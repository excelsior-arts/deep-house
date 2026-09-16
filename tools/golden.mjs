// Master seed 1 is the locked musical body of the first release. This file
// snapshots its *plan* — the notes, the sections, the dice — and nothing about
// how it sounds, so the sound can go on being worked on while the music stops
// moving under it.
//
//   node tools/golden.mjs --check    regenerate and diff; non-zero on any change
//   node tools/golden.mjs --bless    rewrite it (only with Eugene's say-so)
//
// There are two files and the check needs only the first of them.
// `tools/golden-digest.json` is committed: one line per master seed and theme
// with its tempo, its length, how many events it holds and a SHA-256 of the
// plan's canonical JSON. It is a couple of kilobytes, so it can live in the
// repository, and a clean clone can therefore answer the only question that
// matters — has the generator moved? — without being handed anything.
// `tmp/golden/plans.json` is the full snapshot, every note of it, and it is
// ignored on purpose: it is 1.7 MB and it is a scratch file. When it is there
// the check reads it as well, because a hash says that something moved and the
// full snapshot says what.
//
// What is captured: every event's time, voice, layer, bar, step, pitch, length
// and velocity, the timeline, the section plan and every die. What is not:
// levels, sends, drive, reverb amounts, the push automation, the macro filter
// — everything a mix engineer is allowed to change.

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planTheme } from '../src/mix.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Under tmp/: a snapshot, not a deliverable. It is rebuilt with --bless.
const FILE = path.join(HERE, '..', 'tmp', 'golden', 'plans.json');
// Beside the tools, in git: the digest a clean clone checks against.
const DIGEST = path.join(HERE, 'golden-digest.json');
// Seed 1 is the locked musical body of the release; the other two are the
// regression seeds. Between them any drift in the generator itself — not just
// in one seed's luck — fails the check.
const MASTERS = ['1', '92970', '21323'];
const THEMES = { 1: 6, 92970: 4, 21323: 4 };
// Seed 1's notes are written out in full, because it is the body of the
// release and a diff on it has to be readable. The two regression seeds are
// kept as a per-bar count and a hash: enough to fail on any drift, without
// three megabytes of JSON nobody will ever read.
const FULL = '1';

// The send and level fields a voice takes. Everything here is mixing, not
// music, and none of it belongs in the lock.
const SOUND_KEYS = new Set(['reverb', 'delay', 'hall', 'gain', 'spread', 'open', 'pan', 'haas', 'startHz']);

const round = (v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);

function musicalParams(p = {}) {
  const out = {};
  for (const k of Object.keys(p).sort()) {
    if (SOUND_KEYS.has(k)) continue;
    out[k] = round(p[k]);
  }
  return out;
}

function snapshotTheme(master, n) {
  const t = planTheme(master, n, { preset: 'auto' });
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

function snapshot() {
  const out = { masters: {} };
  for (const m of MASTERS) {
    const plans = [];
    for (let n = 0; n < THEMES[m]; n++) plans.push(snapshotTheme(m, n));
    out.masters[m] = plans;
  }
  return out;
}

// Canonical JSON: keys in sorted order at every depth, so a hash answers for
// the plan and not for the order the object happened to be built in.
function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object')
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}

const eventCount = (p) => (Array.isArray(p.events) ? p.events.length : p.events.count);

// What a clean clone compares against: the numbers a person can read at a
// glance, and the hash that catches everything else.
function digestOf(fresh) {
  const masters = {};
  for (const m of Object.keys(fresh.masters)) {
    masters[m] = fresh.masters[m].map((p) => ({
      index: p.index,
      seed: p.seed,
      preset: p.preset,
      bpm: p.bpm,
      bars: p.bars,
      events: eventCount(p),
      hash: crypto.createHash('sha256').update(canonical(p)).digest('hex'),
    }));
  }
  return {
    note: 'One line per master seed and theme: the tempo, the bars, the event count and a SHA-256 of the plan\'s canonical JSON. Written by tools/golden.mjs --bless; checked by --check.',
    masters,
  };
}

function digestText(d) {
  const out = ['{', ` "note": ${JSON.stringify(d.note)},`, ' "masters": {'];
  const names = Object.keys(d.masters);
  names.forEach((m, i) => {
    out.push(`  ${JSON.stringify(m)}: [`);
    d.masters[m].forEach((p, j) => {
      out.push('   ' + JSON.stringify(p) + (j === d.masters[m].length - 1 ? '' : ','));
    });
    out.push('  ]' + (i === names.length - 1 ? '' : ','));
  });
  out.push(' }', '}');
  return out.join('\n') + '\n';
}

// The first thing in the digest that moved, named the way a person would say
// it: which seed, which theme, which field.
function digestDiff(saved, fresh) {
  const a = saved.masters || {}, b = fresh.masters;
  for (const m of Object.keys(b)) {
    if (!a[m]) return `master seed ${m} is not in the digest at all`;
    if (a[m].length !== b[m].length) return `master seed ${m}: ${a[m].length} themes in the digest, ${b[m].length} now`;
    for (let i = 0; i < b[m].length; i++) {
      for (const k of ['seed', 'preset', 'bpm', 'bars', 'events', 'hash']) {
        if (a[m][i][k] !== b[m][i][k])
          return `master seed ${m}, theme ${i}: ${k} ${JSON.stringify(a[m][i][k])} -> ${JSON.stringify(b[m][i][k])}`;
      }
    }
  }
  for (const m of Object.keys(a)) if (!b[m]) return `master seed ${m} is in the digest and is no longer generated`;
  return null;
}

function countEvents(x) {
  return Object.values(x.masters).reduce((a, plans) => a + plans.reduce((b, p) => b + eventCount(p), 0), 0);
}

// First differing path, so a failure says where and not just "different".
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

const mode = process.argv[2] || '';
if (mode && !['--check', '--bless'].includes(mode)) {
  console.error(`unknown mode ${mode}; use --check or --bless`);
  process.exit(2);
}
const fresh = snapshot();

if (mode === '--check') {
  if (!fs.existsSync(DIGEST)) {
    console.error(`no digest at ${path.relative(process.cwd(), DIGEST)}, and it is a committed file.`);
    console.error('Restore it from git, or run `node tools/golden.mjs --bless` if the generator is where Eugene wants it.');
    process.exit(2);
  }
  const digest = digestDiff(JSON.parse(fs.readFileSync(DIGEST, 'utf8')), digestOf(fresh));
  // The full snapshot is a scratch file and may not be here. When it is, it
  // turns "the hash moved" into the bar and the field that moved.
  const detail = fs.existsSync(FILE) ? firstDiff(JSON.parse(fs.readFileSync(FILE, 'utf8')), fresh, 'golden') : null;
  if (digest || detail) {
    console.error(`the generator has moved:\n  ${digest || 'the digest agrees, but the full snapshot does not'}`);
    if (detail) console.error(`  ${detail}`);
    else if (digest) console.error('  (no full snapshot under tmp/golden/; --bless one on a known-good checkout to read the note that moved)');
    console.error('\nIf that is intended and Eugene has re-blessed it: node tools/golden.mjs --bless');
    process.exit(1);
  }
  console.log(
    `the generator has not moved: ${MASTERS.join(', ')} x ${Object.values(THEMES).join('/')} themes, ${countEvents(fresh)} events` +
      `, against ${path.relative(process.cwd(), DIGEST)}${detail === null && fs.existsSync(FILE) ? ' and the full snapshot beside it' : ''}`
  );
} else {
  fs.writeFileSync(DIGEST, digestText(digestOf(fresh)));
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  // Compact, but one line per event and one per timeline row, so a diff points
  // at the bar that moved instead of at the whole file.
  const text = JSON.stringify(fresh)
    .replace(/\},\{"voice"/g, '},\n{"voice"')
    .replace(/\},\{"bar"/g, '},\n{"bar"')
    .replace(/"masters":\{/, '"masters":{\n')
    .replace(/\],"(\d+)":\[/g, '],\n\n"$1":[')
    .replace(/\},\{"index"/g, '},\n\n{"index"');
  fs.writeFileSync(FILE, text + '\n');
  console.log(`wrote ${path.relative(process.cwd(), DIGEST)} and ${path.relative(process.cwd(), FILE)}: masters ${MASTERS.join(', ')}, ${countEvents(fresh)} events`);
}
