// The three drone voices the engine registered for the shavasana and Om places (ambient-voices, 10-18: `bowlRim`,
// `tanpura`, `chantOm`) are heard nowhere yet, in node: they wait in `AWAITING`, so no list the registry widens draws
// them; no row, recipe, place or planner of the app names them (the labels' table and that list aside); and the
// programs a sample of links planned on `local` 79a9443b — house themes in both engines, BELLS, the Ambient tile, the
// two goldens and the birds dragged to their ends — are the programs they plan now, with no event of theirs in them.
// Their sound is the engine's own check (`packages/engine/tools/check-drone-voices.ts`); the link rows and 27191 are
// the link digest's (`tools/bless.ts`).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AWAITING, BY_PLACE } from '../src/catalogue-v2.ts';
import { BY_NAME } from '@deep-house/engine/voices';
import { played, themeHash } from './link-digest.ts';

const NEW = ['bowlRim', 'tanpura', 'chantOm'];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quiet = <T>(fn: () => T): T => {
  const keep = [console.log, console.info, console.warn];
  console.log = console.info = console.warn = () => {};
  try { return fn(); } finally { [console.log, console.info, console.warn] = keep; }
};

test('registered, and waiting: in AWAITING, in no place\'s list, named by no file of the app but the labels and that list', () => {
  for (const id of NEW) {
    assert.ok(BY_NAME[id], `${id} is not registered`);
    assert.ok(AWAITING.some((a) => a.id === id), `${id} is not in AWAITING`);
    assert.ok(!BY_PLACE.some((a) => a.id === id), `${id} is admitted by a place`);
  }
  const allowed = new Set([path.join(ROOT, 'src', 'catalogue-v2.ts'), path.join(ROOT, 'src', 'bird-labels.json')]);
  const named: string[] = [];
  const walk = (dir: string): void => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) walk(p);
      else if (/\.(ts|tsx|json|js)$/.test(d.name) && !allowed.has(p)) {
        const text = fs.readFileSync(p, 'utf8');
        for (const id of NEW) if (new RegExp(`\\b${id}\\b`).test(text)) named.push(`${path.relative(ROOT, p)} names ${id}`);
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  walk(path.join(ROOT, 'recipes'));
  assert.deepEqual(named, []);
});

/** The first 16 hex digits of each whole program (`themeHash`) as `local` 79a9443b planned it; the four inside the bells' box as zones-pilot-2 plans them (the zone, the bowl's level by register) and zones-pilot-3 (the place's trim). */
const LOCAL: Record<string, string> = {
  'seed=1&v=2': 'f342c15084719666',
  'seed=10&v=2': 'fabbe2fe1e2f381d',
  'seed=35&v=2': 'a10692c32fa5d638',
  'seed=1&v=1': '41a594173310055a',
  'seed=1&v=2&spell=em:0.05,ti:0.65,ze:0.65,ro:0.10,gl:0.80,ve:0.30,sp:0.55,lo:0.90&theme=1': '9683b597a7dc7378',
  'seed=5&v=2&spell=em:0.05,ti:0.65,ze:0.65,ro:0.10,gl:0.80,ve:0.30,sp:0.55,lo:0.90&theme=1': '881a3f56dc04c9c1',
  // a library turn at the bells' tile, which the zone plays as the conversation (zones-pilot; check-conversation's TURNED locks it)
  'seed=10&v=2&spell=em:0.05,ti:0.65,ze:0.65,ro:0.10,gl:0.80,ve:0.30,sp:0.55,lo:0.90&theme=2': '12f9024ceed6b520',
  'seed=3&v=2&spell=em:0.10,ti:0.85,ze:0.90,ro:0.50,ve:0.30,sp:0.00,lo:0.80': 'f6af92c14db90357',
  'seed=6&v=2&spell=em:0.00,ti:0.90,ze:0.25,ro:0.85,ve:0.15,sp:0.10,lo:0.80&theme=1': 'ac2d3751bae2c637',
  'seed=27191&v=2&spell=em:0.14,gl:0.00,ve:0.34,sp:0.00,lo:0.81&theme=3': '6f51774f9a732397',
  'seed=1&v=2&spell=em:0.00,ti:0.00,ze:0.00,ro:0.00,gl:0.00,ve:0.00,sp:0.00,lo:0.00': '0b1687353f9a9d68',
  'seed=1&v=2&spell=em:1.00,ti:1.00,ze:1.00,ro:1.00,gl:1.00,ve:1.00,sp:1.00,lo:1.00': '41a0793a1864235a',
  // inside the bells' box (Ember 0, Spark 1, Veil 0): the zone's conversation since zones-pilot
  'seed=1&v=2&spell=em:0.00,ti:0.00,ze:1.00,ro:1.00,gl:0.00,ve:0.00,sp:1.00,lo:1.00': '03e7ac4a5fd125f8',
  'seed=1&v=2&spell=em:1.00,ti:1.00,ze:1.00,ro:0.00,gl:1.00,ve:1.00,sp:1.00,lo:0.00': 'eaacb5bc64904d6b',
};

test('the links plan what they planned on local, and no event of the three', () => {
  for (const [link, hash] of Object.entries(LOCAL)) {
    const { plan } = quiet(() => played(link));
    const theirs = plan.events.filter((e: { voice: string }) => NEW.includes(e.voice));
    assert.equal(theirs.length, 0, `${link}: ${theirs.length} events of the new voices`);
    assert.equal(themeHash(plan).slice(0, 16), hash, `${link}: its program moved`);
  }
});
