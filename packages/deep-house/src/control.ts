// The machine, with no page attached to it.
//
// Under it is src/mix.ts: an endless set, one theme running into the next.
// Everything the interface needs to know is a readout pushed to subscribers;
// everything it can do is a method here. Two faces (the bench and the
// ring) drive the same object, and a headless check can drive it with a fake
// clock and never open an audio context at all.

import { createMix, planTheme, mixPointSeconds, blendBarsFor, blendAsked, recipesFor, spellFor, strategyFor, DEFAULT_STRATEGY, HOUSE } from './mix.ts';
import { sameSpell, spellQuery, spellFromQuery } from './spell.ts';
import { linkRead, linkHere, linkWrite, linkRaw, linkBare, linkOver, linkSameSound, pageDefault, linkWithTime, linkWithout } from './link.ts';
import type { LinkProblem, LinkState } from './link.ts';
import { recipeById } from './recipes.ts';
import type { Spell } from './spell.ts';
import type { Recipe } from './recipe.ts';
import { accompanimentFor } from './recipe-request.ts';
import { developmentFor } from './development.ts';
import { prepareLimiter, limiterFailure } from '@deep-house/engine/master';
import { chordAtBar, noteName } from './theory.ts';
import { REGISTRY, ARRANGEMENT_LAYERS, layersWhere } from '@deep-house/engine/voices';
import type { MixOptions, SetTrack, Track } from './mix.ts';
import type { Descriptor } from '@deep-house/engine/voices/descriptor';
import type { MixState, TransportPoint } from '@deep-house/engine/session';
import { createJournal } from './journal.ts';
import type { JournalEntry, JournalPlace } from './journal.ts';
import { note, report, addressFlood, aBug } from './ledger.ts';
import { hatsOfProgram, programFactsOf, keysOfProgram } from './bird-labels.ts';
import type { HatsReading, ProgramFacts } from './bird-labels.ts';
import { cleanSourceMix } from '@deep-house/engine/source-mix';
import type { SourceMix } from '@deep-house/engine/source-mix';

/** A set playing, as `createMix` hands one back. */
export type Mix = ReturnType<typeof createMix>;

export const PRESETS_CYCLE = ['auto', 'sub', 'growl'];

// The arrangement's layers, in the registry's order: what a section may switch
// on and off. Not a list kept here — every registered voice declares the layer
// that gates it, and this is those, once each.
export const LAYER_ORDER = ARRANGEMENT_LAYERS;

// What each of them is called on the rim. The words are the interface's and
// nothing derives them; `tools/check.ts` holds the keys to `LAYER_ORDER`, so
// a layer cannot arrive without a name or keep one after it goes.
export const LAYER_LABEL = {
  kick: 'kick',
  hatClosed: 'hats',
  hatOpen: 'open hat',
  sixteenths: '16ths',
  clap: 'clap',
  bass: 'bass',
  keys: 'keys',
  pad: 'pad',
};

// The seven lanes the rim draws: one per thing you can hear.
//
// A lane is a **role**, not an instrument, and since round B it says so: each
// one names the roles its members play and the registry answers with the
// members — so `layers` (the arrangement's names: is this allowed to play this
// bar) and `events` (the event list's names: how much of it actually happens)
// are both read off the descriptors rather than kept in step by hand. Register
// a second bass and the B lane lights for it with nothing edited here; the one
// thing that stays the interface's own is which lanes there are, their order
// round the rim and the letter each is drawn with.
const LANE_ROLES = [
  { id: 'kick', initial: 'K', roles: ['kick'] },
  { id: 'bass', initial: 'B', roles: ['bassline'] },
  { id: 'hats', initial: 'H', roles: ['offbeat', 'sixteenth'] },
  { id: 'clap', initial: 'C', roles: ['backbeat'] },
  { id: 'keys', initial: 'S', roles: ['figure', 'melody'] },
  { id: 'pad', initial: 'P', roles: ['sustained'] },
  { id: 'fx', initial: 'F', roles: ['texture'] },
];

/** One lane of the rim, with its roles answered by the registry. */
export interface Lane {
  id: string;
  initial: string;
  layers: string[];
  events: string[];
}

export const LANES: Lane[] = LANE_ROLES.map(({ id, initial, roles }) => {
  const mine = (d: Descriptor) => d.roles.some((r) => roles.includes(r));
  const layers: string[] = [];
  for (const d of REGISTRY) if (mine(d) && d.plays && !layers.includes(d.plays)) layers.push(d.plays);
  return { id, initial, layers, events: layersWhere(mine) };
});

// Per bar, per lane: 0 = silent, 1..3 = how thick the part is. Computed once
// per theme and hung off it, so the rim can be redrawn for free.
/** What `lanesOf` works out: one row per lane, a level per bar. */
export interface Lanes {
  order: string[];
  level: Record<string, Uint8Array>;
  bars: number;
}

/** A plan with its lanes hung off it, which is where they are kept. */
type LanedTrack = Track & { _lanes?: Lanes };

export function lanesOf(track: LanedTrack | null): Lanes | null {
  if (!track) return null;
  if (track._lanes) return track._lanes;
  const bars = track.bars;
  const counts: Record<string, Float32Array> = {};
  const level: Record<string, Uint8Array> = {};
  for (const L of LANES) {
    counts[L.id] = new Float32Array(bars);
    level[L.id] = new Uint8Array(bars);
  }
  const of: Record<string, string> = {};
  for (const L of LANES) for (const e of L.events) of[e] = L.id;
  for (const ev of track.events) {
    const id = of[ev.layer];
    if (!id) continue;
    const b = ev.bar == null ? Math.floor(ev.t / track.barSeconds) : ev.bar;
    if (b >= 0 && b < bars) counts[id][b] += 1;
  }
  for (const L of LANES) {
    let max = 0;
    for (let b = 0; b < bars; b++) max = Math.max(max, counts[L.id][b]);
    for (let b = 0; b < bars; b++) {
      const row = track.timeline[b];
      const allowed = L.layers.length
        ? L.layers.some((k) => row && row.layers.includes(k))
        : counts[L.id][b] > 0;
      if (!allowed) continue;
      const d = max ? counts[L.id][b] / max : 0;
      level[L.id][b] = counts[L.id][b] === 0 ? 1 : d < 0.34 ? 1 : d < 0.72 ? 2 : 3;
    }
  }
  track._lanes = { order: LANES.map((l) => l.id), level, bars };
  return track._lanes;
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Where the listener left the set. Storage can be absent or refuse to write;
// the player works either way.
const STORE = 'deep-house.player';

/**
 * Where the set was left, as this transport writes it down. `strategy` and
 * `link` may be missing: a state written before there were strategies carries
 * neither, one written before 09-23 carries no link, and `restore` reads both
 * as the seed-only place they are.
 *
 * **`link` is the address** (Eugene, 09-23, on his iPhone: *"when I save the
 * page to the home screen, the spell parameters are not stored in local
 * storage — if I restart the app it only restores the seed"*): the sound rows
 * as `linkWrite` writes them — the seed, the engine, the theme, the spell
 * where it is a hand's or a journal's, the recipe and the two modes where
 * their engine would not read them the same way absent — and never the bar. A
 * home-screen app opens on the manifest's `start_url`, a bare address, and
 * gets back the whole link and not only its seed. The second to resume at is
 * the store's own (`seconds`), never the link's.
 */
interface SavedPlace {
  seed: string;
  themeIndex: number;
  seconds: number;
  bar: number;
  preset: string;
  strategy?: string;
  link?: string;
  at: string;
}

/** A seed off the die: the throw's plain roll, the same space a cast lands in. */
const rollSeed = (): string => String(Math.floor(Math.random() * 100000));

function readStore(): SavedPlace | null {
  try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { return null; }
}
function writeStore(v: SavedPlace) {
  try { localStorage.setItem(STORE, JSON.stringify(v)); } catch (e) { /* full or blocked */ }
}
function clearStore() {
  try { localStorage.removeItem(STORE); } catch (e) { /* blocked */ }
}
/** The stored link onto a bare address, in place; whether it was. */
function adoptStoredLink(): boolean {
  try {
    if (!linkBare(location.search)) return false;
    const was = readStore();
    if (!was || typeof was.link !== 'string' || !linkHere(`?${was.link}`).seed) return false;
    const search = linkOver(was.link, location.search);
    history.replaceState(null, '', `${location.pathname}?${search}${location.hash}`);
    return true;
  } catch (e) { return false; }
}
// Which way the set leaves the page. The element path is what a phone needs
// for a lock-screen card; the direct path is the shortest wire there is, for
// telling our own artefacts from the ones the platform adds.
// Only one platform is paid for the element path. iOS and iPadOS keep a
// page's audio session alive through a screen lock for a playing media
// element and nowhere else, and hang their lock-screen card on it. Everywhere
// else the element is a second clock — another buffer, sometimes another
// sample rate — between the mix and the speakers, so the set goes straight
// out. ?out=element|direct overrides either way.
// There is a third road, and it exists for the checks: ?out=silent ends the
// set in a gain of zero connected to the destination. The context is real, the
// clock is real, the scheduler fills its horizon and the capture tap — which
// reads the mix's own last node — reads exactly what it always reads; the one
// thing that changes is that nothing leaves the machine. A suite that plays a
// minute of a set must not play it at whoever is sitting in front of it.
function isApplePhone(): boolean {
  try {
    const ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    // iPadOS reports itself as a Mac; a Mac has no touch screen
    return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
  } catch (e) { return false; }
}

function outMode(): 'direct' | 'element' | 'silent' {
  let asked: 'direct' | 'element' | 'silent' | null = null;
  try { asked = linkHere().out; } catch (e) { asked = null; }
  return asked ?? (isApplePhone() ? 'element' : 'direct');
}
const OUT = outMode();

// A player has no reason to ask for the smallest possible output buffer. The
// 'playback' hint asks the browser for a larger one, which rides through a
// missed deadline instead of letting the card run dry — the clicks that come
// of a 4096-frame period on a busy machine. ?latency= overrides it for a test:
// interactive, balanced, playback, or a number of seconds.
function latencyHint(): AudioContextLatencyCategory | number {
  try { return linkHere().latency ?? 'playback'; } catch (e) { return 'playback'; }
}
const LATENCY = latencyHint();

// How long a start waits for a running context to say what its output buffer
// is, and where the number comes from. Chromium fills `outputLatency` in on
// its first render quantum: on the deepest buffer this page ever asks for
// (?latency=0.3, a 171 ms one) it was still nought when the start was made and
// there fifty milliseconds later. 150 ms is three of those and is the whole of
// the wait — an engine that never reports one at all is not worth waiting for
// and is floored instead, in `anchorHead`. The wait costs nothing after the
// first start of a context, because by then there is a number to read.
const HEAD_SETTLE_MS = 150;
async function settleHead(c: AudioContext): Promise<number> {
  if (c.outputLatency > 0) return 0;
  const t0 = performance.now();
  while (!(c.outputLatency > 0) && performance.now() - t0 < HEAD_SETTLE_MS) {
    await new Promise((r) => setTimeout(r, 8));
  }
  return performance.now() - t0;
}

// The scheduler fills 120 ms ahead while the page is visible. A device that
// hands out a large output buffer needs more reach than that, or a note could
// be written after the card had already asked for it: four buffers plus a
// margin, never less than the 120 ms the mix defaults to.
const VISIBLE_LOOKAHEAD = 0.12;
const lookaheadFor = (base: number) => Math.max(VISIBLE_LOOKAHEAD, (base || 0) * 4 + 0.06);

function urlSeed(): string | null {
  try { return linkHere().seed; } catch (e) { return null; }
}

// **And which theme of it** (`notes/archive/2026-09-plans/cited/PLAN-BIRDS-UX.md` §3b: *"the readout and the URL
// show the entry's seed and theme"*). `?seed=` has always named a record; the
// journal writes `?theme=` beside it so the address bar names one exact track
// and a link is still the save and the share. Nothing wrote one before this, so
// no link anybody holds carries one, and a link without one is theme one — the
// same rule a missing `?v=` keeps.
function urlTheme(): number {
  try { return linkHere().theme; } catch (e) { return 0; }
}

// A link names a bar as a listener sees it: one is the first bar. **Read here
// once and never written** (Eugene, 09-22: a shared link starts the track from
// its beginning, `src/link.ts`); it is a dev link's, for local work. Absent or
// malformed keeps the resume behaviour, and a link still opens stopped.
function urlBar(): number | null {
  if (!urlSeed()) return null;
  try { return linkHere().bar; } catch (e) { return null; }
}
/** The time link's second into the theme, read once at the open (K32); `null` without one. */
function urlTime(): number | null {
  try { return linkHere().t; } catch (e) { return null; }
}

// **`?lock=engine`: a link that names its engine and keeps it.** What the
// retired audition manifests did that a link needs, as an ordinary parameter:
// the machine view's selector holds the engine the link opened under and a
// click on another row asks for nothing. The other half, where the set opens,
// is `?bar=`, which every link already has.
function urlEngineLocked(): boolean {
  try { return linkHere().lock; } catch (e) { return false; }
}
const ENGINE_LOCKED = typeof location === 'undefined' ? false : urlEngineLocked();

/**
 * **The engine this build plays with nothing asked of it**: `pageDefault()` in
 * `src/link-table.ts` (`DEFAULT_VER`) — house-v2, in every build. A bare link plays it; a
 * link a hand has written names its own (`v=`), and plays that whatever this
 * becomes.
 */
export const PAGE_DEFAULT: string = pageDefault();

export type { LinkProblem };

/**
 * **A theme's number in Roman numerals**, the one table the lock screen and
 * the ring both read (the ring in lower case). It stopped at twelve, so a
 * thirteenth theme read "13" beside "XII" (R128 of the reconciled review of
 * 09-24); it is the numeral for any whole number from one on now, and nought
 * or anything that is not a whole number is written as it stands.
 */
const NUMERALS: ReadonlyArray<[number, string]> = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];
export function romanNumeral(n: number): string {
  if (!Number.isInteger(n) || n < 1) return String(n);
  let left = n;
  let out = '';
  for (const [v, s] of NUMERALS) while (left >= v) { out += s; left -= v; }
  return out;
}
const roman = romanNumeral;

// What the phone shows while the screen is dark: the theme, the set it came
// from, and the sigil for a cover. Everything is guarded — a browser without
// a media session simply gets none of it.
// Where the lock-screen pictures live: beside the page. They are kept in
// public/, which the dev server serves at its root and the build copies next
// to index.html, so the same relative address is right in both places.
const ARTWORK_DIR = './';

function artwork() {
  const base = new URL(ARTWORK_DIR, location.href).href;
  return [
    { src: `${base}artwork-512.png`, sizes: '512x512', type: 'image/png' },
    { src: `${base}artwork-256.png`, sizes: '256x256', type: 'image/png' },
    { src: `${base}card-square.png`, sizes: '1200x1200', type: 'image/png' },
  ];
}

/** One section of a theme, as a face draws it off the readout. */
export interface SectionRow {
  label: string;
  kind: string;
  startBar: number;
  bars: number;
  index: number;
}

/**
 * A hand-over a hand asked for that the music has not reached yet: a cut
 * (`skip`, `back`), a cast into another set, or a spell set mid-set. The ring
 * draws the wait for the node that asked and for nothing else, so the two
 * hand-overs that no node asked for are carried here and drawn nowhere.
 */
export interface Cut {
  /** the set's own clock at the instant the hand asked, so the wait has a start */
  askedAt: number;
  at: number;
  end: number;
  swapAt: number;
  kind: 'skip' | 'back' | 'cast' | 'spell' | 'engine';
}

/** Why the readout changed, and how many times it has. */
export interface Change {
  n: number;
  reason: string;
}

/** How a render of the theme playing is going. */
export interface RenderState {
  busy: boolean;
  note: string;
  ok: boolean | null;
}

/** What the browser actually gave us, for the bench to show. */
export interface Timing {
  hint: AudioContextLatencyCategory | number;
  rate: number | null;
  base: number | null;
  output: number | null;
  lookahead?: number;
}

/** Everything the transport holds; the comments beside the fields say what. */
export interface ControlState {
  seed: string;
  strategy: string;
  preset: string;
  minutes: number | null;
  themeBars: number | null;
  playing: boolean;
  themeIndex: number;
  position: number;
  transition: number;
  previewIndex: number | null;
  cut: Cut | null;
  resumeAfterCast: boolean;
  /**
   * The master seed of the set a cast is handing over into, while the
   * hand-over runs. `seed` above is still the set that is playing and becomes
   * this one at the swap; this is what the coming lanes draw in between.
   */
  castTo: string | null;
  /** and which theme of it: theme one for a cast, an entry's own for a walk */
  castToTheme: number | null;
  /**
   * The engine a hand-over is arriving under, while one runs. `strategy` above
   * is still the one that is playing and becomes this at the swap, which is the
   * rule the seed already follows; this is what the coming lanes are planned
   * under in between.
   */
  strategyTo: string | null;
  starting: boolean;
  lookahead: number;
  scrubbing: boolean;
  userStarted: boolean;
  track: SetTrack | null;
  nextTrack: SetTrack | null;
  mix: Mix | null;
  ctx: AudioContext | null;
  /**
   * The mix's own destination: a stream the element plays on the element path,
   * and on the silent route a gain of zero into the context's destination —
   * which is what the browser suites interrogate to prove nothing is heard.
   */
  sink: GainNode | MediaStreamAudioDestinationNode | null;
  raf: number;
  fake: boolean;
  render: RenderState;
  change: Change;
}

/** The theme that is coming, as a face draws it. */
export interface NextInfo {
  index: number;
  seed: string | number;
  key: string;
  bpm: number;
  bars: number;
  duration: number;
  durationLabel: string;
  lanes: Lanes | null;
  plan: SectionRow[];
}

/** One object with everything a face could want to draw. */
export interface Readout {
  seed: string;
  /** which record this is: the composition strategy, by id */
  strategy: string;
  preset: string;
  presetName: string;
  minutes: number | null;
  playing: boolean;
  /** the tempo this theme was planned at, which is its target */
  bpm: number;
  /**
   * and the tempo the set's grid is counting at, which is what is being heard:
   * the two are one number until a seam moves the grid, and then the grid
   * glides to the new theme's own — after the blend by the ratio, or before
   * it for a far jump (`seamTempo`). A face that draws a beat draws this one.
   */
  gridBpm: number;
  beat: number;
  barSeconds: number;
  key: string;
  bars: number;
  bar: number;
  barLabel: string;
  section: string;
  sectionIndex: number;
  chord: string;
  chordNotes: string[];
  kickIn: boolean;
  layers: string[];
  active: Record<string, boolean>;
  seconds: number;
  time: string;
  duration: number;
  durationLabel: string;
  progress: number;
  lanes: Lanes | null;
  beatInBar: number;
  beatPhase: number;
  barPhase: number;
  plan: SectionRow[];
  dice: SetTrack['dice'];
  /** what the hats play in the main, read off the program (K28) */
  hats: HatsReading | null;
  /** what the program plays that a cell's line may state (K30) */
  facts: ProgramFacts | null;
  /** the keys that play (K30) */
  keys: string | null;
  spell: ReturnType<typeof spellFor>;
  /**
   * **The recipe this set was cast under, by the name its row carries** — a
   * value on the readout beside the spell, and never a mark of its own: a set
   * with nothing asked of it has `null` here, which is every set the record
   * plays, so a face that draws this draws nothing until somebody names a row.
   *
   * It stays while a hand moves a bird: a row's musical wishes and the birds
   * are separate parts of the request, the rule `writeSpellUrl` keeps in the
   * address bar; it changes hands with the seed and the birds a cast brings
   * (`mix.recipe`). It used to say it went to `null` at the first pull, which
   * nothing has done since the recipe was split from the spell (R128).
   */
  recipe: string | null;
  change: Change;
  mix: {
    /**
     * **The theme a listener reads, counted from one**: `ControlState`'s
     * `themeIndex` plus one. It was named `themeIndex` too, one-based beside a
     * zero-based field of the same name (R128 and D47 of the reconciled review
     * of 09-24), which is how a reader off by one is made.
     */
    themeNumber: number;
    transition: number;
    /** how near the seam is, nought to one */
    approach: number;
    seamAt: number;
    cutInBars: number;
    cutIn: number;
    /** the whole wait, press to swap, so a fill is two values and no sampling */
    cutSpan: number;
    /** which gesture asked for it, so a face knows which node is waiting */
    cutKind: Cut['kind'] | null;
    cutting: boolean;
    /** seconds until the grid counts at the tempo the set is heading for, the glide included; nought when it does */
    settleIn: number;
    next: NextInfo | null;
  };
  track: SetTrack;
  render: RenderState;
}

/** Where a cast puts the set: which theme it begins on, and how far in. */
export interface CastPoint {
  themeIndex: number;
  seconds: number;
}

/** What a transport may be told when it is made. */
export interface ControlOptions {
  seed?: string | number;
  preset?: string;
  minutes?: number | null;
}

// Half a second of 8 kHz mono silence as a WAV data URL: 4 KB, no file.
export function createControl({ seed = 1, preset = 'auto', minutes = null }: ControlOptions = {}) {
  // **A bare address takes the link this browser stored** — a home-screen app
  // launching from the manifest's `start_url`, a tab opened on the page's own
  // address — before anything reads the address, so everything after (the
  // spell, the recipe, the two modes, the engine, the ring's held birds) reads
  // it the way it would read that link off the bar, refusals included. A link
  // with any sound row on it is somebody's and wins over the store, as it
  // always has. A store written before 09-23 has no link and is restored by
  // its seed alone (`restore`).
  const fromStore = typeof location !== 'undefined' && adoptStoredLink();
  // A bad link is read and repaired before anything reads the address.
  const link = typeof location === 'undefined' ? { search: '', problems: [] as LinkProblem[] }
    : linkRead(location.search, { pageDefault: PAGE_DEFAULT });
  if (link.problems.length) {
    try {
      history.replaceState(null, '', `${location.pathname}${link.search ? `?${link.search}` : ''}${location.hash}`);
    } catch (e) { /* a page with no history to write on */ report('address', 'the address could not be written', e, {}, addressFlood); }
    for (const p of link.problems) console.info(`deep-house: link — ${p.long}.`);
  }
  let sourceMix: SourceMix | null = null;
  const defaultSourceMix = cleanSourceMix();
  const state: ControlState = {
    seed: String(seed),      // the master seed: the whole set comes from it
    // Which composition strategy the set is played under. Read once, off the
    // URL or off what was persisted, and then carried: a set does not change
    // strategy mid-night, because a strategy is which record this is.
    strategy: DEFAULT_STRATEGY,
    preset,
    minutes,                 // nothing pins a theme length today; kept for a bench that may
    themeBars: null,
    playing: false,
    themeIndex: 0,
    position: 0,             // seconds into the theme playing now
    transition: 0,           // 0..1 through the seam into the next theme
    previewIndex: null,      // the theme being mixed in, when it is not n+1
    cut: null,               // a skip or back that the music has not reached yet
    resumeAfterCast: false,  // the set was playing when a new seed was cast
    castTo: null,            // the seed a hand-over in flight is casting into
    castToTheme: null,       // and which theme of it, for a walk back through the journal
    strategyTo: null,        // and the engine it is arriving under
    starting: false,         // a start is under way; exactly one may be
    lookahead: 0,            // how far the scheduler reaches, for this device
    scrubbing: false,        // a hand is dragging the cursor along the band
    // Audio starts from a hand in this page, and from nothing else. A restored
    // tab, a page coming back to the front, a system telling us to play — none
    // of them may make a sound until someone in this session has asked for one.
    userStarted: false,
    track: null,             // the full plan of the current theme
    nextTrack: null,         // and of the one after it
    mix: null,
    ctx: null,
    sink: null,              // the mix's own stream, which the element plays
    raf: 0,
    fake: false,
    render: { busy: false, note: '', ok: null },
    change: { n: 0, reason: 'init' },
  };

  const listeners = new Set<(r: Readout) => void>();
  // Every plan the page has asked for, by the whole request, the least recently
  // asked going first: twenty holds the die's twelve candidates, planned ahead,
  // beside the theme playing, the one coming and a hand's promises either side
  // of a bird, and a plan is the size of a theme's events, so it is not more.
  const planCache = new Map<string, SetTrack>();
  const PLAN_CACHE = 20;
  /** How many themes the page has planned for itself: a bench reading (R13's gate). */
  let plansMade = 0;
  /**
   * **The session journal** (`src/journal.ts`, `notes/archive/2026-09-plans/cited/PLAN-BIRDS-UX.md` §3b). Every theme
   * that plays is written into it, and next and previous walk it — across casts,
   * across engines — before they fall through to the set's own neighbours. It is
   * arithmetic and a string in storage: it plays nothing and the transport never
   * asks it anything, which is why it could be given a check of its own.
   */
  const journal = createJournal();
  // The spell this set is cast under, memoised on the seed: `spellOf` below.
  let spellSeed: string | null = null;
  let spellValue: ReturnType<typeof recipesFor> | null = null;

  // --- where we were ------------------------------------------------------
  let savedAt = 0;
  let scrubFrom = 0; // the position a drag along the band started from

  // Where the set is, into this browser's store: a reload resumes at the
  // second, which the address does not carry.
  function store() {
    // What is written down is where the set is, not where the last frame that
    // happened to be drawn said it was.
    syncFromMix();
    savedAt = Date.now();
    writeStore({
      seed: state.seed,
      themeIndex: state.themeIndex,
      seconds: +state.position.toFixed(2),
      bar: state.track ? Math.floor(state.position / state.track.barSeconds) : 0,
      preset: state.preset,
      // Which record this was. A state written before there were strategies
      // carries none, and `restore` reads that as the default — which is the
      // same rule an old link follows, said in the other store.
      strategy: state.strategy,
      // ...and the whole place as its link, the address's sound rows under the
      // engine the seconds belong to: what a bare address comes back to.
      link: linkNowSafe(),
      at: new Date().toISOString(),
    });
  }

  function linkNowSafe(): string | undefined {
    // (and the machine view where it is open, K21: a home-screen relaunch comes back to it)
    try { return linkNow(linkHere(location.search).view === 'machine' ? 'view=machine' : '', { strategy: state.strategy }); } catch (e) { report('link', 'the page could not write the link where it is', e, {}, aBug); return undefined; }
  }

  function remember() {
    store();
    writeLinkUrl();
  }

  /**
   * **Every write of this page's address comes through here**, and through
   * `linkWrite` (`src/link.ts`): the seed, the engine as its version token
   * (`v=2`) and the theme always, the rest of the sound where it is not
   * what that engine reads its absence as, never the bar, and every view row
   * and unknown parameter kept where it stands. The spell is the address's own
   * unless the caller hands another (`writeSpellUrl`, `writePlaceSpell` decide
   * it); the recipe and the two modes are the page's, fixed when it opened.
   *
   * Nothing calls this before a hand has acted — a start, a pause, a seek, a
   * skip, a cast, a pull, an engine flip — or the page restored a place a hand
   * left in an earlier visit: a bare link a listener opened and never touched
   * stays bare, and is the page's choice.
   */
  function writeAddress(edit: { spell?: Partial<Spell> | null; strategy?: string } = {}): void {
    try {
      const search = linkNow(location.search, edit);
      if (search === location.search.replace(/^\?/, '')) return;
      history.replaceState(null, '', `${location.pathname}${search ? `?${search}` : ''}${location.hash}`);
    } catch (e) { /* a page with no history to write on */ report('address', 'the address could not be written', e, {}, addressFlood); }
  }

  /**
   * The link for where the set is: the seed, the engine and the theme, the
   * spell the address holds (or the one handed), the recipe and the modes the
   * page opened with — over `base`'s other rows. The address is this over
   * itself; the store is this over nothing.
   */
  function linkNow(base: string, edit: { spell?: Partial<Spell> | null; strategy?: string } = {}): string {
    const here = linkHere(location.search, { pageDefault: PAGE_DEFAULT });
    return linkWrite({
      seed: state.seed,
      theme: state.themeIndex,
      strategy: edit.strategy ?? state.strategyTo ?? state.strategy,
      spell: edit.spell !== undefined ? edit.spell : here.spell,
      recipe: here.recipe,
      accompaniment: here.accompaniment,
      development: here.development,
    }, base);
  }

  /** Where the set is, in the journal's terms: what an entry is made of. */
  function placeNow(): JournalPlace {
    const recipe = state.mix?.recipe ?? castOf().track;
    return { seed: state.seed, theme: state.themeIndex, strategy: state.strategy, spell: spellOf(), ...(recipe ? { recipe: recipe.id } : {}), accompaniment: accompanimentFor(), development: developmentFor() };
  }

  // **The place in the address bar** (`notes/archive/2026-09-plans/cited/PLAN-BIRDS-UX.md` §3b: *"the readout and the
  // URL show the entry's seed and theme, so a link still means one exact track
  // and the seed reads as where you are in time"*), and since 09-22 **the
  // engine beside them, always**: the address is the save and the share, and a
  // link is a promise (`src/link.ts`). Written wherever the position is written
  // down (`remember`: a pause, a seek, a skip, a swap, every five seconds of
  // play) and never on a frame. **Never the bar** (Eugene, 09-22): a copied
  // link is the track from its beginning, so the machine does not mix the
  // listener it was sent to into the next one. The engine is the one being
  // *asked* for, so a link copied mid-hand-over names where the set is going.
  function writeLinkUrl(): void {
    writeAddress();
  }

  /**
   * **The spell of a place, in the address bar only where the link would not
   * roll it again.** Under `?recipe=` a set's spell is rolled off its seed, so
   * writing the rolled birds out would pin them and the next cast would keep
   * them instead of rolling its own; a spell a hand set, or one a journal entry
   * was heard under, is written as it stands. Where it is not written, the
   * engine the link names stands for it: its house, or its roll.
   */
  function writePlaceSpell(place: JournalPlace): void {
    try {
      const here = linkHere(location.search, { pageDefault: PAGE_DEFAULT });
      const rolled = recipesFor({ masterSeed: place.seed, strategy: place.strategy,
        search: `?${linkWrite({ seed: place.seed, theme: place.theme, strategy: place.strategy, spell: null,
          recipe: here.recipe, accompaniment: here.accompaniment, development: here.development })}` }).spell;
      if (sameSpell(place.spell, rolled)) {
        if (here.spell) writeAddress({ spell: null });
        return;
      }
    } catch (e) {
      // a request the page refused is written as it stands; a throw of ours is a report (R1)
      report('link', 'the spell of a journal place could not be read against its roll', e, {}, aBug);
    }
    if (!sameSpell(place.spell, spellFromQuery())) writeSpellUrl(place.spell);
  }

  /**
   * **A theme began.** It is either the entry the last press walked to — and
   * the pointer moves onto it — or it is new, and it is written into the
   * journal after the pointer. Asked twice for the same place it does nothing,
   * so a pause and a play cannot write the same theme down twice.
   *
   * Every door a theme arrives through comes here: the swap that changes the
   * seed, the one that changes the theme, the one that changes the engine, and
   * the start of a set.
   */
  function arrived(): void {
    const place = placeNow();
    const t = state.track;
    const did = journal.arrived(place, {
      bar: t ? Math.floor(clamp(state.position, 0, Math.max(0, playable())) / t.barSeconds) + 1 : 1,
      clock: state.ctx ? +state.ctx.currentTime.toFixed(3) : null,
    });
    if (did === 'already') return;
    // **The arriving theme's spell is written only when nothing newer is
    // asked.** A spell asked while an earlier one's seam was in flight lands
    // that one at once and hands over again into its own (`mix.setSpell`), and
    // `setSpell` has already written it: writing the arriving theme's spell
    // here put the link one spell behind the ring until the second landed too
    // (the fault pass of 09-24). The link is what plays *and* what is asked, so
    // while the set has been asked for another spell the address keeps it.
    if (!state.mix || sameSpell(state.mix.spellAsked, place.spell)) writePlaceSpell(place);
    writeLinkUrl();
    note('theme', did === 'walked' ? 'the journal walked onto a theme it had played' : 'a theme was written into the journal',
      { seed: place.seed, theme: place.theme + 1, engine: place.strategy,
        entry: journal.at + 1, of: journal.entries.length });
  }

  /**
   * **A walk to an entry the journal already holds.** Playing, it is a
   * hand-over into a stated place — the seed, the theme of it, the engine and
   * the spell it was heard under — which is `cast` with all four named, so a
   * walk across a cast is the same seam every other manipulation of the ring
   * is. Stopped, it is the plan alone, and the pointer settles at once because
   * no swap is coming to settle it.
   */
  /**
   * **The recipe an entry was heard under, played back from the entry** (the
   * page review of 09-22, finding 8). An entry names the row by its permanent
   * id, so a walk back hands the transport that row and not whatever the
   * address would draw for that seed now; an entry that names none was heard
   * under none. The accompaniment and the development are the set's own and
   * are fixed when it is made, and a journal is only ever read back on a page
   * whose link carries the same two (`journal.load` refuses any other), so an
   * entry's are this page's by construction; one that is not says so.
   */
  function recipeOfEntry(entry: JournalEntry) {
    if ((entry.accompaniment ?? 'base') !== accompanimentFor() || (entry.development ?? 'base') !== developmentFor())
      note('transport', 'a journal entry was heard under other modes than this page plays; walking with the page\'s', {
        entry: `${entry.accompaniment ?? 'base'}/${entry.development ?? 'base'}`, page: `${accompanimentFor()}/${developmentFor()}` });
    if (!entry.recipe) return null;
    try {
      const row = recipeById(entry.recipe);
      if (row) return row;
    } catch (e) { /* an ambiguous name cannot be one an entry wrote */ }
    return recipesFor({ masterSeed: entry.seed, strategy: entry.strategy }).track;
  }

  function walkTo(entry: JournalEntry, index: number, kind: Cut['kind']): void {
    note('transport', kind === 'back' ? 'the journal walked back' : 'the journal walked forward', {
      to: entry.seed, theme: entry.theme + 1, engine: entry.strategy,
      entry: index + 1, of: journal.entries.length,
    });
    if (state.mix) {
      const here = entry.seed === state.seed;
      state.castTo = here ? null : entry.seed;
      state.castToTheme = here ? null : entry.theme;
      state.previewIndex = here ? entry.theme : null;
      state.strategyTo = entry.strategy === state.strategy ? null : entry.strategy;
      armCut(state.mix.cast(entry.seed, {
        spell: entry.spell, themeIndex: entry.theme, strategy: entry.strategy,
        recipe: recipeOfEntry(entry),
      }), kind);
      replan(null);
      remember();
      emit();
      return;
    }
    state.seed = entry.seed;
    state.strategy = entry.strategy;
    state.themeIndex = entry.theme;
    state.position = 0;
    state.previewIndex = null;
    state.castTo = null;
    state.castToTheme = null;
    state.strategyTo = null;
    spellSeed = null;
    writePlaceSpell(entry);
    writeStrategyUrl(entry.strategy);
    replan('seed');
    arrived();
    remember();
    emit();
  }

  function restore(): 'url' | 'fresh' | 'rolled' | 'restored' {
    const url = urlSeed();
    const was = readStore();
    // The strategy is read off the page first and off what was persisted
    // second, and it is read whichever way the seed goes: a `?v=` with no
    // `?seed=` still names the record being played. The link answers the
    // page's default for nothing asked for, for an empty value and for a token
    // nothing answers to (which `linkRead` has already taken off, out loud).
    // **Nothing asked for is the page's default**, `PAGE_DEFAULT`, which is
    // house-v2 in every build (`DEFAULT_VER`, `src/link-table.ts`). A strategy
    // named outright is that strategy, so the toggle can ask for either.
    const asked = linkHere(location.search, { pageDefault: PAGE_DEFAULT });
    const named = asked.named;
    state.strategy = asked.strategy;
    if (url) {
      // **And which theme of it**, since the journal writes `?seed=` and
      // `?theme=` into the address bar as the set plays (`notes/archive/2026-09-plans/cited/PLAN-BIRDS-UX.md` §3b).
      // A link anybody holds carries no `?theme=` and is theme one, exactly as
      // it always was; a reload of a page that has been playing carries its own
      // place, and where that place is the one that was saved the second it was
      // saved at is still where the listener was — so a reload resumes rather
      // than starting the theme again, which is what it did before the address
      // bar knew the seed.
      const theme = urlTheme();
      state.seed = url;
      state.themeIndex = theme;
      // The second is the stored place's alone: the same seed and theme under
      // the same engine, spell, recipe and modes (R26 of the review of 09-24 —
      // a friend's link resumed mid-track whenever this browser was left on the
      // same seed and theme under anything). A store from before the link
      // carries no link, and its engine is the one thing it can be held to.
      const same = !!was && String(was.seed) === url && Math.max(0, Number(was.themeIndex) || 0) === theme
        && (typeof was.link === 'string' ? linkSameSound(`?${was.link}`, location.search, { pageDefault: PAGE_DEFAULT })
          : !was.strategy || strategyFor({ strategy: was.strategy }).id === state.strategy);
      state.position = same ? Math.max(0, Number(was!.seconds) || 0) : 0;
      // The stored link is on the address now, and it is a place a hand left
      // here: the address is written for it as a hand's first write would be.
      // **The preset is never restored** (R27 of the review of 09-24,
      // Eugene's question 9): no link row carries it, so a stored `sub` or
      // `growl` would play one thing here and another for whoever this
      // browser's link is sent to. A restored place plays `auto`, as the link does.
      if (fromStore) {
        state.preset = 'auto';
        return 'restored';
      }
      return 'url';
    }
    // **A link with a sound row on it wins over the store** (ROADMAP 09-23):
    // with no seed it is the link table's seed at the link's own theme, as it
    // is in a browser that stored nothing. The store's seed, theme and second
    // were restored under `?v=2&theme=2` (R25 of the review of 09-24).
    // **A bare address in a browser that stored nothing throws the die**
    // (Eugene, K16: *"every time a bare page is opened and there is no local
    // storage yet, we should not seed 1 but throw a die for the user, and
    // whatever seed it is, that is what the person gets"*): the throw's own
    // roll (`rollSeed`), stored at once so the next bare open on this device
    // comes back to it, and the address left bare until a hand acts.
    if (linkBare(location.search) && !(was && was.seed)) {
      state.seed = rollSeed();
      state.themeIndex = urlTheme();
      return 'rolled';
    }
    if (!was || !was.seed || !linkBare(location.search)) {
      state.themeIndex = urlTheme();
      return 'fresh';
    }
    if (!named && was.strategy) state.strategy = strategyFor({ strategy: was.strategy }).id;
    state.seed = String(was.seed);
    state.themeIndex = Math.max(0, Number(was.themeIndex) || 0);
    state.preset = 'auto';   // never the stored one: no link row carries it (R27)
    state.position = Math.max(0, Number(was.seconds) || 0);
    return 'restored';
  }

  function ctx(): AudioContext {
    if (!state.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      state.ctx = new Ctor({ latencyHint: LATENCY });
      const base = state.ctx.baseLatency || 0;
      state.lookahead = lookaheadFor(base);
      if (state.lookahead > VISIBLE_LOOKAHEAD) {
        console.info(`deep-house: look-ahead raised to ${Math.round(state.lookahead * 1000)} ms ` +
          `for a ${(base * 1000).toFixed(1)} ms buffer.`);
      }
      // A phone call, another app's audio or a locked screen leaves the
      // context 'interrupted' or 'suspended'; nothing resumes it but us.
      state.ctx.addEventListener('statechange', wake);
    }
    return state.ctx;
  }

  // Bring the context back whenever the set should be sounding and is not.
  // Bring a context back that a hand had already started and an interruption
  // took away. It never creates a mix and it never calls start().
  function wake() {
    const c = state.ctx;
    if (!c || !state.userStarted || !state.mix || !state.playing) return;
    if (document.hidden) return;
    if (c.state !== 'running' && c.state !== 'closed') c.resume().catch(() => {});
  }
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('pageshow', wake);
  window.addEventListener('focus', wake);

  // The set leaves through a media element rather than straight out of the
  // context. iOS keeps a page's audio session alive through a screen lock only
  // for a playing element, and it is the element — not the graph — that the
  // system hangs its Now Playing card and its lock-screen controls on. So the
  // mix is rendered into a stream and the element plays that stream.
  let keep: HTMLAudioElement | null = null;
  function sink(): GainNode | MediaStreamAudioDestinationNode | null {
    if (OUT === 'direct') return null;
    if (!state.sink) {
      const c = ctx();
      if (OUT === 'silent') {
        // The whole of the silence: the set's destination is a gain of zero
        // that is itself connected to the context's destination, so the graph
        // is built, pulled and torn down exactly as it is on the page and the
        // last node before the card multiplies by nothing.
        const g = c.createGain();
        g.gain.value = 0;
        g.connect(c.destination);
        state.sink = g;
        return state.sink;
      }
      if (!c.createMediaStreamDestination) return null;
      state.sink = c.createMediaStreamDestination();
    }
    return state.sink;
  }

  function keepAlive(on: boolean) {
    // Only the element path has anything to keep alive: the direct one has no
    // element and the silent one has a gain node, which needs no play().
    if (OUT !== 'element') return;
    if (on) {
      // The element path and no other reaches this line, so the sink is the
      // stream destination `sink()` builds for it.
      const d = sink() as MediaStreamAudioDestinationNode | null;
      if (!keep) {
        // The page may ship one; if it does not, the transport makes it. Either
        // way it is an audio element and the four lines under this set an audio
        // element's properties.
        keep = (document.getElementById('sound') as HTMLAudioElement) || new Audio();
        keep.setAttribute('playsinline', '');
        keep.autoplay = false;
        keep.loop = false;
        keep.muted = false;
        keep.volume = 1;
        // A pause from the lock screen must stop the set, not leave the music
        // running under a control that says it is paused. There is no matching
        // 'play' listener: we are the ones who call play() on the element, and
        // its event would land before the mix exists and start a second one.
        // The lock screen's play arrives through the media session instead.
        keep.addEventListener('pause', () => { if (state.playing && !state.starting) stop(); });
      }
      if (d && keep.srcObject !== d.stream) keep.srcObject = d.stream;
      keep.play().catch(() => {});
    } else if (keep) {
      keep.pause();
    }
  }

  function mixOpts(): Partial<MixOptions> {
    // The spell goes with the options, so the plan the transport draws from —
    // the ring's lanes and dice, the seam it counts down to, the WAV it
    // exports — is the plan the mix plays. `createMix` read the spell off the
    // URL for itself and this did not, so under `?spell=` or `?recipe=` the
    // mix played one record while the readout and the export compiled the
    // house's. With nothing asked for both are `null`, which is
    // the house and the golden's own call.
    const o: Partial<MixOptions> = { masterSeed: state.seed, preset: state.preset, strategy: state.strategy, spell: spellOf() };
    o.recipe = state.mix?.recipe ?? castOf().track;
    o.accompaniment = accompanimentFor();
    o.development = developmentFor();
    if (state.lookahead) o.lookahead = state.lookahead;
    if (state.themeBars) o.themeBars = state.themeBars;
    return o;
  }

  // planTheme is pure and cheap, and it hands back the whole track — the
  // timeline, the events, the arrangement — which is what the lanes are made
  // of. The mix's own planTheme() only summarises, so this is the one to use.
  function planned(
    i: number,
    seed: string = state.seed,
    strategy: string = state.strategy,
    under?: Partial<Spell> | null,
  ): SetTrack {
    // A set's plans are made under that set's own spell: under `?recipe=` the
    // spell is rolled off the master seed, so the set a cast is handing over
    // into is planned under its spell and not under the playing set's. A caller
    // that knows better — the theme that is *coming*, which is planned under
    // the spell that has been asked for and not the one still sounding — says
    // so.
    const spell = under !== undefined ? under
      : seed === state.seed ? spellOf() : spellFor({ masterSeed: seed, strategy });
    const recipe = seed === state.seed
      ? state.mix?.recipe ?? castOf().track : recipesFor({ masterSeed: seed, strategy }).track;
    // **And the spell is part of what names a plan.** It was not, and a held
    // bird was therefore invisible to everything the ring says: `setSpell`
    // empties this cache and then re-fills it a line later with the theme
    // ahead planned under the spell that is still *playing*, so the swap — which
    // asks for the same theme again — was handed that stale plan and the ring
    // read the arriving theme as though no bird were held. MEASURED before the
    // fix: a pull on Ember promised 169.1 bpm on the cell's own sub-line and
    // the ring then printed 104.1 when it landed, while the music went to the
    // tempo it had been asked for — which is Eugene's "the ring pulse is not in
    // sync with the BPM", and it was the plan and not the clock.
    const key = planKeyOf(i, seed, strategy, spell, recipe);
    const had = planCache.get(key);
    if (had) {
      // the most recently asked is the last to go
      planCache.delete(key);
      planCache.set(key, had);
      return had;
    }
    plansMade += 1;
    const t = planTheme(seed, i, { ...mixOpts(), masterSeed: seed, strategy, spell, recipe });
    lanesOf(t);
    planCache.set(key, t);
    // **The least recently asked goes, one at a time** (R13): the cache used to
    // be emptied whole at nine, and nine other places emptied it besides, so a
    // theme the ring had just planned was planned again a line later.
    if (planCache.size > PLAN_CACHE) planCache.delete(planCache.keys().next().value!);
    return t;
  }

  const planKeyOf = (i: number, seed: string, strategy: string, spell: Partial<Spell> | null, recipe: Recipe | null): string =>
    `${strategy}|${seed}|${i}|${state.preset}|${state.themeBars || 0}|${spellQuery(spell) || 'house'}|${recipe?.id ?? ''}|${accompanimentFor()}|${developmentFor()}`;

  /**
   * **The same request, answered only if it has been planned already**: a face
   * that is drawn faster than a theme can be planned asks this first and plans
   * on its own clock (R13: the phone panel planned a whole theme on every notch
   * of its slider).
   */
  function plannedAlready(i: number, seed: string, strategy: string, under: Partial<Spell> | null): SetTrack | null {
    const recipe = seed === state.seed
      ? state.mix?.recipe ?? castOf().track : recipesFor({ masterSeed: seed, strategy }).track;
    return planCache.get(planKeyOf(i, seed, strategy, under, recipe)) ?? null;
  }

  function replan(reason: string | null) {
    state.track = planned(state.themeIndex);
    // Which theme is coming: the first theme of the set a cast is handing over
    // into, or the one after this, unless a back() is under way.
    // A pull on its way is a move in place (Eugene, 09-24): what is coming is
    // this theme under the asked spell, entering where the record is.
    const pullInPlace = !!state.mix && !state.castTo && state.previewIndex == null && !state.strategyTo
      && !sameSpell(state.mix.spellAsked, state.mix.spell);
    const ahead = state.previewIndex != null ? state.previewIndex : pullInPlace ? state.themeIndex : state.themeIndex + 1;
    // The theme that is coming is planned under the engine it will arrive
    // under, which while a switch runs is not the one that is playing — and
    // **under the spell it will arrive under**, which while a hand-over runs is
    // the one a hand has asked for and not the one still sounding. That is what
    // makes the ring's "next" a reading of the promise rather than of the
    // present.
    state.nextTrack = state.castTo
      ? planned(Math.max(0, state.castToTheme ?? 0), state.castTo, state.strategyTo ?? state.strategy)
      : planned(Math.max(0, ahead), state.seed, state.strategyTo ?? state.strategy,
        state.mix ? state.mix.spellAsked : undefined);
    if (reason) state.change = { n: state.change.n + 1, reason };
  }

  const playable = () => (state.track ? state.track.bars * state.track.barSeconds : 0);

  let chordMemo: { t: SetTrack; bar: number; notes: string[] } | null = null;
  function chordNotes(bar: number): string[] {
    const t = state.track;
    if (!t) return [];
    if (chordMemo && chordMemo.t === t && chordMemo.bar === bar) return chordMemo.notes;
    const notes = chordNotesOf(t, bar);
    chordMemo = { t, bar, notes };
    return notes;
  }
  function chordNotesOf(t: SetTrack, bar: number): string[] {
    const chord = chordAtBar(t.progression, clamp(bar, 0, t.bars - 1));
    const seen: string[] = [];
    for (const m of chord.voicing || []) {
      const n = noteName(m).replace(/-?\d+$/, '');
      if (!seen.includes(n)) seen.push(n);
    }
    return seen;
  }

  // Where this theme hands over, and how close we are to it.
  const seamMemo = new WeakMap<SetTrack, number>();
  function seamSeconds(): number {
    const t = state.track;
    if (!t) return 0;
    let got = seamMemo.get(t);
    if (got === undefined) {
      try {
        got = mixPointSeconds(t, blendBarsFor(t, blendAsked(t)), 16);
      } catch (e) {
        report('plan', 'the seam of a theme could not be placed', e, {}, aBug);
        got = t.bars * t.barSeconds;
      }
      seamMemo.set(t, got);
    }
    return got;
  }

  function seamApproach(pos: number): number {
    const t = state.track;
    if (!t) return 0;
    const seam = seamSeconds();
    const window = 32 * t.barSeconds;
    return clamp((pos - (seam - window)) / window, 0, 1);
  }

  // How long until a tapped cut changes hands, in seconds off the set's own
  // clock. mix.ts hands back the moment — swapAt, where the low end goes over
  // and the theme index turns with it — so a face can draw the wait as it runs
  // instead of guessing at its length.
  function cutInSeconds(): number {
    if (!state.cut || !state.ctx) return 0;
    return Math.max(0, state.cut.swapAt - state.ctx.currentTime);
  }

  // And how long the whole wait is: the press to the swap, both ends read off
  // the seam the transport answered with. A face that draws the wait divides
  // one by the other and never samples a clock of its own, so a second press
  // restarts the drawing because it moves both numbers.
  function cutSpanSeconds(): number {
    if (!state.cut) return 0;
    return Math.max(0.001, state.cut.swapAt - state.cut.askedAt);
  }

  // How many bars until a tapped cut actually happens, so the ring can say so.
  function cutInBars(): number {
    if (!state.cut || !state.ctx || !state.track) return 0;
    const left = state.cut.at - state.ctx.currentTime;
    if (left <= 0) return 0;
    return Math.max(1, Math.ceil(left / state.track.barSeconds));
  }

  // The spell this set is cast under, on the readout so a face can read it.
  //
  // It is the composer's own answer and not a second one: `spellFor` is exactly
  // what `createMix` asks, with the seed the transport is on, so what the ring
  // is told is what the dice were leaned by. A set with nothing asked of it
  // gets `null`, which every reader takes as the house — and a face needs it
  // before there is a mix at all, which is why it is worked out here and not
  // read off one. Memoised on the seed, because a readout is taken sixty times
  // a second and a `?recipe=` rolls a stream to answer.
  //
  // **The transport's own, while there is one.** Since 09-19 a spell can be set
  // while a set plays, and it changes hands at the swap the way the seed does
  // (`mix.setSpell`), so the face reads the spell off the set that is playing
  // rather than working out a second answer that would change at the ask and
  // leave the ring wearing a colour the music is not in yet. With no mix — a
  // stopped ring, a page that has not been started — it is the URL's own, which
  // is where a spell set while stopped is kept.
  function castOf(): ReturnType<typeof recipesFor> {
    const key = `${state.seed}|${state.strategy}|${typeof location === 'undefined' ? '' : location.search}`;
    if (spellSeed !== key) {
      spellSeed = key;
      spellValue = recipesFor({ masterSeed: state.seed, strategy: state.strategy });
    }
    return spellValue!;
  }
  function spellOf(): ReturnType<typeof spellFor> {
    if (state.mix) return state.mix.spell;
    return castOf().spell;
  }

  /**
   * The selection actually playing. Birds may change its setting while the
   * recipe keeps its musical instructions; its name is not a box-fit claim.
   */
  function recipeName(): string | null {
    if (state.mix) return state.mix.recipe?.name ?? null;
    return castOf().name;
  }

  // The spell in the address bar: the save and the share (`notes/archive/2026-09-plans/cited/PLAN-BIRDS-UX.md` §4).
  // Written when a spell is set and not on any frame, and the house writes
  // nothing at all — a set at the house names its engine, and the engine's
  // house stands for the spell — and releasing every bird removes the explicit
  // spell. A named recipe stays selected: its musical wishes and the birds are
  // separate parts of the request, and with one selected the house is written
  // as all eight values, because omitting the spell would draw its box again
  // on reload.
  function writeSpellUrl(spell: Partial<Spell> | null): void {
    const here = linkHere(location.search, { pageDefault: PAGE_DEFAULT });
    writeAddress({ spell: spellQuery(spell) ? spell : here.recipe ? HOUSE : null });
  }

  // The engine in the address bar: the save and the share, the way the spell is
  // (`PLAN-MACHINE-VIEW` §5b), written at the ask. Since 09-22 it is always
  // written, as its version token (`v=2`), whichever engine it is: a link
  // that names none is the page's choice, and the page's choice moves.
  function writeStrategyUrl(id: string): void {
    writeAddress({ strategy: id });
  }

  // **A readout is taken every frame, and most of it is the same as the last
  // one's** (R98): the sections of a plan, the coming theme's card, the seam's
  // second and the chord's tones are worked out once per plan or per bar and
  // handed out again, rather than mapped afresh sixty times a second.
  const sectionsMemo = new WeakMap<SetTrack, Readout['plan']>();
  const sectionsOf = (t: SetTrack): Readout['plan'] => {
    let got = sectionsMemo.get(t);
    if (!got) {
      got = t.arrangement.sections.map((s) => ({ label: s.label, kind: s.kind, startBar: s.startBar, bars: s.bars, index: s.index }));
      sectionsMemo.set(t, got);
    }
    return got;
  };
  let nextMemo: { t: SetTrack; index: number; info: NextInfo } | null = null;
  function nextInfo(): NextInfo | null {
    const t = state.nextTrack;
    if (!t) return null;
    // A cast's coming theme is the first of the set arriving, and it is
    // theme one of that set however far into this one the throw came.
    const index = state.castTo ? (state.castToTheme ?? 0) + 1
      : (state.previewIndex != null ? state.previewIndex : state.themeIndex + 1) + 1;
    if (nextMemo && nextMemo.t === t && nextMemo.index === index) return nextMemo.info;
    const info: NextInfo = {
      index,
      seed: t.seed,
      key: t.key.name,
      bpm: t.bpm,
      bars: t.bars,
      duration: t.bars * t.barSeconds,
      durationLabel: formatTime(t.bars * t.barSeconds),
      lanes: lanesOf(t),
      plan: sectionsOf(t),
    };
    nextMemo = { t, index, info };
    return info;
  }

  // One object with everything a face could want to draw.
  function readout(): Readout | null {
    // The transport's own time, taken here rather than at the last animation
    // frame: everything downstream of a readout — the lock screen's position,
    // a rating's window, what a face draws — is then the set as it is.
    const live = syncFromMix();
    const t = state.track;
    if (!t) return null;
    const pos = clamp(state.position, 0, playable());
    // **The tempo the set is counting at**, beside the tempo this theme was
    // planned at. A set keeps one grid: through a seam both decks are on the
    // outgoing theme's, and when the outgoing deck is gone the grid glides to
    // this one's over sixteen bars. MEASURED after a pull on Ember took seed 1
    // from the house to a broken kit: the moment the seam landed the music was
    // at 112.7 and the plan said 169.1, and sixteen bars later it was at 161.9
    // and still leaning. A face that draws a beat is drawing the grid, so a
    // face that prints a tempo has to print the same number or disagree with
    // itself. With nothing running the two are one number to the bit.
    const spb = live && live.beatSeconds ? live.beatSeconds : t.beat;
    const bar = clamp(Math.floor(pos / t.barSeconds), 0, t.bars - 1);
    const row = t.timeline[bar] || { section: '', sectionIndex: 0, chord: '', layers: [] };
    const layers = row.layers || [];
    const active: Record<string, boolean> = {};
    for (const k of LAYER_ORDER) active[k] = layers.includes(k);

    return {
      seed: state.seed,
      // Which record this is. On the readout beside the seed, because the two
      // together are what names a piece of music: a mark, a bench row and a
      // scenario all read it from here.
      strategy: state.strategy,
      preset: state.preset,
      presetName: t.presetLabel,
      minutes: state.minutes,
      playing: state.playing,
      bpm: t.bpm,
      /** and the tempo the grid is actually counting at: the theme's own, until a seam moves it */
      gridBpm: +(60 / spb).toFixed(1),
      beat: t.beat,
      barSeconds: t.barSeconds,
      key: t.key.name,
      bars: t.bars,
      bar,
      barLabel: `${bar + 1}/${t.bars}`,
      section: row.section,
      sectionIndex: row.sectionIndex,
      chord: row.chord,
      chordNotes: chordNotes(bar),
      kickIn: layers.includes('kick'),
      layers,
      active,
      seconds: pos,
      time: formatTime(pos),
      duration: playable(),
      durationLabel: formatTime(playable()),
      progress: playable() ? pos / playable() : 0,
      lanes: lanesOf(t),
      beatInBar: Math.floor((pos / t.beat) % 4),
      beatPhase: (pos / t.beat) % 1,
      barPhase: (pos / t.barSeconds) % 1,
      plan: sectionsOf(t),
      dice: t.dice,
      // what the hats play, off the program and not the mask the dice rolled (K28)
      hats: hatsOfProgram(t.events, t.timeline),
      // and what else the program plays that a line may state, and its keys (K30)
      facts: programFactsOf(t.events, t.dice as { composition?: string }),
      keys: keysOfProgram(t.events, (t.dice as { keysPreset?: string }).keysPreset) ?? null,
      spell: spellOf(),
      recipe: recipeName(),
      change: state.change,
      mix: {
        themeNumber: state.themeIndex + 1,
        transition: state.transition,
        // how near the seam is: the next theme starts showing through over the
        // thirty-two bars before the mix point
        approach: seamApproach(pos),
        seamAt: seamSeconds(),
        cutInBars: cutInBars(),
        cutIn: cutInSeconds(),
        cutSpan: cutSpanSeconds(),
        cutKind: state.cut ? state.cut.kind : null,
        cutting: !!state.cut,
        // and how long until the grid counts at the tempo the set is heading
        // for: the seam and the glide after it (round K12c)
        settleIn: live && typeof live.settleIn === 'number' ? live.settleIn : 0,
        next: nextInfo(),
      },
      track: t,
      render: { ...state.render },
    };
  }

  // --- what the lock screen is told ---------------------------------------
  let mediaFor = '';
  /**
   * **The cover the ring draws of itself** (round K15, Eugene: *"where we show
   * an album cover, show the actual ring in its current colour setting,
   * redone only when a drastic change to the ring happened"*): the face hands
   * over the pictures it rendered, and the lock screen shows them; `null` is
   * the static cover beside the page, which is also what a failure leaves.
   */
  let cover: { src: string; sizes: string; type: string }[] | null = null;
  let posAt = 0;
  let playbackSaid = '';

  function media(r: Readout) {
    // Nothing is published until a hand has started the set: a restored tab
    // must not even advertise itself as something the system can play.
    if (!state.userStarted) return;
    const ms = typeof navigator !== 'undefined' && navigator.mediaSession;
    if (!ms) return;
    // The chord is in the line, so the lock screen says what is sounding and
    // not only which theme it is. It changes at most once a bar — two and a bit
    // seconds at this tempo — and the artwork is the same three URLs every
    // time, so the system has nothing new to fetch when the line turns over.
    const key = `${r.mix.themeNumber}|${r.chord}|${r.seed}`;
    if (key !== mediaFor && window.MediaMetadata) {
      mediaFor = key;
      try {
        ms.metadata = new window.MediaMetadata({
          title: r.chord ? `Theme ${roman(r.mix.themeNumber)} · ${r.chord}` : `Theme ${roman(r.mix.themeNumber)}`,
          artist: 'Deep House',
          album: `seed ${r.seed}`,
          artwork: cover ?? artwork(),
        });
      } catch (e) { /* older shapes */ }
    }
    const playback = r.playing ? 'playing' : 'paused';
    if (playback !== playbackSaid || ms.playbackState !== playback) { playbackSaid = playback; ms.playbackState = playback; }
    const now = Date.now();
    if (now - posAt > 1000 && ms.setPositionState) {
      posAt = now;
      try {
        ms.setPositionState({
          duration: Math.max(1, r.duration),
          position: clamp(r.seconds, 0, Math.max(1, r.duration)),
          playbackRate: 1,
        });
      } catch (e) { /* a position the browser dislikes */ }
    }
  }

  // Registered only once a hand in this page has started the set. A tab that
  // Safari restores has no handlers, so the system cannot tell it to play.
  //
  // They are set twice on purpose. The first pass happens inside the gesture,
  // before any audio flows, which is what lets the system publish the session
  // at all; the second happens once the set is really playing, because WebKit
  // decides which of the Now Playing buttons to *enable* when its own media
  // element goes live, and a handler registered before that moment is a handler
  // it has not counted. Setting the same function twice costs nothing and is
  // idempotent to the system.
  let handlersOn = false;

  // How far the lock screen's two seek arrows move, when the system offers
  // them. It asks for its own `seekOffset` where it has one.
  const SEEK_STEP = 10;

  function mediaHandlers(again = false) {
    if (handlersOn && !again) return;
    const ms = typeof navigator !== 'undefined' && navigator.mediaSession;
    if (!ms || !ms.setActionHandler) return;
    handlersOn = true;
    const set = (name: MediaSessionAction, fn: MediaSessionActionHandler) => { try { ms.setActionHandler(name, fn); } catch (e) { /* unsupported */ } };
    set('play', () => start());
    set('pause', () => stop());
    set('stop', () => stop());
    // **No guard** (step 1c, Eugene 09-19: *"no cut guard on next/previous/dice
    // or the lock screen"*). These were refused while a cut was in flight,
    // because a press then landed a theme further off than the hand meant; the
    // transport aims now, so a press during a blend retargets it and five of
    // them land five ahead. The lock screen is the ring's own two actions by
    // another route and it is the same rule — which also closes the item
    // `TODO.md` opened when a cast began arming one of these and left both
    // buttons dead for the length of a cast's blend.
    set('nexttrack', () => control.skip());
    set('previoustrack', () => control.back());
    // Relative seeks, which the transport already does cheaply: the position is
    // a number and `seekTo` hands it to the mix.
    const by = (delta: number) => {
      const span = playable();
      if (!span) return;
      control.seekTo(clamp(state.position + delta, 0, span) / span, true);
    };
    set('seekbackward', (d) => by(-((d && d.seekOffset) || SEEK_STEP)));
    set('seekforward', (d) => by((d && d.seekOffset) || SEEK_STEP));
    set('seekto', (d) => { if (d && d.seekTime != null && playable()) control.seekTo(d.seekTime / playable(), true); });
  }

  function emit() {
    const r = readout();
    if (!r) return;
    media(r);
    for (const fn of listeners) {
      try { fn(r); } catch (err) { console.error(err); report('page', 'a listener to the set threw', err); }
    }
  }

  // Where the set is, asked of the mix itself. This used to live inside the
  // animation loop, which made the audio's own state a thing that only existed
  // while something was being drawn: a page in the background goes on playing
  // while its frames stop, so a pause, a saved position, a rating or a
  // lock-screen update taken then described a moment nobody had heard. Frames
  // present this; they do not own it.
  // The plan the mix was playing, and the spell, at the last read.
  let playedTrack: SetTrack | null = null;
  let playedSpell: Partial<Spell> | null = null;
  function syncFromMix(): MixState | null {
    const m = state.mix;
    if (!m || state.fake) return null;
    const s = m.state;
    // The deck that is playing knows which theme it is; mix.state.themeIndex
    // is already counting forward in the middle of a back().
    const idx = s.theme && s.theme.index != null ? s.theme.index : s.themeIndex;
    // **The seed, the engine and the theme change hands at the swap**, all
    // three in one statement of the transport's (`promote`), so they are taken
    // here as one snapshot and the theme that arrived is written down once.
    // They used to be two branches: the seed's (or the theme's) wrote an
    // arrival under the engine still named here, and then the engine's wrote
    // a second — an engine hand-over journalled a theme under house-v2 that
    // never played, and a journal walk across seed and engine together never
    // walked (the reconciled review of 09-24, R24). The seed is the outer of
    // them: a new set's theme zero is not this set's theme zero.
    const seedMoved = s.masterSeed !== state.seed;
    const engineMoved = !!s.strategy && s.strategy !== state.strategy;
    const themeMoved = idx !== state.themeIndex && idx >= 0;
    // **And a pull landing in place** (Eugene, 09-24: *"a bird move keeps the
    // place"*): the same seed and theme, the plan playing now the one under
    // the asked spell — the readout re-reads it and the journal writes it down,
    // as it did when a pull brought the next theme.
    const spellMoved = !!m.record && m.record.track !== playedTrack && !seedMoved && !engineMoved && !themeMoved
      && playedTrack != null && m.record.track.index === playedTrack.index && !sameSpell(m.spell, playedSpell);
    if (m.record) { playedTrack = m.record.track; playedSpell = m.spell; }
    if (spellMoved) {
      replan('spell');
      arrived();
    }
    if (seedMoved || engineMoved || themeMoved) {
      if (seedMoved) {
        state.seed = s.masterSeed;
        state.castTo = null;
        state.castToTheme = null;
        // The spell is the seed's under `?recipe=`, so it is asked again.
        spellSeed = null;
      }
      if (engineMoved) {
        state.strategy = s.strategy!;
        state.strategyTo = null;
      }
      if (seedMoved || engineMoved) {
        state.cut = null;
      }
      state.themeIndex = Math.max(0, idx);
      state.previewIndex = null;
      replan(seedMoved ? 'seed' : engineMoved ? 'strategy' : 'theme');
      arrived();
      // A set that has changed hands is a place worth writing down at once,
      // rather than at whatever the loop's next five-second mark happens to be.
      if (seedMoved || engineMoved) remember();
    }
    // **A cast the transport let go is not coming.** A seek inside a cast's
    // blend abandons it, and a journal walk can be overtaken; the transport
    // says so by no longer casting, and the band stops drawing the set that
    // was coming (R20, R7).
    if (state.castTo && !s.casting && s.masterSeed !== state.castTo) {
      state.castTo = null;
      state.castToTheme = null;
      replan(null);
    }
    // While a hand is on the band the position belongs to the hand.
    if (!state.scrubbing) state.position = s.elapsed;
    state.transition = s.transition;
    if (!s.running && state.playing) {
      state.playing = false;
      state.mix = null;
    }
    return s;
  }

  /**
   * **While the page is hidden, the mix's own tick keeps the face current**
   * (the reconciled review of 09-24, R14). The frame loop was the only thing
   * that read the transport, and a hidden page draws no frames: on a locked
   * phone playing through the element the lock-screen card froze on the theme
   * of the lock, no theme that played was written into the journal, and the
   * second stored was the second the screen went dark. The mix emits on every
   * tick of a clock that is a worker; hidden, four of those a second read the
   * set, publish the card and, every five seconds, store the place. Visible,
   * the frames do it and this does nothing.
   */
  let hiddenRead = 0;
  function watchHidden(mix: Mix): void {
    mix.subscribe(() => {
      if (typeof document === 'undefined' || !document.hidden || state.mix !== mix) return;
      const now = Date.now();
      if (now - hiddenRead < 250) return;
      hiddenRead = now;
      syncFromMix();
      const r = readout();
      if (r) media(r);
      if (now - savedAt > 5000) remember();
    });
  }

  // While the mix runs, the clock is the audio context's, read once a frame.
  //
  // **One read of the set a frame, and no storage on it** (R98): the loop read
  // the mix, and then the readout read it again, and every five seconds the
  // frame itself wrote the place into storage and the address. The readout is
  // the one read, and the five-second place goes in an idle slot.
  function loop() {
    if (!state.mix) return;
    if (state.cut && state.ctx && state.ctx.currentTime > state.cut.end) state.cut = null;
    emit();
    if (Date.now() - savedAt > 5000) rememberSoon();
    if (state.mix) state.raf = requestAnimationFrame(loop);
  }

  /** The place written down in the next idle slot, once however often it is asked. */
  let rememberQueued = false;
  function rememberSoon(): void {
    if (rememberQueued) return;
    rememberQueued = true;
    // taken now, so the loop does not ask again while the slot is coming
    savedAt = Date.now();
    const run = () => { rememberQueued = false; remember(); };
    const ric = (globalThis as { requestIdleCallback?: (fn: () => void, o: { timeout: number }) => number }).requestIdleCallback;
    if (typeof ric === 'function') ric(run, { timeout: 1000 });
    else setTimeout(run, 0);
  }

  // A start is asynchronous, so it can be overtaken: by a stop, by a second
  // tap, by a cast. Each one takes the next number, and a startup whose number
  // has moved on stops at its next await and lets go of everything it built.
  // Without this a stop could report itself while a mix it could no longer
  // reach went on to start playing — the set that kept going after pause.
  let generation = 0;
  let pending: Mix | null = null; // a mix that has been built but not yet handed over

  function cancelStartup() {
    generation += 1;
    state.starting = false;
    const m = pending;
    pending = null;
    if (m) {
      try { m.stop(); } catch (e) { console.error(e); report('transport', 'a mix\'s stop threw', e); }
      console.warn('deep-house: cancelled a mix that was still starting');
    }
  }

  // Let go of the mix. The fade and everything downstream of it belong to the
  // mix, not here: this used to pull the mix's output in the same turn as the
  // stop, so the ramp the mix had just scheduled shaped nothing and the record
  // was cut off wherever its waveform stood. Returns the seconds until the set
  // is silent, so whoever asked can wait for it rather than guess.
  function disposeMix(why?: string): number {
    const m = state.mix;
    if (!m) return 0;
    state.mix = null;
    let quiet = 0;
    try { quiet = m.stop() || 0; } catch (e) { console.error(e); report('transport', 'a mix\'s stop threw', e); }
    if (why) console.warn(`deep-house: disposed a live mix (${why})`);
    return quiet;
  }

  function stop() {
    cancelStartup();
    // Where the set had actually reached, before the mix that knows it is let
    // go: this is the position that is remembered and resumed from.
    syncFromMix();
    // **A pull on its way is kept, not dropped** (the fault pass of 09-24).
    // The address has carried the asked spell since the ask; the set stops at
    // the theme the pull was bringing, at the second its landing had reached,
    // so a play starts from the plan the ring and the link promised and not
    // from the one they no longer describe.
    const landing = state.mix && !state.fake ? state.mix.pendingLanding : null;
    const quiet = disposeMix();
    if (landing) {
      state.themeIndex = landing.index;
      state.position = landing.from;
      state.previewIndex = null;
      replan('theme');
      arrived();
    }
    state.playing = false;
    // On the element path the element is the last thing out, so pausing it is
    // another way of cutting the fade off: it waits for the mix to be silent —
    // and then pauses it only if no start has begun since. A play pressed
    // inside those 400 ms is a start still building its mix when the timer
    // fires, and pausing the element under it left the set silent with the
    // ring saying it played (R8).
    if (quiet > 0) setTimeout(() => { if (!state.mix && !state.starting) keepAlive(false); }, quiet * 1000);
    else keepAlive(false);
    state.fake = false;
    cancelAnimationFrame(state.raf);
    state.raf = 0;
    state.transition = 0;
    state.cut = null;
    // Nothing is arriving any more. A hand-over in flight when a hand stopped
    // the set never lands, so what it claimed has to go with it — without this
    // the band went on drawing the set that was coming, and a play afterwards
    // drew its coming lanes off a cast that never happened.
    state.castTo = null;
    state.castToTheme = null;
    state.strategyTo = null;
    state.scrubbing = false;
    // Say "paused" to the system while it is still being listened to: nothing
    // is published once the activation flag is down, so clearing it first left
    // a lock screen holding a card that said the set was playing.
    const paused = readout();
    if (paused) media(paused);
    state.userStarted = false;
    remember();
    emit();
  }

  // The only door into sound. Everything that calls it is a hand: a tap on the
  // ring, a key, or the lock screen's own play button — which a person presses.
  async function start(): Promise<void> {
    // An export renders offline in a room of its own and never holds the set
    // (the never-stops rule), so a render in flight is no reason not to start.
    if (state.mix) return;
    state.userStarted = true;
    mediaHandlers();
    // A start still in flight is superseded by this one rather than racing it.
    cancelStartup();
    const gen = generation;
    const stale = () => gen !== generation;
    state.starting = true;
    let mine: Mix | null = null;
    try {
      const c = ctx();
      keepAlive(true); // before the first await: it has to happen inside the tap
      if (c.state !== 'running') await c.resume();
      if (stale()) return;
      // The ceiling's worklet, once per context, before any master is built.
      // A module that would not load where the browser has worklets is ours
      // or a deploy's, not the browser's: the set plays on, lower and unlimited
      // (R1, the held-errors audit); a browser with none is not a report.
      if (!(await prepareLimiter(c)) && c.audioWorklet && limiterFailure(c)) {
        report('limiter', 'the limiter\'s module did not load; the master runs lower, unlimited', limiterFailure(c), {}, () => true);
      }
      if (stale()) return;
      // And before anything is anchored: a context that has only just begun
      // running has not yet said how deep its output buffer is, and a start
      // that reads the head in that moment aims behind where the head will be
      // by the time the sound is real. Every way in comes through here — a
      // cold start, a resume from a persisted position, the restart after a
      // cast — so the wait is here and nowhere else.
      await settleHead(c);
      if (stale()) return;
      // Where the cursor was left: a seek made while stopped, or where a pause
      // happened. The set picks up there rather than at the theme's first bar.
      const from = clamp(state.position, 0, Math.max(0, playable() - 0.5));
      disposeMix('one was still alive when another was asked for');
      const d = sink();
      mine = createMix(c, { ...mixOpts(), destination: d ? d : c.destination });
      if (sourceMix) mine.setSourceMix(sourceMix);
      pending = mine;
      // Where the set was left goes into the start itself rather than into a
      // seek taken after it. A seek is a move inside one theme: it drops the
      // hand-over in flight and re-arms it on the next sixteen-bar line, so a
      // pause and a play inside a blend threw the mix away and brought it back
      // a dozen bars later — "the track cleared up to a simpler sound". The
      // mix works out from the position alone whether it falls inside a blend
      // and builds that blend again at the stage it had reached.
      await mine.start(state.themeIndex, from);
      if (stale()) return;
      pending = null;
      state.mix = mine;
      mine = null;
      state.playing = true;
      // And the element is asked to play again now there is a mix in it: a
      // pause from anything that ran while this start was building is undone.
      keepAlive(true);
      // **The mix says where it is, whether or not a frame is drawn** (R14).
      watchHidden(state.mix);
      state.position = from;
      // A position past the end of a blend belongs to the theme that arrived
      // at it, so what is drawn and what is written down are the mix's own
      // theme and position rather than the ones that were asked for.
      syncFromMix();
      // The set is up: the theme under the needle is a theme that is playing,
      // so it is an entry — the first of the evening, or the one a press while
      // the ring was stopped walked to.
      arrived();
      remember();
      emit();
      // and again, now that the element the system watches is really playing:
      // WebKit counts the handlers it has when its own media goes live, and the
      // ones set inside the gesture were set before that happened.
      mediaHandlers(true);
      loop();
    } catch (err) {
      // A context that would not resume, a limiter that would not load: the
      // start owns nothing (the `finally` below lets it go) and says so, rather
      // than leaving an unhandled rejection behind a ring that shows nothing
      // (R72). Every caller drops the promise, so this is where it ends.
      console.error('deep-house: the set could not start', err);
      // ours, and not a context the browser refused (R1, the held-errors audit)
      report('start', 'the set could not start', err);
      state.playing = false;
      emit();
    } finally {
      // A startup that was overtaken, or one that threw, owns nothing: what it
      // built is stopped here, so a mix is never left running with no one
      // holding it. A stop that happened while this was waiting stands.
      if (mine) {
        if (pending === mine) pending = null;
        try { mine.stop(); } catch (e) { console.error(e); report('transport', 'a mix\'s stop threw', e); }
      }
      if (!stale()) state.starting = false;
      // A start overtaken by a newer one leaves the element to it: pausing it
      // here paused the element the newer start was about to play into (R8).
      if (!state.mix && !state.starting) keepAlive(false);
    }
  }

  // A new master seed is a different set. The music stops while the old sigil
  // collapses; if it was playing, the ring starts it again once the new one is
  // drawn, which is what `resumeAfterCast` is for.
  //
  // `at` is where the new set begins, and it is read *after* the stop and not
  // before it. A stop's first act is to ask the mix where it had actually got
  // to — which theme was under the needle and at what second — because that is
  // what a pause has to write down. A cast is the opposite of a pause: it
  // says where the set starts, and anything the old mix knew about the old one
  // is not an answer to that question. Setting the theme before the stop and
  // letting the stop read it back is exactly how a reset to seed one came up
  // playing theme six.
  // A cut the transport has taken, drawn as a wait. The transport answers with
  // a promise since 09-19 — it builds the theme it is going to before it starts
  // a deck — so the mark is armed when the answer comes, and a press that was
  // overtaken (a second press, a stop) answers `null` and arms nothing.
  function armCut(p: Promise<TransportPoint | null>, kind: Cut['kind']): void {
    const mine = state.mix;
    // **When the hand asked**, off the set's own clock and taken here rather
    // than when the answer comes back: the wait a face draws begins at the
    // press, and the transport spends a turn — sometimes a little more, for a
    // landing nobody has warmed — building the theme it is going to. Without
    // this the length of the wait was whatever the first frame after the answer
    // happened to read, which is not a value anybody has.
    const askedAt = state.ctx ? state.ctx.currentTime : 0;
    p.then((t) => {
      // The set that was asked, and not whichever one is playing now: a mix
      // let go while its answer was in flight has nothing left to draw a wait
      // for.
      if (!t || !t.at || state.mix !== mine) return;
      state.cut = { askedAt, at: t.at, end: t.end, swapAt: t.swapAt || t.end, kind };
      // **And what is coming is read again here.** A hand-over is armed a turn
      // after it is asked for — the transport spends that turn building the
      // theme it is going to. Before round (a) of the reconciled review of
      // 09-24 `mix.spellAsked` and `mix.strategyAsked` turned over only at the
      // arming, so the `replan` taken at the ask planned the coming theme under
      // the spell still *playing*; they answer the ask at once now (R22), and
      // this second read is what makes the ring's "next" the theme the seam is
      // actually carrying. It bumps no change counter, so nothing is redrawn.
      replan(null);
      emit();
    }).catch((err) => { console.error(err); report('transport', `a ${kind} the transport could not build`, err); });
  }

  // **A cast while the set is playing is a hand-over and not a stop** (Eugene,
  // 09-19: *"once the machine is started it never stops"*). The dice roll the
  // new seed, the transport plans the new set and mixes into its first theme
  // from where the record is, and everything that names the set — the seed on
  // the readout, the theme index, the store, the ring's own sigil — turns over
  // at the swap, because that is when the new set is what is playing.
  //
  // What the ring shows between the throw and the swap is the band's coming
  // lanes, which is what it shows at every other hand-over: `state.castTo` is
  // what makes the theme they draw the new set's first rather than this set's
  // next. Nothing else on the face changes, and no mark is added for it.
  //
  // `false` back means the cast was not taken and the caller does what a cast
  // has always done: stop, re-plan and start again. That is every cast on a
  // stopped ring, a cast onto a stated theme and position (a link, the bench),
  // and a transport that refused the hand-over.
  function castLive(next: string, at: CastPoint): boolean {
    if (!state.mix || !state.playing || state.starting) return false;
    if (Math.floor(Number(at.themeIndex) || 0) !== 0 || Number(at.seconds) > 0) return false;
    // Already on its way: a second throw onto the set that is already arriving
    // asks for what is already happening, and plans nothing.
    if (state.castTo === next) return true;
    const mix = state.mix;
    // The arriving set's own spell, worked out the way `createMix` works one
    // out: under `?recipe=` a spell is rolled off the master seed, so a new
    // seed is a new spell and the transport must be handed the one the readout
    // will report once the seed has changed hands.
    const cast = recipesFor({ masterSeed: next, strategy: state.strategy });
    const spell = cast.spell;
    state.castTo = next;
    state.castToTheme = 0;
    state.previewIndex = null;
    // **A null answer is a cast overtaken, never refused** (R7). Another move
    // took it over — a next, a back, a seek, another throw — and that move says
    // where the set is going; the transport never refuses a cast while it is
    // playing. It used to be read as a refusal, and the fallback stopped the
    // set and started it again, which is exactly what a cast must not do: a
    // next pressed while the new set was being built stopped the music. A cast
    // the transport lets go is taken off the face by `syncFromMix`.
    armCut(mix.cast(next, { spell, recipe: cast.track }), 'cast');
    // Drawn after the transport has taken the cast, which it does in the same
    // turn: a readout before it would find nothing casting and let go of it.
    replan(null);
    emit();
    return true;
  }

  function recast(reason: string, at: CastPoint | null = null): boolean {
    // A set that is still starting counts as one that was playing: the cast
    // has to cancel it, and it is what the listener asked to hear.
    const was = state.playing || state.starting;
    state.castTo = null;
    state.castToTheme = null;
    state.strategyTo = null;
    if (state.mix || state.starting) stop();
    if (reason === 'seed') state.resumeAfterCast = was;
    if (at) {
      state.themeIndex = Math.max(0, Math.floor(Number(at.themeIndex) || 0));
      state.previewIndex = null;
    }
    state.position = at && at.seconds > 0 ? Number(at.seconds) : 0;
    state.transition = 0;
    replan(reason);
    writeLinkUrl();
    emit();
    return was;
  }

  const control = {
    /** What a link asked for that the page would not play, taken off the address when the page opened. */
    linkProblems: link.problems,
    /**
     * **The address, read through the link's table** (`src/link.ts`): what a
     * check running in the page asks instead of parsing `location.search` for
     * itself, so the page and its suite read a link one way. A search string
     * reads that instead; `write` is the page's own writer over this address.
     */
    link: {
      read: (search?: string) => linkHere(search ?? location.search, { pageDefault: PAGE_DEFAULT }),
      write: (place: LinkState, base: string = location.search) => linkWrite(place, base),
      raw: (name: string, search?: string) => linkRaw(name, search ?? location.search),
      /**
       * **The link with the time** (K32): the ring's canonical link — every
       * sound row of what plays, no view row — with \`t\`, whole seconds into
       * the theme (the transport's own second when none is given). What the
       * machine view's key copies.
       */
      withTime: (seconds?: number): string => {
        const r = readout();
        const here = linkHere(location.search, { pageDefault: PAGE_DEFAULT });
        const place: LinkState = { seed: state.seed, theme: state.themeIndex, strategy: state.strategyTo ?? state.strategy,
          spell: here.spell, recipe: here.recipe, accompaniment: here.accompaniment, development: here.development };
        const search = linkWithTime(place, seconds ?? (r ? r.seconds : state.position));
        return `${location.origin}${location.pathname}?${search}`;
      },
    },
    /** `?lock=engine`: the link names its engine and the machine view's selector holds it. */
    engineLocked: ENGINE_LOCKED,
    get sourceMix(): SourceMix { return sourceMix ?? defaultSourceMix; },
    /** Is a mixer in the set at all? Only once a control has moved off clean. */
    get sourceMixOn(): boolean { return sourceMix !== null; },
    /**
     * The machine view's mute, solo, dry and volume. **Clean is nothing at
     * all**: until a control moves away from unity no mixer is installed on any
     * deck (the view opening changes no byte of the record), and a state that
     * is back at clean takes it out again, so the decks built after it are the
     * decks the page has always built.
     */
    setSourceMix(next: SourceMix) {
      const gain = next.gain ? Object.fromEntries(Object.entries(next.gain).filter(([, v]) => v !== 1)) : {};
      if (!next.mute.length && !next.solo.length && !next.dry.length && !Object.keys(gain).length) {
        control.resetSources();
        return;
      }
      sourceMix = { mute: [...next.mute], solo: [...next.solo], dry: [...next.dry],
        ...(Object.keys(gain).length ? { gain } : {}) };
      // **Not a seek** (R18). The first move away from clean installs a mixer
      // on each deck and the notes already handed to the clock went straight to
      // their buses — a look-ahead's worth, 120 ms — and it used to seek the
      // transport to put them through it: a blend in flight was dropped in 80
      // ms, a held pad lost up to a bar, and near the mix point the seam moved
      // by sixteen bars, from a control in a view that only looks. The next
      // note the pump schedules already goes through the mixer.
      if (state.mix) state.mix.setSourceMix(sourceMix);
      emit();
    },
    /**
     * **Back to clean, and out of the set** (Eugene's page review of 09-22,
     * finding 3): what was set in the view is not in force once the view is
     * closed. The decks playing are handed a clean state, which the engine
     * ramps to unity and retires (fix round A), and a set started after it is
     * built with no mixer at all, because this holds `null` again.
     */
    resetSources() {
      if (!sourceMix) return;
      sourceMix = null;
      if (state.mix) state.mix.setSourceMix(cleanSourceMix());
      emit();
    },
    get state() { return state; },
    get track() { return state.track; },
    get playing() { return state.playing; },
    get mix() { return state.mix; },
    LAYER_ORDER,
    LAYER_LABEL,
    LANES,

    /** The lock screen's cover, as the face rendered it, or null for the static one (round K15). */
    setCover(list: { src: string; sizes: string; type: string }[] | null): void {
      cover = list && list.length ? list : null;
      // the metadata is written again at the next readout, with the new cover
      mediaFor = '';
      const r = readout();
      if (r) media(r);
    },
    /** What the lock screen is showing for a cover now. */
    coverShown(): string[] { return (cover ?? artwork()).map((a) => a.src); },

    subscribe(fn: (r: Readout) => void): () => void {
      listeners.add(fn);
      const r = readout();
      if (r) fn(r);
      return () => listeners.delete(fn);
    },

    emit,
    readout,
    planned,
    plannedAlready,
    /** how many themes the page has planned for itself, for a gate to count */
    get plansMade() { return plansMade; },
    start,
    stop,
    toggle() { return state.mix ? stop() : start(); },

    // A seed asked for by name. Where its set begins is part of the ask and
    // defaults to the beginning of it — theme one, bar one — so a seed written
    // down and typed back in plays the record that was written down, and not
    // its sixth theme because that is where the last one had reached.
    setSeed(seed: string | number, { themeIndex = 0, seconds = 0 }: Partial<CastPoint> = {}): void {
      const next = String(seed).trim() || '1';
      if (next === state.seed && themeIndex === state.themeIndex) return;
      if (castLive(next, { themeIndex, seconds })) return;
      state.seed = next;
      recast('seed', { themeIndex, seconds });
    },

    newSeed(): string {
      const next = rollSeed();
      if (castLive(next, { themeIndex: 0, seconds: 0 })) return next;
      state.seed = next;
      recast('seed', { themeIndex: 0, seconds: 0 });
      return state.seed;
    },

    /**
     * The spell the set is cast under, set by a hand.
     *
     * The transport's half of `notes/archive/2026-09-plans/cited/PLAN-BIRDS-UX.md` §3, and the door the ring's own
     * pull will come through when a cell becomes a control (UX-1, step 5). What
     * it does is the rule of that section: the spell is written into the
     * address bar at once, because the URL is the save and the share, and the
     * *music* changes at the next phrase line, handed over by the same blend a
     * theme gets — never abruptly, and never by stopping.
     *
     * Stopped, there is nothing to hand over from, so the URL is the whole of
     * it: the spell is read back off the address bar when a set is started,
     * which is exactly what `?spell=` has always done.
     *
     * Setting the spell the set is already under does nothing at all, so a face
     * may call this on every release without keeping a copy to compare against.
     */
    setSpell(spell: Partial<Spell> | null): void {
      // Against what the set has been *asked* for, which while a hand-over runs
      // is the spell arriving rather than the one still sounding.
      if (sameSpell(spell, state.mix ? state.mix.spellAsked : spellOf())) return;
      writeSpellUrl(spell);
      if (state.mix) {
        armCut(state.mix.setSpell(spell), 'spell');
        // The theme coming is the one the new spell plans: the plan cache is
        // keyed on the whole request, the spell among it, so the promise the
        // hand's ring was drawing is already there (R13; this cleared the
        // cache on a comment that said the key had no spell in it).
        replan(null);
        emit();
        return;
      }
      // Stopped: the URL is the spell now, so the memo goes and everything
      // drawn is re-planned under it.
      spellSeed = null;
      replan('spell');
      emit();
    },

    /**
     * **The engine, changed by a hand — the machine view's one control.**
     *
     * `notes/archive/2026-09-v2-day-chain/plans/PLAN-MACHINE-VIEW.md` §5b: a labelled selector in the output
     * column, and choosing a row **hands over into the same seed under that
     * strategy as a seam, never a stop**. So this is `setSpell`'s shape one
     * layer out: the URL is written at the ask, because a link is the save and
     * the share, and the *music* changes at the next phrase line over the blend
     * a theme gets. The readout's own `strategy` follows at the swap, in
     * `syncFromMix`, and not here.
     *
     * Stopped, the URL is the whole of it and the set started next is planned
     * under it — which is what `?v=` does.
     *
     * Asking for the engine the set is already under, or already arriving
     * under, does nothing, so a selector may call this on every click.
     */
    setStrategy(id: string): void {
      const next = strategyFor({ strategy: id }).id;
      if (ENGINE_LOCKED && next !== (state.strategyTo ?? state.strategy)) return;
      // Against what has been *asked* for and not only what is playing —
      // `strategyTo` as well as the mix's own, because a hand-over spends a
      // moment building the theme it is going to before the transport has
      // taken the ask on, and a second click in that moment must plan nothing.
      const asked = state.strategyTo ?? (state.mix ? state.mix.strategyAsked : state.strategy);
      if (next === asked) return;
      writeStrategyUrl(next);
      if (state.mix) {
        const mix = state.mix;
        state.strategyTo = next;
        const going = mix.setStrategy(next);
        armCut(going, 'engine');
        // A hand-over the transport could not make leaves nothing claimed: the
        // engine that is playing goes back into the address bar and the coming
        // lanes go back to being this engine's.
        going.then((t) => {
          if (t || state.mix !== mix || state.strategyTo !== next) return;
          state.strategyTo = null;
          writeStrategyUrl(state.strategy);
          replan(null);
          emit();
        }).catch((err) => { console.error(err); report('transport', 'an engine hand-over the transport could not build', err); });
        replan(null);
        emit();
        return;
      }
      state.strategy = next;
      state.strategyTo = null;
      replan('strategy');
      remember();
      emit();
    },

    // mix.ts takes its preset when the set is created, so changing it means a
    // new set from the same seed, resumed at the theme you were on.
    setPreset(p: string): void {
      if (!PRESETS_CYCLE.includes(p) || p === state.preset) return;
      state.preset = p;
      const was = recast('preset');
      if (was) start();
    },

    // Nothing pins a theme length today; the mix draws its own.
    setMinutes(m: number): void {
      const n = Number(m);
      if (!(n >= 1 && n <= 8) || n === state.minutes) return;
      state.minutes = n;
      const bs = state.track ? state.track.barSeconds : 2.3;
      state.themeBars = Math.max(16, Math.round((n * 60) / bs / 16) * 16);
      const was = recast('minutes');
      if (was) start();
    },

    // 0..1 along the theme. `commit` false only paints the readout, which is
    // what a drag wants until the finger lifts.
    seekTo(fraction: number, commit = true): number {
      if (!state.track) return 0;
      const to = clamp(fraction, 0, 1) * playable();
      // Where the drag began, so a gesture that asks for nothing — a flick, a
      // cancellation — can put it back even with no set playing.
      if (!commit && !state.scrubbing) scrubFrom = state.position;
      state.position = to;
      // While a scrub is under way the position belongs to the hand; the
      // playhead must not write over it between two moves.
      state.scrubbing = !commit;
      if (commit && state.mix) {
        state.mix.seek(to);
        // The seek dropped whatever seam was running, so a cut the face is
        // still counting down to is not going to happen.
        state.cut = null;
      }
      if (commit) remember();
      emit();
      return to;
    },

    // Every gesture along the band ends here, exactly once, whatever ended
    // it: a lift, a flick, a cancelled drag, a pointer capture the system took
    // away. A lift commits where the hand left the cursor; a flick or a
    // cancellation gives the position back to the transport, because nothing
    // was asked for. `scrubbing` is what stops the playhead writing over the
    // hand, so leaving it set froze the cursor, the elapsed time, the
    // remembered position and the rating window while the set played on.
    endScrub({ commit = false, fraction = null }: { commit?: boolean; fraction?: number | null } = {}): number {
      const was = state.scrubbing;
      state.scrubbing = false;
      if (commit) {
        const f = fraction == null ? (playable() ? state.position / playable() : 0) : fraction;
        return control.seekTo(f, true);
      }
      if (state.mix) state.position = state.mix.state.elapsed;
      else if (was) state.position = clamp(scrubFrom, 0, playable());
      if (was) emit();
      return state.position;
    },

    seekToBar(bar: number): number {
      if (!state.track) return 0;
      return control.seekTo(clamp(bar, 0, state.track.bars - 1) / state.track.bars);
    },

    // --- the set ---------------------------------------------------------
    // Forward is a DJ cut over eight bars, not a jump.
    // Forward is a DJ cut: mix.ts starts it on the next bar and blends over
    // eight, so the theme index only turns over at the end of it. The cut is
    // remembered here so a face can say that the tap was taken.
    skip(): number {
      // **Forward walks the journal while there is an entry ahead**
      // (`notes/archive/2026-09-plans/cited/PLAN-BIRDS-UX.md` §3b). Past its end this is the set's next theme, which
      // is what next has always been, so a page with no journal behind it
      // behaves exactly as it did.
      const ahead = journal.forward();
      if (ahead.kind === 'entry') {
        walkTo(ahead.entry, ahead.index, 'skip');
        return ahead.entry.theme + 1;
      }
      if (state.mix) {
        // The transport builds the theme it is going to before it starts a
        // deck, so the cut it hands back arrives a turn later (and, for a
        // landing nobody has warmed, a moment later than that). The press is
        // answered on the beat either way; what waits is the mark that draws
        // the wait.
        //
        // **And it is never refused** (step 1c): the transport counts from the
        // theme it is aiming at, so the coming lanes draw what is arriving and
        // not this theme's neighbour.
        const to = state.mix.aim + 1;
        // Counted from the aim, which a cast still on its way has moved: a
        // next then goes to the arriving set's next theme, and the band draws
        // that one.
        if (state.castTo) state.castToTheme = to; else state.previewIndex = to;
        armCut(state.mix.skip(), 'skip');
        replan(null);
        remember();
        emit();
        return to;
      }
      // Stopped: step the plan only. Nothing sounds until play is pressed,
      // and then it starts at this theme's first bar.
      state.themeIndex += 1;
      state.position = 0;
      state.previewIndex = null;
      replan('theme');
      remember();
      emit();
      return state.themeIndex;
    },

    back(): boolean {
      // **Back walks the journal across casts** (`notes/archive/2026-09-plans/cited/PLAN-BIRDS-UX.md` §3b): the seed
      // you were on three tracks ago, as a hand-over like every other
      // manipulation of the ring. Before its first entry it is this set's
      // previous theme, which is what back has always been.
      const behind = journal.back();
      if (behind.kind === 'entry') {
        walkTo(behind.entry, behind.index, 'back');
        return true;
      }
      // Counted from the aim, so five backs inside a second walk five themes
      // and the first theme of a set is still the floor.
      const from = state.mix ? state.mix.aim : state.themeIndex;
      if (from <= 0) {
        journal.cancel();
        state.change = { n: state.change.n + 1, reason: 'refused' };
        emit();
        return false;
      }
      if (state.mix) {
        if (state.castTo) state.castToTheme = from - 1; else state.previewIndex = from - 1;
        replan(null);
        armCut(state.mix.back(), 'back');
        remember();
        emit();
        return true;
      }
      state.themeIndex -= 1;
      state.position = 0;
      state.previewIndex = null;
      replan('theme');
      remember();
      emit();
      return true;
    },

    // Back to the beginning: seed one, first theme, first bar, and nothing
    // remembered. The ring casts onto it as it would any other seed — playing,
    // that is a hand-over like every other manipulation of the ring, and what
    // is written down goes on saying where the record actually is until the new
    // set has it.
    resetToStart(): string {
      clearStore();
      // Back to the beginning means the beginning: the evening's walk goes with
      // the place that was saved, so the ring after a reset is the ring a
      // listener who has never been here gets.
      journal.clear();
      if (castLive('1', { themeIndex: 0, seconds: 0 })) return '1';
      state.seed = '1';
      recast('seed', { themeIndex: 0, seconds: 0 });
      remember();
      return state.seed;
    },

    remember,
    /** The evening's walk, for a face that wants to draw it and for a gate. */
    journal,
    out: OUT,
    latencyHint: LATENCY,

    // what the browser actually gave us, for the bench to show
    timing(): Timing {
      const c = state.ctx;
      if (!c) return { hint: LATENCY, rate: null, base: null, output: null };
      return {
        hint: LATENCY,
        rate: c.sampleRate,
        base: c.baseLatency == null ? null : +(c.baseLatency * 1000).toFixed(1),
        output: c.outputLatency == null ? null : +(c.outputLatency * 1000).toFixed(1),
        lookahead: Math.round((state.lookahead || VISIBLE_LOOKAHEAD) * 1000),
      };
    },

    // Called inside the tap that casts, so the context is awake when the new
    // set starts a second and a half later, outside any gesture.
    resumeContext(): AudioContextState {
      const c = ctx();
      if (c.state === 'suspended') c.resume().catch(() => {});
      return c.state;
    },

    // The ring calls this when the new sigil is finished.
    resumeIfCast(): boolean {
      if (!state.resumeAfterCast) return false;
      state.resumeAfterCast = false;
      start();
      return true;
    },

    // For drawing a crossing before the mix engine is driving one.
    setTransition(p: number): void {
      state.transition = clamp(Number(p) || 0, 0, 1);
      emit();
    },

    prepareNext(i?: number | null): NextInfo | null {
      state.nextTrack = planned(i == null ? state.themeIndex + 1 : i);
      emit();
      return nextInfo();
    },

    // A clock that is not an audio context: the ring can be drawn mid-theme
    // without a gesture, which is how the headless screenshots are taken.
    mock({ playing = true, seconds = 0, transition = null, themeIndex = null }:
      { playing?: boolean; seconds?: number; transition?: number | null; themeIndex?: number | null } = {}): Readout | null {
      if (themeIndex != null && themeIndex !== state.themeIndex) {
        state.themeIndex = themeIndex;
        replan('theme');
      }
      state.fake = true;
      state.playing = playing;
      state.position = clamp(seconds, 0, playable());
      if (transition != null) state.transition = clamp(transition, 0, 1);
      emit();
      return readout();
    },
  };

  console.info(OUT === 'silent'
    ? 'deep-house: output silent — the set ends in a gain of zero into the destination, so ' +
      'the clock, the scheduling and the capture tap are what they always are and nothing is heard.'
    : OUT === 'direct'
    ? 'deep-house: output direct — the mix goes straight to the context. No media element, ' +
      'so no lock-screen card and no background play; use ?out=element to get them back.'
    : 'deep-house: output through a media element — a lock-screen card and background play, ' +
      'at the cost of a second buffer. Use ?out=direct to hear the graph itself.');
  // A restored session is always a stopped one: the seed, the theme and the
  // bar come back, the sound does not.
  const how = restore();
  // Tonight's walk, where there is one and it is tonight's and it is on the
  // place this page is starting from. A link somebody sent plays what the link
  // says: the walk in storage is left where it is and this session starts its
  // own (`src/journal.ts`).
  journal.load(placeNow());
  if (minutes) control.setMinutes(minutes);
  else replan(null);
  // **The link's bar is the place**, and the second saved in this browser is
  // kept only where it is inside that bar: the address is written wherever the
  // position is, so the two agree on a reload and the stored second is the
  // finer of them; a link from somewhere else names its own bar and wins.
  const startBar = urlBar();
  if (startBar !== null && state.track) {
    const bar = Math.min(startBar, state.track.bars - 1);
    if (Math.floor(state.position / state.track.barSeconds) !== bar) state.position = bar * state.track.barSeconds;
  }
  // **The time link's second** (round K32): the theme starts at the bar line at
  // or before it — the place the bar path above starts from — and a time past
  // where the theme plays to starts at its last phrase line (four bars) inside
  // it. Read once: the address drops `t` at once, so a reload plays from the
  // top, and the ledger says where the set was started.
  const startT = urlTime();
  if (startT !== null && state.track) {
    const bs = state.track.barSeconds;
    const lastBar = Math.max(0, Math.floor(playable() / bs) - 1);
    const lastLine = Math.floor(lastBar / 4) * 4;
    const bar = Math.min(Math.floor(startT / bs), lastLine);
    state.position = bar * bs;
    note('transport', `started at ${formatTime(state.position)}`, { asked: formatTime(startT), bar: bar + 1 });
    try {
      const search = linkWithout(location.search, 't');
      history.replaceState(history.state, '', `${location.pathname}${search ? `?${search}` : ''}${location.hash}`);
    } catch (e) { /* a page with no history to write on */ report('address', 'the address could not be written', e, {}, addressFlood); }
  }
  // A place restored from this browser is one a hand left here, and the address
  // is written for it; a link that was opened is left as it came (repaired, if
  // it had to be) until a hand acts, so a bare link stays the page's choice and
  // a dev link keeps its bar until the set starts.
  if (how !== 'fresh') {
    state.position = clamp(state.position, 0, Math.max(0, playable() - 0.5));
    if (how === 'restored') remember(); else store();
  }
  // the page going away is the last chance to write down where we were — in
  // the store; the address was written by whatever hand last moved the set
  const leave = () => { if (state.track) store(); };
  window.addEventListener('pagehide', leave);
  document.addEventListener('visibilitychange', () => { if (document.hidden) leave(); });
  return control;
}

/** The transport itself: what both faces drive and what a check can drive headless. */
export type Control = ReturnType<typeof createControl>;

export default createControl;
