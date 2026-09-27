// A review session for step 5b: the three fixes of the morning of 2026-09-20,
// on the five cards Eugene named them on.
//
//   node tools/review/session-from-morning.ts
//   node tools/review/session-from-morning.ts --ear tmp/ear/morning --out notes/reviews/morning.json
//
// He listened to `reviews/music.json`, `reviews/derive.json` and
// `reviews/knobs.json` in one morning and three notes came out of them that are
// about the music and not about the machine: the woodblock reads as a clip bug
// (three sessions), the authored breaks are too busy to be music (two cards,
// both *worse*), and a faster kit wants a lighter bass (one card). Step 5b is
// those three, and this is the session that asks whether they answered him.
//
// **Two kinds of card and two kinds of source button, on purpose.** The two
// seeds are the music review's own — master 1, the card the woodblock was named
// on, and master 92970, the card whose hats he praised — and their source is
// **house-v1**, the same A/B the music session asked, because the question
// there is still *is this still the record*. The three pulls are derive-lite's
// own, and their source is **the file he gave the verdict on**, because the
// question there is *did the fix answer the note you wrote*.
//
// One thing about those three sources has to be said and is said on every card:
// they were rendered at 21:49 on 09-19, and **modulation M1 landed at 23:28**.
// So the seasoning is in the after and not in the before, and a difference on
// those three cards is step 5b *and* M1 together. The cards that isolate step
// 5b are the numbers, in `notes/archive/2026-09-v2-day-chain/rounds/morning-fixes.md`.
//
// **The six verdicts are the strategy session's six**, derived rather than
// written out, so an answer here is comparable with the three sessions it
// answers. `rowWrite` is `none`: a verdict on a fix is not a verdict on a
// recipe row.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SCHEMA, STRATEGY_ACTIONS, assertSession, migrateState, writeSession } from './session.ts';
import { planTheme } from '../../src/mix.ts';
import { loudnessWindow } from '../../src/loudness.ts';
import { HOUSE, asSpell, derive } from '../../src/spell.ts';
import { BY_NAME } from '@deep-house/engine/voices';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };

const EAR = arg('ear', 'tmp/ear/morning');
const OUT = arg('out', 'notes/reviews/morning.json');
const STRATEGY = arg('strategy', 'house-v2');
const BARS = +arg('bars', 16);

/** The six verdicts, with this round's words on the strategy session's own six. */
const SAYS = {
  keep: 'keep — the fix answered it',
  decent: 'decent — better, and it works',
  drop: 'drop — this is not the record',
  worse: 'worse — what I heard before was better',
  pass: 'pass — it is music, just not for me',
  later: 'come back to it',
};
const actions = STRATEGY_ACTIONS.map((a) => ({ ...a, label: SAYS[a.id] || a.label }));
if (actions.some((a) => !SAYS[a.id])) throw new Error('the strategy session has a verdict this round has no words for');

const dir = path.join(ROOT, EAR);
if (!fs.existsSync(dir)) {
  console.error(`nothing at ${EAR}; render it first`);
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

/** The sixteenth lane's voices, so a card can say whether a woodblock is left. */
const SIXTEENTH = new Set(Object.keys(BY_NAME).filter((v) => (BY_NAME[v].roles || []).includes('sixteenth')));
const laneVoice = (t, from, bars) => {
  const seen = new Set(t.events.filter((e) => e.bar >= from && e.bar < from + bars && SIXTEENTH.has(e.voice)).map((e) => e.voice));
  return [...seen].sort().join(', ') || 'silent';
};

/** The two seeds of the music review, against house-v1. */
const SEEDS = [
  ['1', 1, 'the card the woodblock was named on: "a faint repetitive click like knocking an empty plastic box"', 'decent 0 in music.json'],
  ['92970', 1, 'the card whose hats he kept at +2: "great hi-hats work!" — its sixteenth lane drew the shaker and not the woodblock, so its plan did not move at all and this is the control', 'keep +2 in music.json'],
];

/** The three pulls of derive-lite, against the render he answered. */
const PULLS = [
  ['ember-high', { ember: 0.85 }, 'the faster kit, with the lighter bass under it',
    'keep +2 in derive.json ("finally I can hear speed variety! still some annoying click sound") and decent 0 in knobs.json ("when the drums speed up the bass should get lighter, otherwise it gets muddier")'],
  ['spark-high', { spark: 0.80 }, 'the break at the house tempo, thinned',
    'worse -1 in derive.json ("I definitely hear the structure change, but as a music piece this is too complex and hardly listenable")'],
  ['dnb', { ember: 0.90, spark: 0.85 }, 'the break at drum and bass tempo, thinned',
    'worse -1 in derive.json ("same, just faster; I hear the change, but no musical value in this particular clip")'],
];

const items = [];

for (const [seed, theme, why, was] of SEEDS) {
  const t = planTheme(seed, theme, { strategy: STRATEGY });
  const w = loudnessWindow(t, BARS);
  const bars = Math.min(BARS, w.bars);
  const wav = `${EAR}/seed${seed}-after.wav`;
  const source = `${EAR}/seed${seed}-v1.wav`;
  need(wav); need(source);
  items.push({
    id: `seed${seed}`,
    kind: 'strategy',
    title: `master ${seed}, theme ${theme} — the main groove, ${bars} bars`,
    subtitle: `house-v2 after the morning fixes against house-v1, the same seed, theme and window: ${t.preset} ${t.density}, ${t.key.name}, ${t.bpm} BPM`,
    wav,
    source,
    meta: {
      seed, theme,
      bars: `${w.from}+${bars}`,
      strategy: STRATEGY,
      build: BUILD,
      audioHash: hashOf(path.join(ROOT, wav)),
      'A/B': 'the source button is house-v1, the same seed, theme and window',
      why,
      'you said': was,
      'the sixteenth lane plays': laneVoice(t, w.from, bars),
      'a woodblock left in the plan': t.events.some((e) => e.voice === 'woodblock') ? 'yes' : 'no',
      'what changed here': 'the woodblock is reserved with the metal, so a lane that drew it draws the next candidate instead',
    },
  });
}

const housePlan = planTheme('1', 1, { strategy: STRATEGY });
for (const [name, pull, why, was] of PULLS) {
  const spell = asSpell({ ...HOUSE, ...pull });
  const d = derive(spell);
  const t = planTheme('1', 1, { strategy: STRATEGY, spell });
  const w = loudnessWindow(t, BARS);
  const wav = `${EAR}/${name}-after.wav`;
  const source = `${EAR}/${name}-before.wav`;
  need(wav); need(source);
  const knobs = (t.knobs || {}).sub || {};
  items.push({
    id: name,
    kind: 'pull',
    title: `${Object.entries(pull).map(([b, v]) => `${b} ${v}`).join(' + ')} — ${why}`,
    subtitle: `${d.tempoFamily} ${d.tempoRange[0]}-${d.tempoRange[1]} · ${d.kit} · ${t.bpm} BPM`,
    wav,
    source,
    meta: {
      seed: '1', theme: 1,
      bars: `${w.from}+${Math.min(BARS, w.bars)}`,
      strategy: STRATEGY,
      build: BUILD,
      audioHash: hashOf(path.join(ROOT, wav)),
      spell: Object.entries(pull).map(([b, v]) => `${b} ${v}`).join(', '),
      derives: `${d.tempoFamily} / ${d.kit} / drums ${d.drumsOn ? 'on' : 'off'}`,
      tempo: `${t.bpm} BPM against the house's ${housePlan.bpm}`,
      'A/B': 'the source button is the render you answered on 09-19 at 21:49 — and modulation M1 landed at 23:28, so the seasoning is in this one and not in that one',
      'you said': was,
      ...(t.dice.breakMask ? { break: `${t.dice.breakMask}, thinned this morning` } : {}),
      'the sixteenth lane plays': laneVoice(t, w.from, Math.min(BARS, w.bars)),
      ...(Number.isFinite(knobs.hold) ? { 'the bass holds': `${knobs.hold.toFixed(3)} of its note against the house's 0.600` } : {}),
      events: `${t.events.length} against the house's ${housePlan.events.length}`,
    },
  });
}

const out = path.join(ROOT, OUT);
const before = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
const { state, superseded, lost } = migrateState(before, items);

const session = {
  schema: SCHEMA,
  id: arg('id', 'morning'),
  title: 'The morning fixes: did they answer you?',
  kind: 'morning',
  rowWrite: 'none',
  source: {
    tool: 'packages/deep-house/tools/review/session-from-morning.ts',
    from: [EAR, 'packages/deep-house/src/catalogue-v2.ts', 'packages/deep-house/src/spell.ts', 'notes/archive/2026-09-v2-day-chain/rounds/morning-fixes.md'],
    at: new Date().toISOString(),
    note: 'Step 5b of PLAN-DAY-2026-09-19, and the three notes of your morning. The woodblock is reserved with the metal, '
      + 'on a measurement of where its energy is rather than of how loud it is; the authored breaks are thinned so a break is '
      + 'no busier than the four on the floor it replaces and the bass has room in it; and a faster tempo family leans the bass '
      + 'lane\'s hold down, which is the first thing the derived state asks of a knob. The two seeds are against house-v1, the way '
      + 'the music session asked; the three pulls are against the render you answered, which was made before modulation M1 landed. '
      + 'Nothing here is scored onto a recipe row.',
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
