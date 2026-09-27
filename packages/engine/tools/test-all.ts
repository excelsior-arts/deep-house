// The machine's whole suite, as `npm test -w @deep-house/engine` runs it.
//
//   npm run test:engine                     everything, side by side
//   DEEP_HOUSE_JOBS=1 npm run test:engine   the serial suite, one thing at a time
//   node tools/test-all.ts --jobs 1          the same, from this package
//   npm run test:engine -- --jobs 4         four offline renders at once in each
//                                           of the two browser suites
//   npm run test:engine -- --verbose        every reading, as JSON
//
// Three suites that share nothing: the `node --test` checks (no browser), the
// machine's own suite (`test.ts`) and round K4's effects (`test-effects-2.ts`),
// each in two engines. They run at once, and what each one prints is printed
// whole and in that order once the ones before it have finished, so the log
// reads the way the serial one does (the suites' round of 09-24). Every
// argument but `--jobs 1` is handed to the two browser suites as it is.
//
// The two browser suites each have a pool of offline renders (`lanes.ts`) and
// a few jobs that read a clock — a live deck against the audio clock, the
// milliseconds an effect costs — which must not share the machine with the
// other suite's renders. So both are handed one folder: a suite whose renders
// are done says so there, and the timed jobs wait until both have and then
// run one at a time.
//
// It ends the way the worst of them ended: a failure is 1, a skip with nothing
// failed is 2 (harness.ts `finish`), and all passed is 0.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const passed = process.argv.slice(2);
const at = passed.indexOf('--jobs');
const SERIAL = Number(at >= 0 ? passed[at + 1] : process.env.DEEP_HOUSE_JOBS) === 1;

const CHECKS = ['check-piano', 'check-envelopes', 'check-membranes', 'check-duck', 'check-automation',
  'check-render-cache', 'check-lifecycle', 'check-clock-worker', 'check-stage'].map((n) => path.join(HERE, `${n}.ts`));
const suites: Array<{ name: string; args: string[]; browser: boolean }> = [
  { name: 'the node checks', args: ['--test', ...CHECKS], browser: false },
  { name: 'tools/test.ts', args: [path.join(HERE, 'test.ts'), ...passed], browser: true },
  { name: 'tools/test-effects-2.ts', args: [path.join(HERE, 'test-effects-2.ts'), ...passed], browser: true },
];

const group = SERIAL ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'deep-house-lanes-'));
process.on('exit', () => { if (group) fs.rmSync(group, { recursive: true, force: true }); });

interface Ran { out: string; code: number; ms: number }
const start = (s: typeof suites[number]): Promise<Ran> => new Promise((done) => {
  const began = Date.now();
  const env = { ...process.env };
  if (group && s.browser) {
    env.DEEP_HOUSE_LANES = group;
    env.DEEP_HOUSE_LANES_OF = String(suites.filter((x) => x.browser).length);
  }
  const child = spawn(process.execPath, s.args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  child.on('close', (code) => done({ out, code: code ?? 1, ms: Date.now() - began }));
});

const began = Date.now();
const ran: Ran[] = [];
if (SERIAL) {
  for (const s of suites) {
    const r = await start(s);
    process.stdout.write(r.out);
    ran.push(r);
  }
} else {
  const all = suites.map(start);
  for (const p of all) {
    const r = await p;
    process.stdout.write(r.out);
    ran.push(r);
  }
}

const worst = ran.some((r) => r.code === 1 || (r.code !== 0 && r.code !== 2)) ? 1 : ran.some((r) => r.code === 2) ? 2 : 0;
console.log(`\nthe machine's suites: ${suites.map((s, i) => `${s.name} ${ran[i].code === 0 ? 'passed' : ran[i].code === 2 ? 'skipped' : 'FAILED'} in ${(ran[i].ms / 1000).toFixed(1)} s`).join(', ')}; ${((Date.now() - began) / 1000).toFixed(1)} s in all${SERIAL ? ', one at a time' : ', side by side'}`);
process.exit(worst);
