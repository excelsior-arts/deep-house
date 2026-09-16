// Cutting a release. The full history stays here, on `local`; what the world
// gets is `master`, an orphan branch carrying the public files and one commit
// per release.
//
//   node tools/release.mjs --dry-run   build to one side, run the checks, list
//                                      what would ship, and write nothing
//   node tools/release.mjs             write the release commit on master
//   node tools/release.mjs --skip-browsers   cut without the minute of live play
//   node tools/release.mjs --full            run the sound and browser suites even when
//                                           nothing since the last cut can reach them
//
// A release promises that the notes have not moved and that the record still
// sounds the way it was last blessed, so the suites are part of cutting one
// rather than something a person remembers to run first: the golden check, the
// release audit, the sound (tools/test.mjs, which is what `npm test` runs once
// the build is done) and a minute of live play in WebKit and Firefox, which is
// the only one a hand can wave away, with --skip-browsers, and it says so in
// the output when it does. None of them is allowed to skip: a suite that
// cannot find what it needs ends non-zero and the release stops there.
//
// Nothing is pushed and `local` is never touched: the commit is assembled with
// a temporary index and the branch pointer is moved, so the checkout you are
// standing in does not move under you. Publishing is one more command, by
// hand, when Eugene says so.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (args, opts = {}) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', ...opts }).trim();
const node = (args) => execFileSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
const tried = (args) => {
  try {
    node(args);
    return true;
  } catch {
    return false;
  }
};

const dry = process.argv.includes('--dry-run');
const skipBrowsers = process.argv.includes('--skip-browsers');
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const message = `Deep House v${version}`;

const die = (why, how) => {
  console.error(`\n${why}`);
  if (how) console.error(how);
  process.exit(1);
};

// 1. the site is rebuilt first, so a stale docs/ cannot ship. A dry run is
//    allowed to be run in the middle of an afternoon's work, so it builds into
//    a scratch folder and compares instead of writing over docs/.
const VITE = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const DOCS = path.join(ROOT, 'docs');
const warn = [];

const files = (dir, base = '') => {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...files(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out.sort();
};
const same = (a, b) => {
  const la = files(a), lb = files(b);
  if (la.join('\n') !== lb.join('\n')) return false;
  return la.every((f) => fs.readFileSync(path.join(a, f)).equals(fs.readFileSync(path.join(b, f))));
};

// Beside docs/ rather than in the system's scratch: a source map holds the
// way back to the sources as a relative path, so a build one folder deeper
// would differ from the committed one in every map and in nothing else.
const SCRATCH = path.join(ROOT, '.release-build');
process.on('exit', () => fs.rmSync(SCRATCH, { recursive: true, force: true }));
// What the suites are pointed at: the scratch build in a dry run, because that
// is what would ship, and docs/ itself once the release has rebuilt it.
let site = DOCS;

if (dry) {
  console.log('· docs/');
  const built = tried([VITE, 'build', '--outDir', SCRATCH, '--emptyOutDir']);
  if (!built) warn.push('the build failed.');
  else {
    site = SCRATCH;
    if (!same(SCRATCH, DOCS)) warn.push('docs/ is not what the build makes — the release would rebuild it.');
  }
} else {
  console.log('· building docs/');
  node([VITE, 'build']);
}

// 2. everything that ships must be committed, and the build must have changed
//    nothing: whatever is in the working tree is what the commit will hold.
const dirty = git(['status', '--porcelain']);
if (dirty && !dry)
  die(
    'the tree is not clean, so what would ship is not what is committed:\n' +
      dirty.split('\n').map((l) => '  ' + l).join('\n'),
    '\nCommit or stash it — if the build wrote into docs/, commit docs/ — and run this again.'
  );
if (dirty) warn.push(`the tree is not clean: ${dirty.split('\n').length} files are uncommitted, and the release would refuse them.`);

// 3. the checks. Every one of them runs here, in the order that fails cheapest
//    first, and a dry run runs them too — against the build it just made to
//    one side — so that what it reports is what the cut would find.
const tool = (name, ...args) => [path.join(ROOT, 'tools', name), ...args];
const at = site === DOCS ? [] : ['--site', site];
// The gates scale with what changed. The sound suite and the browser suite
// take six minutes between them, and a cut that changes only the page's
// words, its pictures or its metadata cannot have moved a sample: nothing
// that reaches the renderer or the transport is in it. So the two long suites
// run when a file that can reach them has changed since the last cut, and are
// named as skipped, with the reason, when none has. --full runs them anyway.
const SOUND = /^(?:src\/(?!ring\.js$|rate\.js$|index\.html$).+\.js|tools\/(?:test|test-browsers|harness|meter|scenarios|setplan)\.mjs|tools\/scenes\.json|tools\/reference(?:-seed1\.json|\/.+)|package\.json|vite\.config\.js)$/;
const full = process.argv.includes('--full');
let lastCut = '';
try {
  lastCut = git(['rev-parse', '--verify', 'refs/heads/master'], { stdio: ['pipe', 'pipe', 'pipe'] });
} catch {
  lastCut = '';
}
let soundTouched = true;
let untouchedWhy = '';
if (lastCut && !full) {
  const changed = git(['diff', '--name-only', lastCut, 'HEAD'], {}).split('\n').filter(Boolean);
  const reaching = changed.filter((f) => SOUND.test(f));
  soundTouched = reaching.length > 0;
  if (!soundTouched) untouchedWhy = `nothing that reaches the renderer or the transport has changed since master ${lastCut.slice(0, 7)} (${changed.length} files changed, all page, pictures, words or tools that do not meter)`;
}
const checks = [
  ['the generator has not moved', tool('golden.mjs', '--check'), 'the generator has moved.'],
  ['the release audit', tool('check-release.mjs'), 'the release audit fails.'],
];
if (soundTouched) checks.push(['the sound', tool('test.mjs', ...at), 'the sound has moved, or it could not be metered.']);
if (soundTouched && !skipBrowsers) checks.push(['a minute of live play', tool('test-browsers.mjs', ...at), 'the browsers did not play the set through.']);

for (const [what, args, why] of checks) {
  console.log(`· ${what}`);
  if (dry) {
    if (!tried(args)) warn.push(why);
  } else if (!tried(args)) {
    die(`${what}: this has to pass before a release is cut.`, `\nRun it on its own — node ${path.relative(ROOT, args[0])}${args.slice(1).length ? ' ' + args.slice(1).join(' ') : ''} — and fix what it says.`);
  }
}
if (!soundTouched) console.log(`· the sound and a minute of live play — not run: ${untouchedWhy}`);
else if (skipBrowsers) console.log('· a minute of live play — skipped by hand');

// 4. what ships: everything tracked, minus the scratch. Nothing else may be
//    here at all — a lab folder or a stray snapshot is a mistake, not a file
//    to quietly leave out.
const tracked = git(['ls-files', '-z'], {}).split('\0').filter(Boolean);
const scratch = tracked.filter((p) => /^(?:tmp|lab|out|scratch|node_modules)\//.test(p));
if (scratch.length)
  die(
    `scratch is tracked and would have to be filtered out of the release:\n${scratch
      .map((p) => '  ' + p)
      .join('\n')}`,
    '\nUntrack it (git rm --cached) and ignore it; the release ships the whole tree.'
  );
const ship = tracked.slice().sort();

if (dry) {
  const group = (rx) => ship.filter((p) => rx.test(p));
  const site = group(/^docs\//);
  console.log(`\n${message} — dry run, nothing written.\n`);
  console.log(`${ship.length} files would ship:\n`);
  for (const p of ship.filter((p) => !/^docs\//.test(p))) console.log('  ' + p);
  console.log(`\n  docs/ — the published site, ${site.length} files:`);
  for (const p of site) console.log('    ' + p);
  let head = '';
  try {
    head = git(['rev-parse', '--verify', 'refs/heads/master'], { stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    head = '';
  }
  console.log(
    `\nmaster ${head ? `is at ${head.slice(0, 7)}; the release would sit on top of it` : 'does not exist yet; the release would start it'}.`
  );
  for (const w of warn) console.log(`  · ${w}`);
  if (skipBrowsers) console.log('  · the browser suite was not run: --skip-browsers.');
  process.exit(0);
}

// 5. assemble the commit in a temporary index, so the checkout stands still
const index = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'deep-house-release-')), 'index');
const env = { ...process.env, GIT_INDEX_FILE: index };
git(['read-tree', '--empty'], { env });
for (let i = 0; i < ship.length; i += 200)
  git(['add', '--', ...ship.slice(i, i + 200)], { env });
const tree = git(['write-tree'], { env });

let master = '';
try {
  master = git(['rev-parse', '--verify', 'refs/heads/master'], { stdio: ['pipe', 'pipe', 'pipe'] });
} catch {
  master = '';
}
// --fresh recreates master as a single commit, so small follow-up fixes do not
// pile release commits onto the public history.
const fresh = process.argv.includes('--fresh');
if (master && fresh) master = '';
if (master) {
  const last = git(['log', '-1', '--format=%s', master]);
  if (last === message)
    die(
      `master already carries "${message}".`,
      'Bump the version in package.json before cutting another release.'
    );
}

const commit = git(['commit-tree', tree, ...(master ? ['-p', master] : []), '-m', message]);
git(['update-ref', 'refs/heads/master', commit, ...(master && !fresh ? [master] : [])]);
fs.rmSync(path.dirname(index), { recursive: true, force: true });

console.log(`\n${message}`);
console.log(`  ${ship.length} files, tree ${tree.slice(0, 7)}`);
console.log(`  master ${master ? `${master.slice(0, 7)} -> ` : 'created at '}${commit.slice(0, 7)}`);
console.log(`  local is untouched and nothing was pushed.`);
console.log(`\n  git log --stat master        to read it`);
console.log(`  git push ${fresh ? '--force ' : ''}origin master       to publish it`);
