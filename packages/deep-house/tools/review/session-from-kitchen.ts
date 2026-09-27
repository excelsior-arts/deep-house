// A review session from the kitchen's auditions.
//
//   node tools/review/session-from-kitchen.ts
//   node tools/review/session-from-kitchen.ts --out notes/reviews/kitchen.json
//
// `packages/engine/tools/ear.ts`, `ear-voices.ts` and `ear-drums.ts` render
// the kitchen to `tmp/ear/kitchen/` — one effect dry and then wet, one voice
// over the chords, one drum alone and then in a groove, and the two together
// files. This lists whatever is there as a review session.
//
// **What is useful to say about an audition is not a tuning.** Eugene asked
// what feedback helps, and the answer is four things, so this session carries
// `fields` rather than actions: identity (does it sound like what it is
// called), artefacts (clean, some, bad), fit (what it belongs on), amount (the
// setting he was played: less, right, more), and a word of his own. The four
// are `session.ts`'s `AUDITION_FIELDS`, so a later audition round — a second
// pass at the same effects, a new family of voices — is the same form and the
// answers are comparable.
//
// Nothing here is scored and no row is written: `rowWrite: 'none'`. A verdict
// about an instrument belongs to the instrument's own round, and what this
// collects is the round's evidence rather than a library's field.

import fs from 'node:fs';
import path from 'node:path';
import { AUDITION_FIELDS, ROOT, SCHEMA, assertSession, migrateState, writeSession } from './session.ts';
import { BY_ID as EFFECT_BY_ID } from '@deep-house/engine/effects';
import { BY_NAME as VOICE_BY_NAME } from '@deep-house/engine/voices';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };

const KITCHEN = arg('kitchen', 'tmp/ear/kitchen');
const OUT = arg('out', 'notes/reviews/kitchen.json');

const dir = path.join(ROOT, KITCHEN);
if (!fs.existsSync(dir)) {
  console.error(`nothing at ${KITCHEN}; render the kitchen first (packages/engine/tools/ear.ts, ear-voices.ts, ear-drums.ts)`);
  process.exit(2);
}

/** What a file is, from its name: the three prefixes, and a together file. */
function kindOf(stem) {
  if (stem.startsWith('effect-')) return 'effect';
  if (stem.startsWith('voice-')) return 'voice';
  if (stem.startsWith('drum-')) return 'drum';
  if (/together$/.test(stem)) return 'ensemble';
  return 'other';
}

const idOf = (stem) => stem.replace(/^(effect|voice|drum)-/, '');
const list = (xs) => (Array.isArray(xs) ? xs.join(', ') : xs);
const round = (n) => (Number.isFinite(n) ? +n.toFixed(3) : n);

/**
 * What an effect was demonstrated at. The audition plays the fixture dry and
 * then through the effect **at its declared defaults**, so the defaults are the
 * setting the *amount* question is about, and they belong on the card rather
 * than in a file he would have to go and read.
 */
const demonstrated = (d) => Object.entries(d.params || {})
  .filter(([, p]) => p.default !== undefined && p.default !== 0)
  .map(([k, p]) => `${k} ${round(p.default)}`).join(', ');

/** The meta table of one item, off the engine's own descriptors. */
function metaOf(kind, id, stem) {
  if (kind === 'effect') {
    const d = EFFECT_BY_ID[id];
    if (!d) return { '' : 'not in the effect registry' };
    return {
      family: d.family,
      scope: d.scope,
      'applies to': list(d.applies),
      cost: d.cost,
      latency: d.latency,
      ...(d.tail?.seconds ? { tail: `${d.tail.seconds} s` } : {}),
      demonstrated: demonstrated(d) || 'its declared defaults',
      audition: 'the same music dry, then through it',
    };
  }
  if (kind === 'voice' || kind === 'drum') {
    const d = VOICE_BY_NAME[id];
    if (!d) return { '': 'not in the voice registry' };
    const t = d.timbres?.[id] || Object.values(d.timbres || {})[0] || {};
    return {
      family: d.family,
      roles: list(d.roles),
      bus: d.bus,
      level: d.level,
      ...(t.struck !== undefined ? { struck: String(t.struck) } : {}),
      ...(t.hold !== undefined ? { hold: t.hold } : {}),
      ...(t.brightnessHz !== undefined ? { brightness: `${t.brightnessHz} Hz` } : {}),
      ...(t.loudnessDb !== undefined ? { 'declared loudness': `${t.loudnessDb} dB` } : {}),
      audition: kind === 'drum' ? 'four bars alone, then in a groove' : 'sixteen bars over the chords',
    };
  }
  return { audition: stem === 'kit-together' ? 'the kitchen as a kit, sixteen bars' : 'all of them over a house groove, sixteen bars' };
}

/** The subtitle: what it is, in the engine's own words. */
function subtitleOf(kind, id, meta) {
  if (kind === 'effect') return `effect · ${meta.family || '?'} · on ${meta['applies to'] || '?'} · ${meta.cost || '?'} cost`;
  if (kind === 'voice') return `voice · ${meta.family || '?'} · ${meta.roles || '?'}`;
  if (kind === 'drum') return `drum · ${meta.roles || '?'} · ${meta.level || '?'}`;
  if (kind === 'ensemble') return 'all of them at once';
  return kind;
}

// The order is the registries' own, group by group, with each group's together
// file after it: what a round built, in the order it built it.
const GROUPS = ['effect', 'voice', 'drum', 'ensemble', 'other'];
const rankIn = (kind, id) => {
  const of = kind === 'effect' ? Object.keys(EFFECT_BY_ID) : Object.keys(VOICE_BY_NAME);
  const i = of.indexOf(id);
  return i < 0 ? of.length : i;
};

const items = fs.readdirSync(dir).filter((f) => f.endsWith('.wav')).map((f) => {
  const stem = f.replace(/\.wav$/, '');
  const kind = kindOf(stem);
  const id = idOf(stem);
  const meta = metaOf(kind, id, stem);
  return {
    sort: [GROUPS.indexOf(kind), rankIn(kind, id), stem],
    item: {
      // The id is the file's own name, which is the instrument's own name: an
      // audition is of a thing that exists in the registry, and the registry's
      // name is the one thing about it a listener is being asked to confirm.
      id: stem,
      kind,
      title: kind === 'ensemble' ? stem.replace(/-/g, ' ') : id,
      subtitle: subtitleOf(kind, id, meta),
      wav: `${KITCHEN}/${f}`,
      meta,
    },
  };
});

if (!items.length) { console.error(`no wavs under ${KITCHEN}`); process.exit(2); }
items.sort((a, b) => a.sort[0] - b.sort[0] || a.sort[1] - b.sort[1] || String(a.sort[2]).localeCompare(b.sort[2]));

const out = path.join(ROOT, OUT);
const before = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
// An id here is the file's name, so a re-run after K4 adds files carries every
// answer already given across untouched, and says so when one is about a file
// that has gone.
const { state, lost } = migrateState(before, items.map((x) => x.item));

const session = {
  schema: SCHEMA,
  id: arg('id', 'kitchen'),
  title: arg('title', 'The kitchen: does each one sound like what it is called?'),
  kind: 'kitchen',
  rowWrite: 'none',
  source: {
    tool: 'packages/deep-house/tools/review/session-from-kitchen.ts',
    from: [KITCHEN, 'packages/engine/src/effects/index.ts', 'packages/engine/src/voices/index.ts'],
    at: new Date().toISOString(),
    note: 'One item per audition. The four questions are identity, artefacts, fit and amount; '
      + 'nothing is scored and no recipe row is written. The meta is read off the engine\'s own '
      + 'descriptors, so a card says what the thing declares itself to be and the first question '
      + 'is whether it sounds like it.',
  },
  items: items.map((x) => x.item),
  fields: AUDITION_FIELDS,
  state,
};

assertSession(session, OUT);
writeSession(out, session);

const by = (k) => session.items.filter((it) => it.kind === k).length;
const missing = session.items.filter((it) => !fs.existsSync(path.join(ROOT, it.wav)));
console.log(`${OUT} — ${session.items.length} auditions: ${by('effect')} effects, ${by('voice')} voices, ${by('drum')} drums, ${by('ensemble')} together, ${Object.keys(state).length} already answered`);
if (lost.length) console.log(`  ! ${lost.length} answers are about files that are gone: ${lost.join(', ')}`);
if (missing.length) console.log(`  ! ${missing.length} wavs named but not there`);
console.log(`  npm run review -- ${OUT}`);
