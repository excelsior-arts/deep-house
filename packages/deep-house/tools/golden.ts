// Master seed 1 is the locked musical body of the first release. This file
// snapshots its *plan* — the notes, the sections, the dice — and nothing about
// how it sounds, so the sound can go on being worked on while the music stops
// moving under it.
//
//   node tools/golden.ts --check    regenerate and diff; non-zero on any change
//   node tools/golden.ts --bless    rewrite it (only with Eugene's say-so)
//   node tools/golden.ts --strategy house-v2   which composition is being locked
//   node tools/golden.ts --style deep-house    the same question, by the music
//
// **The lock names its style** (PLAN-SCALE rule R6) and, since round K5a of
// PLAN-KITCHEN, **its strategy**. A strategy is a style plus the catalogue, the
// switches and the interpreter version it is played under
// (`src/strategies/index.ts`), so it is the finer of the two names and it is the
// one the digest is sectioned by. `--strategy` defaults to `house-v1`, which is
// the record, and its masters stay exactly where they have always been at the
// top of the file: a second strategy is a **second section**, blessed once and
// frozen the same way, and nothing about adding one moves a hash of the first.
//
// At the commit that made `house-v2` there is one thing worth being able to
// read at a glance, and `tools/check.ts` asserts it as a line of its own: the
// two sections' hashes are **equal**, theme for theme, because house-v2 is
// house-v1 with every new candidate at weight nought. The day they differ is a
// deliberate line in a commit message.
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
import { planTheme, STRATEGIES, DEFAULT_STRATEGY } from '../src/mix.ts';
import { execFileSync } from 'node:child_process';
import { snapshotOf, canonical, FULL, MASTERS, THEMES, SECTION, sectionOf, withSection } from './golden-plan.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Under tmp/: a snapshot, not a deliverable. It is rebuilt with --bless.
// The lab is the repository's and not this package's: three folders up.
const FILE_FOR = (id) => path.join(HERE, '..', '..', '..', 'tmp', 'golden',
  id === 'house-v1' ? 'plans.json' : `plans-${id}.json`);
// Beside the tools, in git: the digest a clean clone checks against.
const DIGEST = path.join(HERE, 'golden-digest.json');
// The fourteen themes both locks hold: `MASTERS` and `THEMES`, `golden-plan.ts`.

// The strategies this build can lock, and the styles they play. A strategy is
// asked for by its own id or by the id of the music it plays; the table is the
// composer's and this file does not keep a second one.
const BY_STYLE = Object.fromEntries(Object.values(STRATEGIES).map((s) => [s.style.id, s.id]));

function snapshotTheme(master, n, strategy) {
  return snapshotOf(master, n, planTheme(master, n, { preset: 'auto', style: strategy.style }));
}

function snapshot(strategy) {
  const out = { masters: {} };
  for (const m of MASTERS) {
    const plans = [];
    for (let n = 0; n < THEMES[m]; n++) plans.push(snapshotTheme(m, n, strategy));
    out.masters[m] = plans;
  }
  return out;
}

const eventCount = (p) => (Array.isArray(p.events) ? p.events.length : p.events.count);

// What a clean clone compares against: the numbers a person can read at a
// glance, and the hash that catches everything else.
function digestOf(fresh, strategy) {
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
    note: 'One line per master seed and theme: the tempo, the bars, the event count and a SHA-256 of the plan\'s canonical JSON. `masters` is the default strategy, house-v1, which is the record; every other strategy is a section of its own under `strategies`. Written by tools/golden.ts --bless; checked by --check.',
    // Which music these plans are, and which composition of it. Both sit beside
    // the hashes and are not in them: adding either moved no hash, because a
    // hash is of one plan's canonical JSON and a plan has never carried a name.
    style: strategy.style.id,
    strategy: strategy.id,
    masters,
  };
}

// --- the file, which holds one section per strategy --------------------------
//
// `sectionOf` and `withSection`, `golden-plan.ts`: the default strategy's
// masters at the top level, every other strategy a named section under
// `strategies`, blessed and checked on its own.

/** One strategy's block, at a given indent: the head lines and the masters. */
function blockText(d, pad) {
  const out = [];
  if (d.note) out.push(`${pad}"note": ${JSON.stringify(d.note)},`);
  out.push(`${pad}"style": ${JSON.stringify(d.style)},`);
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

// The first thing in the digest that moved, named the way a person would say
// it: which seed, which theme, which field.
function digestDiff(saved, fresh) {
  if (!saved) return `there is no section for the strategy ${fresh.strategy} in the digest at all`;
  if (saved.style !== undefined && saved.style !== fresh.style)
    return `the digest was blessed for the style ${saved.style} and this is ${fresh.style}`;
  if (saved.strategy !== undefined && saved.strategy !== fresh.strategy)
    return `the section was blessed for the strategy ${saved.strategy} and this is ${fresh.strategy}`;
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

const argv = process.argv.slice(2);
const take = (flag) => {
  const at = argv.indexOf(flag);
  if (at < 0) return null;
  const v = argv[at + 1];
  argv.splice(at, 2);
  return v;
};
// `--strategy` is the name; `--style` asks the same question by the music, and
// a style names its strategy through the composer's own table.
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
const byStyle = take('--style');
const wanted = take('--strategy') || (byStyle ? BY_STYLE[byStyle] : DEFAULT_STRATEGY);
// **A bare run does nothing but say how** (the reconciled review of 09-24, R67).
// Until then every mode other than `--check` blessed, none included, so
// `node tools/golden.ts` on its own rewrote the record's section without a word.
// Writing a lock is a thing somebody asks for by name.
const mode = argv[0] || '';
if (!['--check', '--bless'].includes(mode)) {
  console.error(mode ? `unknown mode ${mode}; use --check or --bless` : 'usage: node tools/golden.ts --check | --bless [--strategy <id> | --style <id>]\n'
    + '  --check  regenerate and diff against the committed digest\n  --bless  rewrite it (only with Eugene\'s say-so)');
  process.exit(2);
}
const strategy = STRATEGIES[wanted];
if (!strategy) {
  console.error(`this build plays ${Object.keys(STRATEGIES).join(', ')}, not ${byStyle || wanted}`);
  process.exit(2);
}
const style = strategy.style;
// One full snapshot per strategy, because it is one strategy's every note.
const FILE = FILE_FOR(strategy.id);
const fresh = snapshot(strategy);

if (mode === '--check') {
  if (!fs.existsSync(DIGEST)) {
    console.error(`no digest at ${path.relative(process.cwd(), DIGEST)}, and it is a committed file.`);
    console.error('Restore it from git, or run `node tools/golden.ts --bless` if the generator is where Eugene wants it.');
    process.exit(2);
  }
  const digest = digestDiff(sectionOf(JSON.parse(fs.readFileSync(DIGEST, 'utf8')), strategy.id), digestOf(fresh, strategy));
  // The full snapshot is a scratch file and may not be here. When it is, it
  // turns "the hash moved" into the bar and the field that moved. It is one
  // file per strategy, because it is one strategy's every note.
  const detail = fs.existsSync(FILE) ? firstDiff(JSON.parse(fs.readFileSync(FILE, 'utf8')), fresh, 'golden') : null;
  if (digest || detail) {
    console.error(`the generator has moved:\n  ${digest || 'the digest agrees, but the full snapshot does not'}`);
    if (detail) console.error(`  ${detail}`);
    else if (digest) console.error('  (no full snapshot under tmp/golden/; --bless one on a known-good checkout to read the note that moved)');
    console.error('\nIf that is intended and Eugene has re-blessed it: node tools/golden.ts --bless');
    process.exit(1);
  }
  console.log(
    `the generator has not moved: ${strategy.id}, ${style.id}, ${MASTERS.join(', ')} x ${Object.values(THEMES).join('/')} themes, ${countEvents(fresh)} events` +
      `, against ${path.relative(process.cwd(), DIGEST)}${detail === null && fs.existsSync(FILE) ? ' and the full snapshot beside it' : ''}`
  );
} else if (mode === '--bless') {
  const saved = fs.existsSync(DIGEST) ? JSON.parse(fs.readFileSync(DIGEST, 'utf8')) : {};
  fs.writeFileSync(DIGEST, digestText(withSection(saved, strategy.id, digestOf(fresh, strategy))));
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
  console.log(`wrote ${path.relative(process.cwd(), DIGEST)} and ${path.relative(process.cwd(), FILE)}: ${strategy.id}, ${style.id}, masters ${MASTERS.join(', ')}, ${countEvents(fresh)} events`);
}
