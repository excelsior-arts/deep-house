// A review session for modulation M1's five ear files.
//
//   node tools/review/session-from-knobs.ts
//   node tools/review/session-from-knobs.ts --ear tmp/ear/knobs --out notes/reviews/knobs.json
//
// `tools/ear.ts --knobs --strategy house-v2` renders the six spells step 3 of
// `notes/archive/2026-09-v2-day-chain/plans/PLAN-DAY-2026-09-19.md` names — the house, and five pulls — as
// sixteen bars of one seed's own main groove **with the cast pinned**: the lane
// draws and the three harmonic timbres are the house's own on every card, so
// what a listener is comparing is the seasoning and not the draw.
//
// That is the whole difference from step 2's session and it is the round's
// point. `notes/reviews/derive.json`'s `tide-high` card was 31782 LSB from the
// house because house-v2's widened lists had replaced an electric piano with a
// marimba; Eugene's label of it was *the track's structure changes a little,
// but the character of the change is not audible*. Here the electric piano is
// still the electric piano and it is holding a hundred and fourteen
// milliseconds longer.
//
// **The six verdicts are the strategy session's six**, derived rather than
// written out, so an answer here is comparable with K5b's, K6's and derive's;
// `rowWrite` is `none`, because a verdict on a knob range is not a verdict on a
// recipe row.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SCHEMA, STRATEGY_ACTIONS, assertSession, migrateState, writeSession } from './session.ts';
import { planTheme } from '../../src/mix.ts';
import { HOUSE, asSpell, biasFor } from '../../src/spell.ts';
import { laneVoices } from '../../src/lanes.ts';
import { themeSeed } from '../../src/set-plan.ts';
import { strategyById } from '../../src/strategies/index.ts';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };

const EAR = arg('ear', 'tmp/ear/knobs');
const OUT = arg('out', 'notes/reviews/knobs.json');
const STRATEGY = arg('strategy', 'house-v2');
const MASTER = arg('seed', '1');
const THEME = +arg('theme', 1);
const BARS = +arg('bars', 16);

/**
 * The five pulls, in the order a listener should hear them: the tails opening,
 * the tails closing, the lids opening, the lids closing, and the one that is
 * two things at once — Ember carries the derived tempo as well as the attack,
 * which is derive-lite's doing and is said on the card rather than hidden.
 */
const PULLS = [
  ['tide-high', { tide: 0.85 }, 'the same instruments, holding longer'],
  ['tide-low', { tide: 0.15 }, 'the same instruments, let go sooner'],
  ['zephyr-high', { zephyr: 0.85 }, 'the same instruments, with the lids open'],
  ['zephyr-low', { zephyr: 0.15 }, 'the same instruments, with the lids down'],
  ['ember-high', { ember: 0.85 }, 'the same instruments, struck faster — and, from derive-lite, at the techno tempo'],
];

/** The six verdicts, with this round's words on the strategy session's own six. */
const SAYS = {
  keep: 'keep — the seasoning is audible and it is music',
  decent: 'decent — the seasoning is audible and it works',
  drop: 'drop — the seasoning is not audible',
  worse: 'worse — audible, and the house was better',
  pass: 'pass — it is music, just not for me',
  later: 'come back to it',
};
const actions = STRATEGY_ACTIONS.map((a) => ({ ...a, label: SAYS[a.id] || a.label }));
if (actions.some((a) => !SAYS[a.id])) throw new Error('the strategy session has a verdict this round has no words for');

const dir = path.join(ROOT, EAR);
if (!fs.existsSync(dir)) {
  console.error(`nothing at ${EAR}; render it first (node tools/ear.ts --knobs --strategy ${STRATEGY} --bars ${BARS})`);
  process.exit(2);
}

/**
 * Which build these files were rendered from, so a decision says so. The commit
 * and not the branch: `.git/HEAD` on a checked-out branch is a symbolic ref and
 * `ref: refs/heads/local` names no build at all.
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

const hashOf = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);

// The cast the ear tool pinned, worked out the same way it works it out, so the
// card says which instruments a listener is comparing rather than implying it.
const style = strategyById(STRATEGY).style;
const housePlan = planTheme(MASTER, THEME, { strategy: STRATEGY });
const PIN = {
  // A lane the theme's scene withdraws is held off in the plan itself, so the
  // voice pinned to it here plays nothing either way.
  lanes: laneVoices(style, themeSeed(MASTER, THEME), biasFor(HOUSE, style)),
  timbres: {
    leadTimbre: housePlan.dice.leadTimbre,
    padTimbre: housePlan.dice.padTimbre,
    stabTimbre: housePlan.dice.stabTimbre,
  },
};
const CAST = [...new Set(housePlan.events.map((e) => e.voice))].sort().join(', ');

// What the tool read back off the samples, where it has been run. The card
// carries the numbers so a verdict is taken beside them and not against a
// memory of them.
const readings = (() => {
  const file = path.join(dir, 'readings.json');
  if (!fs.existsSync(file)) return {};
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Object.fromEntries(rows.map((r) => [r.name, r]));
})();

const houseWav = `${EAR}/house.wav`;
if (!fs.existsSync(path.join(ROOT, houseWav))) { console.error(`no ${houseWav}`); process.exit(2); }
const houseRead = readings.house;

const items = PULLS.map(([name, pull, why]) => {
  const wav = `${EAR}/${name}.wav`;
  const full = path.join(ROOT, wav);
  if (!fs.existsSync(full)) { console.error(`no ${wav}`); process.exit(2); }
  const spell = asSpell({ ...HOUSE, ...pull });
  const t = planTheme(MASTER, THEME, { strategy: STRATEGY, spell, ...PIN });
  const r = readings[name];
  const said = t.knobs
    ? Object.entries(t.knobs).map(([v, row]) => `${v} ${Object.entries(row).map(([k, x]) => `${k} ${(+x).toPrecision(3)}`).join(', ')}`).join(' · ')
    : 'nothing';
  return {
    id: name,
    kind: 'pull',
    title: `${Object.entries(pull).map(([b, v]) => `${b} ${v}`).join(' + ')} — ${why}`,
    subtitle: r && houseRead
      ? `${r.holdMs.toFixed(0)} ms of hold against the house's ${houseRead.holdMs.toFixed(0)} · ${r.centroid} Hz against ${houseRead.centroid} · ${r.attackMs.toFixed(0)} ms of attack against ${houseRead.attackMs.toFixed(0)}`
      : said,
    wav,
    // **The house is the other side of every card**, and this time it is the
    // same instruments on both sides of it.
    source: houseWav,
    meta: {
      seed: MASTER,
      theme: THEME,
      bars: `${BARS} bars of the main groove`,
      strategy: STRATEGY,
      build: BUILD,
      audioHash: hashOf(full),
      spell: Object.entries(pull).map(([b, v]) => `${b} ${v}`).join(', '),
      knobs: said,
      cast: CAST,
      ...(r ? {
        hold: `${r.holdMs.toFixed(0)} ms to -20 dB against the house's ${houseRead.holdMs.toFixed(0)}`,
        trough: `${r.troughDb.toFixed(1)} dB between notes against the house's ${houseRead.troughDb.toFixed(1)}`,
        centroid: `${r.centroid} Hz on the harmonic bus against the house's ${houseRead.centroid}`,
        attack: `${r.attackMs.toFixed(0)} ms to 90 % against the house's ${houseRead.attackMs.toFixed(0)}`,
        against: `${r.diff.max} LSB over ${r.diff.pct.toFixed(2)} % of the samples, ${r.diff.rmsDb.toFixed(1)} dB`,
      } : {}),
      tempo: `${t.bpm} BPM against the house's ${housePlan.bpm}`,
      source: 'the same seed, theme, bar and cast with nothing asked for',
    },
  };
});

const out = path.join(ROOT, OUT);
const before = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
const { state, superseded, lost } = migrateState(before, items);

const session = {
  schema: SCHEMA,
  id: arg('id', 'knobs'),
  title: 'Modulation M1: the same instruments, seasoned',
  kind: 'knobs',
  rowWrite: 'none',
  source: {
    tool: 'packages/deep-house/tools/review/session-from-knobs.ts',
    from: [EAR, 'packages/deep-house/src/spell.ts', 'packages/engine/src/voices/descriptor.ts'],
    at: new Date().toISOString(),
    note: `One card per pull, seed ${MASTER} theme ${THEME}, ${BARS} bars of the main groove under `
      + `${STRATEGY}, **with the cast pinned to the house's own** — ${CAST} — so the only thing `
      + 'between a card and its source is what the birds did to the instruments\' own ranges. '
      + 'The six verdicts are the strategy session\'s own six with this round\'s words on them. '
      + 'Nothing is scored onto a recipe row.',
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
