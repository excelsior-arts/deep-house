// The sound stage, in two priorities. Audio only: this file never moves a
// note, a time or a length — it reads the plan that already exists and decides
// what the desk does with it.
//
// Eugene, listening to thirteen ranges of the first build: "we sometimes get
// into the trap of repeating nearly the same segment for 30 s, where if the
// bass or drum signature changes it is barely audible while the pads blast the
// same two chords in the foreground." Seven of the thirteen marks say the same
// thing in different words — "pads are too repetitive", "same two chords like
// 16 times already", "repetitive stuff should be on the back, and an accent in
// front to keep engagement".
//
// Deep house is repetitive by nature; the reference sets loop 2 to 8 bars and
// hold a key for five minutes. So the answer is not more harmony. It is that
// the mix has to know what is moving:
//
//   first priority   whatever changed most recently — a new bass variation, a
//                    new stab figure, a lead entering, a section change. It is
//                    mixed to the front: a little louder, a little drier, a
//                    little brighter.
//   second priority  whatever has not changed for more than eight bars. It
//                    recedes, and it is kept interesting with the things a DJ
//                    does to a loop that is holding — a filter rising over
//                    sixteen bars and released at the phrase line, a phaser, a
//                    width breath, a delay throw, a bar of silence before the
//                    boundary — rather than with level alone.
//
// Change is read off the plan's own events, not guessed: a four-bar block is
// "new" when its figure has not been heard in the last sixteen bars. That is
// why the bass, whose variation is re-rolled every four bars, keeps taking the
// front, and the pad, which is two chords going round, keeps giving it up.
//
// Novelty alone turned out not to be enough, and Eugene's next three marks say
// where: "strings are nice touches but still hard to hear behind drone chords,
// that said this mix is great aesthetically" (-1), "touch notes hard to hear"
// (-1), and then +2 and "great move!" on two windows of the same theme playing
// the same figures. The difference between the window he marked -1 and the one
// he marked +2 was not the notes and it was barely the level: in both, a piano
// melody of three onsets in four bars ran over a strings pad holding two
// chords. In the +2 window the piano was the front, at 1.14x its own lowpass;
// in the -1 window the *bass* had varied more recently, took the front, and
// sent the piano to the back of the stage with `lpClose` on it — half its own
// corner, an octave of brightness off a melody, to keep a loop interesting
// that was not the loop. So two rules stand beside novelty, and both of them
// read the figure rather than its history:
//
//   the harmony and the bottom are two stages. The bass plays an octave and a
//   half under the chords and cannot take their place, so which harmonic layer
//   is at the front of the harmony is asked of the harmonic layers alone. The
//   bass still takes the record's accent and still says it in its own tone.
//
//   the layer that plays notes takes the front from the layer that holds one.
//   `figures` reads two numbers off the plan — how long a layer's notes are
//   against a bar, and how many times a bar it strikes — so a touch is in
//   front of a drone whatever the ages say, and the sparse figure is in front
//   of the busy one. A drone's chord moving every eight bars reads as "new" to
//   a four-bar fingerprint, and it used to step in front of the figure that
//   was actually being played. The drone's own step forward is reserved for
//   the bars where nothing is playing over it, which is to say it no longer
//   has one.
//
//   and where a level cannot help, because the two are in the same octave, the
//   drone at the back makes room: one gentle bell, on it alone, where the tune
//   in front of it is playing.
//
// And nothing is put behind nothing: a layer recedes only while another layer
// of its own kind is in front of it — but a drone holding alone is still
// background, and the rhythm section is still the foreground. Eugene, on the
// first build of that rule, twice at -3: "drone chords are dominating above
// all absolutely", on a minimal growl room with an organ pad and nothing over
// it but a kick, a hat line and three bass notes a bar. He was right and the
// first draft of this was wrong: it let a lone pad stand at its own level and
// in its own tone, which is +3.2 dB and an octave of brightness over where the
// stage had it, and in a room with nothing else in the middle the drone simply
// became the record.
//
// And a minimal room does not wait. The stage is otherwise flat for the first
// eight bars of every section — nothing is moved while everything is still
// moving by itself — but that is the rule that left Eugene's *other* -3 where
// it was: bars 9 to 12 of the same theme, the first four bars of its main
// groove, with the organ pad at its own preset level because nothing had yet
// held long enough to be moved anywhere. In a room the density die called
// minimal there is nothing to wait for: the kick, the hats and a few bass
// notes a bar are the foreground from bar one, and the drone is background
// from bar one. So in a minimal room a holding pad opens at the back, with the
// back's colour and the rota and the same lift, on the first bar of every
// section. Every other layer, and every medium or busy room, waits as before.
//
// So `hold` is the back — the same level, the same colour, the same rota — and
// it only steps toward the layer's own level where the arrangement underneath
// it has actually thinned: a bar with no kick, which is a breakdown or a
// dropout and is where the rhythm section is not the foreground because it is
// not there; or a whole phrase with nothing but drums under it, and then only
// if the density die said medium or busy, because a minimal room cannot carry
// a drone at the front whatever else is missing. What `hold` is *for* is the
// other half of the second mark — the pad of seed 99895's third theme was at
// `backMid` and not `back` through its breakdown, 1.44 dB down and darker and
// wetter, for standing behind a `keys` layer that plays no notes at all. With
// no kick in those bars the lift applies and the only harmonic layer in the
// record comes up to its own level; with a kick under it, it does not.
//
// Nothing here is in the golden snapshot, because nothing here runs until a
// plan becomes sound: `develop()` is called by the scheduler and by the mix's
// deck builder, never by `generate()` or by `planTheme()`.

import Rng from './rng.js';

// The grid the foreground is assigned on, and the memory a figure has to fall
// out of before it counts as new again.
const BLOCK = 4; // bars
const WINDOW = 4; // blocks: sixteen bars
// Unchanged for longer than this and a layer is second priority. Eight bars is
// the phrase, and a phrase is how long a loop is allowed to be new for.
const STALE_BARS = 8;
// What tells a drone from a figure: how long a layer's notes are against a
// bar. A strings pad holding a chord across two bars reads 2.00, a drawbar
// organ on the same duty the same; the piano melody of seed 99895's third
// theme reads 0.25 and a rhodes stab line 0.26. It has to be the length of a
// note and not the share of the bar the layer is sounding for, because a stab
// firing four times a bar fills the bar as completely as a held chord does and
// is the opposite kind of figure.
const HOLD_BAR = 0.75;
// And how many times a bar it strikes, which is what tells a touch from a busy
// one. Both are in front of a drone; the sparse one is in front of both.
const TOUCH_ONSETS = 2;
// One die, read twice and both times against the minimal room. It is the room
// in which a drone holding alone may *not* come forward over a phrase that has
// nothing but drums under it, and it is the room that does not wait eight bars
// before putting the drone at the back — the room Eugene marked -3 twice, and
// the room in which a drone at the front has the least to compete with. A bar
// with no kick lifts in any room.
const LIFT_DENSITY = ['medium', 'busy'];
const OPEN_AT_BACK_DENSITY = 'minimal';
// The one thing a level cannot do. A drone at the back is still in the same
// octave as the touch in front of it: MEASURED over bars 112 to 115 of seed
// 99895's third theme — the window Eugene marked +2, the piano at the front
// and the strings five and a half decibels behind it — over the 300 ms after
// each piano note the piano stands 0.4 dB over the strings at 1 kHz, 2.2 at
// 1.25 kHz and 1.8 at 1.6 kHz, and sits 6.9 dB *under* them at 800 Hz. Another
// decibel off the pad everywhere buys a decibel there and a hole in the middle
// of the record; a bell buys it where the tune is and nowhere else. It is
// centred on the median fundamental the touch layer is playing in that block,
// which is a number the plan already holds; the width is about an octave and
// the depth is small enough that what it does is let a note through rather
// than carve a notch anybody can name.
const DIP_DB = -2.5;
const DIP_Q = 1.2;
// And the bell is not another decibel: it is the decibel the stage already
// takes, moved to where the tune is. A bell this deep and this wide costs a
// strings pad 1.0 dB of its own loudness — MEASURED, seed 99895 bars 28 to 31,
// the pad alone reads -14.01 LUFS without it and -15.02 with it — so that much
// is given back as level. The drone ends the size it was, shaped rather than
// smaller: a decibel and a half further down in the octave the tune is in, and
// a decibel up everywhere else, which is the 500 Hz - 2 kHz the balance round
// measured this record short of. The record's own loudness does not move,
// which matters because `loudness.js` predicts a theme's loudness from the
// plan and cannot see a single thing this file does.
const DIP_MAKEUP_DB = 1.0;

// How far the stage moves, in dB. The drums and the bass are the record, so
// the bass barely moves at all and says what it has to say with its tone; the
// harmonic layers are the ones that trade places.
// MEASURED against the three sets after the stage landed: the back of the
// stage is where our 500 Hz - 2 kHz deficit got 2 to 4.5 dB worse, because the
// pad and the keys are the only things we have in that band and the stage was
// taking five decibels off them. The *contrast* is what Eugene liked, so the
// contrast is kept — front to back is still 5.7 dB on the pad and 5.1 on the
// keys, against 7.5 and 6.5 — and the floor comes up under it.
const LEVEL = {
  pad: { front: 2.5, back: -3.2 },
  keys: { front: 2.5, back: -2.6 },
  bass: { front: 1.2, back: -1.0 },
};
// A layer arrives at the front over a bar or two and the one it displaced
// leaves over four, so a hand-over is a hand-over and not a jump cut. The
// numbers are the full travel (back to front is 7.5 dB) divided by those bars.
const RISE_PER_BAR = 4.0;
const FALL_PER_BAR = 1.9;

// Front is drier and brighter, back is wetter and darker, before any treatment.
const FRONT_WET = 0.82;
const FRONT_LP = 1.14;
const BACK_WET = 1.28;
// The same argument as the level: a back layer is still darker than a front
// one, but a sixth of an octave rather than a fifth, because what it darkens
// is the one band the record is short of.
const BACK_LP = 0.90;

// The treatments a background layer may carry. One at a time, changing every
// eight to sixteen bars, never the same one twice running, and never on the
// kick or the sub.
const TREATMENTS = ['hpRise', 'lpClose', 'phaser', 'breath', 'throw', 'hole'];

const db = (x) => Math.pow(10, x / 20);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Rises over the first five sixths of a segment and is released over the last
// sixth — which is the phrase boundary, and which is where a DJ lets the
// filter go.
function riseRelease(u) {
  const t = clamp(u, 0, 1);
  return t < 0.84 ? t / 0.84 : Math.max(0, 1 - (t - 0.84) / 0.16);
}

// --- what changed, and when ------------------------------------------------

// One four-bar block of a layer, as a string. Pitches are relative, so the
// same figure under a different chord is the same figure; velocities are left
// out, because a velocity wobble is not a change.
function blockPrint(track, layer, block) {
  const b0 = block * BLOCK;
  if (layer === 'pad') {
    // The pad's figure is the chords it is holding, not the notes it happens
    // to restrike: two chords going round are one block, every time round.
    const out = [];
    for (let b = b0; b < b0 + BLOCK; b++) out.push(track.timeline[b] ? track.timeline[b].chord : '-');
    return out.join(',');
  }
  // The union of the steps the figure fires on across the block and the
  // intervals it spans — not the per-bar list. A figure is thinned by its own
  // dice bar by bar, and a thinning is not a change; four bars of the same
  // four stabs have to read as four bars of the same four stabs.
  const steps = new Set();
  const midis = [];
  for (const e of track.events) {
    if (e.layer !== layer || e.bar == null) continue;
    if (e.bar < b0 || e.bar >= b0 + BLOCK) continue;
    steps.add(e.step);
    if (e.p && typeof e.p.midi === 'number') midis.push(e.p.midi);
  }
  if (!steps.size) return 'ø';
  const base = midis.length ? Math.min(...midis) : 0;
  return (
    [...steps].sort((a, b) => a - b).join(' ') +
    '|' +
    [...new Set(midis.map((m) => m - base))].sort((a, b) => a - b).join(',')
  );
}

// Every layer's figure, block by block, in one pass over the event list: the
// median length of a note against a bar (`hold`), how many times a bar it is
// struck (`onsets`), and the median fundamental it is playing (`hz`). Notes
// struck together are one onset, because a five-note chord is one thing
// arriving and not five.
//
// `hold` and `onsets` are properties of the figure and not of its history,
// which is the point: they are what settle an argument novelty gets wrong.
// `hz` is the middle of the tune and deliberately not `brightnessHz` from
// TIMBRES, which says where a voice *stops* — 3450 Hz for a piano, nowhere
// near where its notes live.
//
// They read `p0` where there is one, so a second pass over a developed track
// measures the notes the plan wrote and not the ones the stage last shortened.
function figures(track, layers, barSeconds) {
  const blocks = Math.ceil(track.bars / BLOCK);
  const bins = {};
  for (const l of layers) bins[l] = Array.from({ length: blocks }, () => ({ onsets: new Map(), midis: [] }));
  for (const e of track.events) {
    const bin = bins[e.layer];
    if (!bin || e.bar == null) continue;
    const block = Math.floor(e.bar / BLOCK);
    if (block < 0 || block >= blocks) continue;
    const p = e.p0 || e.p || {};
    const key = Math.round(e.t * 1000);
    const dur = Math.max(0, p.dur ?? barSeconds * 0.25);
    bin[block].onsets.set(key, Math.max(bin[block].onsets.get(key) ?? 0, dur));
    if (typeof p.midi === 'number') bin[block].midis.push(p.midi);
  }
  const out = {};
  for (const l of layers) {
    out[l] = bins[l].map(({ onsets, midis }) => {
      if (!onsets.size) return { sounds: false, hold: 0, onsets: 0, hz: null };
      const durs = [...onsets.values()].sort((a, b) => a - b);
      midis.sort((a, b) => a - b);
      return {
        sounds: true,
        hold: durs[Math.floor(durs.length / 2)] / barSeconds,
        onsets: onsets.size / BLOCK,
        hz: midis.length ? 440 * Math.pow(2, (midis[Math.floor(midis.length / 2)] - 69) / 12) : null,
      };
    });
  }
  return out;
}

// Bars since each layer last played something it had not played in the last
// sixteen. A section boundary wipes the memory: a new section is a change
// whatever it plays.
function ages(track, layers) {
  const blocks = Math.ceil(track.bars / BLOCK);
  const out = {};
  for (const layer of layers) {
    const seen = new Map();
    const age = new Array(track.bars).fill(0);
    let lastChange = 0;
    let section = null;
    for (let block = 0; block < blocks; block++) {
      const b0 = block * BLOCK;
      const row = track.timeline[b0];
      const sec = row ? row.sectionIndex : section;
      if (sec !== section) {
        seen.clear();
        lastChange = b0;
        section = sec;
      }
      const print = blockPrint(track, layer, block);
      const before = seen.get(print);
      if (before === undefined || block - before > WINDOW) lastChange = b0;
      seen.set(print, block);
      for (let b = b0; b < Math.min(track.bars, b0 + BLOCK); b++) age[b] = b - lastChange;
    }
    out[layer] = age;
  }
  return out;
}

// --- the treatment rota ----------------------------------------------------

// A layer's whole track of treatments, laid out ahead: segments of eight or
// sixteen bars, each a different one from the last, each with its own settings
// rolled from the theme's seed so two themes never phase the same way.
function rota(seedTag, bars, allow) {
  const r = new Rng(seedTag);
  const segments = [];
  let bar = 0;
  let last = null;
  while (bar < bars) {
    const len = r.chance(0.55) ? 8 : 16;
    const pool = allow.filter((k) => k !== last);
    const kind = pool[r.int(0, pool.length)];
    segments.push({
      start: bar,
      len,
      kind,
      // Every treatment's own settings, rolled once per segment.
      rate: r.float(0.05, 0.2),
      phase: r.float(0, Math.PI * 2),
      stages: r.int(4, 7),
      depth: r.float(0.28, 0.5),
      mix: r.float(0.3, 0.45),
      amount: r.float(0.75, 1.0),
    });
    last = kind;
    bar += len;
  }
  return segments;
}

function segmentAt(segments, bar) {
  for (const s of segments) if (bar >= s.start && bar < s.start + s.len) return s;
  return segments[segments.length - 1] || null;
}

// What a treatment is doing at a (possibly fractional) bar. Everything is a
// multiplier on what the voice would otherwise have done, so an absent
// treatment is a table of ones.
function treatAt(seg, bar) {
  const flat = { lpMul: 1, hpMul: 1, spreadMul: 1, delayMul: 1, levelDb: 0, phaser: null };
  if (!seg) return flat;
  const u = (bar - seg.start) / seg.len;
  const k = riseRelease(u) * seg.amount;
  switch (seg.kind) {
    case 'hpRise':
      // The classic: the bottom leaves the loop over sixteen bars and comes
      // back at the phrase line. On a pad whose highpass sits at 90 Hz this
      // walks it up to about 450 and lets it fall.
      return { ...flat, hpMul: 1 + 4 * k, levelDb: 1.0 * k };
    case 'lpClose':
      return { ...flat, lpMul: Math.pow(2, -1.15 * k) };
    case 'phaser':
      return {
        ...flat,
        phaser: {
          stages: seg.stages,
          rate: seg.rate,
          depth: seg.depth,
          mix: seg.mix,
          phase: seg.phase + ((bar - seg.start) / seg.len) * Math.PI,
          center: 520,
        },
      };
    case 'breath': {
      // Not a sweep with a destination: a slow undulation, one cycle every
      // sixteen bars, which is the width and the tone breathing together.
      const a = (Math.PI * 2 * (bar - seg.start)) / 16 + seg.phase;
      return {
        ...flat,
        lpMul: Math.pow(2, 0.34 * seg.amount * Math.sin(a)),
        spreadMul: 1 + 0.28 * seg.amount * Math.sin(a + Math.PI / 2),
      };
    }
    case 'throw': {
      // Plain until the last bar of a sixteen-bar phrase, and then thrown into
      // the dotted-eighth delay on the way over the line.
      const last = Math.floor(bar) % 16 === 15;
      return last ? { ...flat, delayMul: 3.2, levelDb: 0.8 } : flat;
    }
    default:
      return flat;
  }
}

// --- the stage -------------------------------------------------------------

const LAYERS = ['pad', 'keys', 'bass'];
const HARMONIC = ['pad', 'keys'];

export function stage(track) {
  const bars = track.bars;
  const rows = [];
  const barSeconds = track.barSeconds || 2.3;
  const blocks = Math.ceil(bars / BLOCK);
  // A layer is on the stage in a block when the timeline lists it *and* its
  // figure fires there. A role the arrangement names and the generator leaves
  // empty used to take a place on the stage all the same: in seed 99895's
  // third theme the keys are listed through the breakdown and play nothing in
  // it, and the pad — the only harmonic layer in the record — was put behind
  // them for it.
  const present = { pad: [], keys: [], bass: [] };
  const fig = { pad: [], keys: [], bass: [] };
  const byBlock = figures(track, LAYERS, barSeconds);
  for (const l of LAYERS) {
    for (let block = 0; block < blocks; block++) {
      const f = byBlock[l][block];
      for (let b = block * BLOCK; b < Math.min(bars, (block + 1) * BLOCK); b++) {
        const row = track.timeline[b];
        present[l][b] = !!(row && row.layers.includes(l)) && f.sounds;
        fig[l][b] = f;
      }
    }
  }
  const age = ages(track, ['pad', 'keys', 'bass']);

  // Whether a lone drone may come forward in this bar. Nothing but drums under
  // it for the phrase is read over the eight bars the phrase is, not over this
  // one, so a bass that rests for a bar is not a thinning.
  const density = track.dice && track.dice.density;
  const thick = LIFT_DENSITY.includes(density);
  const openAtBack = density === OPEN_AT_BACK_DENSITY;
  const lift = [];
  for (let b = 0; b < bars; b++) {
    const row = track.timeline[b];
    const on = row ? row.layers : [];
    let bassInPhrase = false;
    const p0 = Math.floor(b / 8) * 8;
    for (let k = p0; k < Math.min(bars, p0 + 8); k++) {
      const r = track.timeline[k];
      if (r && r.layers.includes('bass')) { bassInPhrase = true; break; }
    }
    lift[b] = !on.includes('kick') || (!bassInPhrase && thick) ? 1 : 0;
  }

  const seed = track.seed ?? 1;
  const rotas = {
    pad: rota(`${seed}::treat:pad`, bars, TREATMENTS),
    // A hole in the rhythmic layer is a hole in the groove; the pad is the
    // only layer allowed to disappear for a bar.
    keys: rota(`${seed}::treat:keys`, bars, TREATMENTS.filter((k) => k !== 'hole')),
  };

  // The target level of each layer, bar by bar, before smoothing.
  const target = { pad: [], keys: [], bass: [] };
  const roleAt = [];
  for (let b = 0; b < bars; b++) {
    const live = ['keys', 'bass', 'pad'].filter((l) => present[l][b]);
    // Nothing is moved while everything is still moving by itself: for the
    // first eight bars of every section the stage is flat, which is also why
    // the reference render of seed 1's first eight bars does not budge.
    const engaged = live.some((l) => age[l][b] >= STALE_BARS);
    let front = null;
    let lead = null;
    const role = {};
    if (engaged && live.length) {
      // The record's accent: the most recent change, as ever. A tie goes to
      // the rhythmic role and then to the bass, because those are the two a
      // listener reads as an accent. This is what the bass's own tone follows.
      let best = null;
      for (const l of live) if (best === null || age[l][b] < age[best][b]) best = l;
      front = best;

      // The front of the *harmony* is a second question, asked of the harmonic
      // layers alone: a bass variation is an accent in the bottom octave and a
      // half and it has never been able to take the place of the tune. Three
      // answers, and every one of them is stated:
      //
      //   nothing is holding — novelty decides, exactly as it always did.
      //   something holds and something else does not — the one that plays
      //     notes leads, however recently the drone's chord moved, and the
      //     sparse figure leads over a busy one because two notes a bar is
      //     what a listener reads as an accent.
      //   everything holds — there is no harmonic front at all, because a pad
      //     stepping forward to blast two chords is the fault this whole file
      //     was written to answer.
      const harmonic = HARMONIC.filter((l) => live.includes(l));
      const drones = harmonic.filter((l) => fig[l][b].hold >= HOLD_BAR);
      const moving = harmonic.filter((l) => fig[l][b].hold < HOLD_BAR);
      const touches = moving.filter((l) => fig[l][b].onsets <= TOUCH_ONSETS);
      const pool = !drones.length ? harmonic : touches.length ? touches : moving;
      for (const l of pool) if (lead === null || age[l][b] < age[lead][b]) lead = l;

      // The stage is a gradient, not a cliff: the stalest layer goes all the
      // way to the back, and anything else that is holding sits between. Two
      // harmonic layers both dropped five dB is a mix with a hole where its
      // middle was, and the corpus says the middle is where this music lives.
      //
      // And nothing is put behind nothing: only a layer with one of its own
      // kind in front of it recedes. How long it has been holding still decides
      // *when* it recedes — a chord that has genuinely just moved is worth a
      // phrase at its own level before the desk takes it back — and what the
      // space rule above changed is only that the drone can no longer answer
      // that phrase by stepping in front of the tune.
      const behind = lead
        ? harmonic.filter((l) => l !== lead && age[l][b] > STALE_BARS).sort((a, c) => age[c][b] - age[a][b])
        : [];
      for (const l of live) role[l] = l === lead || (l === 'bass' && front === 'bass') ? 'front' : 'mid';
      behind.forEach((l, i) => {
        role[l] = i === 0 ? 'back' : 'backMid';
      });
      // A harmonic layer that is holding with nothing in front of it is not
      // background and is not an accent either: it stands where it is, at its
      // own level and in its own tone, and the rota is what keeps it moving.
      for (const l of harmonic) if (role[l] === 'mid' && age[l][b] > STALE_BARS) role[l] = 'hold';
    }
    // The minimal room's one exception to waiting, and it has to be written
    // outside the branch above as well as inside it: a drone that is not
    // leading is at the back in such a room whatever the ages say, whether the
    // stage has taken a view yet or not. Inside the branch it is the bar the
    // stage engages on, where the pad's age is exactly the phrase and the test
    // above wants more than one; outside it, it is the first eight bars of
    // every section.
    if (openAtBack && present.pad[b] && fig.pad[b].hold >= HOLD_BAR && (role.pad === 'mid' || role.pad === undefined))
      role.pad = 'hold';
    for (const l of ['pad', 'keys', 'bass']) {
      const r = role[l];
      // `hold` is the back until the arrangement thins under it, and then it
      // travels to the layer's own level. One number carries both, so the
      // hand-over ramp below shapes a lift exactly as it shapes a hand-over.
      const share = r === 'hold' ? 1 - lift[b] : 1;
      let v = r === 'front' ? LEVEL[l].front : r === 'back' || r === 'hold' ? LEVEL[l].back * share : r === 'backMid' ? LEVEL[l].back * 0.45 : 0;
      // Every sixteenth bar the background is let back up for a bar. A DJ
      // releases the filter over the phrase line; the level goes with it, and
      // it is what stops a receded layer becoming a new kind of static.
      if ((r === 'back' || r === 'backMid' || r === 'hold') && b % 16 === 15) v *= 0.35;
      target[l][b] = v;
    }
    roleAt[b] = { engaged, front, lead, role };
  }

  // The hand-over: two bars up, four bars down.
  const level = { pad: [], keys: [], bass: [] };
  for (const l of ['pad', 'keys', 'bass']) {
    let v = 0;
    for (let b = 0; b < bars; b++) {
      const t = target[l][b];
      v = t > v ? Math.min(t, v + RISE_PER_BAR) : Math.max(t, v - FALL_PER_BAR);
      level[l][b] = v;
    }
  }

  for (let b = 0; b < bars; b++) {
    const { engaged, front, lead, role } = roleAt[b];
    const treat = {};
    for (const l of ['pad', 'keys']) {
      treat[l] = role[l] === 'back' || role[l] === 'backMid' || role[l] === 'hold'
        ? segmentAt(rotas[l], b)
        : null;
    }
    // Where the tune is, for whatever is standing behind it. There is one
    // lead at a time, so there is one place to make room in.
    const leadHz = lead ? fig[lead][b].hz : null;
    rows.push({
      bar: b,
      section: track.timeline[b] ? track.timeline[b].section : '',
      engaged,
      front,
      lead,
      leadHz,
      role,
      lift: lift[b],
      age: { pad: age.pad[b], keys: age.keys[b], bass: age.bass[b] },
      figure: { pad: fig.pad[b], keys: fig.keys[b], bass: fig.bass[b] },
      level: { pad: level.pad[b], keys: level.keys[b], bass: level.bass[b] },
      treat: { pad: treat.pad ? treat.pad.kind : null, keys: treat.keys ? treat.keys.kind : null },
      seg: treat,
    });
  }
  return rows;
}

// --- applying it to the notes ----------------------------------------------

// The bass's own contrast, which is not a DJ treatment and is never switched
// off. Two things happen to the body filter once a line has been running for
// sixteen bars: a slow breath on the eight-bar grid so a held line is not one
// tone for a minute, and a bar of extra opening on the bar where the figure
// actually varies. The second is the direct answer to Eugene's sentence — "if
// the bass or drum signature changes it is barely audible".
//
// There is deliberately no "held template" test. `PARAMS.density.bassNotes`
// floors at three moves a bar, so the one-move masks the corpus is full of
// (`.x..............`, 130 of 2966 bars) never reach a note; what this
// generator actually produces is a line that varies every four bars and is
// mixed so that nobody notices. That is the thing to fix.
const BASS_OPEN = [1.0, 1.1, 1.22, 1.08];
const BASS_RUN_BARS = 16;

export function develop(track) {
  if (!track || !track.events || !track.timeline || !track.bars) return track;
  // Once per track. A slice taken off a developed track carries the flag, so a
  // solo-stem render is the stem of the mix that was actually made and not a
  // stage recomputed from one layer's events.
  if (track.developed) return track;
  const rows = stage(track);
  const barSeconds = track.barSeconds || 2.3;
  const seed = track.seed ?? 1;
  const padStrings = !track.dice || track.dice.padTimbre === 'strings' || track.dice.padTimbre === 'swell';
  // A per-phrase colour on the piano, so phrase two and phrase four of a
  // sixteen-bar cycle are not the same phrase twice: rolled from the theme's
  // own seed, and only while the stage is engaged.
  const pr = new Rng(`${seed}::develop:piano`);
  const phraseColour = [0, 1, 2, 3].map((i) => ({
    db: [0, 1.4, -0.4, -1.4][i] + pr.float(-0.5, 0.5),
    wet: [1, 0.78, 1.05, 1.28][i] * pr.float(0.94, 1.06),
  }));

  // Bars the bass has been running without a break, so the body only starts
  // breathing once the ear has had time to decide the line is holding.
  const bassRun = [];
  let run = 0;
  for (let b = 0; b < track.bars; b++) {
    run = track.timeline[b] && track.timeline[b].layers.includes('bass') ? run + 1 : 0;
    bassRun[b] = run;
  }

  for (const ev of track.events) {
    const base = ev.p0 || ev.p || {};
    ev.p0 = base;
    const bar = ev.bar;
    if (bar == null || bar < 0 || bar >= rows.length) continue;
    const row = rows[bar];
    const p = { ...base };

    if (ev.layer === 'bass') {
      p.gain = (base.gain ?? 1) * db(row.level.bass);
      let mul = 1;
      if (bassRun[bar] >= BASS_RUN_BARS) {
        mul *= BASS_OPEN[Math.floor(bar / 8) % BASS_OPEN.length];
        // The bar the figure changes on, opened a little further: the change
        // is in the plan already and this is what makes it reach the ear.
        if (row.age.bass === 0 && bar > 0) mul *= 1.12;
      }
      if (row.front === 'bass') mul *= 1.12;
      p.cutoffMul = mul;
      ev.p = p;
      continue;
    }

    if (ev.layer !== 'pad' && ev.layer !== 'keys') continue;
    const lane = ev.layer === 'pad' ? 'pad' : 'keys';
    const role = row.role[lane] || 'mid';
    const seg = row.seg[lane];
    const durBars = Math.max(0.25, (base.dur ?? barSeconds * 0.25) / barSeconds);
    const t0 = treatAt(seg, bar);
    const t1 = treatAt(seg, bar + durBars);

    // How far back the layer is, which is what the wetness, the colour and the
    // bell all ride. `hold` is all the way back until its lift says otherwise.
    const back = role === 'back' ? 1 : role === 'backMid' ? 0.45 : role === 'hold' ? 1 - row.lift : 0;
    const dipping = back > 0 && row.leadHz && row.lead !== lane;
    const levelDb = row.level[lane] + (t0.levelDb || 0) + (dipping ? DIP_MAKEUP_DB * back : 0);
    const wet = role === 'front' ? FRONT_WET : 1 + (BACK_WET - 1) * back;
    const colour = role === 'front' ? FRONT_LP : 1 + (BACK_LP - 1) * back;

    p.gain = (base.gain ?? 1) * db(levelDb);
    p.lpMul = [colour * t0.lpMul, colour * t1.lpMul];
    p.hpMul = [t0.hpMul, t1.hpMul];
    if (t0.spreadMul !== 1 || t1.spreadMul !== 1) p.spreadMul = (t0.spreadMul + t1.spreadMul) / 2;
    if (t0.phaser) p.phaser = t0.phaser;
    // Room for the tune, in the one layer that is standing behind it. It goes
    // with the back and rides the same gradient, so a layer at `backMid` takes
    // under half of it and a layer at the front takes none.
    if (dipping) p.dip = { hz: row.leadHz, db: DIP_DB * back, q: DIP_Q };

    if (base.reverb != null) p.reverb = base.reverb * wet;
    if (base.hall != null) p.hall = base.hall * wet;
    // A throw is read over the whole note, not just its start: a held chord
    // that crosses the phrase line goes into the delay with everything else.
    if (base.delay != null) p.delay = base.delay * wet * Math.max(t0.delayMul, t1.delayMul);

    if (ev.voice === 'piano' && row.engaged) {
      const c = phraseColour[Math.floor(bar / 16) % 4];
      p.gain *= db(c.db);
      if (p.hall != null) p.hall = Math.min(1.4, p.hall * c.wet);
      if (p.delay != null) p.delay *= c.wet;
    }

    if (lane === 'pad') {
      // Register, not harmony: on alternate eight-bar phrases the desk above
      // comes up, so the same chord is played from a different part of the
      // instrument. The notes in the plan are untouched.
      if (row.engaged && Math.floor(bar / 8) % 2 === 1) p.doubleTop = padStrings ? 0.9 : 0.55;
      // The hole: the pad lets the last bar of a sixteen-bar phrase go by, so
      // the boundary arrives as an arrival.
      if (seg && seg.kind === 'hole' && role !== 'front') {
        const endBar = bar + durBars;
        const line = Math.floor(bar / 16) * 16 + 15;
        if (bar <= line && endBar > line) {
          p.dur = Math.max(barSeconds * 0.5, (line - bar) * barSeconds);
          p.release = Math.min(base.release ?? 1.2, 0.5);
        }
      }
    }
    ev.p = p;
  }

  track.development = rows;
  track.developed = true;
  return track;
}

export default develop;
