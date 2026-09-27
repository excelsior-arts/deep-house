// The second lock: the *developed program*, which is what the golden digest
// leaves out.
//
//   node tools/program.ts --check    regenerate and diff; non-zero on any change
//   node tools/program.ts --bless    rewrite it (only with Eugene's say-so)
//   node tools/program.ts --strategy house-v2 --check   one strategy's section
//
// **The lock names its strategy** since round K5a of PLAN-KITCHEN, the way the
// golden lock does: the default's programs stay at the top of the file where
// they have always been, and every other strategy is a section of its own.
//
// `tools/golden-digest.json` answers "has the generator moved?" — the notes,
// the sections, the dice. It deliberately drops `ev.t`, every send, every gain,
// every pan, the sound stage, the automation and the trim, and it rounds what
// is left to six decimals. So a refactor can pass it and still change the
// record: move a level by a tenth of a decibel, resolve a setting in a
// different order, hand the stage a different bar, and the golden check says
// the generator has not moved, because it has not.
//
// This file locks the other half. For each golden theme it builds the program
// the live decks and the offline render actually consume — every event with its
// resolved onset and arrival in theme seconds at full precision, its voice, its
// bus, and the parameter object the voice is handed after the sound stage and the
// level table have had their say; every automation point the graph receives,
// taken by calling the real schedulers against recording parameters rather than
// by reimagining what they would write; the sidechain the kicks post; the
// theme's trim; and, per master seed, the seam curves the transition writes
// across the set. It hashes that, and it keeps the whole thing beside it so a
// failure names the event and the field.
//
// Two files, the same way the golden lock has two. **`tools/program-digest.json`
// is committed**: one line per master seed and theme with the numbers a person
// can read — the event count, the automation point count, the trim, the first
// and last onset — and a SHA-256 of the canonical JSON of the whole program.
// **`tmp/golden/programs.json`** is the full program, ignored on purpose,
// several megabytes of it, and read as well when it is there, because a hash
// says that something moved and the program says which bar.
//
// ## Where the numbers come from
//
// Nothing here is a second implementation of the sound path, and since round D
// nothing here is a repetition of one either. The program *is* the runtime's:
//
//   `planTheme()`         a fresh plan per call. It is read and not written —
//                         the compiler mutates nothing — so no copy is needed
//                         and none is made.
//   `settingsOf()`        the theme's own room as a frozen value, resolved
//                         exactly the way `makeDeck` and
//                         `renderTrack` each resolve it: the style the plan was
//                         planned in, with the theme's own overrides over it.
//   `compilePerformance()` the whole of it: every event with its onset, its
//                         bus and the parameter object the voice is handed
//                         after the stage and the level table; every
//                         automation line; the sidechain every kick posts; the
//                         trim, the routing, the levels and the seam plan.
//                         The live decks and both renders consume this same
//                         value, so there is nothing left to mirror.
//   `scheduleLine`        the real writer from packages/engine/src/master.ts, handed a graph
//                         whose AudioParams are recorders, so what is locked is
//                         what an AudioParam is actually told.
//   `scheduleTransition`  the real one, handed recording decks, over the set
//                         layout `tools/setplan.ts` already computes.
//
// Until round D two lines of the runtime were *repeated* here rather than
// called — the gain the level table applies and the bus a voice lands on,
// because `fireEvent` did both inside a call that also built audio nodes — and
// six exact source lines were checked against their files so the repetition
// could not drift quietly. The compiler makes both of them once, into the
// program, and the repetition and its guard are gone with them.
//
// ## What it cannot see
//
// PCM. The program is numbers from the plan and the stage, so it runs in node
// with no browser and no sample rate, and it is engine-independent by
// construction. Two engines rendering this same program differ; that is what
// the scene gate is for. It also cannot see anything the runtime decides
// against the clock — `resolveStart`'s guard against the render head, a seek,
// a pause — because those are properties of a moment and not of the record.

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planTheme, scheduleTransition, MIX_DEFAULTS, STRATEGIES, DEFAULT_STRATEGY } from '../src/mix.ts';
import { scheduleLine, paramOf } from '@deep-house/engine/master';
import { compilePerformance, programOf } from '../src/performance.ts';
import { settingsOf } from '@deep-house/engine/settings';
import { setLayout } from './setplan.ts';
import { MASTERS, THEMES, SECTION, sectionOf, withSection } from './golden-plan.ts';

// --- the shapes, written down ------------------------------------------------
//
// Round B turned type checking on for `src/`. `tools/` is left out of it,
// because these files import node's own modules and node's types are not
// installed and would be a second dependency; the typedefs below are still
// written, so the lock's shape is stated rather than inferred from a JSON file
// nobody can read, and so a later round can put `tools/` under the checker
// without first working out what it is holding.
//
// Since round D the shapes are the compiler's own and are written down in
// TypeScript beside it: `AutomationPoint`, `ProgramEvent`, `SeamPlan` and
// `Program` live in `src/performance.ts`. What is left here is the shape of
// *this file's* output — a theme's program with the master seed it came from,
// the curves a recording graph was handed, and the digest that is committed.
//
/** @typedef {import('@deep-house/engine/program').AutomationPoint} AutomationPoint */
/**
 * One golden theme, developed: its events, the curves the graph is given, the
 * sidechain the kicks post, the trim, the routing, the resolved level table and
 * its own seam plan.
 * @typedef {{
 *   master: string, index: number, seed: any, preset: string,
 *   bpm: number, beat: number, barSeconds: number, bars: number, duration: number,
 *   trimDb: number, themeGain: number,
 *   seam: any, blendBars: number, filterMove: any,
 *   routing: Record<string, string>, levels: Record<string, number>,
 *   events: any[], automation: AutomationPoint[], duck: AutomationPoint[],
 *   counts: { events: number, automation: number, duck: number, firstOnset: number|null, lastOnset: number|null },
 * }} ThemeProgram
 */
/**
 * One master seed's set: where each theme hands over and the curves the
 * transition writes across it.
 * @typedef {{
 *   master: string, seams: any[], gaps: any[], curves: AutomationPoint[],
 *   counts: { seams: number, points: number },
 * }} SetProgram
 */
/** The whole thing, before it is hashed. @typedef {{ masters: Record<string, ThemeProgram[]>, sets: Record<string, SetProgram> }} Programs */
/**
 * What is committed: the numbers a person can read at a glance, and a SHA-256
 * of the canonical JSON that catches everything else.
 * @typedef {{
 *   note: string,
 *   masters: Record<string, Array<{
 *     index: number, seed: any, events: number, automation: number, duck: number,
 *     trimDb: number, firstOnset: number|null, lastOnset: number|null, hash: string,
 *   }>>,
 *   sets: Record<string, { seams: number, points: number, hash: string }>,
 * }} Digest
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
// The lab is the repository's and not this package's: two more folders up.
const REPO = path.join(ROOT, '..', '..');
// Beside the tools, in git: the digest a clean clone checks against.
const DIGEST = path.join(HERE, 'program-digest.json');
// Under tmp/: the whole program, rebuilt with --bless, read when it is there.
// One per strategy, because it is one strategy's every event.
const FILE_FOR = (id) => path.join(REPO, 'tmp', 'golden',
  id === 'house-v1' ? 'programs.json' : `programs-${id}.json`);

// --- one section per strategy ------------------------------------------------
//
// Round K5a of PLAN-KITCHEN, and the same arrangement `tools/golden.ts` has:
// the default strategy's programs stay exactly where they have always been at
// the top of the file, so adding a second strategy moved no hash and no line of
// the record's own section, and every other strategy is a named section under
// `strategies`, blessed and checked on its own.
// `SECTION`, `sectionOf` and `withSection` are the golden lock's own, from
// `golden-plan.ts`; so is the set of themes, `MASTERS` and `THEMES`, so the
// two locks answer for the same fourteen themes and a failure in one can be
// read against the other.

// --- a recording AudioParam --------------------------------------------------
//
// Everything the graph is told, in the order it is told: one row per call, with
// the parameter's name, what kind of move it is and where. `value` is here
// because `scheduleTransition` reads the sum's current gain before it writes
// the seam's dip.
function recorder(name, sink, value = 1) {
  return {
    name,
    value,
    cancelScheduledValues(t) { sink.push({ p: name, op: 'cancel', t }); return this; },
    setValueAtTime(v, t) { sink.push({ p: name, op: 'set', t, v }); return this; },
    linearRampToValueAtTime(v, t) { sink.push({ p: name, op: 'lin', t, v }); return this; },
    exponentialRampToValueAtTime(v, t) { sink.push({ p: name, op: 'exp', t, v }); return this; },
    setTargetAtTime(v, t, tau) { sink.push({ p: name, op: 'target', t, v, tau }); return this; },
  };
}

// The nodes a program's automation lines name, and nothing else.
function recordingGraph(beat, sink) {
  return {
    beat,
    macro: { frequency: recorder('macro.frequency', sink) },
    melodic: { gain: recorder('melodic.gain', sink) },
    push: {
      wet: { gain: recorder('push.wet.gain', sink) },
      body: { gain: recorder('push.body.gain', sink) },
      sub: { gain: recorder('push.sub.gain', sink) },
    },
    duck: { gain: recorder('duck.gain', sink) },
    duckLow: { gain: recorder('duckLow.gain', sink) },
    // The melodic bus's sweep stages (house-v2's `busSweeps`).
    sweep: Object.fromEntries(['hp', 'lp'].map((s) => [s, {
      cutoffHz: recorder(`sweep.${s}.cutoffHz`, sink),
      wet: { gain: recorder(`sweep.${s}.wet.gain`, sink) },
      dry: { gain: recorder(`sweep.${s}.dry.gain`, sink) },
    }])),
  };
}

// --- one theme's program -----------------------------------------------------

/**
 * Every automation point a program's lines write, through the real writer, in
 * the order it writes them. **A line the recording graph has no parameter for
 * is a failure, not a silence** (R69 of the reconciled review of 09-24):
 * `scheduleLine` drops a line whose parameter it cannot find, which is right
 * for a graph and wrong for a lock, where a new automation target would be
 * invisible to the digest.
 */
export function recordAutomation(program, beat, where = 'a program') {
  const curves = [];
  const graph = recordingGraph(beat, curves);
  for (const line of program.automation) {
    if (!paramOf(graph, line.param))
      throw new Error(`${where}: an automation line on ${line.param}, which the lock's recording graph does not have — add it to recordingGraph`);
    scheduleLine(graph, line, 0);
  }
  return curves;
}

export /** @returns {ThemeProgram} */
function programOfTheme(master, n, strategy = DEFAULT_STRATEGY) {
  // A fresh plan, and the room every path that makes a sound out of it
  // resolves for itself: `settingsOf(plan)` is what `makeDeck`,
  // and `renderTrack` each hold. The compiler reads both and writes
  // to neither, so nothing here has to own anything.
  const track = planTheme(master, n, { preset: 'auto', strategy });
  const settings = settingsOf(track);
  const program = compilePerformance(track, settings, { boundaryBars: MIX_DEFAULTS.boundaryBars });

  // The curves the graph is given, taken by handing the program's automation
  // to the real writer against a graph whose AudioParams are recorders — the
  // same call `startDeck` and both renders make.
  const curves = recordAutomation(program, track.beat, `theme ${n} of master ${master}`);

  const events = program.events.map((e) => ({
    i: e.i,
    voice: e.voice,
    layer: e.layer,
    bus: e.bus,
    level: e.level,
    bar: e.bar,
    step: e.step,
    // The arrival is the plan's own `t`; the onset is what every horizon test
    // asks for, and for the one anticipatory voice they are 1.8 seconds apart.
    arrival: e.t,
    onset: e.onset,
    lead: e.lead,
    p: sorted(e.p),
  }));

  const onsets = events.map((e) => e.onset);
  settingsOfTheme.set(`${strategy}|${master}|${n}`, settingsHash(program));
  return {
    master,
    index: n,
    seed: program.seed,
    preset: program.preset,
    bpm: program.bpm,
    beat: program.beat,
    barSeconds: program.barSeconds,
    bars: program.bars,
    duration: program.duration,
    // The theme's own output gain, which is the one place the loudness trim is
    // applied: `buildGraph` sets `themeOut.gain.value = dbToGain(trimDb)`.
    trimDb: program.trimDb,
    themeGain: program.themeGain,
    // Where this theme hands over on its own, before a set has a say. The live
    // engine and the offline render both read it off the program.
    seam: program.seam,
    blendBars: program.blendBars,
    filterMove: program.filterMove,
    routing: sorted(program.routing),
    levels: program.levels,
    events,
    automation: curves,
    // The sidechain every kick of the theme posts, in the theme's own seconds.
    duck: program.duck,
    counts: {
      events: events.length,
      automation: curves.length,
      duck: program.duck.length,
      firstOnset: onsets.length ? Math.min(...onsets) : null,
      lastOnset: onsets.length ? Math.max(...onsets) : null,
    },
  };
}

// --- what the voices render with ----------------------------------------------
//
// **The settings, the kick's duck shape and the stage's rows** (R69 of the
// reconciled review of 09-24). The program above hashes the level
// table of the settings and nothing else of them, so a change to the room a
// voice is played in — the kick's pitch and envelope, a send, the sidechain, any
// of the fifty voice blocks — moved no hash. They are hashed on a line of their
// own, `settings`, beside `hash` and not inside it, so adding it moved no theme's
// hash and the full program under tmp/golden/ is the same file it was.
//
// A strategy carries the line from the bless that adds it: house-v2 since
// round (b) of 09-24, house-v1 since round (g) on Eugene's word (question 14:
// the file re-blessed, v1's music not moved — every program hash, count and
// set of its section byte-identical, the `settings` line added beside them).
export const SETTINGS_LOCKED = ['house-v1', 'house-v2'];
const settingsOfTheme = new Map();
/** The `settings` line of a theme: what its voices render with, hashed exactly. */
export const settingsHash = (program) =>
  sha(exact({ settings: program.settings, duckShape: program.duckShape, development: program.development }));

// --- one set's seams ---------------------------------------------------------
//
// The curves a hand-over writes are not a property of either theme: they are
// what `scheduleTransition` tells the two decks and the sum while both are up.
// `setLayout` already lays the themes out on one grid the way `renderMix` does,
// so the decks here are that layout with recording parameters where the audio
// nodes would be.
//
// `extra` is the rest of a set's request — a spell, a recipe, the two modes —
// for the link digest (`tools/link-digest.ts`), which lays out the sets a link
// plays. The two locks pass none, and the options are then the ones they were.
//
// **The style is the strategy's, named** (09-24). `MIX_DEFAULTS` is the
// record's options and carries the record's style, and `setLayout` takes an
// options' style before its strategy's, so until this line house-v2's sets
// were laid out in house-v1's music. Naming it moved no hash — a set's seams
// are planned off its own stream (the check below `the programs` says why) —
// and it is what the page's `createMix` does.
export function seamProgram(master, themes, strategy = DEFAULT_STRATEGY, extra = {}) {
  const o = { ...MIX_DEFAULTS, style: STRATEGIES[strategy].style, strategy, ...extra };
  const L = setLayout(master, themes, o);
  const sink = [];
  const decks = L.plans.map((track, i) => ({
    track,
    // Since round K6 a deck reads its beat, its tempo, its index and its trim
    // off the **program** and not off the plan, so a deck standing in for one
    // here carries the same program a real one would be handed.
    program: programOf(track),
    clock: L.clock,
    startBeat: L.clock.beatAt(L.starts[i]),
    perBeat: L.perBeats[i],
    graph: { buses: { sub: { dry: { gain: recorder(`deck${i}.sub.dry.gain`, sink) } } } },
    hp: { frequency: recorder(`deck${i}.hp.frequency`, sink) },
    lp: { frequency: recorder(`deck${i}.lp.frequency`, sink) },
    fader: { gain: recorder(`deck${i}.fader.gain`, sink) },
  }));
  const sum = { gain: recorder('mix.gain', sink) };
  const scheduled = L.seams.map((s) =>
    // `ctx` is unused by `scheduleTransition` unless the seam is a cut, and a
    // set's own seams never are: a cut is a hand on the NEXT button.
    scheduleTransition(null, decks[s.from], decks[s.to], s.at, s.bars, s.barSeconds, o, sum)
  );
  return {
    master,
    themes,
    starts: L.starts,
    seams: L.seams.map((s, i) => ({
      from: s.from,
      to: s.to,
      bar: s.bar,
      boundary: s.boundary,
      bars: s.bars,
      barSeconds: s.barSeconds,
      at: scheduled[i].at,
      swapAt: scheduled[i].swapAt,
      end: scheduled[i].end,
    })),
    // Which events a seam cuts out rather than fades: the arriving theme's bass
    // until the swap, and a bar without a kick on either side of it.
    // A gap that runs to the end of a theme is written as `Infinity`, which
    // JSON cannot hold and would read back as null: it is said in words here so
    // the file that is written is the file that is compared.
    // Under the two names the digest has always written them, off the one
    // list per hand-over group a deck now keeps.
    gaps: decks.map((d, i) => ({ deck: i, kickGaps: finite(d.gaps?.kick), subGaps: finite(d.gaps?.sub) })),
    curves: sink,
    counts: { seams: L.seams.length, points: sink.length },
  };
}

// --- the whole thing ---------------------------------------------------------

/** @returns {Programs} */
function build(strategy = DEFAULT_STRATEGY) {
  const out = { masters: {}, sets: {} };
  for (const m of MASTERS) {
    const programs = [];
    for (let n = 0; n < THEMES[m]; n++) programs.push(programOfTheme(m, n, strategy));
    out.masters[m] = programs;
    out.sets[m] = seamProgram(m, THEMES[m], strategy);
  }
  // A lock that cannot be written down and read back is not a lock: an
  // infinity or a NaN goes to JSON as `null` and a minus nought as `0`, and the
  // check would then compare a value against the ghost of itself for ever. The
  // one place the program holds an infinity says so in words (`finite` above);
  // anywhere else it is a fault, and this is where it is found.
  writable(out, 'program');
  return out;
}

function writable(v, at) {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`${at} is ${v}, which JSON writes as null`);
    if (Object.is(v, -0)) throw new Error(`${at} is -0, which JSON writes as 0`);
    return;
  }
  if (Array.isArray(v)) { v.forEach((x, i) => writable(x, `${at}[${i}]`)); return; }
  if (v && typeof v === 'object') for (const k of Object.keys(v)) writable(v[k], `${at}.${k}`);
}

// Keys in sorted order at every depth, so a hash answers for the program and
// not for the order the object happened to be built in. The same rule
// `tools/golden.ts` follows, and deliberately its own copy: the golden file
// runs its snapshot at import time and cannot be imported for one helper.
function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object')
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}

// **The same, for a value that is hashed and never written**: a minus nought, an
// infinity and a NaN are each their own word, so a move between one of them
// and a plain number is a move. The settings' own stage rows hold minus noughts
// (a level of -0 dB), which `canonical` would write as 0; nothing written here
// is read back, so there is no file for them to survive. The link digest
// (`tools/link-digest.ts`) hashes with it too.
function exact(v) {
  if (typeof v === 'number') return Object.is(v, -0) ? '"-0"' : Number.isFinite(v) ? JSON.stringify(v) : `"${v}"`;
  if (Array.isArray(v)) return '[' + v.map(exact).join(',') + ']';
  if (v && typeof v === 'object')
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + exact(v[k])).join(',') + '}';
  if (typeof v === 'function') throw new Error('a function where the settings hold values');
  return JSON.stringify(v === undefined ? null : v);
}

// Whatever JSON cannot hold, said in words: an infinity, a NaN or a -0 all
// survive a write and a read back as themselves rather than as null or 0.
const finite = (gaps) =>
  (gaps || []).map((g) => g.map((v) => (Number.isFinite(v) ? (Object.is(v, -0) ? '-0' : v) : String(v))));

function sorted(o) {
  const out = {};
  for (const k of Object.keys(o).sort()) out[k] = o[k];
  return out;
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// What a clean clone compares against: the numbers a person can read at a
// glance, and the hash that catches everything else.
/** @param {Programs} fresh @param {string} [strategy] @returns {Digest} */
function digestOf(fresh, strategy = DEFAULT_STRATEGY) {
  const masters = {};
  const sets = {};
  for (const m of Object.keys(fresh.masters)) {
    masters[m] = fresh.masters[m].map((p) => ({
      index: p.index,
      seed: p.seed,
      events: p.counts.events,
      automation: p.counts.automation,
      duck: p.counts.duck,
      trimDb: p.trimDb,
      firstOnset: p.counts.firstOnset,
      lastOnset: p.counts.lastOnset,
      hash: sha(canonical(p)),
      ...(SETTINGS_LOCKED.includes(strategy) ? { settings: settingsOfTheme.get(`${strategy}|${m}|${p.index}`) } : {}),
    }));
    const s = fresh.sets[m];
    sets[m] = { seams: s.counts.seams, points: s.counts.points, hash: sha(canonical(s)) };
  }
  return {
    note:
      "One line per master seed and theme of the developed program — every event's onset, arrival and resolved parameters, " +
      'every automation point the graph is given, the sidechain, the trim and the routing — plus one line per set for the seam curves. ' +
      '`masters` and `sets` are the default strategy, house-v1, which is the record; every other strategy is a section of its own under `strategies`. ' +
      'Written by tools/program.ts --bless; checked by --check. The golden digest locks the plan; this locks what the plan becomes.' +
      (SETTINGS_LOCKED.includes(strategy) ? ' `settings`: a SHA-256 of what the voices render with — the resolved settings, the duck shape and the stage\'s rows — beside `hash` and not in it.' : ''),
    strategy,
    masters,
    sets,
  };
}

/** One strategy's block, at a given indent: the head lines, the masters, the sets. */
function blockText(d, pad) {
  const out = [];
  if (d.note) out.push(`${pad}"note": ${JSON.stringify(d.note)},`);
  out.push(`${pad}"strategy": ${JSON.stringify(d.strategy)},`);
  out.push(`${pad}"masters": {`);
  const names = Object.keys(d.masters);
  names.forEach((m, i) => {
    out.push(`${pad} ${JSON.stringify(m)}: [`);
    d.masters[m].forEach((p, j) => {
      out.push(`${pad}  ` + JSON.stringify(p) + (j === d.masters[m].length - 1 ? '' : ','));
    });
    out.push(`${pad} ]` + (i === names.length - 1 ? '' : ','));
  });
  out.push(`${pad}},`, `${pad}"sets": {`);
  const setNames = Object.keys(d.sets);
  setNames.forEach((m, i) => {
    out.push(`${pad} ${JSON.stringify(m)}: ` + JSON.stringify(d.sets[m]) + (i === setNames.length - 1 ? '' : ','));
  });
  out.push(`${pad}}`);
  return out;
}

function digestText(d) {
  const out = ['{', ...blockText(d, ' ')];
  const others = Object.keys(d[SECTION] || {});
  if (others.length) {
    out[out.length - 1] += ',';
    out.push(' "strategies": {');
    others.forEach((id, i) => {
      out.push(`  ${JSON.stringify(id)}: {`);
      out.push(...blockText(d[SECTION][id], '   '));
      out.push('  }' + (i === others.length - 1 ? '' : ','));
    });
    out.push(' }');
  }
  out.push('}');
  return out.join('\n') + '\n';
}

// The first thing in the digest that moved, named the way a person would say it.
function digestDiff(saved, fresh) {
  if (!saved) return `there is no section for the strategy ${fresh.strategy} in the digest at all`;
  if (saved.strategy !== undefined && saved.strategy !== fresh.strategy)
    return `the section was blessed for the strategy ${saved.strategy} and this is ${fresh.strategy}`;
  const a = saved.masters || {}, b = fresh.masters;
  for (const m of Object.keys(b)) {
    if (!a[m]) return `master seed ${m} is not in the digest at all`;
    if (a[m].length !== b[m].length) return `master seed ${m}: ${a[m].length} themes in the digest, ${b[m].length} now`;
    for (let i = 0; i < b[m].length; i++) {
      for (const k of ['seed', 'events', 'automation', 'duck', 'trimDb', 'firstOnset', 'lastOnset', 'hash', ...('settings' in b[m][i] ? ['settings'] : [])]) {
        if (a[m][i][k] !== b[m][i][k])
          return `master seed ${m}, theme ${i}: ${k} ${JSON.stringify(a[m][i][k])} -> ${JSON.stringify(b[m][i][k])}`;
      }
    }
  }
  for (const m of Object.keys(a)) if (!b[m]) return `master seed ${m} is in the digest and is no longer a program`;
  const sa = saved.sets || {}, sb = fresh.sets;
  for (const m of Object.keys(sb)) {
    if (!sa[m]) return `the set of master seed ${m} is not in the digest at all`;
    for (const k of ['seams', 'points', 'hash']) {
      if (sa[m][k] !== sb[m][k])
        return `the set of master seed ${m}: ${k} ${JSON.stringify(sa[m][k])} -> ${JSON.stringify(sb[m][k])}`;
    }
  }
  return null;
}

// First differing path, so a failure says which event and which field and not
// just "different".
function firstDiff(a, b, at = '') {
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null) return `${at}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`;
  if (typeof a !== 'object') return `${at}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`;
  if (Array.isArray(a) !== Array.isArray(b)) return `${at}: array/object`;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return `${at}.length: ${a.length} -> ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = firstDiff(a[i], b[i], `${at}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  for (const k of keys) {
    const d = firstDiff(a[k], b[k], `${at}.${k}`);
    if (d) return d;
  }
  return null;
}

const totals = (x) => {
  let events = 0, automation = 0, duck = 0, seam = 0;
  for (const m of Object.keys(x.masters)) {
    for (const p of x.masters[m]) {
      events += p.counts.events;
      automation += p.counts.automation;
      duck += p.counts.duck;
    }
    seam += x.sets[m].counts.points;
  }
  return { events, automation, duck, seam };
};

const rel = (p) => path.relative(process.cwd(), p);

// The whole program, as data, for anything that wants to build two of them
// inside one process — the determinism proof above all. Importing this file is
// free of side effects: `main()` runs only when node was pointed at this file
// and not at something that imports it.
export const programs = build;
export { canonical, exact, digestOf };

function main() {
const argv = process.argv.slice(2);
// **`--all` checks every strategy this build plays**, one line each (R4 of the
// reconciled review of 09-24). The list is `STRATEGIES`' own, read here, so a
// gate that asks for `--all` — the release, `tools/check.ts` — cannot fall
// behind a strategy added after it was written. It is a check only: a bless is
// one strategy's, by name.
if (argv.includes('--all')) {
  const rest = argv.filter((a) => a !== '--all');
  if (rest.join(' ') !== '--check') {
    console.error('--all goes with --check alone: a bless names its one strategy');
    process.exit(2);
  }
  let bad = 0;
  for (const id of Object.keys(STRATEGIES)) {
    try {
      process.stdout.write(execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--check', '--strategy', id], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    } catch (e) {
      bad++;
      process.stderr.write(String(e.stderr || e.message));
    }
  }
  process.exit(bad ? 1 : 0);
}
const at = argv.indexOf('--strategy');
const wanted = at < 0 ? DEFAULT_STRATEGY : argv[at + 1];
if (at >= 0) argv.splice(at, 2);
// A bare run says how and writes nothing (R67): a lock is written by name.
const mode = argv[0] || '';
if (!['--check', '--bless'].includes(mode)) {
  console.error(mode ? `unknown mode ${mode}; use --check or --bless` : 'usage: node tools/program.ts --check | --bless [--strategy <id>]\n'
    + '  --check  regenerate and diff against the committed digest\n  --bless  rewrite it (only with Eugene\'s say-so)');
  process.exit(2);
}
if (!STRATEGIES[wanted]) {
  console.error(`this build plays ${Object.keys(STRATEGIES).join(', ')}, not ${wanted}`);
  process.exit(2);
}

const FILE = FILE_FOR(wanted);
const fresh = build(wanted);
const t = totals(fresh);

if (mode === '--check') {
  if (!fs.existsSync(DIGEST)) {
    console.error(`no digest at ${rel(DIGEST)}, and it is a committed file.`);
    console.error('Restore it from git, or run `node tools/program.ts --bless` if the sound is where Eugene wants it.');
    process.exit(2);
  }
  const digest = digestDiff(sectionOf(JSON.parse(fs.readFileSync(DIGEST, 'utf8')), wanted), digestOf(fresh, wanted));
  // The full program is a scratch file and may not be here. When it is, it
  // turns "the hash moved" into the event and the field that moved.
  const detail = fs.existsSync(FILE) ? firstDiff(JSON.parse(fs.readFileSync(FILE, 'utf8')), fresh, 'program') : null;
  if (digest || detail) {
    console.error(`the program has moved:\n  ${digest || 'the digest agrees, but the full program does not'}`);
    if (detail) console.error(`  ${detail}`);
    else if (digest) console.error('  (no full program under tmp/golden/; --bless one on a known-good checkout to read the field that moved)');
    console.error('\nIf that is a deliberate sound change and Eugene has heard it: node tools/program.ts --bless');
    process.exit(1);
  }
  console.log(
    `the program has not moved: ${wanted}, ${MASTERS.join(', ')} x ${Object.values(THEMES).join('/')} themes, ` +
      `${t.events} events, ${t.automation + t.duck} automation points, ${t.seam} seam points, against ${rel(DIGEST)}` +
      `${detail === null && fs.existsSync(FILE) ? ' and the full program beside it' : ''}`
  );
} else if (mode === '--bless') {
  const saved = fs.existsSync(DIGEST) ? JSON.parse(fs.readFileSync(DIGEST, 'utf8')) : {};
  fs.writeFileSync(DIGEST, digestText(withSection(saved, wanted, digestOf(fresh, wanted))));
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  // One line per event and one per automation point, so a diff points at the
  // event that moved instead of at the whole file.
  const text = JSON.stringify(fresh)
    .replace(/\},\{"i":/g, '},\n{"i":')
    .replace(/\},\{"p":/g, '},\n{"p":')
    .replace(/"masters":\{/, '"masters":{\n')
    .replace(/\},\{"master"/g, '},\n\n{"master"');
  fs.writeFileSync(FILE, text + '\n');
  console.log(
    `wrote ${rel(DIGEST)} and ${rel(FILE)}: ${wanted}, masters ${MASTERS.join(', ')}, ${t.events} events, ` +
      `${t.automation} curve points, ${t.duck} sidechain points, ${t.seam} seam points`
  );
}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
