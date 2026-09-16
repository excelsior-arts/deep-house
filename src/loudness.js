// The theme's own loudness, decided before a node is built.
//
// The make-up gain is one number for the whole record and the limiter does the
// levelling, so before this a main groove landed anywhere between about -15.6
// and -11.2 LUFS depending on the room the preset die rolled and how much was
// playing. Four decibels is not a mix: it is one theme quieter than the next,
// and a listener hears it as a fault in the record rather than as a property of
// the seed.
//
// The fix is not a compressor and not a meter. A theme's loudness turns out to
// be largely a function of things the plan already knows — the levels the room
// declares, what the density die said, which layers are sounding, how thick the
// mined masks are, and what the instruments holding the chords say about
// themselves — so it is *predicted* at plan time and the error is handed to the
// theme's own output gain in `buildGraph`. The trim therefore sits under
// everything the theme does to itself and above the master every deck shares:
// the sound stage, the width and the macro filter are upstream of it; the
// limiter, the make-up and the ceiling are downstream; and two decks at a seam
// each carry their own while one fader crossfades between them.
//
// It costs nothing at runtime. There is no render, no analysis and no envelope
// follower: one pass over eight rows of the timeline and about twenty
// multiplications, worked out once when a theme is planned.
//
// ## Nothing here names an instrument, or a room
//
// That is the point of the file, and it is the same argument `hatEnergy` makes
// in params.js: a fit with a coefficient for `piano` and another for `organ` is
// a fit somebody has to run again every time a voice is written, and this
// catalogue is meant to grow. So:
//
//   a room is read as the levels and the sidechain it declares, never as its
//   name, so a preset written tomorrow gets a sensible answer with no case
//   added to any switch;
//
//   an instrument is read as the four numbers it declares about itself in
//   `TIMBRES` (src/voices/index.js, filled by the voice modules): its family,
//   whether it is struck, how much of the note is still there at the bar line,
//   its own filter corner, and how loud it is alone at its table level. Adding
//   a family is adding its module and its numbers. The fit sums over whatever
//   is sounding and gains no coefficient.
//
// The coefficients themselves live in `PARAMS.loudness` in params.js, with the
// date, the seed range and the residual beside them.

import { baseParams } from './params.js';
import { TIMBRES, levelKeyOfRole } from './voices/index.js';

const BASE = baseParams();

export const LOUDNESS_WINDOW_BARS = 8;

// The eight bars a theme is measured by, and the same eight bars the fit is
// evaluated on: the middle of the first main section that starts past bar 16,
// so the sound stage has a history behind it. This rule is the measurement's
// own — tools/loudness-fit.mjs renders exactly this window — and the floor of
// two bars is there because the measurement renders two bars of pre-roll into
// it. A theme too short to hold one (a set built out of sixteen-bar themes, as
// the seam scene is) falls back to its longest main, and then to its opening.
export function loudnessWindow(track, bars = LOUDNESS_WINDOW_BARS) {
  const secs = (track.arrangement && track.arrangement.sections) || [];
  const mains = secs.filter((s) => s.kind === 'main');
  const long = mains.filter((s) => s.bars >= bars);
  let pick = long.find((s) => s.startBar >= 16) || long[long.length - 1];
  if (!pick) pick = mains.reduce((a, s) => (!a || s.bars > a.bars ? s : a), null);
  const n = Math.max(1, Math.min(bars, pick ? pick.bars : track.bars, track.bars));
  const start = pick ? pick.startBar + Math.floor((pick.bars - n) / 2) : 0;
  return { from: Math.max(0, Math.min(track.bars - n, Math.max(2, start))), bars: n };
}

const LAYERS = ['kick', 'hatClosed', 'hatOpen', 'sixteenths', 'clap', 'bass', 'keys', 'pad'];
const HARMONIC = [['keys', 'stabTimbre'], ['pad', 'padTimbre']];

const maskDensity = (m) => {
  if (typeof m !== 'string' || !m.length) return 0;
  let n = 0;
  for (let i = 0; i < m.length; i++) if (m[i] !== '.') n++;
  return n / m.length;
};

// Add loudnesses the way loudnesses add: in power, not in decibels.
const sumDb = (parts) => {
  let p = 0;
  for (const db of parts) p += Math.pow(10, db / 10);
  return p > 0 ? 10 * Math.log10(p) : -120;
};

// Everything the fit is allowed to read, all of it on the plan. The tool that
// measured the record imports this, so what was fitted and what is evaluated
// are the same arithmetic and cannot drift apart.
export function loudnessFeatures(track) {
  const w = loudnessWindow(track);
  const rows = track.timeline.slice(w.from, w.from + w.bars);
  const k = rows.length || 1;
  const share = {};
  for (const n of LAYERS) share[n] = 0;
  let layers = 0;
  for (const r of rows) {
    layers += r.layers.length;
    for (const n of r.layers) if (n in share) share[n]++;
  }
  for (const n of LAYERS) share[n] /= k;

  // What is actually written in those bars, as the plan wrote it: how often
  // each layer fires, how hard, and how much of it is going to the sends. All
  // of it is on `ev.p` before a node exists, and all of it is a property of a
  // *layer* — a role — and never of the instrument filling it.
  const bs = track.barSeconds;
  const t0 = w.from * bs;
  const t1 = (w.from + w.bars) * bs;
  const EV = {};
  for (const ev of track.events) {
    if (ev.t < t0 || ev.t >= t1) continue;
    const l = ev.layer;
    if (!l) continue;
    const a = EV[l] || (EV[l] = { n: 0, vel: 0, wet: 0, delay: 0 });
    a.n++;
    a.vel += ev.p?.vel ?? 1;
    a.wet += (ev.p?.reverb ?? 0) + (ev.p?.hall ?? 0);
    a.delay += ev.p?.delay ?? 0;
  }
  const rate = (l) => (EV[l] ? EV[l].n / k : 0);
  const mean = (l, f) => (EV[l] && EV[l].n ? EV[l][f] / EV[l].n : 0);

  const d = track.dice || {};
  const over = track.paramOverrides || {};
  const L = { ...BASE.levels, ...(over.levels || {}) };
  const SC = { ...BASE.sidechain, ...(over.sidechain || {}) };
  const KI = { ...BASE.kick, ...(over.kick || {}) };
  const BA = { ...BASE.bass, ...(over.bass || {}) };
  const H = over.hats || {};

  // What the harmonic layer is worth, from what the instruments holding it say
  // about themselves and the level the room gives that role. No name is read.
  const parts = [];
  let hold = 0, bright = 0, struck = 0, weight = 0;
  for (const [role, die] of HARMONIC) {
    const s = share[role];
    if (!s) continue;
    const timbre = d[die];
    const t = TIMBRES[timbre];
    if (!t) continue;
    const level = L[levelKeyOfRole(role, timbre)] ?? -12;
    parts.push(level + t.loudnessDb + 10 * Math.log10(s));
    hold += s * t.hold;
    bright += s * Math.log2(t.brightnessHz);
    struck += s * (t.struck ? 1 : 0);
    weight += s;
  }
  const f = {
    density: track.density,
    bpm: track.bpm,
    themeBars: track.bars,
    scale: (track.key && track.key.scaleName) || 'minor',
    voicingStyle: d.voicingStyle,
    loopBars: d.loopBars || 0,
    chords: (track.progression && track.progression.chords.length) || 0,
    layers: layers / k,
    bassMask: maskDensity(d.bassMask),
    stabMask: maskDensity(d.stabMask),
    hatMask: maskDensity(d.hatMask),
    // The room, as the numbers it declares and never as its name.
    lvSub: L.sub,
    lvKeys: L.keys,
    lvPad: L.pad,
    lvPiano: L.piano,
    lvHat: L.hatClosed,
    lvShaker: L.shaker,
    lvClap: L.clap,
    sidechainDb: SC.depthDb,
    sidechainLowDb: SC.lowDepthDb ?? SC.depthDb,
    kickDrive: KI.drive,
    bassDrive: BA.drive,
    hatTrimDb: H.trimDb ?? 0,
    // The instruments, as the properties they declare and never as their names.
    harmonicDb: parts.length ? sumDb(parts) : -60,
    harmonicHold: weight ? hold / weight : 0,
    harmonicBright: weight ? bright / weight : 0,
    harmonicStruck: weight ? struck / weight : 0,
    harmonicRoles: parts.length,
    // Per layer: notes a bar, how hard they are hit, and how much of them is
    // going to the reverb and the delay.
    rateKeys: rate('keys'),
    ratePad: rate('pad'),
    rateBass: rate('bass'),
    rateHats: rate('hats'),
    rateShaker: rate('shaker'),
    rateFx: rate('fx'),
    velKeys: mean('keys', 'vel'),
    velPad: mean('pad', 'vel'),
    velBass: mean('bass', 'vel'),
    velHats: mean('hats', 'vel'),
    wetKeys: mean('keys', 'wet'),
    wetPad: mean('pad', 'wet'),
    delayKeys: mean('keys', 'delay'),
    delayPad: mean('pad', 'delay'),
    from: w.from,
    windowBars: w.bars,
  };
  for (const n of LAYERS) f[`share_${n}`] = share[n];
  return f;
}

// The columns a fit may draw on, by name. Every one is either a structural
// property of the plan, a number the room declares, or a sum over what the
// instruments declare — so the list does not grow when the catalogue does.
// Adding a column here does not change the record: only `PARAMS.loudness.coef`
// decides what is read.
export const LOUDNESS_COLUMNS = {
  densityMedium: (f) => (f.density === 'medium' ? 1 : 0),
  densityBusy: (f) => (f.density === 'busy' ? 1 : 0),
  layers: (f) => f.layers,
  bassMask: (f) => f.bassMask,
  stabMask: (f) => f.stabMask,
  hatMask: (f) => f.hatMask,
  bpm: (f) => f.bpm,
  themeBars: (f) => f.themeBars,
  loopBars: (f) => f.loopBars,
  chords: (f) => f.chords,
  voicingElevenths: (f) => (f.voicingStyle === 'elevenths' ? 1 : 0),
  minor: (f) => (f.scale === 'minor' ? 1 : 0),
  shareKick: (f) => f.share_kick,
  shareBass: (f) => f.share_bass,
  shareKeys: (f) => f.share_keys,
  sharePad: (f) => f.share_pad,
  shareOpen: (f) => f.share_hatOpen,
  shareSixteenths: (f) => f.share_sixteenths,
  shareClap: (f) => f.share_clap,
  lvSub: (f) => f.lvSub,
  lvKeys: (f) => f.lvKeys,
  lvPad: (f) => f.lvPad,
  lvHat: (f) => f.lvHat,
  lvShaker: (f) => f.lvShaker,
  lvClap: (f) => f.lvClap,
  sidechainDb: (f) => f.sidechainDb,
  sidechainLowDb: (f) => f.sidechainLowDb,
  kickDrive: (f) => f.kickDrive,
  bassDrive: (f) => f.bassDrive,
  hatTrimDb: (f) => f.hatTrimDb,
  harmonicDb: (f) => f.harmonicDb,
  harmonicHold: (f) => f.harmonicHold,
  harmonicBright: (f) => f.harmonicBright,
  harmonicStruck: (f) => f.harmonicStruck,
  harmonicRoles: (f) => f.harmonicRoles,
  rateKeys: (f) => f.rateKeys,
  ratePad: (f) => f.ratePad,
  rateBass: (f) => f.rateBass,
  rateHats: (f) => f.rateHats,
  rateShaker: (f) => f.rateShaker,
  rateFx: (f) => f.rateFx,
  velKeys: (f) => f.velKeys,
  velPad: (f) => f.velPad,
  velBass: (f) => f.velBass,
  velHats: (f) => f.velHats,
  wetKeys: (f) => f.wetKeys,
  wetPad: (f) => f.wetPad,
  delayKeys: (f) => f.delayKeys,
  delayPad: (f) => f.delayPad,
  // How much of the harmonic layer is going to the room, share-weighted: a
  // theme whose chords are drowned reads quieter than one whose chords are dry
  // at the same level, and the wetness die is a plan fact.
  wetHarmonic: (f) => (f.share_keys * f.wetKeys + f.share_pad * f.wetPad) / Math.max(1e-9, f.share_keys + f.share_pad),
  // Notes a bar across the harmonic layer, whichever role is holding it.
  rateHarmonic: (f) => f.rateKeys + f.ratePad,
};

// What the record is predicted to measure, in LUFS, before anything is built.
export function predictedLufs(track) {
  const M = BASE.loudness;
  const f = loudnessFeatures(track);
  let v = M.intercept;
  for (const k of Object.keys(M.coef)) {
    const col = LOUDNESS_COLUMNS[k];
    if (!col) continue;
    v += M.coef[k] * (col(f) - (M.centre[k] ?? 0));
  }
  return v;
}

// The theme's trim, in dB: how far the fit says it is from the target, divided
// by how much of a decibel survives the master, and clamped.
//
// That division is the one thing this could not be got right without measuring
// it twice. The trim sits in front of the shared master, and this record lives
// on its limiter — the reference eight bars spend forty-five per cent of their
// length more than a decibel down — so a decibel put in here does not come out
// the other side as a decibel. MEASURED over the same 120 themes rendered a
// second time with the trim in the graph: so many decibels out per decibel in,
// through the low shelf, the bells, the make-up, the limiter and the clipper.
//
// Two numbers and not one, because a limiter is one-sided. Driving a theme up
// into the ceiling gives back 0.667 of the decibel; pulling one back out of it
// gives back 0.766. A single slope in the middle over-trims everything quiet
// and under-trims everything loud, and it is what put one theme of a montage
// a decibel and a half under its neighbours. Within each direction it is a
// straight line through the origin — residual 0.065 and 0.099 LU — and the
// level of the theme adds nothing to it (0.019 dB of slope per LU going up,
// nothing coming down), so two numbers is the whole of it.
//
// Read off the base table and not off the live one, the way `hatEnergy` is, so
// planning a theme never depends on which preset was applied last.
export function loudnessTrimDb(track) {
  const M = BASE.loudness;
  if (!M || !M.coef || !Object.keys(M.coef).length) return 0;
  const need = M.targetLufs - predictedLufs(track);
  // Two slopes, because a limiter is a one-sided thing: driving a theme *into*
  // the ceiling gives back less of the decibel than pulling it back out of the
  // ceiling does, and one number in the middle over-trims everything quiet and
  // under-trims everything loud.
  const s = (need >= 0 ? M.slopeUp : M.slopeDown) || 1;
  return +Math.max(-M.clampDb, Math.min(M.clampDb, need / s)).toFixed(3);
}

export default loudnessTrimDb;
