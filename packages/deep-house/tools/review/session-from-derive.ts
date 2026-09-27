// A review session for derive-lite's six ear files.
//
//   node tools/review/session-from-derive.ts
//   node tools/review/session-from-derive.ts --ear tmp/ear/derive --out notes/reviews/derive.json
//
// `tools/ear.ts --derive --strategy house-v2` renders the six spells step 2 of
// `notes/archive/2026-09-v2-day-chain/plans/PLAN-DAY-2026-09-19.md` names — the house, and five pulls — as
// sixteen bars of one seed's own main groove. This lists the five pulls as
// cards with **the house as the source of every one of them**, because the
// question the round is gated on is comparative and nothing else: *is a pull
// audible at all*, against the same seed, the same theme, the same bar and the
// same window with nothing asked for.
//
// **The six verdicts are the strategy session's six**, derived rather than
// written out: `STRATEGY_ACTIONS` by id, with labels that say what this round
// is asking. A round that invented a seventh answer would be a round whose
// verdicts nobody can compare with K5b's or K6's, and the gate below asserts
// that the ids, the keys and the scores are the ones that file states.
//
// `rowWrite` is `none`: a verdict on a derived state is not a verdict on a
// recipe row, exactly as a verdict on a strategy is not.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SCHEMA, STRATEGY_ACTIONS, assertSession, migrateState, writeSession } from './session.ts';
import { planTheme } from '../../src/mix.ts';
import { HOUSE, asSpell, derive } from '../../src/spell.ts';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };

const EAR = arg('ear', 'tmp/ear/derive');
const OUT = arg('out', 'notes/reviews/derive.json');
const STRATEGY = arg('strategy', 'house-v2');
const MASTER = arg('seed', '1');
const THEME = +arg('theme', 1);
const BARS = +arg('bars', 16);

/**
 * The five pulls, in the order a listener should hear them: the grid going
 * away, the grid going faster, the grid breaking, both at once, and then the
 * one that is the round's own *before* — Tide, which step 3 owns and which is
 * here so that the pair is on record before the knobs exist.
 */
const PULLS = [
  ['ember-low', { ember: 0.10 }, 'the grid goes away'],
  ['ember-high', { ember: 0.85 }, 'the grid goes faster, and stays straight'],
  ['spark-high', { spark: 0.80 }, 'the grid breaks, at the house tempo'],
  ['dnb', { ember: 0.90, spark: 0.85 }, 'both at once'],
  ['tide-high', { tide: 0.85 }, 'the before for modulation M1'],
];

/** The six verdicts, with this round's words on the strategy session's own six. */
const SAYS = {
  keep: 'keep — the pull is audible and it is music',
  decent: 'decent — the pull is audible and it works',
  drop: 'drop — the pull is not audible',
  worse: 'worse — audible, and the house was better',
  pass: 'pass — it is music, just not for me',
  later: 'come back to it',
};
const actions = STRATEGY_ACTIONS.map((a) => ({ ...a, label: SAYS[a.id] || a.label }));
if (actions.some((a) => !SAYS[a.id])) throw new Error('the strategy session has a verdict this round has no words for');

const dir = path.join(ROOT, EAR);
if (!fs.existsSync(dir)) {
  console.error(`nothing at ${EAR}; render it first (node tools/ear.ts --derive --strategy ${STRATEGY} --bars ${BARS})`);
  process.exit(2);
}

/**
 * Which build these files were rendered from, so a decision says so. The commit
 * and not the branch: `.git/HEAD` on a checked-out branch is a *symbolic* ref
 * and `ref: refs/heads/local` names no build at all.
 */
const BUILD = (() => {
  try {
    const head = String(fs.readFileSync(path.join(ROOT, '.git', 'HEAD'), 'utf8')).trim();
    const m = /^ref:\s*(.+)$/.exec(head);
    if (!m) return head.slice(0, 12);
    return String(fs.readFileSync(path.join(ROOT, '.git', m[1]), 'utf8')).trim().slice(0, 12);
  } catch (e) {
    return 'unknown';
  }
})();

/** The bytes of a file, so a decision says which audio it was about. */
const hashOf = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);

const houseWav = `${EAR}/house.wav`;
const housePlan = planTheme(MASTER, THEME, { strategy: STRATEGY });
if (!fs.existsSync(path.join(ROOT, houseWav))) { console.error(`no ${houseWav}`); process.exit(2); }

const items = PULLS.map(([name, pull, why]) => {
  const wav = `${EAR}/${name}.wav`;
  const full = path.join(ROOT, wav);
  if (!fs.existsSync(full)) { console.error(`no ${wav}`); process.exit(2); }
  const spell = asSpell({ ...HOUSE, ...pull });
  const d = derive(spell);
  const t = planTheme(MASTER, THEME, { strategy: STRATEGY, spell });
  return {
    id: name,
    kind: 'pull',
    title: `${Object.entries(pull).map(([b, v]) => `${b} ${v}`).join(' + ')} — ${why}`,
    subtitle: `${d.tempoFamily} ${d.tempoRange[0]}-${d.tempoRange[1]} · ${d.kit} · drums ${d.drumsOn ? 'on' : 'off'} · ${t.bpm} BPM`,
    wav,
    // **The house is the other side of every card.** Nothing about a pull is
    // judgeable on its own: the question is what changed.
    source: houseWav,
    meta: {
      seed: MASTER,
      theme: THEME,
      bars: `${BARS} bars of the main groove`,
      strategy: STRATEGY,
      build: BUILD,
      audioHash: hashOf(full),
      spell: Object.entries(pull).map(([b, v]) => `${b} ${v}`).join(', '),
      pulse: +d.pulse.toFixed(3),
      derives: `${d.tempoFamily} / ${d.kit} / drums ${d.drumsOn ? 'on' : 'off'}`,
      tempo: `${t.bpm} BPM against the house's ${housePlan.bpm}`,
      ...(t.dice.breakMask ? { break: t.dice.breakMask } : {}),
      events: `${t.events.length} against the house's ${housePlan.events.length}`,
      source: 'the same seed, theme and bar with nothing asked for',
    },
  };
});

const out = path.join(ROOT, OUT);
const before = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
const { state, superseded, lost } = migrateState(before, items);

const session = {
  schema: SCHEMA,
  id: arg('id', 'derive'),
  title: 'Derive-lite: can you hear the pull?',
  kind: 'derive',
  rowWrite: 'none',
  source: {
    tool: 'packages/deep-house/tools/review/session-from-derive.ts',
    from: [EAR, 'packages/deep-house/src/spell.ts', 'notes/diagrams/landscape.md'],
    at: new Date().toISOString(),
    note: `One card per pull, seed ${MASTER} theme ${THEME}, ${BARS} bars of the main groove under `
      + `${STRATEGY}; the source button on every card is the same window with nothing asked for. `
      + 'The six verdicts are the strategy session\'s own six with this round\'s words on them, so '
      + 'an answer here is comparable with K5b\'s and K6\'s. Nothing is scored onto a recipe row.',
  },
  items,
  actions,
  state,
  ...(superseded && Object.keys(superseded).length ? { superseded } : {}),
};

assertSession(session, OUT);
writeSession(out, session);
console.log(`${OUT} — ${items.length} cards, each against ${houseWav}, ${Object.keys(state).length} already answered`);
if (lost && lost.length) console.log(`  ! ${lost.length} answers are about files that are gone: ${lost.join(', ')}`);
console.log(`  npm run review -- ${OUT}`);
