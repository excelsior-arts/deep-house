// A review session from a recipe's rendered variants.
//
//   node tools/review/session-from-variants.ts
//   node tools/review/session-from-variants.ts --letter A --out notes/reviews/variants-A.json
//
// `tools/imprint/variants.ts` asks the other half of the recipe question —
// *what else in today's catalogue is this?* — and renders the nearest few
// beside the source, which is how the eight verdicts of `analysis/recipe-demo.md`
// were given: by ear, one variant at a time, against the music the recipe was
// encoded from. This turns its report into a manifest with the source as the
// A/B, so the comparison is a switch and not two tabs.
//
// A variants session **does not score the row**: every item points at the same
// recipe, and a row has one chef's score. What it writes is the verdict — hit,
// partial or miss, in his words — which is the labelled data the encoder is
// tuned on, so `rowWrite` is `verdict`.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SCHEMA, VARIANT_ACTIONS, assertSession, migrateState, provenanceKey, writeSession } from './session.ts';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };

const REPORT = arg('report', 'tmp/imprint/variants/variants.json');
const ROWS = arg('rows', 'notes/recipes');
const LETTER = arg('letter', null);
// What `variants.ts` rendered with: sixteen bars at 48 kHz are its defaults and
// the report does not carry them, so they are named here and overridable the
// same way, because they are half of an item's provenance key.
const EAR_BARS = +arg('ear-bars', 8);
const RATE = +arg('rate', 48000);
const OUT = arg('out', LETTER ? `notes/reviews/variants-${LETTER}.json` : 'notes/reviews/variants.json');

const file = path.join(ROOT, REPORT);
if (!fs.existsSync(file)) {
  console.error(`no variants report at ${REPORT}; run tools/imprint/variants.ts first`);
  process.exit(2);
}
const report = JSON.parse(fs.readFileSync(file, 'utf8'));
const recipes = report.recipes.filter((r) => !LETTER || r.letter === LETTER);
if (!recipes.length) { console.error(`no recipe ${LETTER} in ${REPORT}`); process.exit(2); }

const round = (n) => (Number.isFinite(n) ? Number(n.toFixed(3)) : n);

const items = [];
for (const r of recipes) {
  const row = `${ROWS}/${r.file}`;
  for (const p of r.picks) {
    items.push({
      // The id is the provenance of the music and nothing else — the same rule
      // `tools/imprint/cookbook.ts` names its reference wavs by, so a decision
      // survives a re-render that changes a variant's rank.
      id: provenanceKey(`variant${r.letter}`, p.seed, p.theme, p.fromBar, EAR_BARS, RATE),
      title: `recipe ${r.letter}, variant ${p.n} — ${p.seed}#${p.theme} bar ${p.fromBar}+${EAR_BARS}`,
      subtitle: p.inside ? 'inside the box' : p.insideConfident ? 'inside it on the birds the reading was sure of' : `out on ${(p.outside || []).map((x) => x.split(' ')[0]).join(', ')}`,
      wav: p.wav,
      source: r.sourceWav,
      meta: {
        recipe: r.id,
        seed: p.seed,
        theme: p.theme,
        bars: `${p.fromBar}+${EAR_BARS}`,
        rate: RATE,
        room: p.room,
        density: p.density,
        'bird distance': round(p.distance),
        'wants penalty': round(p.penalty),
        lead: p.lead,
        pad: p.pad,
        stab: p.stab,
        ...(p.misses?.length ? { misses: p.misses } : {}),
      },
      row,
    });
  }
}

const out = path.join(ROOT, OUT);
const before = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
// Whatever has already been decided is carried across by the music it is about
// and not by the id it had, which is what the provenance key is for.
const { state, lost } = migrateState(before, items, { rate: RATE });

const session = {
  schema: SCHEMA,
  id: arg('id', LETTER ? `variants-${LETTER}` : 'variants'),
  title: arg('title', LETTER
    ? `Recipe ${LETTER}: is this the same dish?`
    : 'The recipes\' variants: is this the same dish?'),
  kind: 'variants',
  rowWrite: 'verdict',
  source: {
    tool: 'packages/deep-house/tools/review/session-from-variants.ts',
    from: [REPORT],
    at: new Date().toISOString(),
    note: 'Each item is a variant of the recipe its row holds, with the recipe\'s own source as the A/B. A decision writes a verdict onto the row and never its score, because every item here points at the same row.',
  },
  items,
  actions: VARIANT_ACTIONS,
  state,
};

assertSession(session, OUT);
writeSession(out, session);

const missing = session.items.filter((it) => !fs.existsSync(path.join(ROOT, it.wav)));
console.log(`${OUT} — ${session.items.length} variants of ${recipes.length} recipe${recipes.length > 1 ? 's' : ''}, ${Object.keys(state).length} already decided`);
if (lost.length) console.log(`  ! ${lost.length} decisions name music that is not in this report any more: ${lost.join(', ')}`);
if (missing.length) console.log(`  ${missing.length} have no wav yet: ${missing.map((m) => m.id).join(', ')}`);
console.log(`  npm run review -- ${OUT}`);
