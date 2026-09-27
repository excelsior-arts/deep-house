// What the golden lock snapshots of a plan, and the hash it takes of it: the
// half of `tools/golden.ts` that another check needs to ask "is this the plan
// the lock holds?" of a plan it made some other way (`tools/check-link.ts`
// plans off a link). Moved here out of golden.ts, byte for byte; golden.ts
// imports it back, so there is one snapshot and not two.

import crypto from 'node:crypto';
import { DEFAULT_STRATEGY } from '../src/strategies/index.ts';

// --- what both locks hold, and how their files are laid out ------------------
//
// `tools/golden.ts` and `tools/program.ts` lock the same fourteen themes so a
// failure in one can be read against the other, and keep one section per
// strategy the same way; the table and the two section helpers were written in
// each of them until round (f) of the reconciled review of 09-24 (D45).
// `tools/check.ts` states the table on its own, as a check does.

// Seed 1 is the locked musical body of the release; the other two are the
// regression seeds. Between them any drift in the generator itself — not just
// in one seed's luck — fails the check.
export const MASTERS = ['1', '92970', '21323'];
export const THEMES = { 1: 6, 92970: 4, 21323: 4 };

// The default strategy's block is at the top level of a digest, exactly where
// it has been since the first release, so adding a second strategy moved no
// hash and no line of the record's own section. Everything else is a named
// section under `strategies`, and a section is blessed and checked on its own.
export const SECTION = 'strategies';

/** One strategy's block of a saved digest, wherever that strategy keeps it. */
export function sectionOf(saved, id) {
  if (id === DEFAULT_STRATEGY) return saved;
  return (saved[SECTION] || {})[id] || null;
}

/**
 * The same digest with one strategy's block replaced, the others untouched.
 *
 * The one thing it writes into a block it was not asked to bless is the
 * default's own `strategy` name, which the file did not carry before there were
 * any. That is metadata beside the hashes and not in them — a hash is of one
 * plan's canonical JSON and a plan has never carried a name — so filling it in
 * moves nothing and leaves the record's section saying which composition it is.
 */
export function withSection(saved, id, block) {
  const head = saved.masters ? { strategy: DEFAULT_STRATEGY, ...saved } : saved;
  if (id === DEFAULT_STRATEGY) return { ...block, [SECTION]: head[SECTION] || {} };
  return { ...head, [SECTION]: { ...(head[SECTION] || {}), [id]: block } };
}

// Seed 1's notes are written out in full, because it is the body of the
// release and a diff on it has to be readable. The two regression seeds are
// kept as a per-bar count and a hash: enough to fail on any drift, without
// three megabytes of JSON nobody will ever read.
export const FULL = '1';

// The send and level fields a voice takes. Everything here is mixing, not
// music, and none of it belongs in the lock. `swell` is house-v2's entrance
// swell (round S1): a level and a tone walked in over the notes a held layer
// enters on, and the notes themselves the plan's as ever.
const SOUND_KEYS = new Set(['reverb', 'delay', 'hall', 'gain', 'spread', 'open', 'pan', 'haas', 'startHz', 'swell']);

const round = (v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);

function musicalParams(p = {}) {
  const out = {};
  for (const k of Object.keys(p).sort()) {
    if (SOUND_KEYS.has(k)) continue;
    out[k] = round(p[k]);
  }
  return out;
}

/** One theme's plan as the lock snapshots it: the music, and nothing a mix engineer may change. */
export function snapshotOf(master, n, t) {
  return {
    index: n,
    seed: t.seed,
    preset: t.preset,
    bpm: t.bpm,
    bars: t.bars,
    barSeconds: round(t.barSeconds),
    swing: t.swing,
    density: t.density,
    key: { root: t.key.root, name: t.key.name, scaleName: t.key.scaleName },
    dice: t.dice,
    progression: {
      loopBars: t.progression.loopBars,
      changeEvery: t.progression.changeEvery,
      voicingStyle: t.progression.voicingStyle,
      chords: t.progression.chords.map((c) => ({
        roman: c.roman,
        label: c.label,
        startBar: c.startBar,
        bars: c.bars,
        voicing: c.voicing,
      })),
    },
    sections: t.arrangement.sections.map((s) => ({
      kind: s.kind,
      label: s.label,
      startBar: s.startBar,
      bars: s.bars,
    })),
    timeline: t.timeline.map((r) => ({
      bar: r.bar,
      section: r.section,
      chord: r.chord,
      roman: r.roman,
      layers: r.layers,
    })),
    // No `t` and no note name: both are derived from the bar, the step and the
    // tempo, and a file that repeats itself is a file whose diffs are noise.
    events: eventsOf(master, t),
  };
}

function eventsOf(master, t) {
  const list = t.events.map((e) => ({
    voice: e.voice,
    layer: e.layer,
    bar: e.bar,
    step: e.step,
    p: musicalParams(e.p),
  }));
  if (master === FULL) return list;
  const perBar = new Array(t.bars).fill(0);
  for (const e of list) if (e.bar >= 0 && e.bar < t.bars) perBar[e.bar]++;
  return {
    count: list.length,
    hash: crypto.createHash('sha256').update(JSON.stringify(list)).digest('hex').slice(0, 16),
    perBar,
  };
}

// Canonical JSON: keys in sorted order at every depth, so a hash answers for
// the plan and not for the order the object happened to be built in.
export function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object')
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}

/** The digest's hash of a plan: what `tools/golden-digest.json` holds per theme. */
export const planHash = (master, n, t) => crypto.createHash('sha256').update(canonical(snapshotOf(master, n, t))).digest('hex');
