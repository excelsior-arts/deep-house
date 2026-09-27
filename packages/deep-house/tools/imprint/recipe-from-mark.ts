// recipe-from-mark.ts — a mark Eugene left, encoded as a recipe.
//
//   node tools/imprint/recipe-from-mark.ts notes/ratings/deep-house-ratings-2026-09-18.json
//   ... --mark 0            just the first usable mark
//   ... --out notes/recipes --reuse
//
// PLAN-RECIPES says the listener's love button captures "the derived bird
// values of the theme, the roles and families sounding, the figures'
// properties, plus the seed and theme index as provenance". This is that, done
// by hand from a ratings log, so the shape is known before the button exists.
//
// What it does, per mark:
//
//   1. **Plans the theme again and checks it against the mark.** A mark records
//      the tempo, the bars, the room, the key and every die; if the build has
//      moved since, the recipe would describe music that no longer exists, so
//      the encoding is refused and says which field moved. This is the golden
//      rule applied to a listener's row.
//   2. **Renders exactly the marked seconds** — the bars the mark names, with
//      two bars of pre-roll thrown away — offline through the real graph, one
//      at a time, reniced, on the silent route.
//   3. **Imprints it**, and imprints the theme's own 32-bar main groove beside
//      it, so the row can say what the same recipe would be at `track` scope.
//   4. **Widens the reading into a box** using the spread of the golden themes
//      *of that room*: a recipe is ranges, and a range taken from one ten-second
//      window would be a point with a rounding error round it. The per-room
//      spread is the honest width, because the calibration found that the
//      fourteen golden themes are two clusters and the room is the split.
//   5. **Reads `wants` off the plan**: the roles and families sounding in those
//      bars, and the figure properties — hat density, note lengths, syncopation
//      — from the masks the dice drew. Never an instrument, never an effect,
//      never a number the engine owns.
//
// The row goes to `notes/recipes/`, which is outside git with the rest of the
// notes. The wav and the imprint stay in `tmp/`, which is the lab.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { planTheme } from '../../src/mix.ts';
import { loudnessWindow } from '../../src/loudness.ts';
import { BY_NAME } from '@deep-house/engine/voices';
// What the plan and the stage say about a span, shared with the ranker so that
// what a recipe wants and what a candidate is are the same measurement twice.
import { timbreWants, ratesOf, stageOf, eventsIn, STAGE_POLICY } from './plan-facts.ts';
import { ROOT, VENV, IMPRINT_PY, serveSite, openPage, renderToWav } from './render.ts';
import { carryAcross, identityOf } from './human-fields.ts';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const has = (k) => process.argv.includes(`--${k}`);

const RATINGS = process.argv[2];
if (!RATINGS || RATINGS.startsWith('--')) {
  console.error('usage: recipe-from-mark.ts <ratings.json> [--mark N] [--out notes/recipes]');
  process.exit(2);
}
const OUT = path.resolve(ROOT, arg('out', path.join('notes', 'recipes')));
const LAB = path.join(ROOT, 'tmp', 'imprint', 'marks');
const GOLDEN = path.join(ROOT, 'tmp', 'imprint', 'golden');
const PORT = +arg('port', 7023);
const RATE = +arg('rate', 48000);
const PY = arg('python', VENV);
const ONLY = arg('mark', null);
const PREROLL_BARS = 2;
const TAIL_SECONDS = 1.5;
const TRACK_BARS = 32;
// A box is never narrower than this on any axis, however tight one room's
// fourteen-theme spread happens to be: a range of nothing is a point, and a
// point is not a recipe.
const MIN_HALF_WIDTH = 0.05;

const BIRDS = ['ember', 'tide', 'zephyr', 'root', 'gleam', 'veil', 'spark', 'loom'];
const round3 = (x) => Math.round(x * 1000) / 1000;

// --- the marks that can be encoded -----------------------------------------

const log = JSON.parse(fs.readFileSync(path.resolve(RATINGS), 'utf8'));
const usable = [];
const refused = [];
for (const [i, m] of (log.marks || []).entries()) {
  const t = m.theme || {};
  const r = m.range || {};
  const why = m.rating == null ? 'no score on it'
    : !t.seed ? 'no theme seed: the mark was taken before a theme was on the deck'
      : !(r.bar1 > r.bar0) ? 'no span: it marks an instant and not a stretch'
        : null;
  if (why) { refused.push({ i, id: m.id, why }); continue; }
  usable.push({ i, mark: m });
}
const wanted = ONLY == null ? usable : usable.filter((u, n) => String(n) === String(ONLY) || String(u.i) === String(ONLY));

console.log(`${path.basename(RATINGS)}: build ${log.build}, ${log.count} played, ${(log.marks || []).length} marks`);
for (const r of refused) console.log(`  mark ${r.i} (${r.id}) is not a recipe: ${r.why}`);
if (!wanted.length) { console.error('  nothing to encode'); process.exit(2); }

// --- does the record still make this music? --------------------------------

function checkAgainstPlan(mark) {
  const t = mark.theme;
  const [master, idxText] = String(t.seed).split('#');
  const theme = Number(idxText);
  const track = planTheme(master, theme, {});
  const moved = [];
  const same = (name, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) moved.push(`${name}: the mark says ${JSON.stringify(a)}, the plan makes ${JSON.stringify(b)}`); };
  same('bpm', t.bpm, track.bpm);
  same('bars', t.bars, track.bars);
  same('room', t.room, track.preset);
  same('key', t.key, track.key.name);
  for (const k of Object.keys(t.dice || {})) same(`dice.${k}`, t.dice[k], track.dice[k]);
  return { master, theme, track, moved };
}

// --- what the plan says is happening in those bars --------------------------

const fill = (mask) => (typeof mask === 'string' && mask.length
  ? [...mask].filter((c) => c !== '.').length / mask.length : 0);
// How much of a sixteen-step mask sits anywhere but on the four beats.
const offGrid = (mask) => {
  if (typeof mask !== 'string' || !mask.length) return 0;
  const on = [...mask].filter((c, i) => c !== '.' && i % 4 === 0).length;
  const all = [...mask].filter((c) => c !== '.').length;
  return all ? round3((all - on) / all) : 0;
};
const densityWord = (f) => (f <= 0.15 ? 'sparse' : f <= 0.30 ? 'offbeat' : f <= 0.55 ? 'broken' : 'sixteenths');
const lengthWord = (bars) => (bars >= 2 ? 'held' : bars >= 0.9 ? 'long' : bars >= 0.4 ? 'medium' : 'short');

/** The roles and families sounding, and the figures they are playing. */
function wantsOf(track, events, spanBars, stageWants) {
  const voices = [...new Set(events.map((e) => e.voice))];
  const roles = [];
  const families = [];
  for (const name of voices) {
    const d = BY_NAME[name];
    if (!d) continue;
    // A descriptor says what it *can* play; the piano is the one voice with two
    // roles, and which one it is playing is a die the plan already rolled.
    const role = d.roles.length > 1
      ? (track.dice.pianoRole === 'melody' ? 'melody' : 'figure')
      : d.roles[0];
    if (role && !roles.includes(role)) roles.push(role);
    if (d.family && !families.includes(d.family)) families.push(d.family);
  }
  // Note lengths per role, in bars, from the events that are actually in the
  // window — a property of the figure and not of the instrument.
  const bs = track.barSeconds;
  const lengths = {};
  for (const e of events) {
    const d = BY_NAME[e.voice];
    if (!d || !e.p || typeof e.p.dur !== 'number') continue;
    const role = d.roles.length > 1 ? (track.dice.pianoRole === 'melody' ? 'melody' : 'figure') : d.roles[0];
    (lengths[role] = lengths[role] || []).push(e.p.dur / bs);
  }
  const noteLength = {};
  for (const role of Object.keys(lengths)) {
    const xs = lengths[role].sort((a, b) => a - b);
    noteLength[role] = lengthWord(xs[Math.floor(xs.length / 2)]);
  }
  // How many bars a chord holds inside the window, off the timeline.
  const bars = [...new Set(events.map((e) => e.bar))].sort((a, b) => a - b);
  const romans = bars.map((b) => track.timeline[b] && track.timeline[b].roman).filter(Boolean);
  let runs = 1;
  for (let i = 1; i < romans.length; i++) if (romans[i] !== romans[i - 1]) runs++;
  // Onsets per bar, per role, off the plan — the thing a bird measured over a
  // whole mix cannot see. A figure can be quiet in energy and the most salient
  // thing in the bar, and a rate is how often it happens.
  const rates = ratesOf(track, events, spanBars);
  return {
    roles: roles.sort(),
    families: families.sort(),
    // What the three timbre dice drew, as properties and never as names.
    timbres: {
      lead: timbreWants(track.dice.leadTimbre),
      pad: timbreWants(track.dice.padTimbre),
      stab: timbreWants(track.dice.stabTimbre),
    },
    rates,
    stage: { ...stageWants, tolerance: STAGE_POLICY },
    figures: {
      hatDensity: densityWord(fill(track.dice.hatMask)),
      bassDensity: densityWord(fill(track.dice.bassMask)),
      figureDensity: densityWord(fill(track.dice.stabMask)),
      // How much of each figure falls off the four beats: Spark, as the plan
      // drew it rather than as the audio measured it.
      bassSyncopation: offGrid(track.dice.bassMask),
      figureSyncopation: offGrid(track.dice.stabMask),
      noteLength,
      barsPerChord: romans.length ? round3(romans.length / runs) : null,
      loopBars: track.dice.loopBars,
      voicing: track.dice.voicingStyle,
      density: track.density,
    },
  };
}

/** A name in role and figure words. It may not name an instrument or a room. */
function nameOf(w) {
  const lead = w.roles.includes('melody') ? 'a melody' : w.roles.includes('figure') ? 'a figure' : 'no lead';
  const holdWord = w.figures.noteLength.sustained || 'long';
  const bed = w.families.includes('ensemble') ? `a ${holdWord} ensemble` : 'a held bed';
  return `${w.figures.density} groove: ${lead} over ${bed}, ${w.figures.hatDensity} hats`;
}

// --- the spread of the golden, per room ------------------------------------
//
// The width of a recipe's box. Taken from the fourteen locked themes of the
// same room, because the calibration measured the catalogue as two clusters
// with the room as the split; a box widened by the whole catalogue's spread
// would be a box that reaches into the other room.

function roomSpread() {
  if (!fs.existsSync(GOLDEN)) return null;
  const MASTERS = { 1: 6, 92970: 4, 21323: 4 };
  const rows = {};
  for (const master of Object.keys(MASTERS)) {
    for (let n = 0; n < MASTERS[master]; n++) {
      const file = path.join(GOLDEN, `golden-${master}-${n}.json`);
      if (!fs.existsSync(file)) continue;
      const room = planTheme(String(master), n, {}).preset;
      const d = JSON.parse(fs.readFileSync(file, 'utf8'));
      (rows[room] = rows[room] || []).push(d.summary.birds);
    }
  }
  const out = {};
  for (const room of Object.keys(rows)) {
    out[room] = { themes: rows[room].length, halfWidth: {} };
    for (const b of BIRDS) {
      const xs = rows[room].map((r) => r[b].median).sort((x, y) => x - y);
      const q = (p) => {
        const i = (xs.length - 1) * p;
        const lo = Math.floor(i), hi = Math.ceil(i);
        return xs[lo] + (xs[hi] - xs[lo]) * (i - lo);
      };
      out[room].halfWidth[b] = round3(Math.max(MIN_HALF_WIDTH, (q(0.75) - q(0.25)) / 2));
    }
  }
  return out;
}

// --- render, imprint, encode ------------------------------------------------

const imprintOf = (wavFile, label, origin) => {
  const out = wavFile.replace(/\.wav$/, '.json');
  execFileSync('nice', ['-n', '18', PY, IMPRINT_PY, wavFile, '--out', out,
    '--origin', origin, '--raw', '--label', label, '--quiet'], { stdio: 'inherit' });
  return JSON.parse(fs.readFileSync(out, 'utf8'));
};

const spread = roomSpread();
if (!spread) {
  console.error(`there are no golden imprints in ${path.relative(ROOT, GOLDEN)}; run tools/imprint/imprint-golden.ts first`);
  process.exit(2);
}

fs.mkdirSync(LAB, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
const server = await serveSite(PORT);
const browser = await openPage(PORT);
console.log(`  ${browser.label}`);

const written = [];
for (const { i, mark } of wanted) {
  const { master, theme, track, moved } = checkAgainstPlan(mark);
  const label = `${master}#${theme}`;
  if (moved.length) {
    console.log(`  mark ${i} (${label}) is not encodable: the build has moved under it — ${moved.join('; ')}`);
    continue;
  }
  const r = mark.range;
  const bs = track.barSeconds;
  console.log(`  mark ${i}: ${label} ${track.preset} ${track.density}, bars ${r.bar0}-${r.bar1}, ${mark.section}, +${mark.rating}`);

  // The marked seconds, and then the theme's own main groove beside them.
  const wav = path.join(LAB, `mark-${mark.id}.wav`);
  if (!has('reuse') || !fs.existsSync(wav)) {
    const got = await renderToWav(browser.page, {
      masterSeed: master, theme,
      preFromBar: Math.max(0, r.bar0 - PREROLL_BARS), fromBar: r.bar0, toBar: r.bar1, tail: TAIL_SECONDS,
    }, wav, RATE);
    console.log(`    the marked window: ${got.seconds} s, ${got.events} events, ${got.peak} dBFS`);
  }
  const w = loudnessWindow(track, TRACK_BARS);
  const trackWav = path.join(LAB, `mark-${mark.id}-track.wav`);
  if (!has('reuse') || !fs.existsSync(trackWav)) {
    const got = await renderToWav(browser.page, {
      masterSeed: master, theme,
      preFromBar: Math.max(0, w.from - PREROLL_BARS), fromBar: w.from, toBar: w.from + w.bars, tail: TAIL_SECONDS,
    }, trackWav, RATE);
    console.log(`    the theme's main groove, bar ${w.from}+${w.bars}: ${got.seconds} s, ${got.events} events`);
  }

  const why = `listener mark, ${label} bars ${r.bar0}-${r.bar1}`;
  const im = imprintOf(wav, `${why} (${track.preset}, ${track.density}, ${track.key.name})`, 'listener');
  const imTrack = imprintOf(trackWav, `${label} main groove bar ${w.from}+${w.bars}`, 'listener');

  const hw = (spread[track.preset] || spread.growl).halfWidth;
  const events = eventsIn(track, r.bar0, r.bar1);
  const wants = wantsOf(track, events, r.bar1 - r.bar0, stageOf(track, r.bar0, r.bar1));
  const birds = {};
  const centre = {};
  const confidence = {};
  for (const b of BIRDS) {
    const c = im.summary.birds[b].median;
    centre[b] = c;
    confidence[b] = im.summary.confidence[b];
    birds[b] = [round3(Math.max(0, c - hw[b])), round3(Math.min(1, c + hw[b]))];
  }
  const trackBirds = {};
  for (const b of BIRDS) {
    const c = imTrack.summary.birds[b].median;
    trackBirds[b] = [round3(Math.max(0, c - hw[b])), round3(Math.min(1, c + hw[b]))];
  }

  const id = `listener/${master}-t${theme}-b${r.bar0}`;
  const recipe = {
    schema: 1,
    kind: 'recipe',
    id,
    interpreter: 'v1',
    scope: 'section',
    applies: mark.section,
    name: nameOf(wants),
    origin: 'listener',
    birds,
    wants,
    forbids: [],
    weight: 1,
    // What the same mark would be if it were taken as a whole dish rather than
    // a course: the theme's own 32-bar main groove, in the same box widths.
    alternates: {
      track: {
        scope: 'track',
        applies: null,
        birds: trackBirds,
        from: `the theme's own main groove, bar ${w.from}+${w.bars}`,
        note: 'The marked span is a section of this theme; at track scope the recipe is the theme\'s own groove, which is a different reading of the same music and a wider one.',
      },
    },
    reading: {
      centre: Object.fromEntries(BIRDS.map((b) => [b, centre[b]])),
      confidence,
      halfWidth: Object.fromEntries(BIRDS.map((b) => [b, hw[b]])),
      widenedBy: `the spread of the ${spread[track.preset] ? track.preset : 'growl'} golden themes (${(spread[track.preset] || spread.growl).themes} of them), half their interquartile range, floored at ${MIN_HALF_WIDTH}`,
    },
    provenance: {
      masterSeed: master,
      themeIndex: theme,
      themeSeed: track.seed,
      displayIndex: mark.theme.index,
      bars: [r.bar0, r.bar1],
      seconds: [r.t0, r.t1],
      section: mark.section,
      build: mark.build,
      markId: mark.id,
      markedAt: mark.at,
      score: mark.rating,
      note: mark.note || null,
      ratingsFile: path.basename(RATINGS),
      imprint: im.id,
      trackImprint: imTrack.id,
      anchors: im.tool.anchors,
      encodedBy: 'recipe-from-mark.ts',
      encodedAt: new Date().toISOString().slice(0, 10),
    },
  };
  const file = path.join(OUT, `recipe-${mark.id}.json`);
  // A row that already exists may carry things this tool did not write and
  // cannot work out again: the verdicts somebody gave its variants, the chef's
  // score, whether it was picked, a name somebody gave it. Re-encoding a row
  // must never be the way they are lost, so they are carried across by the
  // shared contract (`human-fields.ts`), by the mark the row was encoded from
  // and never by the file. Everything else is derived and is rewritten.
  let row = recipe;
  if (fs.existsSync(file)) {
    const old = JSON.parse(fs.readFileSync(file, 'utf8'));
    const { rows, carried, orphans } = carryAcross([recipe], [old]);
    row = rows[0];
    for (const c of carried) console.log(`    kept ${c.verdicts} verdicts, chef ${c.chef}${c.picked !== undefined ? `, picked ${c.picked}` : ''} from the row that was there`);
    if (orphans.length) {
      // The old row is another mark's music under this file name, which cannot
      // happen unless a mark id was reused; it is kept beside the new one
      // rather than overwritten.
      const aside = path.join(OUT, 'orphans', `recipe-${mark.id}.json`);
      fs.mkdirSync(path.dirname(aside), { recursive: true });
      fs.renameSync(file, aside);
      console.log(`    ! the row that was there is other music (${identityOf(old)}); moved to ${path.relative(ROOT, aside)}`);
    }
  }
  fs.writeFileSync(file, JSON.stringify(row, null, 1) + '\n');
  written.push({ file, recipe: row });
  console.log(`    -> ${path.relative(ROOT, file)}  ${BIRDS.map((b) => `${b.slice(0, 2)} ${birds[b][0].toFixed(2)}-${birds[b][1].toFixed(2)}`).join('  ')}`);
}

await browser.close();
server.close();
console.log(`\n${written.length} recipes in ${path.relative(ROOT, OUT)}`);
