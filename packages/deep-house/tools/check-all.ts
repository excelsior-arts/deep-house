// `npm run check` for this package: every node check at once, each to a log of its own, and one block at the end.
//
//   node tools/check-all.ts            the merge gate: check.ts in four parts, the words, the node tests (their sweeps
//                                      at every third seed), the guards' line, side by side; under three minutes
//   DEEP_HOUSE_SWEEP=full node tools/check-all.ts   the night's: every sweep whole
//   node tools/check-all.ts --parts 6  check.ts in six parts
//   node tools/check-all.ts --verbose  every log printed whole as it ends, not only the red
//
// Round test-sane (11-05; his word: "even 30 minutes is a lot, not sure what are we testing there"). It was a chain
// of four commands, one after the other, check.ts alone 262 s on one core and the node tests' 240 KB of `ℹ` lines on
// the screen; the reds were found by scrolling. Now the pieces run side by side, the logs go to `tmp/check-logs/`
// (the repository's `tmp/`), and the run ends with
//
//   check: green, 2m41s                              or
//   check: 2 red, 2m41s — check.ts: <name>; node tests: <name>
//
// with each red's own lines above it. A threshold is never this file's: it only runs the checks and reads their ends.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.join(HERE, '..');
const REPO = path.join(PKG, '..', '..');
const LOGS = path.join(REPO, 'tmp', 'check-logs');
const ARGV = process.argv.slice(2);
const argOf = (k: string): string | null => { const i = ARGV.indexOf(`--${k}`); return i < 0 ? null : ARGV[i + 1]; };
const PARTS = Math.max(1, Number(argOf('parts') ?? 4) | 0);
const VERBOSE = ARGV.includes('--verbose');
const FULL = process.env.DEEP_HOUSE_SWEEP === 'full';

// The node test files, the list `package.json`'s check named (one place now: here).
export const TEST_FILES = [
  'check-composition', 'check-calibration', 'check-live-audition', 'check-recipe-selection', 'check-recipe-assembly',
  'check-recipe-context', 'check-development-shape', 'check-development-rhythm', 'check-rhythm-characters',
  'check-recipe-catalogue', 'check-recipe-performance', 'check-scene', 'check-composer-phrases', 'check-composer-swells',
  'check-composer-sections', 'check-composer-places', 'check-link', 'check-transport', 'check-keys', 'check-ambient',
  'check-ambient-voices', 'check-passage', 'check-plan-worker', 'check-hat-figure', 'check-conversation',
  'check-drone-voices', 'check-zones', 'check-journey', 'check-air', 'check-surf', 'check-slowdown', 'check-bowls',
  'check-ensembles', 'check-length', 'check-layout', 'check-break-pulse', 'check-heart',
].map((f) => `tools/${f}.ts`);

type Job = { name: string; args: string[]; log: string; reds: (out: string, code: number) => string[] };

// What each piece calls red, read off its own end.
const checkReds = (out: string, code: number) => {
  const reds = [...out.matchAll(/^FAIL {2}(.+?): /gm)].map((m) => m[1]);
  return reds.length || code === 0 ? reds : [`exited ${code} with no FAIL line`];
};
const wordReds = (out: string, code: number) => {
  const reds = [...out.matchAll(/^ {2}FAIL (.+)$/gm)].map((m) => m[1]);
  return reds.length || code === 0 ? reds : [`exited ${code}`];
};
const testReds = (out: string, code: number) => {
  // the spec reporter's own list at the end: "✖ failing tests:" then each red as "✖ <name> (<ms>)"
  const at = out.lastIndexOf('✖ failing tests:');
  const reds = at < 0 ? [] : [...out.slice(at).matchAll(/^✖ (.+?) \([\d.]+m?s\)$/gm)].map((m) => m[1]);
  return reds.length || code === 0 ? reds : [`exited ${code} with no failing test named`];
};
const anyReds = (out: string, code: number) => (code === 0 ? [] : [`exited ${code}`]);

const jobs: Job[] = [
  ...Array.from({ length: PARTS }, (_, k) => ({ name: `check.ts ${k + 1}/${PARTS}`, args: ['tools/check.ts', '--part', `${k + 1}/${PARTS}`, '--times'], log: `check-${k + 1}.log`, reds: checkReds })),
  { name: 'words', args: ['tools/check-words.ts'], log: 'words.log', reds: wordReds },
  { name: 'node tests', args: ['--test', '--test-reporter=spec', ...TEST_FILES], log: 'node-tests.log', reds: testReds },
  { name: 'guards', args: ['tools/check-program-guards.ts', '--line'], log: 'guards.log', reds: anyReds },
];

fs.mkdirSync(LOGS, { recursive: true });
const t0 = Date.now();
const clock = (ms: number) => `${Math.floor(ms / 60000)}m${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}s`;
console.log(`check: ${jobs.length} pieces side by side${FULL ? ', the sweeps whole' : ', the sweeps at every third seed'}; logs in ${path.relative(process.cwd(), LOGS) || LOGS}`);

const run = (j: Job) => new Promise<{ job: Job; out: string; code: number; ms: number }>((done) => {
  const at = Date.now();
  const file = path.join(LOGS, j.log);
  const sink = fs.createWriteStream(file);
  let out = '';
  const child = spawn(process.execPath, j.args, { cwd: PKG, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const s of [child.stdout, child.stderr]) s.on('data', (b) => { out += b; sink.write(b); });
  child.on('close', (code) => {
    sink.end();
    const ms = Date.now() - at;
    done({ job: j, out, code: code ?? 1, ms });
  });
});

const results = await Promise.all(jobs.map(async (j) => {
  const r = await run(j);
  const reds = j.reds(r.out, r.code);
  console.log(`${reds.length ? 'red  ' : 'ok   '} ${j.name.padEnd(14)} ${clock(r.ms).padStart(6)}${reds.length ? `  ${reds.length} red` : ''}  (${path.join(path.relative(process.cwd(), LOGS) || LOGS, j.log)})`);
  return { ...r, reds };
}));

const red = results.filter((r) => r.reds.length);
for (const r of VERBOSE ? results : red) {
  console.log(`\n--- ${r.job.name} ---`);
  if (VERBOSE) { console.log(r.out.trimEnd()); continue; }
  // a red's own lines: check.ts's FAIL lines, the words' FAIL lines, the node tests' failing list with each error's
  // first lines
  if (r.job.name === 'node tests') {
    const at = r.out.lastIndexOf('✖ failing tests:');
    console.log((at < 0 ? r.out.slice(-3000) : r.out.slice(at)).split('\n').filter((l) => !/^\s+at /.test(l)).slice(0, 120).join('\n').trimEnd());
  } else {
    const lines = r.out.split('\n').filter((l) => /FAIL/.test(l));
    console.log((lines.length ? lines : r.out.split('\n').slice(-20)).join('\n').trimEnd());
  }
}
const total = Date.now() - t0;
const named = red.flatMap((r) => r.reds.map((n) => `${r.job.name}: ${n.slice(0, 100)}`));
console.log(named.length ? `\ncheck: ${named.length} red, ${clock(total)} — ${named.join('; ')}` : `\ncheck: green, ${clock(total)}`);
process.exit(named.length ? 1 : 0);
