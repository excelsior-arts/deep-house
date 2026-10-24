// The machine, with no page attached to it.
//
// Under it is src/mix.ts: an endless set, one theme running into the next.
// Everything the interface needs to know is a readout pushed to subscribers;
// everything it can do is a method here. Two faces (the bench and the
// ring) drive the same object, and a headless check can drive it with a fake
// clock and never open an audio context at all.

import { createMix, startMark, primeStart, planTheme, mixPointSeconds, blendBarsFor, blendAsked, recipesFor, spellFor, strategyFor, DEFAULT_STRATEGY, HOUSE, applyBypass, readBypass } from './mix.ts';
import { sameSpell, spellQuery, spellFromQuery } from './spell.ts';
import { linkRead, linkHere, linkWrite, linkRaw, linkBare, linkOver, linkSameSound, pageDefault, linkWithTime, linkWithout, linkTimeStart } from './link.ts';
import type { LinkProblem, LinkState } from './link.ts';
import { recipeById } from './recipes.ts';
import { reachOf } from './library-draw.ts';
import type { Spell } from './spell.ts';
import type { Recipe } from './recipe.ts';
import { definitionOf } from './generation.ts';
import { accompanimentFor } from './recipe-request.ts';
import { developmentFor } from './development.ts';
import { prepareLimiter, limiterFailure } from '@deep-house/engine/master';
import { chordAtBar, noteName } from './theory.ts';
import { REGISTRY, ARRANGEMENT_LAYERS, layersWhere } from '@deep-house/engine/voices';
import type { MixOptions, SetTrack, Track } from './mix.ts';
import type { Descriptor } from '@deep-house/engine/voices/descriptor';
import type { MixState, MixWait, TransportPoint } from '@deep-house/engine/session';
import { createJournal } from './journal.ts';
import { planOffThread, startPlanner, plannerState } from './plan-off-thread.ts';
import type { OffThreadHow } from './plan-off-thread.ts';
import type { JournalEntry, JournalPlace } from './journal.ts';
import { note, report, addressFlood, aBug } from './ledger.ts';
import { hatsOfProgram, programFactsOf, keysOfProgram, heldOfProgram, airPlayOf, type AirPlay } from './bird-labels.ts';
import type { HatsReading, ProgramFacts } from './bird-labels.ts';
import { cleanSourceMix } from '@deep-house/engine/source-mix';
import { ON_WAVE } from './surf.ts';
import { exchangesOf } from './moments.ts';
/** The conversation's parts that ink their lanes (`lanesOf`): its calls, its answers and its hand's marks; the ground's bowl rings under them all. */
const CONVERSATION_STRIKES: ReadonlySet<string> = new Set(['conversation-call', 'conversation-answer', 'conversation-punctuation']);
import type { SourceMix } from '@deep-house/engine/source-mix';
import { sayHello } from './console-hello.ts';
import { pageBase } from './page-base.ts';
import { watchSlowdowns, settleSlowdowns, slowSummary, slowdowns } from './slowdown.ts';
import { readStress, stressRender } from './render-stress.ts';

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
  // **The sea's lanes** (PLAN-AMBIENT Phase 4, `src/surf.ts`): where a place lays a sea it holds off the lanes whose
  // parts it lays itself (the pad, the bass, the keys), so their sections' layers are off, and the parts that enter on
  // its waves — the bloom, the bass on the undertow, the bell on the break — open their own lane over the bars they
  // sound; every lane the sea lays, its noises' too, is as deep in a bar as the sea is high there (its largest wave's
  // size): faint in a calm or a lull, full under a set's large waves. A theme with no sea draws what it always did.
  //
  // **The conversation's lanes** (PLAN-AMBIENT Phase 1; ambient-waves-3, the same rule): where a place lays a
  // conversation it holds off the lanes whose parts it strikes itself, so their sections' layers are off too, and its
  // calls, its answers and its hand's marks open their own lane over the bars they sound, each as deep as it was struck
  // (its velocity against the theme's own strikes, in thirds), the bars it rings on a step fainter than its strike; the
  // ground's bowl, which rings under everything, inks nothing. A theme with no conversation draws what it always did.
  const sea = (track as Track & { sea?: { waveList: ReadonlyArray<readonly [number, number, number, number, ...unknown[]]> } }).sea;
  const talk = !!(track as Track & { conversation?: unknown }).conversation;
  const laid: Record<string, Uint8Array> = {};
  const struck: Record<string, Uint8Array> = {};
  for (const L of LANES) { laid[L.id] = new Uint8Array(bars); struck[L.id] = new Uint8Array(bars); }
  const partOf = (ev: { part?: unknown }) => (typeof ev.part === 'string' ? ev.part : '');
  const strikes = talk ? track.events.filter((ev) => CONVERSATION_STRIKES.has(partOf(ev as { part?: unknown })) && of[ev.layer]).map((ev) => Number(ev.p?.vel ?? 0)) : [];
  const velLo = strikes.length ? Math.min(...strikes) : 0, velHi = strikes.length ? Math.max(...strikes) : 0;
  const tierOf = (vel: number) => { const u = velHi > velLo ? (vel - velLo) / (velHi - velLo) : 1; return u < 1 / 3 ? 1 : u < 2 / 3 ? 2 : 3; };
  // **One depth an exchange** (ambient-waves-4, the review of 10-19: the keys lane stepped bar to bar inside one, the
  // call at its tier, its ring a step fainter, the answer at its own): an exchange's calls and answers (the ring's own
  // grouping, `exchangesOf`) ink their lanes at the exchange's depth, its strongest strike's, from its first strike's
  // bar to its last's; only the bars it rings on past its last strike are a step fainter.
  const exchangeTier = new Map<object, number>();
  const exchangeSpans: Array<{ lane: string; from: number; to: number; tier: number }> = [];
  if (talk && !sea) {
    const conv = (track as Track & { conversation?: { breathS?: number } }).conversation;
    const S = track.events.filter((ev) => (partOf(ev as { part?: unknown }) === 'conversation-call' || partOf(ev as { part?: unknown }) === 'conversation-answer') && of[ev.layer])
      .map((ev) => ({ t: ev.t, part: partOf(ev as { part?: unknown }), voice: ev.voice, ev })).sort((a, b) => a.t - b.t);
    for (const x of exchangesOf(S, conv?.breathS ?? 8, track.barSeconds)) {
      const all = [...x.calls, ...x.answers] as typeof S;
      const tier = Math.max(...all.map((y) => tierOf(Number(y.ev.p?.vel ?? 0))));
      for (const y of all) exchangeTier.set(y.ev, tier);
      const lanes = new Set(all.map((y) => of[y.ev.layer]));
      const barOf = (y: (typeof S)[number]) => (y.ev.bar == null ? Math.floor(y.t / track.barSeconds) : y.ev.bar);
      for (const lane of lanes) {
        const mine = all.filter((y) => of[y.ev.layer] === lane);
        exchangeSpans.push({ lane, from: Math.min(...mine.map(barOf)), to: Math.max(...mine.map(barOf)), tier });
      }
    }
  }
  for (const ev of track.events) {
    const id = of[ev.layer];
    if (!id) continue;
    const b = ev.bar == null ? Math.floor(ev.t / track.barSeconds) : ev.bar;
    if (b >= 0 && b < bars) {
      counts[id][b] += 1;
      const part = partOf(ev as { part?: unknown });
      if ((sea && ON_WAVE.has(part)) || (talk && CONVERSATION_STRIKES.has(part))) {
        const z = Math.min(bars, Math.ceil((ev.t + Math.max(0, Number(ev.p?.dur ?? 0))) / track.barSeconds - 1e-6));
        for (let k = b; k < Math.max(b + 1, z); k++) laid[id][k] = 1;
        if (talk && !sea) {
          const tier = exchangeTier.get(ev) ?? tierOf(Number(ev.p?.vel ?? 0));
          for (let k = b; k < Math.max(b + 1, z); k++) struck[id][k] = Math.max(struck[id][k], k === b ? tier : Math.max(1, tier - 1));
        }
      }
    }
  }
  for (const x of exchangeSpans) for (let k = Math.max(0, x.from); k <= Math.min(bars - 1, x.to); k++) { laid[x.lane][k] = 1; struck[x.lane][k] = Math.max(struck[x.lane][k], x.tier); }
  const seaHigh = sea ? new Float32Array(bars) : null;
  if (seaHigh) for (const [t0, , until, size] of sea!.waveList) {
    for (let b = Math.max(0, Math.floor(t0 / track.barSeconds)); b < Math.min(bars, Math.ceil(until / track.barSeconds)); b++) seaHigh[b] = Math.max(seaHigh[b], size);
  }
  for (const L of LANES) {
    let max = 0;
    for (let b = 0; b < bars; b++) max = Math.max(max, counts[L.id][b]);
    for (let b = 0; b < bars; b++) {
      const row = track.timeline[b];
      const allowed = L.layers.length
        ? L.layers.some((k) => row && row.layers.includes(k)) || laid[L.id][b] === 1
        : counts[L.id][b] > 0;
      if (!allowed) continue;
      const d = max ? counts[L.id][b] / max : 0;
      // the sea's lanes: the sea's height in the bar, a calm, a swell, a large wave
      const h = seaHigh && (!L.layers.length || laid[L.id][b] === 1) ? seaHigh[b] : null;
      // the conversation's: its strikes' depth in the bar
      const c = struck[L.id][b];
      level[L.id][b] = h != null ? (h < 0.45 ? 1 : h < 0.9 ? 2 : 3) : c > 0 ? c : counts[L.id][b] === 0 ? 1 : d < 0.34 ? 1 : d < 0.72 ? 2 : 3;
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
  /** **Where the page is in a playlist** (PLAN-LIBRARY §1): this device's state, never the library's */
  playlist?: PlaylistPlace;
  at: string;
}
/** A playlist by its name (`null`, Saved) and the track's place in it, zero-based. */
export interface PlaylistPlace { name: string | null; index: number }

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
/**
 * **Whether this browser keeps a place** (a seed it left): what a first run is told by (featured, 10-23). A bare
 * address with none starts on the first featured playlist (`playlists-ui.ts`, `openListLink`).
 */
export function placeStored(): boolean {
  const was = readStore();
  return !!(was && was.seed);
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

/** A context whose device would not start within the wait (`wakeDevice`): the device's, never a report. */
class DeviceAsleep extends Error {
  readonly ctxState: string;
  constructor(ctxState: string) { super(`the audio device would not start (${ctxState})`); this.ctxState = ctxState; }
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
  /** the gesture that asked for the hand-over in flight, kept from the press: a back that walks the journal is a cast to the transport, and a face still draws the chevron */
  cutAsk: Cut['kind'] | null;
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
  /**
   * **A hand has asked for the set and its record has not begun yet** (K42):
   * from the press, through the build and the start's lead, to the instant the
   * set's clock reaches the first moment of the record. The face draws the
   * pause and holds the needle, and nothing else reads it: `playing` is still
   * the transport's own word, true once the set is up, so the lock screen and
   * every count go on saying what they always said.
   */
  starting: boolean;
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
  /** the section row's own name (round T2, `src/sections.ts`) where it is not the kind's word; '' where it is */
  sectionName: string;
  /** the sub-section the bar is in (round DNB-1): a switch-up's figure, a turnaround, a fill, a drop-out; '' outside one */
  sub: string;
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
  /** and the held voice that plays most, which Zephyr names where no keys play (the bird-labels round) */
  held: string | null;
  /** and how bright the front voices play (the strike, the keys' low-pass, the knob), which Zephyr's air word reads (bird-labels round 3) */
  air: AirPlay | null;
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
    /** what the hand-over in flight carries — a step, a cast, a spell, an engine — as the transport says it */
    cutKind: Cut['kind'] | null;
    /**
     * **The gesture that asked for it** (10-05, Eugene on a back that walked the
     * journal and filled the die: *"since the Prev button is clicked it must
     * fill right to left"*): `back` or `skip` where a chevron was pressed, even
     * where the walk is a cast to the transport; the face draws the pressed node.
     */
    cutAsked: Cut['kind'] | null;
    /** and whether it lands on another seed: a step that walks the journal onto one fills the die beside the chevron */
    cutCasts: boolean;
    cutting: boolean;
    /** seconds until the grid counts at the tempo the set is heading for, the glide included; nought when it does */
    settleIn: number;
    /**
     * **The hand-over in flight as one wait, on the set's own clock** (round
     * MIX-X1): the transport's `MixWait` — asked when, the low end changing
     * hands when, the tempo fully heard when, and a plan number that moves
     * only on a genuine re-plan — beside the clock it is read against. A face
     * draws a bird's wait as (now − its drop) over (heard − its drop), both
     * on this clock, so the fill closes exactly as the value is heard and
     * never from a value it sampled.
     */
    wait: MixWait | null;
    /** the set's clock at this readout, which `wait`'s instants are on */
    clock: number;
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

/**
 * **A playlist steering the transport** (PLAN-LIBRARY §2, *Playing a playlist*):
 * next and back step through it (true: taken), the dice leave it, and `place`
 * is what the store keeps.
 */
export interface PlaylistSteer {
  next(): boolean;
  back(): boolean;
  leave(): void;
  place(): PlaylistPlace | null;
}

/**
 * **The link of a place as it sounds** (PLAN-LIBRARY §2: a saved track is a record of what you heard): the seed,
 * the theme, the engine, the recipe and the two modes, and the spell the theme is played under, written only where
 * the link would not roll it again (under a recipe, a spell equal to the seed's roll is left to the roll), as
 * `writePlaceSpell` writes the address. Pure, so a check can hold the throne's save to it.
 */
export function linkOfPlace(p: { seed: string; theme: number; strategy: string; spell: Partial<Spell> | null; recipe: string | null; accompaniment: LinkState['accompaniment']; development: LinkState['development'] }): string {
  const place = { seed: p.seed, theme: p.theme, strategy: p.strategy, recipe: p.recipe, accompaniment: p.accompaniment, development: p.development };
  let spell = p.spell;
  if (p.recipe !== null) {
    try {
      const rolled = recipesFor({ masterSeed: p.seed, strategy: p.strategy, search: `?${linkWrite({ ...place, spell: null })}` }).spell;
      if (sameSpell(spell, rolled)) spell = null;
    } catch (e) { /* written as it stands */ }
  }
  return linkWrite({ ...place, spell });
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
  // the playlist place a reload carries on in, read before anything writes the store again
  const resumedPlaylist: PlaylistPlace | null = (() => {
    const p = typeof location === 'undefined' ? null : readStore()?.playlist;
    return p && typeof p === 'object' && (p.name === null || typeof p.name === 'string') && Number.isInteger(p.index) && p.index >= 0 ? { name: p.name, index: p.index } : null;
  })();
  /** **The playlist's hand on next, back and the dice** (PLAN-LIBRARY §2): set by the Playlists tab while a playlist plays. */
  let steer: PlaylistSteer | null = null;
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
  /**
   * **A listening link's desk** (round DNB-CLEAN): `solo=` and `mute=` on the
   * address, a comma list of layers (`kick`, `clap`, `hats`, `bass`, `pad`,
   * `keys`, …: every instrument whose events carry that layer) or of
   * instruments by name, set the machine view's solo and mute as the page
   * opens — so a link can say "the drums alone" or "everything but the bed".
   * The private tier only, as `reach=` is; a release build reads neither.
   */
  let sourceMix: SourceMix | null = (() => {
    if (typeof __PRIVATE_TOOLS__ === 'undefined' || !__PRIVATE_TOOLS__ || typeof location === 'undefined') return null;
    const names = (raw: string | null): string[] => {
      if (!raw) return [];
      const out = new Set<string>();
      for (const word of raw.split(',').map((w) => w.trim()).filter(Boolean)) {
        const byLayer = REGISTRY.filter((d) => d.layer === word).map((d) => d.name);
        for (const v of byLayer.length ? byLayer : REGISTRY.some((d) => d.name === word) ? [word] : []) out.add(v);
      }
      return [...out].sort();
    };
    const solo = names(linkRaw('solo', location.search)), mute = names(linkRaw('mute', location.search));
    return solo.length || mute.length ? { mute, solo, dry: [] } : null;
  })();
  const defaultSourceMix = cleanSourceMix();
  /**
   * **The private tier's reach** (round D1, `src/library-draw.ts`): how far a
   * library turn's row may leak beyond its place, off `reach=` and the machine
   * view's slider. A dev or preview build only — `__PRIVATE_TOOLS__` is false
   * in a release, which then reads nothing and plays the style's own (`null`).
   */
  let reachAsked: number | null = (() => {
    if (typeof __PRIVATE_TOOLS__ === 'undefined' || !__PRIVATE_TOOLS__ || typeof location === 'undefined') return null;
    const raw = linkRaw('reach', location.search);
    return raw !== null && raw.trim() !== '' && Number.isFinite(Number(raw)) ? reachOf(Number(raw)) : null;
  })();

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
    cutAsk: null,            // the gesture that asked for it, from the press
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
  let scrubTrack: SetTrack | null = null; // and the record's plan it was made on, while one plays

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
      ...(playlistNow() ? { playlist: playlistNow()! } : {}),
      at: new Date().toISOString(),
    });
  }
  /** The playlist place the store keeps: the steer's, once there is one; until then the one this page opened on. */
  function playlistNow(): PlaylistPlace | null {
    return steer ? steer.place() : resumedPlaylist;
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
  function arrived(at: { bar: number; clock: number | null } | null = null): void {
    const place = placeNow();
    const did = journal.arrived(place, at ?? whereNow());
    if (did === 'already') return;
    addressOf(place);
    note('theme', did === 'walked' ? 'the journal walked onto a theme it had played' : 'a theme was written into the journal',
      { seed: place.seed, theme: place.theme + 1, engine: place.strategy,
        entry: journal.at + 1, of: journal.entries.length });
  }

  /** The bar of the theme the set is at, and the context's clock: where an entry began. */
  function whereNow(): { bar: number; clock: number | null } {
    const t = state.track;
    return {
      bar: t ? Math.floor(clamp(state.position, 0, Math.max(0, playable())) / t.barSeconds) + 1 : 1,
      clock: state.ctx ? +state.ctx.currentTime.toFixed(3) : null,
    };
  }

  /**
   * **The address names the place the set is at.** The arriving theme's spell
   * is written only when nothing newer is asked: a spell asked while an
   * earlier one's seam was in flight lands that one at once and hands over
   * again into its own (`mix.setSpell`), and `setSpell` has already written
   * it: writing the arriving theme's spell here put the link one spell behind
   * the ring until the second landed too (the fault pass of 09-24). The link
   * is what plays *and* what is asked, so while the set has been asked for
   * another spell the address keeps it.
   */
  function addressOf(place: JournalPlace): void {
    if (!state.mix || sameSpell(state.mix.spellAsked, place.spell)) writePlaceSpell(place);
    writeLinkUrl();
  }

  /**
   * **A theme is written into the journal once it has sounded** (the deep
   * review of 10-08: five quick nexts journalled three themes nobody heard,
   * and a back then walked through them). A theme a hand-over brought has
   * been up under the record for its blend and is written at the swap; one a
   * quick press promoted before it began — a next pressed again inside the
   * cut the last one asked — is written only once a beat of it has played,
   * and a theme the set has left by then is never written. The address names
   * it at once, because the address is where the set is.
   */
  let owed: { track: unknown; at: number; where: { bar: number; clock: number | null } } | null = null;
  function arrivedPlaying(m: Mix, s: MixState): void {
    const r = m.record;
    const now = state.ctx ? state.ctx.currentTime : 0;
    const heardFrom = r ? (r.laidFrom ?? now) + Math.max(0, s.beatSeconds || 0) : now;
    if (!r || now >= heardFrom - 1e-6) { owed = null; arrived(); return; }
    owed = { track: r.track, at: heardFrom, where: whereNow() };
    addressOf(placeNow());
  }
  /** The theme owed to the journal: written once it has sounded a beat, forgotten once the set has left it. */
  function settleOwed(m: Mix): void {
    if (!owed) return;
    if (!m.record || m.record.track !== owed.track) {
      note('theme', 'a theme the set left before it sounded was not written into the journal', { theme: state.themeIndex + 1 });
      owed = null;
      return;
    }
    if (state.ctx && state.ctx.currentTime >= owed.at - 1e-6) {
      const where = owed.where;
      owed = null;
      arrived(where);
    }
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
    goTo(entry, recipeOfEntry(entry), kind);
  }

  /**
   * **A hand-over into a stated place** (the journal's walk, and since
   * PLAN-LIBRARY phase 3 a playlist's track, `playPlace`): playing, `mix.cast`
   * with the seed, the theme, the engine, the spell and the recipe named, so
   * the seam is the set's own; stopped, the plan alone, and the pointer settles
   * at once. `startAt` is a stopped place's second (a link's `t`).
   */
  function goTo(entry: JournalPlace, recipe: Recipe | null, kind: Cut['kind'], startAt: number | null = null): void {
    if (state.mix) {
      const here = entry.seed === state.seed;
      state.castTo = here ? null : entry.seed;
      state.castToTheme = here ? null : entry.theme;
      state.previewIndex = here ? entry.theme : null;
      state.strategyTo = entry.strategy === state.strategy ? null : entry.strategy;
      armCut(state.mix.cast(entry.seed, {
        spell: entry.spell, themeIndex: entry.theme, strategy: entry.strategy,
        recipe,
      }), kind);
      // **The birds go with it** (his question 10-20: only the die showed the wait): the spell the place is heard
      // under is the ask from here, so it is in the address at once, as a pull's is, and the ring stands its birds
      // at it and fills their wait to the swap (`followOutsideAsk`, ring.ts). The sound is the cast's, as before.
      writePlaceSpell(entry);
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
    if (startAt !== null && state.track) state.position = linkTimeStart(startAt, state.track.barSeconds, playable());
    arrived();
    remember();
    emit();
  }

  function restore(): 'url' | 'fresh' | 'restored' {
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
    // **A bare address in a browser that stored nothing** no longer throws the die (featured, his word 10-23: the
    // random first seed "is not really working out"): the page puts the first featured playlist's first track on the
    // address before the transport is made (`openListLink`, playlists-ui.ts), so it arrives here as a link. Only where
    // there is none to put (an empty table) does a bare first open come here, and it is the link table's seed.
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

  let slowTick: (() => void) | null = null;
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
      // **The slowdown watch** (round audio-slack, `slowdown.ts`): the render
      // clock against the wall clock on each of the transport's ticks.
      slowTick = watchSlowdowns(state.ctx, OUT);
      // and a check's render made to fall behind (`?stress=`, `render-stress.ts`)
      const stress = readStress(linkRaw('stress', location.search));
      if (stress) void stressRender(state.ctx, stress);
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
        keep.addEventListener('pause', () => { if (state.playing && !state.starting) stop('system'); });
      }
      if (d && keep.srcObject !== d.stream) keep.srcObject = d.stream;
      keep.play().catch(() => {});
    } else if (keep) {
      keep.pause();
    }
  }

  // **The sound is checked, not assumed** (round lock-resume, his iPhone 10-23: a pause, a while in other apps,
  // the lock screen's play did nothing, and the app then said it played, silently). On the element path the set
  // reaches the speaker through links the page does not own: the context's device, the stream, and WebKit's
  // element. After a long pause in the background any of them can be dead with the page none the wiser: a
  // context whose `resume()` never settles (WebKit holds the promise until it can have its audio session), one
  // that says `running` while its clock stands (WebKit lets its audio session go when its process is suspended,
  // and the context is not told), or an element that plays nothing. So a start is not a sound until the render
  // clock and the element are seen moving:
  // - the device's wake is bounded (`wakeDevice`, 3 s): a resume that has not run by then fails the start, and
  //   the key shows paused;
  // - once the set is up, and whenever the page comes back into view while it says it plays, `hear` watches
  //   both clocks for 1.5 s;
  // - a set that is not heard (`checkSound`; the face shows the start's wait meanwhile) has its device stopped
  //   and started again and the element handed its stream again; then a stream of its own (the clock runs, the
  //   element does not) or a context of its own, built anew, the set started where it was;
  // - and what still cannot sound stops, paused: the next press builds a new context inside its own gesture.
  // The element path only: the direct one (the Mac, desktop browsers) and the checks' silent one are unchanged.
  const WAKE_WAIT_MS = 3000;
  const HEAR_MS = 1500;
  /** what the render clock must have moved, at least, over the check (a device buffer is at most ~85 ms) */
  const HEAR_MOVED_S = 0.2;
  /** the output did not come back: the next start builds a context of its own first, inside its gesture */
  let outputDead = false;
  /** a check or a revival under way, superseded by a stop or a newer start */
  let hearGen = 0;
  /** the set is being revived: the face shows the start's wait */
  let reviving = false;
  const checksSound = OUT === 'element';
  const settleWithin = (p: Promise<unknown>, ms: number): Promise<boolean> =>
    Promise.race([p.then(() => true, () => false), new Promise<boolean>((r) => setTimeout(() => r(false), ms))]);

  /** The device woken, or not within the wait: a context that cannot have its device is said, not waited on. */
  async function wakeDevice(c: AudioContext): Promise<void> {
    if (c.state === 'running') return;
    // asked at once, so a start's first call is still inside its gesture
    const resumed = c.resume();
    if (!checksSound) { await resumed; return; }
    await settleWithin(resumed, WAKE_WAIT_MS);
    if ((c.state as AudioContextState) !== 'running') throw new DeviceAsleep(c.state);
  }

  /** Whether the set is heard: the render clock and the element both move within `HEAR_MS` of wall time. */
  async function hear(gen: number): Promise<boolean | null> {
    const c = state.ctx;
    if (!c) return false;
    const t0 = performance.now(), ct0 = c.currentTime, et0 = keep ? keep.currentTime : 0;
    for (;;) {
      await new Promise((r) => setTimeout(r, 250));
      if (gen !== hearGen || state.ctx !== c) return null;
      const moved = c.currentTime - ct0;
      const el = !!keep && !keep.paused && keep.currentTime > et0;
      if (c.state === 'running' && moved >= HEAR_MOVED_S && el) return true;
      // a context that is not running under a set that says it plays is not heard, and no wait will change that
      if (performance.now() - t0 >= (c.state === 'running' ? HEAR_MS : HEAR_MS / 3)) return false;
    }
  }

  /** What the check reads, for the ledger. */
  function soundFacts(): Record<string, string | number | boolean> {
    const c = state.ctx;
    return { ctx: c ? c.state : 'none', clock: c ? +c.currentTime.toFixed(3) : 0, hidden: !!document.hidden,
      element: keep ? (keep.paused ? 'paused' : 'playing') : 'none', elementTime: keep ? +keep.currentTime.toFixed(3) : 0 };
  }

  /** After a start, or the page back in view: is the set heard, and if not, bring it back or say it stopped. */
  function checkSound(why: 'start' | 'shown' | 'rebuilt' | 'shell'): void {
    if (!checksSound || !state.mix || !state.playing) return;
    const gen = ++hearGen;
    void (async () => {
      const heard = await hear(gen);
      if (heard !== false || gen !== hearGen || !state.mix) return;
      const was = soundFacts();
      reviving = true;
      emit();
      try {
        // 1. the device stopped and started again, the element handed its stream again
        const c = state.ctx!;
        await settleWithin(c.suspend(), 1000);
        await settleWithin(c.resume(), WAKE_WAIT_MS / 2);
        if (gen !== hearGen) return;
        const d = sink() as MediaStreamAudioDestinationNode | null;
        if (keep && d) { keep.srcObject = null; keep.srcObject = d.stream; keep.play().catch(() => {}); }
        const ct1 = c.currentTime;
        if (await hear(gen)) {
          note('transport', 'the set was not heard; its output was started again', { why, step: 'device', ...was });
          return;
        }
        if (gen !== hearGen || !state.mix) return;
        // 2. built anew and the set started where it was (once: a rebuilt one that is not heard either stops):
        // a stream of its own where the clock runs and the element does not; else a context of its own. A
        // browser that starts a context only inside a gesture (Safari) cannot start that one from here: its
        // start fails, paused, and the next press builds it inside its gesture.
        if (why !== 'rebuilt') {
          const running = c.state === 'running' && c.currentTime - ct1 >= HEAR_MOVED_S;
          note('transport', running ? 'the set was not heard; a new stream plays it on' : 'the set was not heard; a new audio context plays it on',
            { why, step: running ? 'stream' : 'context', ...was });
          rebuildAndPlay(running ? 'stream' : 'context');
          return;
        }
        // 3. it cannot sound: paused, honestly; the next press starts on a new context inside its gesture
        note('transport', 'the set could not be heard; it is paused, and the next play builds its output again', { why, ...soundFacts() });
        outputDead = true;
        reviving = false;
        stop('system');
      } finally {
        if (gen === hearGen && reviving) { reviving = false; emit(); }
      }
    })();
  }

  /** Let the context go: the next `ctx()` builds a new one, and its stream and the element's source with it. */
  function dropContext(): void {
    const c = state.ctx;
    if (!c) return;
    state.ctx = null;
    state.sink = null;
    if (keep) keep.srcObject = null;
    c.close().catch(() => {});
  }

  /** The set stopped where it is, its stream (or its whole context) replaced, and started again from there. */
  let rebuilt = false;
  function rebuildAndPlay(what: 'stream' | 'context'): void {
    syncFromMix();
    disposeMix();
    state.playing = false;
    if (what === 'context') dropContext();
    else { state.sink = null; if (keep) keep.srcObject = null; }
    rebuilt = true;
    void start();
  }

  // the page back in view while it says it plays: is it heard (the lock screen, another app, a long while)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkSound('shown'); });

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
    if (reachAsked !== null) o.reach = reachAsked;
    return o;
  }


  // **The link's bypass, as the set reads it** (the deep review of 10-08): a
  // `roles=`, `strings=` or `sub=` link plays its themes with the bypass folded
  // in (`readBypass`, read once, as `createMix` reads it), so the plans the
  // ring and the machine view read are folded the same way and name the voice
  // that plays — they named the one the bypass took out.
  const linkBypass = readBypass();
  // planTheme is pure and cheap, and it hands back the whole track — the
  // timeline, the events, the arrangement — which is what the lanes are made
  // of. The mix's own planTheme() only summarises, so this is the one to use.
  function planned(
    i: number,
    seed: string = state.seed,
    strategy: string = state.strategy,
    under?: Partial<Spell> | null,
    // (round D1) the reach the plan is made at: the playing set's, or the one asked of what is coming
    reach: number | null = reachNow(),
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
    const key = planKeyOf(i, seed, strategy, spell, recipe, reach);
    const had = cachedPlan(key);
    if (had) return had;
    return keepPlan(key, applyBypass(planTheme(seed, i, planOpts(seed, strategy, spell, recipe, reach)), linkBypass));
  }

  /** A plan already made under this request, if there is one, made the most recently asked. */
  function cachedPlan(key: string): SetTrack | null {
    const had = planCache.get(key);
    if (!had) return null;
    // the most recently asked is the last to go
    planCache.delete(key);
    planCache.set(key, had);
    return had;
  }
  /** The options a plan of the page's is made under: the set's, with the place's own over them. */
  function planOpts(seed: string, strategy: string, spell: Partial<Spell> | null, recipe: Recipe | null, reach: number | null): Partial<MixOptions> {
    // **The reach as the number it is** (the planning perf round, 10-12): the
    // style's own (`null`) is read as `reachOf(null)`, nought, wherever a plan
    // reads it, so a stopped ring (the reach asked, none) and a playing set (the
    // set's, nought) ask for the same plan by one name — a stop planned the
    // playing theme again, 40 ms in its own task, for the name alone. Byte for
    // byte the same plan over the link digest's grid.
    return { ...mixOpts(), masterSeed: seed, strategy, spell, recipe, reach: reachOf(reach) };
  }
  /** A plan made, counted and kept by its request. */
  function keepPlan(key: string, t: SetTrack): SetTrack {
    plansMade += 1;
    lanesOf(t);
    planCache.set(key, t);
    // **The least recently asked goes, one at a time** (R13): the cache used to
    // be emptied whole at nine, and nine other places emptied it besides, so a
    // theme the ring had just planned was planned again a line later.
    //
    // **Never the theme playing or the one coming** (the planning perf round,
    // 10-12): the die's twelve candidates, planned ahead after every pull,
    // pushed the playing theme's plan out, and the next `replan` planned it
    // again on the page's thread — MEASURED 50 ms in a pull's own task for the
    // Drum & Bass tile.
    if (planCache.size > PLAN_CACHE) {
      for (const [k, v] of planCache) {
        if (v === state.track || v === state.nextTrack || v === t) continue;
        planCache.delete(k);
        break;
      }
    }
    return t;
  }

  /**
   * **The same request, planned off the page's thread** (the planning perf
   * round, 10-12): the plan `planned` would make, made in the planner's
   * worker (`src/plan-off-thread.ts`) and kept by the same request, so the
   * `planned` and `plannedAlready` after it find it. One planned already is
   * handed back at once. `null` where there is no worker, and the caller plans
   * here as it always did; a promise that rejects where a later ask with the
   * same `tag` took its place, or where the plan throws.
   */
  function planLater(
    i: number,
    seed: string = state.seed,
    strategy: string = state.strategy,
    under?: Partial<Spell> | null,
    reach: number | null = reachNow(),
    how: OffThreadHow = {},
  ): Promise<SetTrack> | null {
    const spell = under !== undefined ? under
      : seed === state.seed ? spellOf() : spellFor({ masterSeed: seed, strategy });
    const recipe = seed === state.seed
      ? state.mix?.recipe ?? castOf().track : recipesFor({ masterSeed: seed, strategy }).track;
    const key = planKeyOf(i, seed, strategy, spell, recipe, reach);
    const had = cachedPlan(key);
    if (had) return Promise.resolve(had);
    const offer = planOffThread(seed, i, planOpts(seed, strategy, spell, recipe, reach), { ...how, bypass: linkBypass });
    if (!offer) return null;
    // a plan of the same request made here meanwhile is the one kept
    return offer.then((track) => cachedPlan(key) ?? keepPlan(key, track));
  }

  // The row by its resolved definition (`definitionOf`: id, revision and
  // content), as the mix names a place: a new revision or a desk edit of a row
  // under the same id is another plan (the deep review of 10-08).
  const planKeyOf = (i: number, seed: string, strategy: string, spell: Partial<Spell> | null, recipe: Recipe | null, reach: number | null): string =>
    `${strategy}|${seed}|${i}|${state.preset}|${state.themeBars || 0}|${spellQuery(spell) || 'house'}|${definitionOf(recipe) ?? ''}|${accompanimentFor()}|${developmentFor()}|${reachOf(reach)}`;
  /** (round D1) the reach the playing theme was planned at: the set's own while there is one, else the one asked */
  const reachNow = (): number | null => (state.mix ? state.mix.reach : reachAsked);

  /**
   * **The same request, answered only if it has been planned already**: a face
   * that is drawn faster than a theme can be planned asks this first and plans
   * on its own clock (R13: the phone panel planned a whole theme on every notch
   * of its slider).
   */
  function plannedAlready(i: number, seed: string, strategy: string, under: Partial<Spell> | null): SetTrack | null {
    const recipe = seed === state.seed
      ? state.mix?.recipe ?? castOf().track : recipesFor({ masterSeed: seed, strategy }).track;
    return planCache.get(planKeyOf(i, seed, strategy, under, recipe, reachNow())) ?? null;
  }

  function replan(reason: string | null) {
    trackSoon(state.themeIndex);
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
    const next: Parameters<typeof planned> = state.castTo
      ? [Math.max(0, state.castToTheme ?? 0), state.castTo, state.strategyTo ?? state.strategy]
      : [Math.max(0, ahead), state.seed, state.strategyTo ?? state.strategy,
        state.mix ? state.mix.spellAsked : undefined, state.mix ? state.mix.reachAsked : reachAsked];
    nextSoon(next);
    if (reason) state.change = { n: state.change.n + 1, reason };
    primeSoon();
  }

  /**
   * **The coming theme, planned off the page's thread while a set plays** (the
   * planning perf round, 10-12). A pull asked for it in the hand's own task —
   * the theme in place under the asked spell, the very plan the mix's landing
   * makes — so a pull planned it twice there. The plan is asked of the worker
   * and the coming card reads it when it lands, a plan's time after the ask
   * (the card read the theme it had until then: it is read by the card and by
   * nothing else); planned already, or before the page has drawn a card, or
   * with no worker, it is read at once as it always was. A stop that keeps a
   * pull's landing asks for the theme after it this way too.
   */
  let nextAsk = 0;
  /**
   * **And the theme playing, planned again under a request that changed while
   * it plays** — the reach the set was started at, a recipe it took on — off
   * the thread the same way, the readout reading the plan it has of the same
   * theme until it lands. MEASURED, the first pull after a start planned the
   * playing theme again here, 50 ms for the Drum & Bass tile, because the set's
   * reach became part of the request once it was running. Another theme — a
   * swap, a skip, a cast — is read at once, as it always was.
   */
  let trackAsk = 0;
  let trackOf = '';
  function trackSoon(i: number): void {
    const ask = ++trackAsk;
    const of = `${state.seed}|${state.strategy}|${i}`;
    const offer = state.mix && state.track && of === trackOf ? planLater(i) : null;
    if (!offer) { state.track = planned(i); trackOf = of; return; }
    void offer.then((t) => {
      if (ask !== trackAsk) return;
      state.track = t;
      emit();
    }, () => {
      if (ask === trackAsk) { try { state.track = planned(i); emit(); } catch (err) { report('plan', 'the theme playing could not be planned', err); } }
    });
  }
  function nextSoon(args: Parameters<typeof planned>): void {
    const ask = ++nextAsk;
    const offer = state.mix || state.nextTrack ? planLater(...args) : null;
    if (!offer) { state.nextTrack = planned(...args); return; }
    void offer.then((t) => {
      if (ask !== nextAsk) return;
      state.nextTrack = t;
      emit();
    }, () => {
      // the plan throws here as it would have, and says so where it always did
      if (ask === nextAsk) { try { state.nextTrack = planned(...args); emit(); } catch (err) { report('plan', 'the coming theme could not be planned', err); } }
    });
  }

  /**
   * **The theme a Play would open on, planned before the hand asks** (K42):
   * in an idle slot whenever the set is stopped and what it would start on may
   * have moved, so a Play finds its plan and its compile made
   * (`primeStart`, `src/mix.ts`). Once however often it is asked; a plan made
   * for a place the start no longer names is simply not taken.
   */
  let primeQueued = false;
  function primeSoon(): void {
    if (primeQueued || state.mix || state.starting) return;
    primeQueued = true;
    const run = () => {
      primeQueued = false;
      if (state.mix || state.starting) return;
      primeStart(mixOpts(), state.themeIndex);
    };
    const ric = (globalThis as { requestIdleCallback?: (fn: () => void, o: { timeout: number }) => number }).requestIdleCallback;
    if (typeof ric === 'function') ric(run, { timeout: 1000 });
    else setTimeout(run, 0);
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
  //
  // **Off the transport's own wait first** (round MIX-X1): the mix publishes
  // the hand-over a hand asked for from the ask itself — the line it will
  // take, before its landing is built — where `state.cut` is armed a turn
  // later, when the answer comes back. A fill that reads the wait begins at
  // the drop; one that read `state.cut` began up to a second after it.
  const askedWait = (): (MixWait & { kind: Cut['kind'] }) | null => {
    const w = state.mix && !state.fake ? state.mix.state.wait : null;
    return w && w.kind !== 'seam' ? (w as MixWait & { kind: Cut['kind'] }) : null;
  };
  /**
   * **The hand-over a node is counting down to, and only until its swap**
   * (round MIX-X5, Eugene on a cast landed with Ember still settling: *"the
   * die's node stayed filled for a while after the seed had turned"*). The
   * transport's wait outlives the swap — it names the tempo's arrival too,
   * which is Ember's own sector to draw — and the answer (`state.cut`) stands
   * to the blend's end; a node's fill is the press to the swap and nothing
   * after it, so past the swap there is no cut for a node to draw.
   */
  const nodeCut = (): { askedAt: number; swapAt: number; kind: Cut['kind'] } | null => {
    const c = askedWait() ?? state.cut;
    if (!c) return null;
    const now = state.ctx ? state.ctx.currentTime : 0;
    return c.swapAt > now ? c : null;
  };
  function cutInSeconds(): number {
    if (!state.ctx) return 0;
    const c = nodeCut();
    return c ? Math.max(0, c.swapAt - state.ctx.currentTime) : 0;
  }

  // And how long the whole wait is: the press to the swap, both ends read off
  // the seam the transport answered with. A face that draws the wait divides
  // one by the other and never samples a clock of its own, so a second press
  // restarts the drawing because it moves both numbers.
  function cutSpanSeconds(): number {
    const c = nodeCut();
    return c ? Math.max(0.001, c.swapAt - c.askedAt) : 0;
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
  function readout(at?: number): Readout | null {
    // The transport's own time, taken here rather than at the last animation
    // frame: everything downstream of a readout — the lock screen's position,
    // a rating's window, what a face draws — is then the set as it is.
    const live = syncFromMix();
    const t = state.track;
    if (!t) return null;
    // `at`: the set as it would read at a stated second, for a still picture
    // (M21: the ring photographed at a bar's downbeat); the transport is not moved
    const pos = clamp(at ?? state.position, 0, playable());
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
      starting: (state.starting && !state.playing) || reviving || !!(state.playing && live && live.leading),
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
      /** the section row's own name, where it is not the kind's word (round T2) */
      sectionName: (row as { sectionName?: string }).sectionName ?? '',
      /** the sub-section the bar is in, where it is in one (round DNB-1) */
      sub: (row as { sub?: string }).sub ?? '',
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
      held: heldOfProgram(t.events) ?? null,
      air: airPlayOf(t.events, t.knobs, (t.dice as { keysPreset?: string }).keysPreset),
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
        // the transport's own wait names the hand-over in flight (a bird pulled
        // into a cast's is still the cast's, round MIX-X5); the answer's kind
        // stands in only before the transport has said
        cutKind: nodeCut()?.kind ?? null,
        cutAsked: nodeCut() ? state.cutAsk : null,
        cutCasts: !!nodeCut() && !!state.castTo,
        cutting: !!nodeCut(),
        // and how long until the grid counts at the tempo the set is heading
        // for: the seam and the glide after it (round K12c)
        settleIn: live && typeof live.settleIn === 'number' ? live.settleIn : 0,
        wait: live ? live.wait ?? null : null,
        clock: state.ctx ? state.ctx.currentTime : 0,
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
    // **The line is the theme, and changes only with it** (Eugene, 10-19: over
    // Bluetooth in his car and on his TV the progress "resets to zero and back
    // … a quick flip in a split second, but noticeable"). The line used to carry
    // the chord as well, retitled once a bar; a receiver — a car's Bluetooth
    // (AVRCP), AirPlay, a bridge to a cast speaker — takes any change of the
    // line for a new track and shows nought until a position comes. So the line
    // is the theme alone, and a new metadata with its artwork goes up once a
    // theme or when the cover is redrawn (iOS decodes the artwork again for
    // each: the performance review of 10-06), with the position told at once
    // after it, never up to a second later.
    const key = `${r.mix.themeNumber}|${r.seed}`;
    const title = `Theme ${roman(r.mix.themeNumber)}`;
    let fresh = false;
    if ((key !== mediaFor || !ms.metadata) && window.MediaMetadata) {
      mediaFor = key;
      try {
        ms.metadata = new window.MediaMetadata({ title, artist: 'Deep House', album: `seed ${r.seed}`, artwork: cover ?? artwork() });
        fresh = true;
      } catch (e) { /* older shapes */ }
    }
    const playback = r.playing ? 'playing' : 'paused';
    if (playback !== playbackSaid || ms.playbackState !== playback) { playbackSaid = playback; ms.playbackState = playback; }
    const now = Date.now();
    if ((fresh || now - posAt > 1000) && ms.setPositionState) {
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

  // The lock screen's two seek arrows, off: iOS shows them in place of the
  // previous and next track buttons. How far they would move, if switched on;
  // the system asks for its own `seekOffset` where it has one.
  const SEEK_ARROWS = false;
  const SEEK_STEP = 10;

  function mediaHandlers(again = false) {
    if (handlersOn && !again) return;
    const ms = typeof navigator !== 'undefined' && navigator.mediaSession;
    if (!ms || !ms.setActionHandler) return;
    handlersOn = true;
    const set = (name: MediaSessionAction, fn: MediaSessionActionHandler | null) => { try { ms.setActionHandler(name, fn); } catch (e) { /* unsupported */ } };
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
    // **No ten-second arrows** (Eugene, 10-19, on the iPhone's lock screen:
    // "I'd rather do normal next track button"). Where a page handles
    // `seekbackward`/`seekforward`, iOS draws the two buttons beside play as
    // ±10 s and drops previous and next; with them unset it draws the track
    // buttons, which are the ring's own back and skip. The scrubber still seeks.
    // The relative seeks stay written behind `SEEK_ARROWS` ("keep the code
    // though, maybe we will use it later").
    const by = (delta: number) => {
      const span = playable();
      if (!span) return;
      control.seekTo(clamp(state.position + delta, 0, span) / span, true);
    };
    set('seekbackward', SEEK_ARROWS ? (d) => by(-((d && d.seekOffset) || SEEK_STEP)) : null);
    set('seekforward', SEEK_ARROWS ? (d) => by((d && d.seekOffset) || SEEK_STEP) : null);
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
  let playedReach = 0;
  function syncFromMix(): MixState | null {
    const m = state.mix;
    if (!m || state.fake) return null;
    const s = m.state;
    settleOwed(m);
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
    // **And a reach landing in place** (round D1): the same theme planned again
    // at the asked reach. The readout re-reads it as a pull's landing does
    // ('spell': the ring restates its values and draws nothing of its own for
    // it), and it is not journalled: the reach is not a place a link names.
    const reachMoved = !spellMoved && !!m.record && m.record.track !== playedTrack && !seedMoved && !engineMoved && !themeMoved
      && playedTrack != null && m.record.track.index === playedTrack.index && m.reach !== playedReach;
    if (m.record) { playedTrack = m.record.track; playedSpell = m.spell; playedReach = m.reach; }
    if (spellMoved) {
      replan('spell');
      arrivedPlaying(m, s);
    }
    if (reachMoved) replan('spell');
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
      arrivedPlaying(m, s);
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
    // and a start's lead is not a position: the needle holds at the second it
    // was started from until the record reaches it (K42)
    if (!state.scrubbing) state.position = s.leading && s.leadFrom != null ? s.leadFrom : s.elapsed;
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
    // a theme owed to the journal goes with its set: a play writes the theme it starts on
    owed = null;
    let quiet = 0;
    try { quiet = m.stop() || 0; } catch (e) { console.error(e); report('transport', 'a mix\'s stop threw', e); }
    if (why) console.warn(`deep-house: disposed a live mix (${why})`);
    return quiet;
  }

  // **A stopped set lets the device rest** (the engine review of 10-08, F6):
  // on the direct path, once the fade is silent and no start has begun, and a
  // second more for the torn-down decks' notes to end, the context is suspended — a running one goes on pulling the destination for
  // nothing. `start()` resumes a context that is not running before it builds
  // anything; a start that began while the suspension was on its way resumes
  // it here. The element path keeps its context (the element is what a phone's
  // lock screen holds), and the silent one is a test's.
  const REST_AFTER_MS = 1000;
  function rest() {
    if (OUT !== 'direct') return;
    // a second on, so the notes the teardown stopped have ended and let go of their decks first
    setTimeout(() => {
      const c = state.ctx;
      if (!c || c.state !== 'running' || state.mix || state.starting) return;
      c.suspend().then(() => { if (state.mix || state.starting) c.resume().catch(() => {}); }).catch(() => {});
    }, REST_AFTER_MS);
  }

  /**
   * **Whose stop it was** (the review of 10-21, F5): `system` where the element was paused under the set (WebKit, for
   * a call or a lost output) or the app asked (its shell's `act`), a hand's otherwise. The Apple app reads it: an
   * interruption never resumes a hand's pause.
   */
  let stoppedBy: 'hand' | 'system' = 'hand';
  function stop(by?: unknown) {
    stoppedBy = by === 'system' ? 'system' : 'hand';
    cancelStartup();
    // a sound check or a revival under way is over (`checkSound`)
    hearGen += 1;
    reviving = false;
    // a slowdown open at a stop is closed where its lag last rose (`slowdown.ts`)
    settleSlowdowns();
    // Where the set had actually reached, before the mix that knows it is let
    // go: this is the position that is remembered and resumed from.
    syncFromMix();
    // **A pull on its way is kept, not dropped** (the fault pass of 09-24).
    // The address has carried the asked spell since the ask; the set stops at
    // the theme the pull was bringing, at the second its landing had reached,
    // so a play starts from the plan the ring and the link promised and not
    // from the one they no longer describe.
    const landing = state.mix && !state.fake ? state.mix.pendingLanding : null;
    // **And what it does not keep, it says** (the deep review of 10-08, F8): a
    // hand-over a hand asked for — a next, a back, a cast, an engine switch —
    // that has not changed hands is not rebuilt by a play, which resumes the
    // theme the record was on at its second. Only a pull's landing is kept
    // (above); the rest is dropped, and the ledger names it.
    const asked = state.mix && !state.fake ? state.mix.state.wait : null;
    if (asked && asked.kind !== 'seam' && !landing && state.ctx && asked.swapAt > state.ctx.currentTime)
      note('transport', 'a pause dropped a hand-over a hand had asked for; play resumes the record where it was', {
        kind: asked.kind, swapIn: +(asked.swapAt - state.ctx.currentTime).toFixed(2), theme: state.themeIndex + 1 });
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
    if (quiet > 0) setTimeout(() => { if (!state.mix && !state.starting) { keepAlive(false); rest(); } }, quiet * 1000);
    else { keepAlive(false); rest(); }
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
    primeSoon();
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
    // an output that could not be heard last time is built again first, inside this press (`checkSound`)
    if (outputDead) { outputDead = false; dropContext(); }
    const afterRebuild = rebuilt;
    rebuilt = false;
    const gen = generation;
    const stale = () => gen !== generation;
    state.starting = true;
    startMark('start');
    let mine: Mix | null = null;
    try {
      const c = ctx();
      keepAlive(true); // before the first await: it has to happen inside the tap
      // **The device is woken first and waited for last** (K42). A fresh
      // context's clock begins only when the output device has started —
      // MEASURED in headless Chromium 80 ms to a whole second after the
      // resume, which is the wait a first Play was heard to have — and the
      // start used to sit through it before it built anything. The resume is
      // asked here, inside the gesture, and everything that needs no running
      // clock — the limiter's module, the master, the first theme's plan, its
      // compile and its voices — is built while the device wakes. The anchor
      // is still read only after the context runs and its output buffer has
      // been said (`settleHead`), so where the record starts is unmoved.
      // On the element path the wait is bounded (`wakeDevice`): a device that cannot be had fails the start.
      const woken = wakeDevice(c)
        .then(() => { startMark('resumed'); return settleHead(c); })
        .then(() => { startMark('head'); });
      // handled where it is awaited, in the set's start; a start overtaken
      // before it gets there must not leave the rejection unheard of
      woken.catch(() => {});
      // The face answers the hand now, and not when the music does (K42): the
      // ring draws its key as the pause and holds the needle where it is, with
      // the point on it breathing, until the set's clock is running. After the
      // resume is asked, so drawing it costs the device nothing.
      emit();
      // The ceiling's worklet, once per context, before any master is built.
      // A module that would not load where the browser has worklets is ours
      // or a deploy's, not the browser's: the set plays on, lower and unlimited
      // (R1, the held-errors audit); a browser with none is not a report.
      if (!(await prepareLimiter(c)) && c.audioWorklet && limiterFailure(c)) {
        report('limiter', 'the limiter\'s module did not load; the master runs lower, unlimited', limiterFailure(c), {}, () => true);
      }
      startMark('limiter');
      if (stale()) return;
      // And before anything is anchored: a context that has only just begun
      // running has not yet said how deep its output buffer is, and a start
      // that reads the head in that moment aims behind where the head will be
      // by the time the sound is real. Every way in comes through here — a
      // cold start, a resume from a persisted position, the restart after a
      // cast — so the wait is here and nowhere else: it is `woken`, which the
      // set's start waits for before it anchors anything.
      // Where the cursor was left: a seek made while stopped, or where a pause
      // happened. The set picks up there rather than at the theme's first bar.
      const from = clamp(state.position, 0, Math.max(0, playable() - 0.5));
      disposeMix('one was still alive when another was asked for');
      const d = sink();
      // nothing judged in the first second of a set (`slowdown.ts`)
      settleSlowdowns();
      mine = createMix(c, { ...mixOpts(), destination: d ? d : c.destination, onTick: slowTick ?? undefined });
      if (sourceMix) mine.setSourceMix(sourceMix);
      pending = mine;
      // Where the set was left goes into the start itself rather than into a
      // seek taken after it. A seek is a move inside one theme: it drops the
      // hand-over in flight and re-arms it on the next sixteen-bar line, so a
      // pause and a play inside a blend threw the mix away and brought it back
      // a dozen bars later — "the track cleared up to a simpler sound". The
      // mix works out from the position alone whether it falls inside a blend
      // and builds that blend again at the stage it had reached.
      await mine.start(state.themeIndex, from, woken);
      if (stale()) return;
      pending = null;
      state.mix = mine;
      mine = null;
      state.playing = true;
      startMark('playing');
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
      // and is it heard (the element path): if not, it is brought back or said to be stopped
      checkSound(afterRebuild ? 'rebuilt' : 'start');
    } catch (err) {
      // A context that would not resume, a limiter that would not load: the
      // start owns nothing (the `finally` below lets it go) and says so, rather
      // than leaving an unhandled rejection behind a ring that shows nothing
      // (R72). Every caller drops the promise, so this is where it ends.
      if (err instanceof DeviceAsleep) {
        // the device's, not ours: said in the ledger, the key left paused, the next press builds the output again
        note('transport', 'the output would not wake; the set stays paused', { ctx: err.ctxState, hidden: !!document.hidden });
        outputDead = true;
      } else {
        console.error('deep-house: the set could not start', err);
        // ours, and not a context the browser refused (R1, the held-errors audit)
        report('start', 'the set could not start', err);
      }
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
      // and a start that ended without a set — it threw, or a stop overtook
      // it — puts the face back: it was drawn as starting at the press
      if (!state.playing && !state.starting) emit();
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
    // the gesture, from the press: the transport's wait names what the
    // hand-over carries (a journal walk is a cast to it), the face draws the node
    state.cutAsk = kind;
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
        return `${pageBase()}?${search}`;
      },
    },
    /** `?lock=engine`: the link names its engine and the machine view's selector holds it. */
    engineLocked: ENGINE_LOCKED,
    /** The slowdowns since the page loaded (`slowdown.ts`): a count, the longest, the last; and each of them, for a check. */
    slowSummary,
    slowdowns,
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
    planLater,
    /** the planner's worker: whether it runs, and what it has been asked (a bench reading) */
    get planner() { return plannerState(); },
    /** how many themes the page has planned for itself, for a gate to count */
    get plansMade() { return plansMade; },
    start,
    stop,
    // A set still starting is one the face already draws as playing (K42), so
    // a second press on the key that says pause is a pause, not a restart.
    toggle() { return state.mix || state.starting ? stop() : start(); },
    /** Whose the last stop was: `system` (the element paused under the set, or the app's shell) or `hand`. */
    get stoppedBy(): 'hand' | 'system' { return stoppedBy; },

    // A seed asked for by name. Where its set begins is part of the ask and
    // defaults to the beginning of it — theme one, bar one — so a seed written
    // down and typed back in plays the record that was written down, and not
    // its sixth theme because that is where the last one had reached.
    setSeed(seed: string | number, { themeIndex = 0, seconds = 0 }: Partial<CastPoint> = {}): void {
      const next = String(seed).trim() || '1';
      if (next === state.seed && themeIndex === state.themeIndex) return;
      steer?.leave();
      if (castLive(next, { themeIndex, seconds })) return;
      state.seed = next;
      recast('seed', { themeIndex, seconds });
    },

    newSeed(): string {
      // **The dice leave the playlist** (PLAN-LIBRARY §2): a new seed plays outside it
      steer?.leave();
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
      // **A playlist stays current only while what plays is its track** (his word 10-20): a spell the hand asks for
      // (a genre star, a bird let go) moves the sound off it, so the playlist is left, as the dice leave it. A
      // playlist's own step comes through `playPlace`, never here; the same spell asked again returned above.
      steer?.leave();
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
      // another engine is another sound: the playlist is left (its track names its engine)
      steer?.leave();
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

    /**
     * **The reach, moved by the private tier's slider** (round D1): the theme
     * playing is planned again at it and handed over in place within a phrase
     * (`mix.setReach`, a ledger line with the number), and the plans are named
     * by it. `null` is the style's own.
     * The shipped page never calls it.
     */
    setReach(r: number | null): void {
      const next = r === null ? null : reachOf(r);
      if (next === reachAsked) return;
      reachAsked = next;
      // Playing, the theme the music is on is planned again at it and handed
      // over in place at the next phrase line (`mix.setReach`, a pull's shape).
      // No cut is armed: the ring draws nothing for a reach — the DRAW block
      // and the ledger are where it is seen. Stopped, the theme the page is on
      // is planned again at it, restated as a pull is ('spell'), never flashed.
      if (state.mix) {
        void state.mix.setReach(next);
        replan(null);
      } else replan('spell');
      emit();
    },
    /** the reach asked of the plan, or `null` for the style's own */
    get reach(): number | null {
      return reachAsked;
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
      if (!commit && !state.scrubbing) { scrubFrom = state.position; scrubTrack = state.mix?.record?.track ?? null; }
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
      const made = was ? scrubTrack : null;
      scrubTrack = null;
      if (commit) {
        // **A drag that spans a swap commits into the theme it was made in**
        // (the deep review of 10-08, F9): the theme under the hand turned over
        // while the finger was down, and the commit used to land at the
        // fraction the hand held on the theme that left, in the theme that
        // arrived. While the theme it was made on still plays out its tail the
        // mix takes it back, at the second the hand chose on it; once it is
        // gone the band is the arrived theme's, and so is the fraction.
        const m = state.mix;
        if (m && made && m.record && m.record.track !== made && m.playingOut && m.playingOut.track === made) {
          const len = made.bars * made.barSeconds;
          const f = fraction == null ? (len ? clamp(state.position / len, 0, 1) : 0) : clamp(fraction, 0, 1);
          state.position = f * len;
          note('transport', 'a drag made on the theme before the swap commits into it', { theme: (made.index ?? 0) + 1, at: +(f * len).toFixed(2) });
          m.seek(f * len, made);
          state.cut = null;
          remember();
          emit();
          return state.position;
        }
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
      // **A playing playlist steps through itself** (PLAN-LIBRARY §2), on the ring and the lock screen
      if (steer && steer.next()) return state.themeIndex + 1;
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
      if (steer && steer.back()) return true;
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
      steer?.leave();
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

    // --- playlists (PLAN-LIBRARY phase 3) ---------------------------------
    /**
     * **Play a saved link** (PLAN-LIBRARY §2, *Press a row to play it*):
     * playing, it mixes in by the same `mix.cast` path a journal walk takes,
     * so the seam is the set's own; stopped, it starts there (at the link's
     * `t` where it carries one). The recipe and the two modes are fixed when a
     * page opens, so a link naming others than this page plays is opened as a
     * page, stopped, as that link would be. False: not a link the page plays.
     */
    playPlace(link: string, kind: Cut['kind'] = 'cast'): boolean {
      const search = `?${String(link).replace(/^\?/, '')}`;
      let L: ReturnType<typeof linkHere>;
      try { L = linkHere(search, { pageDefault: PAGE_DEFAULT }); } catch (e) { return false; }
      if (!L.seed) return false;
      const here = linkHere(location.search, { pageDefault: PAGE_DEFAULT });
      if ((L.recipe ?? null) !== (here.recipe ?? null) || L.accompaniment !== here.accompaniment || L.development !== here.development) {
        const q = new URLSearchParams(search);
        for (const name of ['view', 'out', 'latency', 'stress']) { const v = linkRaw(name, location.search); if (v !== null && !q.has(name)) q.set(name, v); }
        store();
        location.assign(`${location.pathname}?${q.toString()}${location.hash}`);
        return true;
      }
      let cast: ReturnType<typeof recipesFor>;
      try { cast = recipesFor({ masterSeed: L.seed, strategy: L.strategy, search }); } catch (e) { report('link', 'a playlist link could not be read', e, {}, aBug); return false; }
      note('transport', 'a playlist track was asked for', { seed: L.seed, theme: L.theme + 1, engine: L.strategy });
      const place: JournalPlace = { seed: L.seed, theme: L.theme, strategy: L.strategy, spell: cast.spell,
        ...(cast.track ? { recipe: cast.track.id } : {}), accompaniment: here.accompaniment, development: here.development };
      const wasStopped = !state.mix && !state.starting;
      // the dice's wait is for a new seed: a track on the seed that plays moves only the birds (and the theme),
      // so it waits as a pull does, the ring drawing nothing of its own (his word 10-20)
      const cut: Cut['kind'] = kind === 'cast' && L.seed === state.seed ? 'spell' : kind;
      goTo(place, cast.track ?? null, cut, wasStopped ? L.t : null);
      if (wasStopped) start();
      return true;
    },
    /** Hand the transport a playlist's steer, or take it back (`null`). */
    steer(s: PlaylistSteer | null): void { steer = s; },
    /** The playlist place this page opened on, from the store: a reload carries on in it. */
    resumedPlaylist,
    /** The second the playing theme hands over at on its own: where a playlist mixes its next track in. */
    get seamAt(): number { return seamSeconds(); },
    /**
     * **The place heard, as one string**, for a playlist's seam (`playlists-ui.ts`): the seed, the theme, the
     * engine and the spell, all four from the one snapshot the transport takes of a swap (`syncFromMix`), so a
     * hand-over is never read half arrived. Two saved tracks that differ only by their birds differ here. The
     * recipe and the two modes are the page's: a track naming others opens as a page.
     */
    get placeHeard(): string {
      const spell = state.mix && playedTrack ? playedSpell : spellOf();
      return `${state.seed}|${state.themeIndex}|${state.strategy}|${spellQuery(spell) ?? ''}`;
    },
    /** The link of what plays, as the address writes it: the save's link. */
    linkNow(): string { return linkNow('', { strategy: state.strategy }); },
    /**
     * **The link of what sounds now**, for the throne's save: the playing theme's own spell (the set's, as the
     * readout reads it), never one a hand has asked for and the music has not reached yet, which the address
     * already names; the recipe and the modes are the page's.
     */
    linkPlaying(): string {
      const here = linkHere(location.search, { pageDefault: PAGE_DEFAULT });
      return linkOfPlace({ seed: state.seed, theme: state.themeIndex, strategy: state.strategy, spell: spellOf(),
        recipe: here.recipe, accompaniment: here.accompaniment, development: here.development });
    },
    /** The evening's walk, for a face that wants to draw it and for a gate. */
    journal,
    out: OUT,
    latencyHint: LATENCY,
    /** Is the set heard (the element path): asked by the Apple app's shell after the system's audio services restarted. */
    checkSound(): void { checkSound('shell'); },

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

  // the console's hello for everyone (console-hello.ts); the output path only where a link asked for one (his word 10-21)
  let outAsked = false;
  try { outAsked = linkHere().out != null; } catch (e) { outAsked = false; }
  if (!outAsked) sayHello();
  else if (OUT === 'silent') console.info('deep-house: output silent — the set ends in a gain of zero into the destination, so ' +
    'the clock, the scheduling and the capture tap are what they always are and nothing is heard.');
  else if (OUT === 'direct') console.info('deep-house: output direct — the mix goes straight to the context. No media element, ' +
    'so no lock-screen card and no background play; use ?out=element to get them back.');
  else console.info('deep-house: output through a media element — a lock-screen card and background play, ' +
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
  // **The planner's worker, loaded in an idle slot once the page has drawn**
  // (the planning perf round, 10-12), so it is ready before a hand asks it for
  // anything; until it is, and where there is none, themes plan here.
  {
    const ric = (globalThis as { requestIdleCallback?: (fn: () => void, o: { timeout: number }) => number }).requestIdleCallback;
    if (typeof ric === 'function') ric(() => { startPlanner(); }, { timeout: 2000 });
    else setTimeout(() => { startPlanner(); }, 200);
  }
  // **The link's bar is the place**, and the second saved in this browser is
  // kept only where it is inside that bar: the address is written wherever the
  // position is, so the two agree on a reload and the stored second is the
  // finer of them; a link from somewhere else names its own bar and wins.
  const startBar = urlBar();
  if (startBar !== null && state.track) {
    const bar = Math.min(startBar, state.track.bars - 1);
    if (Math.floor(state.position / state.track.barSeconds) !== bar) state.position = bar * state.track.barSeconds;
  }
  // **The time link's second** (round K32; the deep review of 10-08): the theme
  // starts on the second it names, so a copy writes the same `t` back, and a
  // time past where the theme plays to starts at its last phrase line (four
  // bars) inside it (`linkTimeStart`). Read once: the address drops `t` at
  // once, so a reload plays from the top, and the ledger says where the set
  // was started.
  const startT = urlTime();
  if (startT !== null && state.track) {
    state.position = linkTimeStart(startT, state.track.barSeconds, playable());
    note('transport', `started at ${formatTime(state.position)}`, { asked: formatTime(startT), bar: Math.floor(state.position / state.track.barSeconds) + 1 });
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
