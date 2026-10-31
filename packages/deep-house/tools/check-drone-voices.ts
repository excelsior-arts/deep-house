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
/** the two still waiting: the rim left `AWAITING` for BOWLS's row (ambient-bowls, 10-27), named by it alone */
const WAITING = ['tanpura', 'chantOm'];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quiet = <T>(fn: () => T): T => {
  const keep = [console.log, console.info, console.warn];
  console.log = console.info = console.warn = () => {};
  try { return fn(); } finally { [console.log, console.info, console.warn] = keep; }
};

test('registered, and waiting: in AWAITING, in no place\'s list, named by no file of the app but the labels and that list (the rim: BOWLS\'s, named by its row)', () => {
  for (const id of NEW) assert.ok(BY_NAME[id], `${id} is not registered`);
  for (const id of WAITING) {
    assert.ok(AWAITING.some((a) => a.id === id), `${id} is not in AWAITING`);
    assert.ok(!BY_PLACE.some((a) => a.id === id), `${id} is admitted by a place`);
  }
  assert.ok(!AWAITING.some((a) => a.id === 'bowlRim') && BY_PLACE.some((a) => a.id === 'bowlRim'), 'the rim is not BOWLS\'s');
  const allowed = new Set([path.join(ROOT, 'src', 'catalogue-v2.ts'), path.join(ROOT, 'src', 'bird-labels.json')]);
  const named: string[] = [];
  const walk = (dir: string): void => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) walk(p);
      else if (/\.(ts|tsx|json|js)$/.test(d.name) && !allowed.has(p)) {
        const text = fs.readFileSync(p, 'utf8');
        for (const id of NEW) if (new RegExp(`\\b${id}\\b`).test(text) && !(id === 'bowlRim' && p === path.join(ROOT, 'recipes', 'ambient', 'conversation.json'))) named.push(`${path.relative(ROOT, p)} names ${id}`);
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  walk(path.join(ROOT, 'recipes'));
  assert.deepEqual(named, []);
});

/** The first 16 hex digits of each whole program (`themeHash`) as `local` 79a9443b planned it; the four inside the bells' box as zones-pilot-2 plans them (the zone, the bowl's level by register) and zones-pilot-3 (the place's trim). Re-pinned in round length-after to `local` fb344631, where round length-2's lengths moved all but house-v1's and nothing else did (his word 10-28: "The length around is great ... so we can merge it now"). The Ambient tile's seed 3 re-pinned to `local` after the September-studies merge, where the piano's bus moved it and nothing else did (his words 10-28: "the ensembles are good for now"; "once piano rounds are back just accept it to unblock the next round"). The three in the bells' box re-pinned in round v24-bugs for the bells' hand the soft woodblock alone (his ear 10-29: "the woodblock is the only matching percussion ... all other claps are distracting"): the hand's strikes alone moved. Four re-pinned to `local` after round chillstep-ends's tail rule and phrase seam (his word 10-30: "Those are actually fine. We can accept them and merge"): the forms' outros and seams alone moved. Two re-pinned to `local` after round break-pulse-rule (his word 10-30: "all breaks changes approved, you got it right!"): a beat-led break's carrier and the pad hole's cut alone moved. Re-pinned after loudness-place (his word 10-30: "loudness round 2 sounds good", "yeah merge it"): every theme's trim, density and the lifted deep groove's kick and clap set-down moved; no note or figure did. */
const LOCAL: Record<string, string> = {
  'seed=1&v=2': '5d86c9339442b623',
  'seed=10&v=2': '20e72b15479b831f',
  'seed=35&v=2': '6a513c1b011245d0',
  'seed=1&v=1': '41a594173310055a',
  'seed=1&v=2&spell=em:0.05,ti:0.65,ze:0.65,ro:0.10,gl:0.80,ve:0.30,sp:0.55,lo:0.90&theme=1': '401d3474e265e505',
  'seed=5&v=2&spell=em:0.05,ti:0.65,ze:0.65,ro:0.10,gl:0.80,ve:0.30,sp:0.55,lo:0.90&theme=1': '1571b72101c30ea7',
  // a library turn at the bells' tile, which the zone plays as the conversation (zones-pilot; check-conversation's TURNED locks it)
  'seed=10&v=2&spell=em:0.05,ti:0.65,ze:0.65,ro:0.10,gl:0.80,ve:0.30,sp:0.55,lo:0.90&theme=2': 'ce9be1842ec160d1',
  'seed=3&v=2&spell=em:0.10,ti:0.85,ze:0.90,ro:0.50,ve:0.30,sp:0.00,lo:0.80': 'c73795ad1370643c', // piano-tone: the new piano
  'seed=6&v=2&spell=em:0.00,ti:0.90,ze:0.25,ro:0.85,ve:0.15,sp:0.10,lo:0.80&theme=1': 'db003cff5f51b938',
  'seed=27191&v=2&spell=em:0.14,gl:0.00,ve:0.34,sp:0.00,lo:0.81&theme=3': '4fa3955f41d4a223',
  'seed=1&v=2&spell=em:0.00,ti:0.00,ze:0.00,ro:0.00,gl:0.00,ve:0.00,sp:0.00,lo:0.00': 'dea569773934f854',
  'seed=1&v=2&spell=em:1.00,ti:1.00,ze:1.00,ro:1.00,gl:1.00,ve:1.00,sp:1.00,lo:1.00': '5656272f312c9fca', // piano-tone: the new piano
  // inside the bells' box (Ember 0, Spark 1, Veil 0): the zone's conversation since zones-pilot
  'seed=1&v=2&spell=em:0.00,ti:0.00,ze:1.00,ro:1.00,gl:0.00,ve:0.00,sp:1.00,lo:1.00': 'fcdb4d49ec9e40e5',
  'seed=1&v=2&spell=em:1.00,ti:1.00,ze:1.00,ro:0.00,gl:1.00,ve:1.00,sp:1.00,lo:0.00': 'd693db62626fbef1', // piano-tone: the new piano
};

test('the links plan what they planned on local, and no event of the three', () => {
  for (const [link, hash] of Object.entries(LOCAL)) {
    const { plan } = quiet(() => played(link));
    const theirs = plan.events.filter((e: { voice: string }) => NEW.includes(e.voice));
    assert.equal(theirs.length, 0, `${link}: ${theirs.length} events of the new voices`);
    assert.equal(themeHash(plan).slice(0, 16), hash, `${link}: its program moved`);
  }
});
