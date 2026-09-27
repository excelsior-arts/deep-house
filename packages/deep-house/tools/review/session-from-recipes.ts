// A review session for step 6: the theme, the wants, and the lead's entry.
//
//   node tools/review/session-from-recipes.ts
//   node tools/review/session-from-recipes.ts --ear tmp/ear/recipes --out notes/reviews/recipes.json
//
// Three questions, and they are three different kinds of claim, so the cards
// are in three groups and each group's **source button is a different thing**.
//
//   **the lead's entry** (`notes/archive/2026-09-plans/cited/PLAN-DEVELOP.md` §1) — the source is the same seed, the
//   same theme and the same sixteen bars rendered against a build of this tree
//   with the rule switched off. Nothing else differs between the two files, so
//   what is heard is the rule. The window is **the first sixteen bars the rule
//   moves**, because a theme's loudest sixteen are by construction a groove
//   with the figure already in them.
//   **the theme** (`PLAN-MOTIF` T1) — the source is the same track with **no
//   theme at all**, so what is heard is the melody family and not the seed. One
//   card per authored family.
//   **the wants** (`PLAN-RECIPES`, the interpreter) — the source is the same row
//   rolled to **the same spell** with its `wants` and `forbids` taken off. The
//   box was already read before this round and the wants were not, so the pair
//   is the only thing that isolates what the interpreter does.
//
// The six verdicts are the strategy session's six, derived rather than written
// out, so an answer here is comparable with every session since. `rowWrite` is
// `score+verdict`: a verdict on a melody family is a verdict on a **row**, and
// it lands on `recipes/motif-*.json` the way every other chef's score does.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SCHEMA, STRATEGY_ACTIONS, assertSession, migrateState, writeSession } from './session.ts';
import { planTheme } from '../../src/mix.ts';
import { strategyById } from '../../src/strategies/index.ts';
import { HOUSE_FAMILIES, readMotif } from '../../src/motif.ts';
import { recipeById } from '../../src/recipes.ts';
import { spellFrom } from '../../src/recipe.ts';
import { interpretWants, sayWanted } from '../../src/interpret.ts';
import { biasFor, HOUSE } from '../../src/spell.ts';
import Rng from '../../src/rng.ts';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };

const EAR = arg('ear', 'tmp/ear/recipes');
const OUT = arg('out', 'notes/reviews/recipes.json');
const STRATEGY = arg('strategy', 'house-v2');
const BARS = +arg('bars', 16);
const MASTER = arg('seed', '1');
const THEME = +arg('theme', 1);

/** This round's words on the strategy session's own six. */
const SAYS = {
  keep: 'keep — this is better music',
  decent: 'decent — different, and it works',
  drop: 'drop — this is not the record',
  worse: 'worse — the source was better',
  pass: 'pass — it is music, just not for me',
  later: 'come back to it',
};
const actions = STRATEGY_ACTIONS.map((a) => ({ ...a, label: SAYS[a.id] || a.label }));
if (actions.some((a) => !SAYS[a.id])) throw new Error('the strategy session has a verdict this round has no words for');

const dir = path.join(ROOT, EAR);
if (!fs.existsSync(dir)) {
  console.error(`nothing at ${EAR}; render it first: node tools/ear.ts --recipes --strategy house-v2 --bars 16`);
  process.exit(2);
}

/** Which build these files were rendered from, so a decision says so. */
const BUILD = (() => {
  try {
    const head = String(fs.readFileSync(path.join(ROOT, '.git', 'HEAD'), 'utf8')).trim();
    const m = /^ref:\s*(.+)$/.exec(head);
    if (!m) return head.slice(0, 12);
    return String(fs.readFileSync(path.join(ROOT, '.git', m[1]), 'utf8')).trim().slice(0, 12);
  } catch {
    return 'unknown';
  }
})();

const hashOf = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);
const need = (rel) => {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) { console.error(`no ${rel}`); process.exit(2); }
  return full;
};
/** The readings the render tool wrote, by file, so a card carries the number. */
const readings = (() => {
  const out = {};
  for (const when of ['before', 'after']) {
    const file = path.join(dir, `readings-${when}.json`);
    if (!fs.existsSync(file)) continue;
    for (const row of JSON.parse(fs.readFileSync(file, 'utf8'))) out[row.name] = row;
  }
  return out;
})();
const mids = (name) => (readings[name] ? `${readings[name].wide} dB at 300 Hz–2 kHz, ${readings[name].narrow} at 500 Hz–2 kHz` : 'not read');

/** `an arch`, `a wave`: the one word in front of a contour that has to agree. */
const article = (word) => `${/^[aeiou]/.test(word) ? 'an' : 'a'} ${word}`;

const style = strategyById(STRATEGY).style;
const off = { ...style, switches: { ...(style.switches || {}), leadEntry: false } };
const items = [];

// --- the lead's entry --------------------------------------------------------
const ENTRY = [
  ['1', 3, 'the record\'s own seed: sixteen bars of a groove that had nothing over the pad'],
  ['25417', 4, '`PLAN-DEVELOP` §1\'s own seed — *"in 25417 theme 2 there is no lead to put there for forty bars"* — and theme 4 is where that is true under house-v2\'s dice'],
];
for (const [seed, theme, why] of ENTRY) {
  const before = planTheme(seed, theme, { style: off, strategy: STRATEGY });
  const after = planTheme(seed, theme, { strategy: STRATEGY });
  const wav = `${EAR}/seed${seed}-after.wav`;
  const source = `${EAR}/seed${seed}-before.wav`;
  need(wav); need(source);
  const row = readings[`seed${seed}-after`];
  const was = readings[`seed${seed}-before`];
  items.push({
    id: `entry-${seed}`,
    kind: 'lead entry',
    title: `master ${seed}, theme ${theme} — the lead enters`,
    subtitle: `${after.preset} ${after.density}, ${after.key.name}, ${after.bpm} BPM; ${BARS} bars from the first bar the rule moves`,
    wav,
    source,
    meta: {
      seed, theme,
      bars: `${BARS} bars`,
      strategy: STRATEGY,
      build: BUILD,
      audioHash: hashOf(path.join(ROOT, wav)),
      'A/B': 'the source button is the same seed, theme and bars rendered against a build of this tree with the rule switched off, and nothing else differs between the two files',
      why,
      'the rule': 'a section that has been pad-alone for sixteen bars — counted from the figure\'s own last bar, not from a section boundary — opens the figure role for the rest of itself. The pad keeps playing.',
      'the figure plays': `${was && was.keysBars ? was.keysBars : '0 of 16'} bars before, ${row && row.keysBars ? row.keysBars : '?'} after`,
      'the mids': `${was ? was.wide : '?'} → ${row ? row.wide : '?'} dB at 300 Hz–2 kHz (the band the music review measured at −18.8 on seed 1)`,
      'the plan': `${before.events.length} events before, ${after.events.length} after`,
      'over 200 themes': 'a pad-alone run past the floor in a groove or a drop falls from 74 themes, the longest 108 bars, to 0, the longest 16',
      ...(after.dice.motif ? { 'and it has a theme': `${after.dice.motif} in the ${after.dice.motifRegister}, so what enters is the theme` } : {}),
    },
  });
}

// --- the theme ---------------------------------------------------------------
for (const f of HOUSE_FAMILIES) {
  const short = f.id.split('/').pop();
  const wav = `${EAR}/motif-${short}.wav`;
  const source = `${EAR}/motif-none.wav`;
  need(wav); need(source);
  const t = planTheme(MASTER, THEME, { strategy: STRATEGY, motif: { family: f.id } });
  const none = planTheme(MASTER, THEME, { strategy: STRATEGY, motif: { off: true } });
  const shape = readMotif({ degrees: String(t.dice.motifDegrees).split(' ').map(Number), cell: String(t.dice.motifCell).split(' ').map(Number), register: t.dice.motifRegister, accent: [] });
  items.push({
    id: `motif-${short}`,
    kind: 'theme',
    title: `${f.name} — a theme in the ${f.register}`,
    subtitle: `master ${MASTER} theme ${THEME}, the same ${BARS} bars: ${t.preset} ${t.density}, ${t.key.name}, ${t.bpm} BPM`,
    wav,
    source,
    // A verdict on a melody family is a verdict on a **row of the library**,
    // and a row is a file: the chef's score and his words land on it the way
    // they land on every other row he has ever scored.
    row: `packages/deep-house/recipes/motif-${short}.json`,
    meta: {
      seed: MASTER, theme: THEME,
      bars: `${BARS} bars`,
      strategy: STRATEGY,
      build: BUILD,
      audioHash: hashOf(path.join(ROOT, wav)),
      'A/B': 'the source button is the same seed, the same theme and the same bars with no theme at all, so what is different is the melody family and not the track',
      'the family': f.note,
      'the box': `${article(f.box.contour)}, ${f.box.density[0]}–${f.box.density[1]} notes a bar, ${f.box.range.semitones[0]}–${f.box.range.semitones[1]} semitones across, a cell of ${f.box.cell.beats[0]}–${f.box.cell.beats[1]} beats, back every ${f.box.returns.bars[0]}–${f.box.returns.bars[1]} bars`,
      'the theme it rolled': `degrees ${t.dice.motifDegrees} over ${t.dice.motifCell} sixteenths — ${article(shape.contour)}, ${(+shape.density).toFixed(1)} notes a bar, ${shape.semitones} semitones across — back every ${t.dice.motifReturns} bars`,
      'where it goes': 'stated in the groove, fragmented in the build, whole in the drop, absent in the breakdown so the return is an event, echoed in the outro',
      'the mids': `${mids(`motif-${short}`)} against the same track with no theme at ${mids('motif-none')}`,
      'the plan': `${t.events.length} events against ${none.events.length} with no theme`,
    },
  });
}

// --- the wants ---------------------------------------------------------------
for (const id of ['house/growl-room', 'house/sub-room']) {
  const row = recipeById(id);
  const short = id.split('/').pop();
  const wav = `${EAR}/wants-${short}-on.wav`;
  const source = `${EAR}/wants-${short}-box.wav`;
  need(wav); need(source);
  const spell = spellFrom(row, new Rng(`${MASTER}::spell`));
  const on = planTheme(MASTER, THEME, { strategy: STRATEGY, spell, recipe: row });
  const box = planTheme(MASTER, THEME, { strategy: STRATEGY, spell, recipe: { ...row, wants: {}, forbids: [] } });
  const said = interpretWants(row, style, biasFor(spell, style));
  const cast = (t) => [...new Set(t.events.map((e) => e.voice))].sort().join(', ');
  items.push({
    id: `wants-${short}`,
    kind: 'wants',
    title: `${row.name} — the row's wants, interpreted`,
    subtitle: `master ${MASTER} theme ${THEME}, the same ${BARS} bars and the same spell: ${on.preset} ${on.density}, ${on.key.name}, ${on.bpm} BPM`,
    wav,
    source,
    row: `packages/deep-house/recipes/${short}.json`,
    meta: {
      seed: MASTER, theme: THEME,
      bars: `${BARS} bars`,
      strategy: STRATEGY,
      build: BUILD,
      audioHash: hashOf(path.join(ROOT, wav)),
      'A/B': 'the source button is the same row rolled to the same eight numbers with its wants and forbids taken off, so what is different is the interpreter and not the box',
      'the spell both are rolled at': Object.entries(spell).map(([k, v]) => `${k} ${(+v).toFixed(3)}`).join(', '),
      'what the row asked for': sayWanted(said),
      'the cast it drew': cast(on),
      'the cast the box alone drew': cast(box),
      'the mids': `${mids(`wants-${short}-on`)} against the box alone at ${mids(`wants-${short}-box`)}`,
      'the plan': `${on.events.length} events against the box alone's ${box.events.length}`,
      'the row was captured under': `interpreter ${row.interpreter || 'v1'}, and is resolved by v2 — which PLAN-RECIPES says is allowed and logged, and this is the log`,
    },
  });
}

const out = path.join(ROOT, OUT);
const before = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
const { state, superseded, lost } = migrateState(before, items);

const session = {
  schema: SCHEMA,
  id: arg('id', 'recipes'),
  title: 'The theme, the wants, and the lead\'s entry',
  kind: 'recipes',
  rowWrite: 'score+verdict',
  source: {
    tool: 'packages/deep-house/tools/review/session-from-recipes.ts',
    from: [EAR, 'packages/deep-house/src/motif.ts', 'packages/deep-house/src/interpret.ts', 'notes/archive/2026-09-v2-day-chain/rounds/recipes-product.md'],
    at: new Date().toISOString(),
    note: 'Step 6 of PLAN-DAY-2026-09-19. Three questions and three kinds of source button: the two lead-entry cards are '
      + 'against a build of this tree with that rule switched off; the three theme cards are against the same track with no '
      + 'theme at all; the two wants cards are against the same row rolled to the same spell with its wants taken off. '
      + 'A verdict on a theme card or a wants card lands on that row of the library as the chef\'s score and your words, '
      + 'which are the two fields no tool ever derives.',
  },
  items,
  actions,
  state,
  ...(superseded && Object.keys(superseded).length ? { superseded } : {}),
};

assertSession(session, OUT);
writeSession(out, session);
console.log(`${OUT} — ${items.length} cards, ${Object.keys(state).length} already answered`);
if (lost && lost.length) console.log(`  ! ${lost.length} answers are about files that are gone: ${lost.join(', ')}`);
console.log(`  npm run review -- ${OUT}`);
