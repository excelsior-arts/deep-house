// Cutting a release. The full history stays here, on `local`; what the world
// gets is `master`, an orphan branch carrying the public files and one commit
// per release.
//
//   node tools/release.ts --dry-run   build to one side, run the checks, list
//                                      what would ship, and write nothing
//   node tools/release.ts             write the release commit on master
//   node tools/release.ts --skip-browsers   cut without the minute of live play
//   node tools/release.ts --full            run the sound and browser suites even when
//                                           nothing since the last cut can reach them
//   node tools/release.ts --list-gates      print the promise's gates and stop
//   node tools/release.ts --port 7200       the machine view's photograph on 7200 and
//                                           the suites on 7201, for a worktree that
//                                           must not share the default ports
//   node tools/release.ts --keep-pictures   ship public/machine.{svg,png} as committed
//                                           instead of photographing again: the ring
//                                           is animated, so two photographs of the
//                                           same tree differ by a beat arc and the
//                                           clean-tree gate below would never pass
//
// It refuses outright if VITE_PRIVATE_TOOLS is set in the environment: that is
// the dev and preview flag (the private tier's per-instrument export), and a
// release carries none of it.
//
// A release promises that the notes have not moved and that the record still
// sounds the way it was last blessed, so the suites are part of cutting one
// rather than something a person remembers to run first: the **whole** of the
// root `npm run check` — the types, the locks of every strategy (the plans, the
// programs, the recipe programs and what a written link plays, held to what
// the last cut shipped), the link's own test and every other node check — then
// the release audit of what would ship, the sound
// (tools/test.ts, which is what `npm test` runs once the build is done) and a
// minute of live play in WebKit and Firefox, which is the only one a hand can
// wave away, with --skip-browsers, and it says so in the output when it does.
// None of them is allowed to skip: a suite that cannot find what it needs ends
// non-zero and the release stops there.
//
// Until the reconciled review of 09-24 (R4) the only lock
// here was `golden.ts --check` with no strategy, which is house-v1's plans —
// while a bare link plays house-v2. A cut could ship with v2's plans, either
// strategy's programs or any pulled link moved, and notice nothing. Round (b)
// ran the five locks by name and left the whole check behind a flag; Eugene's
// answer to question 7 is the whole check, always, so there is no flag and no
// partial path: a cut is never gated on less than a commit is.
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
import { privateTier, inTier } from './private-tier.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (args, opts = {}) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', ...opts }).trim();
const node = (args, cwd = ROOT) => execFileSync(process.execPath, args, { cwd, stdio: 'inherit' });
const tried = (args, cwd = ROOT) => {
  try {
    node(args, cwd);
    return true;
  } catch {
    return false;
  }
};

const die = (why, how) => {
  console.error(`\n${why}`);
  if (how) console.error(how);
  process.exit(1);
};

const dry = process.argv.includes('--dry-run');
const skipBrowsers = process.argv.includes('--skip-browsers');
const portAt = process.argv.indexOf('--port');
const port = portAt < 0 ? null : Number(process.argv[portAt + 1]);
if (port !== null && !(Number.isInteger(port) && port >= 1024 && port < 65535))
  die(`--port wants a whole number between 1024 and 65534, not ${process.argv[portAt + 1]}`);
// The suites' own ports, when a port is named: the photograph on it, the rest one above.
const suitePort = port === null ? [] : ['--port', String(port + 1)];
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const message = `Deep House v${version}`;


// 0. **A release is never built with the private tier in the environment.**
//    `VITE_PRIVATE_TOOLS=1` puts the per-instrument export on the page; it is
//    for `npm run dev` and `npm run build:preview` and for nothing else. A
//    release built with it set would ship Eugene's private tool, silently, in
//    whatever shell happened to have the variable exported. So the release
//    refuses rather than trusting a person to remember, and it refuses before
//    it builds anything, because the build is what would carry it. A dry run
//    refuses too: the point of a dry run is to answer what would ship, and
//    this is the answer. (The engine a bare link plays is no flag: it is
//    `DEFAULT_VER` in `src/link-table.ts`, house-v2 in every build.)
if (process.env.VITE_PRIVATE_TOOLS) {
  die(`VITE_PRIVATE_TOOLS is set to ${process.env.VITE_PRIVATE_TOOLS} in this shell.`,
    'That flag is the dev and preview build\'s private tier; a release carries none of it.\n'
    + 'Unset it (unset VITE_PRIVATE_TOOLS) and cut the release again. `npm run build:preview` is how the preview is built with it.');
}

// 1. the site is rebuilt first, so a stale docs/ cannot ship. A dry run is
//    allowed to be run in the middle of an afternoon's work, so it builds into
//    a scratch folder and compares instead of writing over docs/.
const VITE = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const DOCS = path.join(ROOT, 'docs');
// The site is one package's build — `packages/deep-house`, the composer and the
// page — and `docs/` is the repository's, because the published site belongs to
// the work and not to a package of it. Vite is run standing in that package, so
// it finds the config that says so; everything else here is the repository's.
const APP = path.join(ROOT, 'packages', 'deep-house');
// The two packages' tools: the app's read the digests and the scenes, the
// repository's audit what would ship.
const tool = (name, ...args) => [path.join(name === 'check-release.ts' ? path.join(ROOT, 'tools') : path.join(APP, 'tools'), name), ...args];
const warn = [];

// The promise's gate is the root `npm run check`, whole (Eugene, question 7 of
// the reconciled review of 09-24): it holds both lock tools over every
// strategy (`--all` walks STRATEGIES in the tools themselves, so a strategy
// added later is locked without this line knowing its name), the recipe
// programs, the link digest against the last cut, the link's own test, and
// everything else a commit is held to.
const GATE = { what: 'the whole of npm run check', command: ['npm', 'run', 'check'], why: 'npm run check fails.' };

// `--list-gates` prints the promise's gate and stops, before anything is
// built: `tools/check.ts` reads it, and holds the check it names to running
// every lock, so a release that stops locking a strategy or the link fails the
// suite before it can fail to fail a cut.
if (process.argv.includes('--list-gates')) {
  console.log(`${GATE.what}\t${GATE.command.join(' ')}`);
  process.exit(0);
}

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

// **The README's diagram is a photograph of the machine view** (step 1b,
// 2026-09-19). The two hand-drawn pictures it used to carry could not be kept
// in step by hand, so `tools/machine-view.ts` opens the built page headless at a
// stated place in a stated record, flips it to the machine view and writes the
// view's own diagram out. `public/` is where it goes, because that is where the
// pictures live and what the build copies into `docs/`.
//
// Which means the site is built **twice** at a release, and the order is the
// whole of it: build so there is something to photograph, photograph, build
// again so the fresh picture is in `docs/`. A dry run photographs into a scratch
// folder and compares, the way it already compares the site.
//
// `mastering.svg` and `mastering.png` are not regenerated: the master chain is
// eleven boxes of the same diagram now, so the two of them retire and the
// README's sentence points at the picture and at `?view=machine` on the live
// page.
const PICTURES_DIR = path.join(ROOT, 'public');
const SHOT = path.join(ROOT, 'tools', 'machine-view.ts');
const SHOTS = path.join(ROOT, '.release-pictures');
process.on('exit', () => fs.rmSync(SHOTS, { recursive: true, force: true }));
// `--sizes one`: the release carries the README's picture and not the round's
// three, which are a laptop, a large desktop and a phone taken to look at.
const picture = (out, from) => tried([SHOT, '--out', out, '--site', from, '--port', String(port ?? 7035), '--sizes', 'one']);

if (dry) {
  console.log('· docs/');
  const built = tried([VITE, 'build', '--outDir', SCRATCH, '--emptyOutDir'], APP);
  if (!built) warn.push('the build failed.');
  else {
    site = SCRATCH;
    if (!same(SCRATCH, DOCS)) warn.push('docs/ is not what the build makes — the release would rebuild it.');
    console.log('· the README\'s diagram');
    fs.mkdirSync(SHOTS, { recursive: true });
    // Of the scratch build and not of `docs/`: a dry run reports what *would*
    // ship, and the page it would ship is the one it has just made to one side.
    if (!picture(SHOTS, SCRATCH)) warn.push('the machine view could not be photographed — the README\'s diagram would not be refreshed.');
    else for (const f of ['machine.svg', 'machine.png']) {
      const was = path.join(PICTURES_DIR, f);
      if (!fs.existsSync(was) || !fs.readFileSync(was).equals(fs.readFileSync(path.join(SHOTS, f))))
        warn.push(`public/${f} is not what the machine view draws — the release would replace it.`);
    }
  }
} else if (process.argv.includes('--keep-pictures')) {
  console.log('· building docs/ with public/machine.{svg,png} as committed: --keep-pictures');
  node([VITE, 'build'], APP);
} else {
  console.log('· building docs/');
  node([VITE, 'build'], APP);
  console.log('· photographing the machine view into public/');
  if (!picture(PICTURES_DIR, DOCS))
    die('the machine view could not be photographed, so the README\'s diagram would ship stale.',
      '\nRun it on its own — node tools/machine-view.ts — and fix what it says.');
  console.log('· building docs/ again, with the fresh picture in it');
  node([VITE, 'build'], APP);
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
const at = site === DOCS ? [] : ['--site', site];
// The gates scale with what changed. The sound suite and the browser suite
// take six minutes between them, and a cut that changes only the page's
// words, its pictures or its metadata cannot have moved a sample: nothing
// that reaches the renderer or the transport is in it. So the two long suites
// run when a file that can reach them has changed since the last cut, and are
// named as skipped, with the reason, when none has. --full runs them anyway.
// `.json` under either `src/` and the recipe library are in it since the
// review of 09-19: a signature table, a loudness fit and a recipe row are
// compiled into the bundle and decide which way a die leans or how loud a
// theme plays, so a cut that changes one of them has moved a sample as surely
// as one that changes a voice. The build stamp already reads them for the same
// reason; this regex had not caught up.
const SOUND = /^(?:packages\/engine\/(?:src\/.+\.(?:js|ts|json)|tools\/(?:meter|harness)\.ts)|packages\/deep-house\/(?:src\/(?!ring\.ts$|rate\.ts$|index\.html$).+\.(?:js|ts|json)|recipes\/.+\.json|tools\/(?:test|test-browsers|scenarios|setplan)\.ts|tools\/scenes\.json|tools\/reference(?:-seed1\.json|\/.+)|package\.json|vite\.config\.ts)|package\.json)$/;
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
const npm = (args) => {
  try {
    execFileSync('npm', args, { cwd: ROOT, stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
};
const checks: [string, string[] | null, string, (() => boolean)?][] = [[GATE.what, null, GATE.why, () => npm(GATE.command.slice(1))]];
// The audit is of what would ship: the scratch build in a dry run (`--site`),
// docs/ itself once the release has rebuilt it.
checks.push(['the release audit', tool('check-release.ts', ...at), 'the release audit fails.']);
if (soundTouched) checks.push(['the sound', tool('test.ts', ...at, ...suitePort), 'the sound has moved, or it could not be metered.']);
if (soundTouched && !skipBrowsers) checks.push(['a minute of live play', tool('test-browsers.ts', ...at, ...suitePort), 'the browsers did not play the set through.']);

const GATE_FAULTS = checks.map(([, , why]) => why);
for (const [what, args, why, run] of checks) {
  console.log(`· ${what}`);
  const ok = run ? run() : tried(args);
  if (dry) {
    if (!ok) warn.push(why);
  } else if (!ok) {
    const how = run ? 'npm run check' : `node ${args.map((a) => (path.isAbsolute(a) ? path.relative(ROOT, a) : a)).join(' ')}`;
    die(`${what}: this has to pass before a release is cut.`, `\nRun it on its own — ${how} — and fix what it says.`);
  }
}
if (!soundTouched) console.log(`· the sound and a minute of live play — not run: ${untouchedWhy}`);
else if (skipBrowsers) console.log('· a minute of live play — skipped by hand');

// 4. what ships: everything tracked, minus the scratch. Nothing else may be
//    here at all — a lab folder or a stray snapshot is a mistake, not a file
//    to quietly leave out.
const tracked = git(['ls-files', '-z'], {}).split('\0').filter(Boolean);
// The private tier: `.releaseignore` lists the prefixes that are tracked on
// `local` for the private origin and never reach the public repository — the
// notes, the mining tooling. One .gitignore serves both tiers; this is the
// second, tighter list, applied here and mirrored by the audit.
const PRIVATE = privateTier(ROOT);
const isPrivate = (p) => inTier(PRIVATE, p);
const stripped = tracked.filter(isPrivate);
const scratch = tracked.filter((p) => /^(?:tmp|lab|out|scratch|node_modules)\//.test(p));
if (scratch.length)
  die(
    `scratch is tracked and would have to be filtered out of the release:\n${scratch
      .map((p) => '  ' + p)
      .join('\n')}`,
    '\nUntrack it (git rm --cached) and ignore it; the release ships the whole tree but for the private tier in .releaseignore.'
  );
const ship = tracked.filter((p) => !isPrivate(p)).sort();

if (dry) {
  const group = (rx) => ship.filter((p) => rx.test(p));
  const site = group(/^docs\//);
  console.log(`\n${message} — dry run, nothing written.\n`);
  console.log(`${ship.length} files would ship (${stripped.length} kept to the private tier by .releaseignore: ${PRIVATE.join(' ')}):\n`);
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
  // A dry run that found something a cut would stop on says so in its exit,
  // so a gate can be tested by running one (R4's gate: a moved v2 plan).
  process.exit(warn.some((w) => GATE_FAULTS.includes(w)) ? 1 : 0);
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
console.log(`  ${ship.length} files, tree ${tree.slice(0, 7)}; ${stripped.length} private-tier files left behind`);
console.log(`  master ${master ? `${master.slice(0, 7)} -> ` : 'created at '}${commit.slice(0, 7)}`);
console.log(`  local is untouched and nothing was pushed.`);
console.log(`\n  git log --stat master        to read it`);
console.log(`  git push ${fresh ? '--force ' : ''}upstream master     to publish it (upstream is the public repository; origin is private)`);
