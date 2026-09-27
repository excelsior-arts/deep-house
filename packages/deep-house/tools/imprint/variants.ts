// variants.ts — what else in today's catalogue is this recipe?
//
//   node tools/imprint/variants.ts
//   ... --seeds 60 --themes 3 --candidates 20 --pick 4
//   ... --recipe recipe-mu6xix1h-0.json
//
// A recipe is a box in bird space, and the point of a box is that more than one
// record falls in it. The spell layer that will *roll inside* a box does not
// exist yet (PLAN-MAGIC-V2 phase 0), so the honest experiment today is
// **rejection sampling from the catalogue as it already is**: plan a sweep of
// seeds, throw away everything the composer can already tell is a different
// dish, measure what is left, and keep what lands in the box.
//
// Three stages, cheapest first, because the third one costs a render:
//
//   1. **Plan** `--seeds` master seeds x `--themes` themes. Planning is pure
//      arithmetic and costs nothing; a hundred and eighty plans take a second.
//   2. **Filter on what the composer already knows**: the same room, the same
//      density class, and a style distance (`src/style-distance.ts` — the same
//      measure the ring's dice use to decide whether a cast is a new record)
//      under a threshold. The nearest `--candidates` of those go on.
//   3. **Imprint** each candidate over a window of exactly the same length as
//      the recipe's own, taken from its first long main groove — like for like,
//      because Veil and Loom both read differently over a longer window — and
//      keep the ones inside the box.
//
// Then the `--pick` nearest inside the box are rendered as eight bars each,
// beside eight bars of the source, into `tmp/ear/`, for a listener. Distance is
// Euclidean over the eight birds **weighted by the recipe's own confidences**,
// so a bird nobody could measure does not get to decide what a recipe sounds
// like.
//
// One renderer, one at a time, reniced, on the silent route, on a port that is
// never 6975.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { planTheme } from '../../src/mix.ts';
import { propertyPenalty, stageOf, eventsIn } from './plan-facts.ts';
import { loudnessWindow } from '../../src/loudness.ts';
import { styleDistance } from '../../src/style-distance.ts';
import { ROOT, VENV, IMPRINT_PY, serveSite, openPage, renderToWav } from './render.ts';
import { emptyLedger, assignNumbers, seedFromPicks, musicKey } from './ledger.ts';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const has = (k) => process.argv.includes(`--${k}`);

const RECIPES = path.resolve(ROOT, arg('recipes', path.join('notes', 'recipes')));
const LAB = path.join(ROOT, 'tmp', 'imprint', 'variants');
const EAR = path.join(ROOT, 'tmp', 'ear');
const PORT = +arg('port', 7023);
const RATE = +arg('rate', 48000);
const PY = arg('python', VENV);
const SEEDS = +arg('seeds', 60);
const THEMES = +arg('themes', 3);
const CANDIDATES = +arg('candidates', 20);
const PICK = +arg('pick', 4);
const EAR_BARS = +arg('ear-bars', 8);
// What a property miss costs against a bird's distance. A bird's own box is
// about 0.05 wide, so one whole tolerance of property mismatch costing 0.06 puts
// the two on the same footing — which is the intent: a recipe's `wants` are
// preferences and are meant to bias the ranking, not to gate it.
const WANTS_WEIGHT = +arg('wants-weight', 0.06);
// The stage policy the recipe carries, with the one rule the verdicts argue
// about available on the command line. `--front-hard` makes "the front must
// match" a match again, which is what 09-18 asked for and what the eight labels
// since then do not support; the ranking is reported both ways in
// `analysis/recipe-demo.md` rather than one way with the other hidden.
const POLICY = has('front-hard') ? { frontMustMatch: true } : {};
const ONLY = arg('recipe', null);
const PREROLL_BARS = 2;
const TAIL_SECONDS = 1.5;

const BIRDS = ['ember', 'tide', 'zephyr', 'root', 'gleam', 'veil', 'spark', 'loom'];
const round3 = (x) => Math.round(x * 1000) / 1000;

// --- the recipes ------------------------------------------------------------

const files = fs.existsSync(RECIPES)
  ? fs.readdirSync(RECIPES).filter((f) => f.endsWith('.json') && f !== 'index.json').sort()
  : [];
const library = files
  .map((f) => ({ file: f, row: JSON.parse(fs.readFileSync(path.join(RECIPES, f), 'utf8')) }))
  .filter((r) => r.row.kind === 'recipe');
// A, B, C... in the order the library holds them, which is the order the marks
// were made in. The letter is what the wav files are named by, so it is given
// over the **whole** library and only then is `--recipe` applied: a run over
// the second row alone used to call it A and write A's files (M3 of the mining review).
library.forEach((r, i) => { r.letter = String.fromCharCode(65 + i); });
const recipes = library.filter((r) => !ONLY || r.file === ONLY);
if (!recipes.length) {
  console.error(`no recipes in ${path.relative(ROOT, RECIPES)}; run tools/imprint/recipe-from-mark.ts first`);
  process.exit(2);
}

// --- the sweep --------------------------------------------------------------
//
// Master seeds 1..N, three themes each, and the source theme itself left out of
// its own search. Planning only: no context, no nodes, no sound.

console.log(`planning ${SEEDS} master seeds x ${THEMES} themes`);
const sweep = [];
for (let s = 1; s <= SEEDS; s++) {
  for (let n = 0; n < THEMES; n++) {
    const track = planTheme(String(s), n, {});
    sweep.push({ masterSeed: String(s), theme: n, track });
  }
}
console.log(`  ${sweep.length} themes planned`);

// --- what the composer can already tell ------------------------------------

function shortlist(recipe) {
  const p = recipe.provenance;
  const source = planTheme(p.masterSeed, p.themeIndex, {});
  const matched = sweep.filter((c) =>
    !(c.masterSeed === p.masterSeed && c.theme === p.themeIndex)
    && c.track.preset === source.preset
    && c.track.density === source.density);
  for (const c of matched) c.distance = styleDistance(source, c.track).distance;
  matched.sort((a, b) => a.distance - b.distance);
  return { source, matched, chosen: matched.slice(0, CANDIDATES) };
}

// --- what the plan says, against what the recipe wants ----------------------
//
// The birds are measured over the whole mix, and a mix is mostly its drums: a
// figure can be twelve decibels down and still be the thing a listener is
// following. Eugene's four verdicts on recipe A said so out loud — every miss
// had the one timbre whose hold is 0.048 in its lead or its stab, and the
// nearest candidate in bird space was inside the box on seven birds of eight.
// So the properties are read off the *plan*, where they are exact, and they are
// scored beside the distance rather than inside it.
//
// Nothing here reads a timbre's name for anything but looking its declared
// properties up. A candidate is judged on `struck`, `hold`, `brightnessHz` and
// how often each role fires, and never on which instrument is filling it.

// --- in the box, and how far from its centre -------------------------------

// Two readings of "is it in the box", and the second one exists because the
// first is strict in eight dimensions at once. `inside` is the recipe as
// written: every bird within its range. `insideConfident` asks the same of the
// birds the *source reading* was sure of — confidence 0.8 and over — and lets
// the rest go, because a ten-second window gives Veil four blocks and Loom no
// span at all, and a bird measured at a confidence of 0.22 should not be the
// one that decides what a recipe sounds like. The distance is weighted by the
// same confidences, so it already says this quietly; this says it out loud.
const SURE = 0.8;

function against(recipe, birds) {
  const centre = recipe.reading.centre;
  const conf = recipe.reading.confidence;
  let sum = 0;
  let w = 0;
  const outside = [];
  const outsideSure = [];
  for (const b of BIRDS) {
    const c = conf[b] == null ? 1 : conf[b];
    sum += c * (birds[b] - centre[b]) ** 2;
    w += c;
    const [lo, hi] = recipe.birds[b];
    if (birds[b] < lo || birds[b] > hi) {
      const why = `${b} ${birds[b].toFixed(2)} ${birds[b] < lo ? 'under' : 'over'} ${(birds[b] < lo ? lo : hi).toFixed(2)}`;
      outside.push(why);
      if (c >= SURE) outsideSure.push(why);
    }
  }
  return {
    distance: round3(Math.sqrt(sum / (w || 1))),
    outside, inside: outside.length === 0,
    outsideSure, insideConfident: outsideSure.length === 0,
  };
}

// --- run --------------------------------------------------------------------

fs.mkdirSync(LAB, { recursive: true });
fs.mkdirSync(EAR, { recursive: true });
const server = await serveSite(PORT);
const browser = await openPage(PORT);
console.log(`  ${browser.label}`);

const imprintOf = (wavFile, label) => {
  const out = wavFile.replace(/\.wav$/, '.json');
  execFileSync('nice', ['-n', '18', PY, IMPRINT_PY, wavFile, '--out', out,
    '--origin', 'generated', '--raw', '--label', label, '--quiet'], { stdio: 'inherit' });
  return JSON.parse(fs.readFileSync(out, 'utf8'));
};

// A variant keeps its number for life. A wav somebody has listened to and
// given a verdict on must go on meaning the same eight bars: a re-rank that
// renumbered the files would silently re-point every verdict already given.
// The numbers live in an **append-only ledger** (`ledger.ts`), keyed by the
// recipe's id and by the music — seed, theme and window — and never by the
// letter or the rank; a number once given is never given again, and a window
// that moved under the same seed is new music and takes a new number. The
// previous run's picks seed the ledger once, so nothing already on disk is
// renumbered by the tool that now protects it.
const OUT_JSON = path.join(LAB, 'variants.json');
const LEDGER = path.join(LAB, 'ledger.json');
const previous = fs.existsSync(OUT_JSON) ? JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')) : null;
const ledger = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : emptyLedger();
const writeLedger = () => fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1) + '\n');
/** A render's sidecar: what the wav beside it is, so `--reuse` reuses only the same music. */
const sidecarOf = (wav) => wav.replace(/\.wav$/, '.job.json');
const sameJob = (wav, job) => {
  const f = sidecarOf(wav);
  if (!fs.existsSync(wav) || !fs.existsSync(f)) return false;
  try { return JSON.stringify(JSON.parse(fs.readFileSync(f, 'utf8'))) === JSON.stringify(job); } catch { return false; }
};
const renderOnce = async (wav, job) => {
  if (has('reuse') && sameJob(wav, job)) return;
  await renderToWav(browser.page, job, wav, RATE);
  fs.writeFileSync(sidecarOf(wav), JSON.stringify(job) + '\n');
};

const report = [];
for (const { file, row: recipe, letter } of recipes) {
  const p = recipe.provenance;
  const span = p.bars[1] - p.bars[0];
  console.log(`\nrecipe ${letter}: ${recipe.id} — ${recipe.name}`);
  console.log(`  source ${p.themeSeed} ${recipe.wants.figures.density}, bars ${p.bars[0]}-${p.bars[1]} (${round3(span)} bars), score +${p.score}`);
  const { source, matched, chosen } = shortlist(recipe);
  console.log(`  ${matched.length} of ${sweep.length} themes share its room and density; the nearest ${chosen.length} by style distance run ${chosen[0] ? chosen[0].distance.toFixed(3) : '-'} to ${chosen.length ? chosen[chosen.length - 1].distance.toFixed(3) : '-'}`);

  const rows = [];
  for (const c of chosen) {
    // The same window length as the recipe's own, from this candidate's own
    // first long main groove.
    const w = loudnessWindow(c.track, Math.ceil(span));
    const name = `${c.masterSeed}-${c.theme}`;
    const wav = path.join(LAB, `${letter}-${name}.wav`);
    await renderOnce(wav, {
      masterSeed: c.masterSeed, theme: c.theme,
      preFromBar: Math.max(0, w.from - PREROLL_BARS), fromBar: w.from, toBar: w.from + span,
      tail: TAIL_SECONDS,
    });
    const im = imprintOf(wav, `candidate ${c.masterSeed}#${c.theme} bar ${w.from}, ${c.track.preset}, ${c.track.density}`);
    const birds = Object.fromEntries(BIRDS.map((b) => [b, im.summary.birds[b].median]));
    const v = against(recipe, birds);
    // What the plan says about the same window, which is where the properties
    // a mix-wide bird cannot see are exact.
    const events = eventsIn(c.track, w.from, w.from + span);
    const props = propertyPenalty(recipe.wants, c.track, events, span,
      { stageAt: stageOf(c.track, w.from, w.from + span), policy: POLICY });
    v.penalty = props.penalty;
    v.misses = props.misses;
    v.off = props.off;
    v.score = round3(v.distance + WANTS_WEIGHT * props.penalty);
    // `styleDistance` first and by its own name: the spread below carries the
    // candidate's own `distance`, which is the style one, and `...v` overwrites
    // it with the bird one. Two distances, two names, neither hidden.
    rows.push({ ...c, styleDistance: c.distance, fromBar: w.from, birds, ...v, imprint: im.id });
    process.stdout.write(`    ${name.padEnd(8)} style ${c.distance.toFixed(3)}  bird ${v.distance.toFixed(3)}  wants ${v.penalty.toFixed(2)}  score ${v.score.toFixed(3)}  `
      + `${v.inside ? 'INSIDE' : v.insideConfident ? 'inside on the sure birds' : `out: ${v.outside.map((x) => x.split(' ')[0]).join(', ')}`}`
      + `${v.off.length ? `  |  wants off: ${v.off.join(', ')}` : ''}\n`);
  }

  // The ranking is the combined score wherever the recipe carries property
  // wants, and the plain bird distance where it does not — an older row stays
  // ranked the way it was written.
  const hasWants = !!(recipe.wants && recipe.wants.timbres);
  const byDistance = (a, b) => (hasWants ? a.score - b.score : a.distance - b.distance);
  const byBird = (a, b) => a.distance - b.distance;
  const inside = rows.filter((r) => r.inside).sort(byDistance);
  const sure = rows.filter((r) => r.insideConfident).sort(byDistance);
  // Inside the box first, then inside it on the birds the source was sure of,
  // then simply the nearest — each group in distance order, and no candidate
  // twice. A demo with three variants because the box was strict is a worse
  // demo, and the table says of every pick which group it came from.
  const seen = new Set();
  const pool = [];
  for (const group of [inside, sure, [...rows].sort(byDistance)]) {
    for (const r of group) {
      const key = `${r.masterSeed}#${r.theme}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pool.push(r);
    }
  }
  const picks = pool.slice(0, PICK);
  // The numbers, off the ledger: once, the previous run's picks seed it.
  const old = previous && previous.recipes && previous.recipes.find((r) => r.id === recipe.id || r.letter === letter);
  seedFromPicks(ledger, recipe.id, old && old.picks, EAR_BARS);
  const numbers = assignNumbers(ledger, recipe.id, picks.map((r) => musicKey(r.masterSeed, r.theme, r.fromBar, EAR_BARS)));
  for (const r of picks) r.n = numbers.get(musicKey(r.masterSeed, r.theme, r.fromBar, EAR_BARS));
  writeLedger();
  console.log(`  ${inside.length} of ${rows.length} measured candidates are inside the whole box, `
    + `${sure.length} inside it on the birds the source was sure of`
    + (inside.length >= PICK ? '' : '; the rest of the picks are the nearest, with the birds that are out listed'));

  // Eight bars of each, for a listener: the source first.
  const sourceWav = path.join(EAR, `recipe-${letter}-source.wav`);
  const sBar = Math.floor(p.bars[0]);
  await renderOnce(sourceWav, {
    masterSeed: p.masterSeed, theme: p.themeIndex,
    preFromBar: Math.max(0, sBar - PREROLL_BARS), fromBar: sBar, toBar: sBar + EAR_BARS, tail: TAIL_SECONDS,
  });
  console.log(`  ${path.relative(ROOT, sourceWav)}  ${p.themeSeed} bar ${sBar}+${EAR_BARS}`);
  const wavs = [];
  for (const r of picks) {
    const out = path.join(EAR, `recipe-${letter}-variant-${r.n}.wav`);
    const job = {
      masterSeed: r.masterSeed, theme: r.theme,
      preFromBar: Math.max(0, r.fromBar - PREROLL_BARS), fromBar: r.fromBar, toBar: r.fromBar + EAR_BARS,
      tail: TAIL_SECONDS,
    };
    // A number names one piece of music for life, so a file under that number
    // that says it is other music is never written over: the ledger gave this
    // music its own number, and a mismatch here is a fault to stop on.
    if (fs.existsSync(out) && fs.existsSync(sidecarOf(out)) && !sameJob(out, job)) {
      throw new Error(`${path.relative(ROOT, out)} is other music than ${musicKey(r.masterSeed, r.theme, r.fromBar, EAR_BARS)} and a verdict may point at it; the ledger is wrong`);
    }
    await renderOnce(out, job);
    wavs.push(out);
    console.log(`  ${path.relative(ROOT, out)}  ${r.masterSeed}#${r.theme} bar ${r.fromBar}+${EAR_BARS}  bird ${r.distance.toFixed(3)} wants ${r.penalty.toFixed(2)} score ${r.score.toFixed(3)}  `
      + `${r.inside ? 'in the box' : r.insideConfident ? 'in it on the sure birds' : `nearest; out on ${r.outside.map((x) => x.split(' ')[0]).join(', ')}`}  `
      + `${r.track.preset} ${r.track.density}  lead ${r.track.dice.leadTimbre} pad ${r.track.dice.padTimbre} stab ${r.track.dice.stabTimbre}`);
  }

  report.push({
    letter, id: recipe.id, file, source: p, span: round3(span),
    sweep: sweep.length, matched: matched.length, measured: rows.length,
    inside: inside.length, insideConfident: sure.length,
    // What share of the whole sweep this recipe would claim, if the measured
    // candidates are representative of the ones that were not measured. They
    // are the nearest by style distance, so this is an upper bound.
    naturalFrequency: round3((matched.length / sweep.length) * (inside.length / (rows.length || 1))),
    naturalFrequencyConfident: round3((matched.length / sweep.length) * (sure.length / (rows.length || 1))),
    rows: rows.map((r) => ({
      seed: r.masterSeed, theme: r.theme, fromBar: r.fromBar, styleDistance: round3(r.styleDistance),
      birdDistance: r.distance, penalty: r.penalty, score: r.score, misses: r.misses,
      inside: r.inside, insideConfident: r.insideConfident, outside: r.outside,
      room: r.track.preset, density: r.track.density,
      lead: r.track.dice.leadTimbre, pad: r.track.dice.padTimbre, stab: r.track.dice.stabTimbre,
      birds: Object.fromEntries(BIRDS.map((b) => [b, round3(r.birds[b])])),
    })),
    ranking: hasWants ? 'bird distance plus the property wants' : 'bird distance',
    wantsWeight: WANTS_WEIGHT,
    byBirdAlone: [...rows].sort(byBird).slice(0, PICK).map((r) => `${r.masterSeed}#${r.theme}`),
    picks: picks.map((r, i) => ({
      n: r.n, seed: r.masterSeed, theme: r.theme, fromBar: r.fromBar, distance: r.distance,
      penalty: r.penalty, score: r.score, misses: r.misses,
      inside: r.inside, insideConfident: r.insideConfident, outside: r.outside,
      room: r.track.preset, density: r.track.density,
      lead: r.track.dice.leadTimbre, pad: r.track.dice.padTimbre, stab: r.track.dice.stabTimbre,
      wav: `tmp/ear/recipe-${letter}-variant-${r.n}.wav`,
    })),
    sourceWav: path.relative(ROOT, sourceWav),
  });
}

await browser.close();
server.close();

fs.writeFileSync(OUT_JSON, JSON.stringify({ at: new Date().toISOString(), sweep: sweep.length, recipes: report }, null, 1) + '\n');
console.log(`\n${path.relative(ROOT, OUT_JSON)}`);
for (const r of report) {
  console.log(`  ${r.letter}: ${r.matched}/${r.sweep} share the room and density, ${r.inside}/${r.measured} measured are inside the whole box and ${r.insideConfident}/${r.measured} on the sure birds`
    + ` — natural frequency about ${(r.naturalFrequency * 100).toFixed(1)}% of the catalogue, ${(r.naturalFrequencyConfident * 100).toFixed(1)}% on the sure birds`);
}
