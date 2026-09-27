// Does the machine install and run anywhere, with no composer in sight?
//
//   npm run standalone -w @deep-house/engine
//
// The boundary gate in the app's `tools/check.ts` reads the imports and says
// that no module of this package names anything outside it. This asks the
// question the other way round, and costs a tarball: pack the package as npm
// would, install it into an empty folder somewhere else on the disk, and import
// every name on its exports map from a script that has never heard of deep
// house.
//
// It is installed **twice**, because there are two ways a package is consumed
// and node treats them differently:
//
//   copied    `npm install <tarball>` unpacks it into node_modules. Node
//             refuses to strip types out of anything under node_modules
//             (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), so the five
//             subpaths that are `.ts` do not import — for a rule about
//             node_modules, not about this package. A bundler has no such rule
//             and neither does the app, which is how the page is built.
//   linked    `npm install file:<dir>` symlinks it, which is what a workspace
//             and a git dependency both do. The real path is outside
//             node_modules, node strips the types, and every subpath imports.
//
// Both are run and both are reported. What they prove together is that the
// tarball is complete — nothing in it reaches for a file that is not in it —
// and that a consumer who links it, or who builds with a bundler, has the whole
// machine. The day the engine is published for plain node consumers, the `.ts`
// subpaths want compiling at pack time; that is a packaging decision and not a
// boundary, and it is written down in notes/TODO.md.
//
// It is not part of `npm test` because it shells out to npm four times; it is
// what round W of PLAN-V1-NEXT proved the split with, and what to run before
// the engine is ever lifted into a repository of its own.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.join(HERE, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8'));
const NAME = manifest.name;
const SUBPATHS = Object.keys(manifest.exports).map((k) => k.replace(/^\.\//, ''));
const npm = (args: string[], cwd: string): string => execFileSync('npm', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deep-house-engine-'));
let failed = 0;

// The probe, as text: it is written into the temp folder and run there, so it
// names the package the way any consumer would. The name is passed in as a
// value rather than written into a specifier, because a literal specifier in
// this file would be an engine module naming something outside the package,
// which the boundary gate reads — rightly — as a reach across the line.
const PROBE = `
const pkg = ${JSON.stringify(NAME)};
const names = ${JSON.stringify(SUBPATHS)};
const out = [];
const refused = [];
for (const name of names) {
  try {
    const m = await import(pkg + '/' + name);
    out.push([name, Object.keys(m).length]);
  } catch (e) {
    refused.push([name, e.code || e.constructor.name]);
  }
}
let did = null;
try {
  const { resolveSettings } = await import(pkg + '/settings');
  const { duckShape } = await import(pkg + '/program');
  const { REGISTRY } = await import(pkg + '/voices');
  const { table } = await import(new URL('node_modules/' + pkg + '/tools/fixture.ts', import.meta.url).href);
  const settings = resolveSettings({ base: table });
  did = { frozen: Object.isFrozen(settings), sub: settings.levels.sub, voices: REGISTRY.length, duck: duckShape(settings, 0.5).length };
} catch (e) {
  did = { error: e.code || e.message.split('\\n')[0] };
}
console.log(JSON.stringify({ out, refused, did }));
`;

/** What the probe managed to do with the machine, or the one error that stopped it. */
interface ProbeDid {
  frozen?: boolean;
  sub?: number;
  voices?: number;
  duck?: number;
  error?: string;
}

/**
 * What the probe prints, as JSON, out of the folder it was installed into:
 * which subpaths imported and how many names each carried, which refused and
 * with what code, and what it managed to do once it had them.
 */
interface Probed {
  out: [string, number][];
  refused: [string, string][];
  did: ProbeDid;
}

function install(where: string, spec: string): Probed {
  const dir = path.join(root, where);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'nowhere', private: true, type: 'module' }, null, 2));
  npm(['install', '--no-audit', '--no-fund', spec], dir);
  fs.writeFileSync(path.join(dir, 'probe.mjs'), PROBE);
  return JSON.parse(execFileSync(process.execPath, [path.join(dir, 'probe.mjs')], { cwd: dir, encoding: 'utf8' }).trim());
}

try {
  const tarball = path.join(root, npm(['pack', '--pack-destination', root], PKG).split('\n').pop()!);
  console.log(`${NAME} packs to ${path.basename(tarball)} (${(fs.statSync(tarball).size / 1024).toFixed(0)} kB), ${SUBPATHS.length} subpaths on its exports map.\n`);

  // Unpacked once, so the linked install is exactly what the tarball holds.
  const unpacked = path.join(root, 'unpacked');
  fs.mkdirSync(unpacked, { recursive: true });
  execFileSync('tar', ['xzf', tarball, '-C', unpacked, '--strip-components', '1']);

  for (const [how, spec] of [['copied into node_modules', tarball], ['linked, as a workspace or a git dependency links it', `file:${unpacked}`]]) {
    const said = install(how.split(',')[0].replace(/\s+/g, '-'), spec);
    const total = said.out.reduce((n, [, k]) => n + k, 0);
    console.log(`${how}:`);
    console.log(`  ${said.out.length}/${SUBPATHS.length} subpaths imported, ${total} names in all`);
    for (const [name, code] of said.refused) console.log(`  refused: ${name} — ${code}`);
    if (said.did.error) console.log(`  it could not run: ${said.did.error}`);
    else console.log(`  it resolved a room out of the fixture table (frozen ${said.did.frozen}, sub ${said.did.sub} dB), read ${said.did.voices} voice descriptors and worked out a ${said.did.duck}-point sidechain — with no composer installed`);
    console.log();
    // What has to hold either way: nothing in the tarball reaches for something
    // that is not in it. A missing file reads as ERR_MODULE_NOT_FOUND.
    const missing = said.refused.filter(([, code]) => code === 'ERR_MODULE_NOT_FOUND');
    if (missing.length) { failed++; console.log(`  FAIL ${missing.length} subpaths could not find a module: ${missing.map(([n]) => n).join(', ')}`); }
    if (spec.startsWith('file:') && (said.out.length !== SUBPATHS.length || said.did.error)) {
      failed++;
      console.log('  FAIL a linked install has to resolve every subpath and make a room out of a table');
    }
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log('the machine stands on its own.');
