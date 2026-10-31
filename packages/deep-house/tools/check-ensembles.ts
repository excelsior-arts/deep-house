// The ensembles' salt, held (10-28, `src/ensemble.ts`, `tools/ensemble-salt.ts`): every relation an ensemble row states
// sits in its range on forty seeds, at the study's own birds with Ember at three places (other keys, other tempi,
// other voices), each theme inside the ensemble's tempo window, at reach 0, a half and 1 (the roles' tolerances widened,
// the relations as written). A relation out of its range fails here, loudly, with the seed: nothing re-rolls it at play time.
import assert from 'node:assert/strict';
import test from 'node:test';
import { ENSEMBLE_LIBRARY } from '../src/recipes.ts';
import { parseSpell } from '../src/spell.ts';
import { ensembleAt } from './ensemble-salt.ts';
import { validate, vocabularyOf } from '../src/recipe.ts';
import { strategyById } from '../src/strategies/index.ts';
import * as registry from '@deep-house/engine/voices';

// where each study sits (its approved spell); Ember's three pulls move the tempo inside the ensemble's window
const AT: Record<string, string> = {
  'ensembles/the-conversation': 'ti:0.6,ze:0.53,ro:0.76,gl:0.4,ve:0.58,sp:0.38,lo:0.578',
  'ensembles/body-and-distance': 'ti:0.558,ze:0.7,ro:0.3,gl:0.7,ve:0.7,sp:0.16,lo:0.3',
};
const EMBERS = [0.36, 0.42, 0.48];

test('every ensemble row is valid and names its study\'s place', () => {
  const vocab = vocabularyOf(strategyById('house-v2').style, registry);
  assert.ok(ENSEMBLE_LIBRARY.length >= 2);
  for (const r of ENSEMBLE_LIBRARY) {
    assert.deepEqual(validate(r, vocab), [], r.id);
    assert.ok(AT[r.id], `${r.id}: the check needs its study's place`);
  }
});

// and at the draw's reach (the machine view's slider, `reachOf`): the ingredients widen with it, the salt never does
const REACHES = [0, 0.5, 1];

for (const row of ENSEMBLE_LIBRARY) for (const reach of REACHES) test(`${row.id}: its salt holds on forty seeds at reach ${reach}`, () => {
  const out: string[] = [], keys = new Set<string>(), tempi = new Set<number>(), voices = new Set<string>();
  for (let seed = 1; seed <= 40; seed++) {
    const spell = parseSpell(`em:${EMBERS[seed % 3]},${AT[row.id]}`) as Record<string, number>;
    const { t, salt } = ensembleAt(row, String(seed), spell, reach);
    // its tempo window is where it is placed (a later step); a theme outside it is not a case the salt promises
    if (t.bpm < row.ensemble.tempo[0] || t.bpm > row.ensemble.tempo[1]) continue;
    keys.add(t.key.name); tempi.add(Math.round(t.bpm));
    for (const e of t.events) if (e.ensemble) voices.add(`${e.ensemble}:${e.voice}`);
    for (const s of salt) if (!s.ok) out.push(`seed ${seed} (${t.key.name}, ${t.bpm} BPM): ${s.relation.says} = ${s.value}, outside ${s.relation.range.join('-')}`);
  }
  assert.deepEqual(out, [], 'the salt left its range');
  // and it varied: keys, tempi and voices
  assert.ok(keys.size >= 6 && tempi.size >= 6, `${keys.size} keys, ${tempi.size} tempi`);
  // a role draws more than one voice over the seeds (the swaps the source voices allow)
  const roles = new Map<string, Set<string>>(); for (const v of voices) { const [r, x] = v.split(':'); roles.set(r, (roles.get(r) ?? new Set()).add(x)); }
  assert.ok([...roles.values()].some((s) => s.size > 1), `no role swapped its voice: ${[...voices].join(' ')}`);
});
