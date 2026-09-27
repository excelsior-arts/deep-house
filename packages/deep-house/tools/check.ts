// The checks that need no browser, no sound card and no seconds to spare.
//
//   npm run check          this, then the release audit
//   node tools/check.ts   on its own
//
// Everything here is arithmetic over the plan: the generator is pure, the seam
// layout is pure, the push curve is pure and the style distance is pure, so the
// things that used to be probe scripts under tmp/ — run by hand, once, and then
// remembered — are checks that run every time in about the time it takes to
// read this sentence. Each prints one line. Any of them failing ends the run
// non-zero naming what moved.
//
// What is *not* here is anything that has to be heard: that is tools/test.ts,
// which renders the scene list in two engines, and tools/test-browsers.ts,
// which plays a set.

import crypto from 'node:crypto';
import { WAIT_ALPHA } from '../src/wait.ts';
import { INK as VIEW_INK } from '../src/machine/look.ts';
import fs from 'node:fs';
import os from 'node:os';
import zlib from 'node:zlib';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { planTheme, presetOfTheme, makeSetClock, seamFromHere, spellFor, MIX_DEFAULTS, SEAM_FLOOR, STYLE } from '../src/mix.ts';
import { generate } from '../src/generator.ts';
import { dbToGain, startTime, leadStats } from '@deep-house/engine/dsp';
import { THIRDS } from '@deep-house/engine/meter';
import { predictedLufs, loudnessTrimDb, loudnessWindow, trimWindow, headroomDb, LOUDNESS_COLUMNS, knobDbOf } from '../src/loudness.ts';
import v2LoudnessFit from '../src/styles/deep-house-v2-loudness.json' with { type: 'json' };
import { pushCurve } from '../src/arrangement.ts';
import {
  REGISTRY, BY_NAME, VOICES, VOICE_BUS, VOICE_LEVEL, TIMBRES,
  ARRANGEMENT_LAYERS, EVENT_LAYERS, layersWhere,
  FAMILIES, ROLES, BUSES, FIELDS,
  VOICE_KNOBS, KNOB_BIRDS, KNOB_UNITS, knobFaults, knobReadout,
} from '@deep-house/engine/voices';
import { LANES, LAYER_ORDER, LAYER_LABEL } from '../src/control.ts';
import { linkRead } from '../src/link.ts';
import { isReported, REPORTED_KINDS, REPORT_CAPS, CAUGHT, reportedAs, ours, aBug, report, lines as ledgerLines } from '../src/ledger.ts';
import { createJournal, CAP as JOURNAL_CAP, KEY as JOURNAL_KEY, SESSION_HOURS } from '../src/journal.ts';
import { STAGE_LAYERS, STAGE_HARMONIC, compilePerformance, sliceProgram, programOf } from '../src/performance.ts';
import { duckAt } from '@deep-house/engine/program';

import { loudnessFeatures } from '../src/loudness.ts';
import { clone } from '@deep-house/engine/params';
import { resolveSettings, settingsOf } from '@deep-house/engine/settings';
import { styleDistance, FLOOR } from '../src/style-distance.ts';
import { castPool, pickCast } from '../src/cast-pool.ts';
import Rng from '../src/rng.ts';
import { bandsOf, bandAt, leanAt, LABEL_TABLE, allSentences, allShorts, sentenceOf, shortOf, BANNED_WORDS, cellReading, timbrePhrase } from '../src/bird-labels.ts';
import { candidateLists } from '../src/catalogue.ts';
import { GLYPH_ROWS, levelAt as glyphLevelAt } from '../src/bird-glyph.ts';
import { edgesOf, linksOf, frameLine, biasesOf, COMPASS as INFLUENCE_COMPASS } from '../src/bird-influence.ts';
import { percentOf, valueOfPercent, percentShown, RIM_PERCENT, HOUSE_ZONE, HOUSE_HOLD, magnet, PULL_STEP, PULL_PAGE, TAP_STEP, nearHouse } from '../src/bird-percent.ts';
import {
  BIRDS, HOUSE, HOUSE_BOX, HOUSE_DERIVED, asSpell, biasFor, derive, isHouse,
  measuredWeights, measuredRanges, MIN_SIGNATURE, WEIGHT_FLOOR, WEIGHT_CEILING,
  parseSpell, sameSpell, spellQuery, spellFromQuery, recipeFromQuery,
  knobSetting, knobsFor, knobInRegion, KNOB_TASTE, HOUSE_REGION,
  tempoBassLean, tempoBassSetting, TEMPO_BASS_KNOBS,
} from '../src/spell.ts';
import {
  ringColour, restyle, typeInk, paleInk, PALE, contrastOnBlack, hexToLch, GOLD_STOPS, BASE, K,
  PALETTES, PALETTE, warp,
} from '../src/ring-colour.ts';
import {
  HOUSE_RECIPE, houseRecipe, boxOf, diceBoxOf, outsideBox, spellFrom, validate, vocabularyOf, loadRecipes, weightOf,
} from '../src/recipe.ts';
import {
  CALIBRATION_SCHEMA, PLATEAU, atKnots, boxInDice, forwardOf, forwardSpell, inverseOf, inverseSpell, originSpell, unreachable,
} from '../src/calibration.ts';
import { INTERPRETER, MEMBER_COST, WANT_LEAN, interpretWants, sayWanted } from '../src/interpret.ts';
import {
  ATTEMPTS, CALIBRATION, CONTOURS, HOUSE_FAMILIES, MOVES, PLACEMENT, REGISTERS,
  cellBeats, contourOf, develop, familyById, insideBox, motifFaults, onsetsOf,
  placementOf, readMotif, rollAttempts, rollMotif, spanSemitones,
} from '../src/motif.ts';
import { MOTIF_RECIPES, motifRecipe } from '../src/recipe.ts';
import { LIBRARY, recipeById } from '../src/recipes.ts';
import { drawable, recipesFor } from '../src/mix.ts';
import {
  STRATEGIES, STRATEGY_IDS, DEFAULT_STRATEGY, strategyById, strategyFromQuery,
} from '../src/strategies/index.ts';
import { MOMENTS, PALETTE_LANES, LANE_TRIMS } from '../src/styles/deep-house-v2.ts';
import { DROPPED_FOR_COST, CEILING as CATALOGUE_CEILING, CAST_UNITS, TREATED_LANES } from '../src/catalogue-v2.ts';
import { BY_ID as EFFECTS_BY_ID, REGISTRY as EFFECT_REGISTRY, costOf } from '@deep-house/engine/effects';
import { costOfVoices } from '@deep-house/engine/voices';
import * as VOICE_REGISTRY from '@deep-house/engine/voices';
import { voicePlaying } from '@deep-house/engine/voices';
import { seamCurves } from '../src/set-plan.ts';
import { FIGURE_SOURCES, sourcesOf, laneVoices, switchOn, layerOf } from '../src/lanes.ts';
import { FIXTURES, twoGates } from './lane-fixtures.ts';
import { carryAcross, hasOpinion, identityOf } from './imprint/human-fields.ts';
import { assignNumbers, emptyLedger, musicKey } from './imprint/ledger.ts';

// The style this build plays, and the three shorthands the checks below read it
// by. Every one of them used to be a module-level constant somewhere in `src/`.
const CATALOGUE = STYLE.candidates;
const UNREACHABLE = STYLE.unreachable;
const PRESETS = STYLE.rooms;
const PRESET_IDS = Object.keys(STYLE.rooms);
const STAGE_LEVEL = STYLE.stage.level;
const BASE_SETTINGS = STYLE.settings;
import { schedule, firstEvent, offsetGrid, visitAt } from '@deep-house/engine/schedule';
import { deckContextTime, deckThemeTime } from '@deep-house/engine/deck';
import { setLayout } from './setplan.ts';
import { drawsOf } from './imprint/signatures.ts';
import { canonical, seamProgram, recordAutomation, settingsHash, SETTINGS_LOCKED } from './program.ts';
// The machine view's two pieces that are arithmetic rather than drawing: where
// a box goes, and where a decibel sits on a meter.
import { joinParts, describeGraph, describeDeck, describeMaster } from '@deep-house/engine/describe';
import { CLIP_DB, HOT_DB, windowFor } from '@deep-house/engine/taps';
import { FRAME_MS, COARSE_FRAME_MS } from '../src/machine/store.ts';
import { FAMILY_GAP, FRAME_LABEL, FRAME_PAD, INSET, KEY_GAP, KEY_H, KEY_INSET, KEY_W, LEGEND_H, LEVEL_W, PAD, RADIUS, SOURCE_GAP, SOURCE_H, SOURCE_H2, SOURCE_KEYS_W, bellsAt, layoutCanvas, mainPath, oneLine, rackOf, shapeOf } from '../src/machine/layout.ts';
import { SPACE } from '../src/machine/look.ts';
import { GROUPS, lanePart, lanesOfTheme } from '../src/machine/model.ts';
import { ENTRIES as MANUAL, KEY_PAGES, manualKey, said } from '../src/machine/manual.ts';
import { METER_FLOOR, SCALE, meterAt } from '../src/machine/look.ts';
import { note, forget, lines, keepPlace, sentence } from '../src/ledger.ts';
import {
  AUDITION_FIELDS, decide, isReviewed, keyOfItem, migrateState, provenanceKey, sampleSession, validateSession, writeSession,
} from './review/session.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// This package is one of two, and three of the checks below read both: the
// repository is two folders further up, and `packages/` is what it holds.
const REPO = path.join(ROOT, '..', '..');
const PACKAGES = fs.readdirSync(path.join(REPO, 'packages')).sort();

// The three master seeds the two locks hold, and how many themes of each:
// tools/golden.ts and tools/program.ts name the same set, and the checks
// below that walk "every golden theme" walk exactly it.
const GOLDEN_THEMES = { 1: 6, 92970: 4, 21323: 4 };

let failed = 0;
function check(name, fn) {
  let note;
  try {
    note = fn();
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}: ${e.message}`);
    return;
  }
  console.log(`ok    ${name}: ${note}`);
}
const must = (cond, why) => { if (!cond) throw new Error(why); };

// --- the generator has not moved -------------------------------------------
// Both locks run **once per strategy** since round K5a of PLAN-KITCHEN. A
// strategy is a versioned composition with its own section in each digest, and
// a suite that checked only the default would let a second one rot in the file
// it is written in.
// Since the reconciled review of 09-24 (R4) both are asked once, with `--all`,
// which is what the release asks too: the lock tool walks `STRATEGIES` itself,
// and this line holds its answer to naming every id in `STRATEGY_IDS`, in
// order, so a strategy the tool skipped is a failure here and at the cut.
const lockLines = (tool, prefix) => {
  let out;
  try {
    out = execFileSync(process.execPath, [path.join(ROOT, 'tools', tool), '--check', '--all'], { encoding: 'utf8' });
  } catch (e) {
    throw new Error((e.stderr || e.stdout || e.message).toString().trim().split('\n').slice(0, 2).join(' — '));
  }
  const lines = out.trim().split('\n').filter((l) => prefix.test(l));
  const named = lines.map((l) => l.replace(prefix, '').split(',')[0]);
  must(named.join(' ') === STRATEGY_IDS.join(' '), `${tool} --check --all answered for ${named.join(', ') || 'nothing'}, and this build plays ${STRATEGY_IDS.join(', ')}`);
  return lines.map((l) => l.replace(prefix, '')).join('; ');
};

check('the plans', () => lockLines('golden.ts', /^the generator has not moved: /));

// --- the developed program has not moved either -----------------------------
// The golden digest above answers for the plan and says nothing about what the
// plan becomes: it drops every time, send, gain, pan, the sound stage, the
// automation and the trim. This one answers for those. A refactor that leaves
// both unmoved has not changed the record.
check('the programs', () => lockLines('program.ts', /^the program has not moved: /));

// --- the program lock sees what the voices render with (R69) ------------------
// The program's hash holds the settings' level table and nothing else of them,
// so a room a voice plays in could move under both locks. Every strategy's
// section carries a `settings` line per theme beside the hash (house-v1's since
// round (g), Eugene's question 14); and a line the recording
// graph cannot write is a failure, where the real writer would drop it.
check('the program lock sees the settings the voices render with, and every automation target', () => {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'program-digest.json'), 'utf8'));
  const sectionOf = (id) => (id === 'house-v1' ? d : d.strategies[id]);
  for (const id of STRATEGY_IDS) {
    const lines = Object.values(sectionOf(id).masters).flat();
    const carrying = lines.filter((l) => typeof l.settings === 'string' && /^[0-9a-f]{64}$/.test(l.settings)).length;
    must(carrying === (SETTINGS_LOCKED.includes(id) ? lines.length : 0), `${id}: ${carrying} of ${lines.length} theme lines carry a settings hash`);
  }
  const program = programOf(planTheme('1', 0, { preset: 'auto', strategy: 'house-v2' }));
  const line = d.strategies['house-v2'].masters['1'][0];
  must(settingsHash(program) === line.settings, 'house-v2 1#0: the settings hash is not the committed one');
  // A move the program's own hash cannot see: the sidechain's attack, which no
  // event carries and the level table does not hold.
  const nudged = { ...program, settings: { ...program.settings, sidechain: { ...program.settings.sidechain, attack: program.settings.sidechain.attack * 1.01 } } };
  must(settingsHash(nudged) !== line.settings, 'a one per cent move of the sidechain attack left the settings hash where it was');
  const minus = { ...program, development: [...program.development, { level: { pad: -0 } }] };
  must(settingsHash(minus) !== settingsHash({ ...program, development: [...program.development, { level: { pad: 0 } }] }), 'a minus nought and a nought hash the same');
  let refused = '';
  try {
    recordAutomation({ automation: [{ param: 'nowhere.gain', curve: 'linear', points: [{ t: 0, value: 1 }] }] }, 0.5, 'the probe');
  } catch (e) {
    refused = e.message;
  }
  must(/nowhere\.gain/.test(refused), 'an automation line on a parameter the recording graph lacks was dropped in silence');
  const targets = [...new Set(program.automation.map((l) => l.param))].sort();
  return `house-v1's ${Object.values(d.masters).flat().length} and house-v2's ${Object.values(d.strategies['house-v2'].masters).flat().length} theme lines carry it; a 1 % sidechain move moves it; an unknown target (nowhere.gain) fails the lock; 1#0 writes ${targets.join(', ')}`;
});

// --- the release locks every strategy and the link (R4) ------------------------
// A bare link plays house-v2, and the cut used to lock house-v1's plans alone.
// Since Eugene's answer to question 7 (09-24) the cut's gate is this suite,
// whole: `npm run check` and nothing less. The release names it
// (`--list-gates`), and it is held here to being that command, and the command
// to holding every lock: both lock tools over every strategy (above), the
// recipe programs (below), check-link — the link's test, the link digest and
// its freeze against the last cut — and the release audit.
check('the release runs the whole of npm run check, and it holds every lock of every strategy and the link\'s', () => {
  const out = execFileSync(process.execPath, [path.join(REPO, 'tools', 'release.ts'), '--list-gates'], { encoding: 'utf8', env: { ...process.env, VITE_PRIVATE_TOOLS: '' } });
  const gates = out.trim().split('\n').map((l) => l.split('\t')[1]);
  must(gates.join('|') === 'npm run check', `the release gates on ${gates.join('; ')}, not the whole of npm run check`);
  const src = fs.readFileSync(path.join(REPO, 'tools', 'release.ts'), 'utf8');
  must(!/whole-check|WHOLE_CHECK|LOCKS/.test(src), 'the release still carries a partial path beside the whole check');
  const root = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).scripts.check;
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts.check;
  const held = [
    [root, 'npm run types'], [root, 'npm run check -w @deep-house/app'], [root, 'node tools/check-release.ts'],
    [app, 'node tools/check.ts'], [app, 'tools/check-link.ts'],
  ].filter(([script, part]) => !script.includes(part)).map(([, part]) => part);
  must(!held.length, `npm run check does not run ${held.join('; ')}`);
  return `one gate before the audit and the suites, npm run check, which runs the types, check.ts (the plans and the programs --all, the recipe programs), check-link (the link digest and its freeze) and the audit`;
});

// --- the recipe programs, every row ------------------------------------------
// `fixtures/programs.ts --check` was a gate of the release's own; with the cut
// gated on this suite it is run here, every row.
check('the recipe programs', () => {
  let out;
  try {
    out = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'fixtures', 'programs.ts'), '--check'], { encoding: 'utf8' });
  } catch (e) {
    throw new Error((e.stderr || e.stdout || e.message).toString().trim().split('\n').slice(0, 3).join(' — '));
  }
  return out.trim().split('\n').pop();
});

// --- the release audit reads what would ship (R68, R135) ----------------------
// A dry release audits its scratch build through `--site`, and the audit sees
// a side-effect import, a video, and the words a picture carries. Planted in a
// copy of docs/ outside the checkout: every one of them must be named.
check('the release audit reads a scratch build and sees what used to slip past it', () => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'deep-house-audit-'));
  try {
    fs.cpSync(path.join(REPO, 'docs'), site, { recursive: true });
    fs.writeFileSync(path.join(site, 'planted.html'), '<script type="module">\nimport "https://example.invalid/remote.js";\n</script>\n');
    // The video's name is put together, so the audit does not find it in this file.
    const video = `planted.${'webm'}`;
    fs.writeFileSync(path.join(site, video), Buffer.alloc(16));
    const chunk = (type, data) => {
      const b = Buffer.alloc(12 + data.length);
      b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8);
      return b;
    };
    fs.writeFileSync(path.join(site, 'planted.png'), Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      // Compressed, so a scan of the raw bytes cannot see it: only reading the chunk does.
      chunk('zTXt', Buffer.concat([Buffer.from('Comment\0\0', 'latin1'), zlib.deflateSync(Buffer.from(`/${'Users'}/somebody/render.blend`))])),
      chunk('IEND', Buffer.alloc(0))]));
    let out = '';
    try {
      execFileSync(process.execPath, [path.join(REPO, 'tools', 'check-release.ts'), '--site', site], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      out = String(e.stderr);
    }
    const want = [
      ['docs/planted.html:2: not a relative module: https://example.invalid/remote.js', 'the side-effect import'],
      [`docs/${video}:0: an audio file in the release`, 'the video'],
      ['docs/planted.png:0: a disk path, in a picture\'s text', 'the picture\'s words'],
    ];
    const missed = want.filter(([line]) => !out.includes(line)).map(([, what]) => what);
    must(!missed.length, `the audit of a planted build missed ${missed.join(', ')}: ${out.slice(0, 200)}`);
    must(/release audit failed: 3 to fix/.test(out), `the planted build failed on something else too: ${out.slice(0, 600)}`);
    return 'a copy of docs/ with a side-effect import, a .webm and a PNG whose compressed zTXt names a disk path fails on exactly those three';
  } finally {
    fs.rmSync(site, { recursive: true, force: true });
  }
});

// --- a lock is written only by name (R67) -------------------------------------
// A bare run of either lock tool used to bless, house-v1's section included.
// Now it prints how and ends 2, and the committed file is the bytes it was.
check('a bare run of a lock tool writes nothing and says how', () => {
  const said = [];
  for (const [tool, file] of [['golden.ts', 'golden-digest.json'], ['program.ts', 'program-digest.json']]) {
    const was = fs.readFileSync(path.join(ROOT, 'tools', file));
    let code = 0, err = '';
    try {
      execFileSync(process.execPath, [path.join(ROOT, 'tools', tool)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      code = e.status;
      err = String(e.stderr);
    }
    must(code === 2, `${tool} with no mode ended ${code}, not 2`);
    must(/^usage: /.test(err), `${tool} with no mode did not say how: ${err.slice(0, 60)}`);
    must(fs.readFileSync(path.join(ROOT, 'tools', file)).equals(was), `${tool} with no mode rewrote ${file}`);
    said.push(`${tool} ends 2`);
  }
  return `${said.join(', ')}, both digests untouched`;
});

// --- and the two strategies do not lock the same record any more -------------
//
// **This line is the golden opening**, and it is the opposite of the one that
// stood here between K5a and K5b.
//
// Until K5b house-v2's hashes were house-v1's hashes, theme for theme and set
// for set, because every candidate the kitchen added was at weight nought; the
// equality was a check of its own so that the day it stopped being true would
// be a deliberate line in a commit message rather than something somebody
// noticed in a diff. K5b is that day. So the assertion is turned round: the two
// strategies must now **differ**, on every master and on every set, and by how
// much is a number this check states rather than a sentence somebody writes.
//
// house-v1's own section is still asserted to be the record, byte for byte,
// which is the half of the promise that does not move: an unversioned link is
// still the record and `tools/golden.ts --check` on the default is still the
// numbers it read the day it was blessed.
check('house-v2 no longer locks house-v1\'s record, and here is how far it moved', () => {
  let themes = 0;
  let moved = 0;
  let sets = 0;
  let setsMoved = 0;
  let events1 = 0;
  let events2 = 0;
  let seamCount = 0;
  const notes = [];
  for (const [tool, file] of [['golden', 'golden-digest.json'], ['program', 'program-digest.json']]) {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', file), 'utf8'));
    const other = (d.strategies || {})['house-v2'];
    must(other, `${file} has no section for house-v2`);
    for (const m of Object.keys(d.masters)) {
      must(other.masters[m], `${file}: house-v2 has no master seed ${m}`);
      must(other.masters[m].length === d.masters[m].length, `${file}: master ${m} has a different number of themes`);
      for (let i = 0; i < d.masters[m].length; i++) {
        themes++;
        if (other.masters[m][i].hash !== d.masters[m][i].hash) moved++;
        if (tool === 'golden') { events1 += d.masters[m][i].events; events2 += other.masters[m][i].events; }
      }
    }
    for (const m of Object.keys(d.sets || {})) {
      sets++;
      seamCount += d.sets[m].seams;
      if (other.sets[m].hash !== d.sets[m].hash) setsMoved++;
    }
    notes.push(tool);
  }
  // Every one of them, and not "most": a theme that planned the same bytes
  // under a catalogue this much wider would be a theme the catalogue never
  // reached, which is a fault and not a coincidence.
  must(moved === themes, `${moved} of ${themes} theme hashes moved; ${themes - moved} are still house-v1's`);
  // **And not one of the set hashes moved**, which is a result and is asserted
  // rather than shrugged at. A seam is planned off two things and the catalogue
  // touches neither: the set's own stream — the theme's length, its tempo, its
  // blend bars, its filter move, all rolled from `<master>::mix:<n>` before a
  // note exists — and the theme's section grammar, which is `dice('arrangement')`
  // and a mined order. So all fourteen themes keep the section plan, the
  // length, the tempo, the room, the key and the blend they had, and the
  // hand-over between two of them lands on the same bar at the same second with
  // the same curve. **A widened catalogue changes what a theme is made of and
  // not where a set turns over**, and the day that stops being true it will be
  // because something reached the arrangement rather than the instruments.
  //
  // **Until round S4 of the composer (09-25), which is that day on purpose:**
  // house-v2 has its own set table — its themes a fifth shorter and its seam
  // floor at 0.82 (Eugene: "trim the formula for track length by about 20 %
  // ... the mix starts a bit later") — so its sets turn over elsewhere, every
  // one of them, and that is asserted as well: a v2 set hash equal to v1's
  // would be a set table nobody reads.
  must(setsMoved === sets, `${setsMoved} of ${sets} set hashes moved, and house-v2's own set table (round S4) moves every one`);
  return `${notes.join(' and ')}: all ${themes} theme hashes differ between the two strategies and the fourteen golden themes hold ${events2} events under house-v2 against ${events1} under house-v1 (${events2 - events1 >= 0 ? '+' : ''}${events2 - events1}), and all ${sets} set hashes moved — house-v2's themes are a fifth shorter and its seams later since round S4, so its ${seamCount} hand-overs land elsewhere. house-v1's own section is untouched and is checked against, byte for byte, by the two lines above`;
});

// --- the compiler's own four properties -------------------------------------
//
// The program digest above says the compiler still produces the record. These
// four say what kind of thing it is: pure, deterministic, values all the way
// down, and the same answer over a window as over the theme the window is cut
// from. They are round D's claims, and each of them is the reason a consumer
// was allowed to stop doing something for itself.

// Every golden theme, compiled once, kept for the checks below.
const GOLDEN_PLANS = [];
const GOLDEN_PROGRAMS = [];
for (const m of Object.keys(GOLDEN_THEMES)) {
  for (let n = 0; n < GOLDEN_THEMES[m]; n++) {
    const plan = planTheme(m, n, { preset: 'auto' });
    GOLDEN_PLANS.push(plan);
    GOLDEN_PROGRAMS.push(compilePerformance(plan, settingsOf(plan), { boundaryBars: MIX_DEFAULTS.boundaryBars }));
  }
}

check('the compiler mutates nothing and compiles the same thing twice', () => {
  // The plan, hashed before and after. `develop()` used to write the stage's
  // decisions onto these very objects, so this is the round's own sentence
  // checked rather than asserted.
  let compiled = 0;
  for (let i = 0; i < GOLDEN_PLANS.length; i++) {
    const plan = GOLDEN_PLANS[i];
    const settings = settingsOf(plan);
    const before = canonical(plan);
    const again = compilePerformance(plan, settings, { boundaryBars: MIX_DEFAULTS.boundaryBars });
    must(canonical(plan) === before, `compiling ${plan.seed} changed the plan it was given`);
    must(canonical(again) === canonical(GOLDEN_PROGRAMS[i]), `compiling ${plan.seed} twice gave two different programs`);
    compiled++;
  }
  // And the strongest form of the same claim: a plan nothing *can* be written
  // to. A module is strict, so a write to a frozen object throws rather than
  // being dropped, which means this passes only if not one is attempted.
  const deepFreeze = (o) => {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o);
      for (const k of Object.keys(o)) deepFreeze(o[k]);
    }
    return o;
  };
  let frozen = 0;
  for (const plan of [planTheme('1', 0, { preset: 'auto' }), planTheme('21323', 3, { preset: 'auto' })]) {
    deepFreeze(plan);
    compilePerformance(plan, settingsOf(plan));
    frozen++;
  }
  return `${compiled} golden themes compile to the same program twice and leave their plan byte-identical; ${frozen} of them compile deep-frozen, so no write is even attempted`;
});

check('a program is values all the way down', () => {
  // What the runtime is handed has to survive being written down and read
  // back, and has to name nothing it cannot resolve.
  const fns = [], nans = [], zeroes = [], undefs = [];
  const walk = (v, at) => {
    if (typeof v === 'function') { fns.push(at); return; }
    if (v === undefined) { undefs.push(at); return; }
    if (typeof v === 'number') {
      if (Number.isNaN(v)) nans.push(at);
      if (Object.is(v, -0)) zeroes.push(at);
      return;
    }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${at}[${i}]`)); return; }
    if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], `${at}.${k}`);
  };
  let events = 0, voices = new Set();
  for (let i = 0; i < GOLDEN_PROGRAMS.length; i++) {
    const program = GOLDEN_PROGRAMS[i];
    const plan = GOLDEN_PLANS[i];
    walk(program, `${plan.seed}`);
    must(Object.isFrozen(program) && Object.isFrozen(program.events) && Object.isFrozen(program.events[0].p),
      `${plan.seed}'s program is not frozen through`);
    for (const pe of program.events) {
      must(typeof VOICES[pe.voice] === 'function', `${plan.seed} event ${pe.i} names a voice ${pe.voice} the registry does not have`);
      must(BUSES.includes(pe.bus), `${plan.seed} event ${pe.i} lands on a bus called ${pe.bus}`);
      voices.add(pe.voice);
      events++;
    }
    // The trim in the program is the trim the loudness model works out from
    // the plan, and it is applied in exactly one place.
    const trim = loudnessTrimDb(plan, STYLE);
    must(program.trimDb === trim, `${plan.seed}: the program trims ${program.trimDb} dB where the model says ${trim}`);
    must(program.themeGain === dbToGain(trim), `${plan.seed}: the theme gain is not the trim in linear`);
  }
  must(!fns.length, `a program holds a function at ${fns[0]}`);
  must(!nans.length, `a program holds a NaN at ${nans[0]}`);
  // Two things a program does hold, both of them stated rather than waved
  // through, because a check that passes by accident is worse than none:
  //
  //   a minus nought, and only in the stage's own rows, where a layer's back
  //   level times a lift of nought is one. Nothing plays off `development`; it
  //   is what the stage decided, kept for a readout.
  const strayZero = zeroes.find((at) => !/\.development\[/.test(at));
  must(!strayZero, `a program holds a -0 outside the stage's rows, at ${strayZero}`);
  //   an undefined, and only where the *plan* already had one: the generator
  //   writes a handful of parameter keys as `undefined` where a voice is to
  //   take its own default (`p.startHz` on a slow theme's kicks is the one in
  //   notes/TODO.md). The compiler introduces none of its own, which is what
  //   this asks: every undefined leaf is a `p` key the plan wrote undefined.
  const keys = new Set();
  for (const at of undefs) {
    const m = /^(.*)\.events\[(\d+)\]\.p\.([A-Za-z0-9_]+)$/.exec(at);
    must(m, `a program holds an undefined at ${at}, which is not a parameter the plan wrote`);
    const plan = GOLDEN_PLANS.find((t) => String(t.seed) === m[1]);
    must(plan && plan.events[+m[2]] && m[3] in (plan.events[+m[2]].p || {}) && plan.events[+m[2]].p[m[3]] === undefined,
      `the compiler wrote an undefined the plan did not, at ${at}`);
    keys.add(m[3]);
  }
  return `${GOLDEN_PROGRAMS.length} programs, ${events} events, ${voices.size} voices and ${BUSES.length} buses all resolving, frozen through, no function and no NaN; ${zeroes.length} minus noughts, all of them the stage's own rows, and ${undefs.length} undefined parameters, every one of them a parameter (${[...keys].sort().join(', ')}) the plan itself left for the voice to default`;
});

check('a window of a program is the program of that window', () => {
  // The property the scene gate stands on. It used to slice the *plan* — every
  // event outside the window handed over under a voice name no voice has, so
  // that the stage would read the theme's real history — and then compile
  // that; it now compiles the theme and slices the program. The two have to be
  // the same thing, field for field, or nine blessed envelopes are measuring
  // something other than the music.
  const MUTE = 'silent:not-in-window';
  const plan = planTheme('1', 1, { preset: 'auto' });
  const settings = settingsOf(plan);
  const bs = plan.barSeconds;
  const fromBar = 60, bars = 8, preroll = 2, tail = 1.5;
  const tp = (fromBar - preroll) * bs;
  const t1 = (fromBar + bars) * bs;

  // The old way, exactly: the plan windowed, then compiled.
  const windowed = {
    ...plan,
    duration: t1 - tp + tail,
    events: plan.events.map((e) => (e.t >= tp && e.t < t1 ? { ...e, t: e.t - tp } : { ...e, voice: MUTE, t: 0 })),
    automation: Object.fromEntries(
      Object.keys(plan.automation || {}).map((k) => {
        const v = plan.automation[k];
        return [k, Array.isArray(v) ? v.map((q) => ({ ...q, t: q.t - tp })) : v];
      })
    ),
  };
  const compiledSlice = compilePerformance(windowed, settings).events.filter((e) => e.voice !== MUTE);
  // The new way: the theme compiled once, the window cut out of the program.
  const whole = compilePerformance(plan, settings);
  const sliced = sliceProgram(whole, { from: tp, to: t1, tail }).events;

  must(compiledSlice.length === sliced.length,
    `${compiledSlice.length} events compiling the window against ${sliced.length} slicing the program`);
  const fields = ['voice', 'layer', 'bus', 'level', 'bar', 'step', 't', 'onset', 'lead', 'duck', 'gap'];
  let leaves = 0;
  for (let i = 0; i < sliced.length; i++) {
    for (const f of fields) {
      must(Object.is(compiledSlice[i][f], sliced[i][f]), `event ${i}: ${f} is ${compiledSlice[i][f]} compiled and ${sliced[i][f]} sliced`);
      leaves++;
    }
    const a = compiledSlice[i].p, b = sliced[i].p;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      must(JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null), `event ${i}: p.${k} moved between the two`);
      leaves++;
    }
  }
  const curves = compilePerformance(windowed, settings).automation;
  const sc = sliceProgram(whole, { from: tp, to: t1, tail }).automation;
  must(curves.length === sc.length, 'the two windows carry different numbers of automation lines');
  for (let i = 0; i < curves.length; i++) {
    must(canonical(curves[i]) === canonical(sc[i]), `the ${curves[i].param} line differs between the two windows`);
    leaves += curves[i].points.length;
  }
  return `bars ${fromBar}-${fromBar + bars} of seed 1 theme 1 with ${preroll} bars of pre-roll: ${sliced.length} events and ${curves.length} automation lines, ${leaves} fields, identical whether the plan is windowed and compiled or the theme is compiled and the program windowed`;
});

// --- the resolver's rules ---------------------------------------------------
//
// Round C's claim, and the one everything after it stands on. It began as a
// direct comparison — `resolveSettings()` against what `applyParams()` left in
// the live table, key for key and bit for bit on all fourteen golden themes
// and all three set masters — and that check ran green through the round's
// first four commits; the run is written out in notes/archive/2026-09-v1-stretch/rounds/round-c.md. The
// live table is gone now, so what is left to check is the resolver's own
// rules, and the *numbers* are locked by the program digest, which records
// every theme's resolved `levels` and every resolved `p` the voices are
// handed.
check("the resolver's rules", () => {
  const firstDiff = (a, b, at) => {
    if (Object.is(a, b)) return null;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object')
      return `${at}: ${JSON.stringify(a)} against ${JSON.stringify(b)}`;
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])]) {
      const d = firstDiff(a[k], b[k], `${at}.${k}`);
      if (d) return d;
    }
    return null;
  };
  // Frozen at every level, not just the top: a writable `levels` under a
  // frozen root is the alias round C exists to remove.
  const frozenThrough = (o, at) => {
    if (!o || typeof o !== 'object') return;
    must(Object.isFrozen(o), `${at} is not frozen`);
    for (const k of Object.keys(o)) frozenThrough(o[k], `${at}.${k}`);
  };

  // The base, with nothing merged over it, is the table itself.
  must(!firstDiff(clone(STYLE.base), BASE_SETTINGS, 'the base'), "the style's resolved settings are not its own table");
  frozenThrough(BASE_SETTINGS, 'the base');

  let themes = 0;
  for (const m of Object.keys(GOLDEN_THEMES)) {
    for (let i = 0; i < GOLDEN_THEMES[m]; i++) {
      const t = planTheme(m, i, { preset: 'auto' });
      frozenThrough(settingsOf(t), `theme ${m}#${i}`);
      themes++;
    }
  }

  // The order: base, then room, then the track's overrides, then the bypass,
  // each winning over the one before it, and a deep merge rather than a
  // replacement — `levels.kick` survives an override that only names
  // `levels.sub`.
  const probe = resolveSettings({
    base: STYLE.base,
    room: { levels: { sub: -20, keys: -20 } },
    overrides: { levels: { keys: -21 } },
    bypass: { levels: { keys: -22 } },
  });
  must(probe.levels.sub === -20, `the room did not reach the value: ${probe.levels.sub}`);
  must(probe.levels.keys === -22, `the bypass does not win: ${probe.levels.keys}`);
  must(probe.levels.kick === BASE_SETTINGS.levels.kick, 'a nested override replaced its block instead of merging into it');

  // The one derivation the resolver makes: the sub ceiling, over the base and
  // not over whatever was merged, and a ceiling rather than a trim.
  const cap = BASE_SETTINGS.levels.sub + BASE_SETTINGS.levels.subCeilingOverBaseDb;
  must(resolveSettings({ base: STYLE.base, room: { levels: { sub: cap + 3 } } }).levels.sub === cap, 'the sub ceiling is not applied');
  must(resolveSettings({ base: STYLE.base, room: { levels: { sub: cap - 3 } } }).levels.sub === cap - 3, 'the sub ceiling is trimming a level that is under it');
  must(BASE_SETTINGS.levels.sub <= cap, 'the base table is over its own ceiling');
  const rooms = PRESET_IDS.filter((id) => PRESETS[id].params);
  return `the base resolves to the table, ${themes} golden themes resolve frozen through, the four layers merge in order and deeply, and the ${cap} dB sub ceiling holds over ${rooms.length} rooms without trimming anything under it`;
});

// --- a room cannot be reached from another room -----------------------------
//
// Round C's own test, and the review's reproduction (finding 02) written as
// arithmetic. It used to be: start a `sub` deck, then `generate({ preset:
// 'growl' })` without touching the deck, and the deck's next kick callbacks
// read 65 Hz and a hat lid of 8200 where its own room says 54 and 7800.
//
// There is no table to contaminate now, so the test is what *cannot* happen:
// a deck's settings are a value it holds, and planning a dozen other rooms
// between two of its ticks leaves the value, the gains its events carry and
// the sidechain its kicks post identical. The two rooms are checked to differ
// first, or the whole thing would prove nothing.
check('a room cannot be reached from another room', () => {
  // (1) A then B then A is bit-identical A. A resolver that kept anything
  // between calls would show here and nowhere else.
  const a1 = resolveSettings({ base: STYLE.base, room: PRESETS.sub.params });
  const b1 = resolveSettings({ base: STYLE.base, room: PRESETS.growl.params });
  const a2 = resolveSettings({ base: STYLE.base, room: PRESETS.sub.params });
  const same = (x, y, at = '') => {
    if (Object.is(x, y)) return null;
    if (!x || !y || typeof x !== 'object' || typeof y !== 'object') return `${at}: ${x} against ${y}`;
    for (const k of [...new Set([...Object.keys(x), ...Object.keys(y)])]) {
      const d = same(x[k], y[k], `${at}.${k}`);
      if (d) return d;
    }
    return null;
  };
  must(!same(a1, a2, 'sub'), `resolving sub, growl, sub moved sub at ${same(a1, a2, 'sub')}`);
  must(a1 !== a2, 'the resolver handed back the same object twice, which is a cache and not a value');
  must(same(a1, b1, 'rooms'), 'the two measured rooms resolve to the same settings, so nothing below proves anything');

  // (2) The reproduction. A deck is its program and its program is its room,
  // so this *is* the deck: what its next events carry and what its kicks post,
  // compiled the way `makeDeck` compiles it. Round C read the gains off two
  // lines copied out of `fireDeckEvent`; since round D those lines are the
  // compiler's, so this asks the compiler.
  const deckTrack = planTheme('1', 0, { preset: 'sub' });
  let duckPoints = 0;
  const ahead = (n) => {
    const settings = settingsOf(deckTrack);
    const program = compilePerformance(deckTrack, settings);
    const sink = [];
    const rows = [];
    for (const pe of program.events.slice(0, n)) {
      rows.push([pe.voice, pe.p.gain]);
      if (pe.duck) for (const d of duckAt(program.duckShape, pe.onset)) sink.push([d.p, d.op, +d.t.toFixed(9), d.v]);
    }
    duckPoints = sink.length;
    return JSON.stringify([
      rows,
      sink,
      settings.kick.startHz,
      settings.hats.lidHz,
      settings.sidechain.depthDb,
      settings.levels.sub,
    ]);
  };
  const before = ahead(400);
  // Twelve other rooms planned and generated between the deck's two ticks,
  // which is exactly what the page does while a set plays.
  let planned = 0;
  for (let i = 0; i < 12; i++) {
    planTheme(String(7000 + i), i % 3, { preset: i % 2 ? 'growl' : 'sub' });
    generate({ style: STYLE, seed: 7000 + i, minutes: 1, preset: i % 2 ? 'growl' : 'sub' });
    planned += 2;
  }
  must(before === ahead(400), 'the deck\'s next events moved while other rooms were planned');

  // (3) And the set master's own: two sets in one process, each its own room,
  // neither one the other's leftovers.
  const mA = resolveSettings({ base: STYLE.base, room: PRESETS.sub.params });
  const mB = resolveSettings({ base: STYLE.base, room: PRESETS.growl.params });
  must(mA.master.airDb !== mB.master.airDb && mA.clap.on !== mB.clap.on,
    'two set masters resolved in one process do not differ where their rooms do');
  const cap = BASE_SETTINGS.levels.sub + BASE_SETTINGS.levels.subCeilingOverBaseDb;
  must(mA.levels.sub === cap && mB.levels.sub === cap,
    `the sub ceiling is not being applied: ${mA.levels.sub} and ${mB.levels.sub} against ${cap}`);
  return `sub, growl and sub again are bit-identical and three different objects; ${planned} plans in two rooms between a sub deck's ticks left its next 400 events, their gains and ${duckPoints} sidechain points identical; two masters differ in air and clap and both sit on the ${cap} dB sub ceiling`;
});

// --- the set plan is what a hand-over writes --------------------------------
//
// Round E's claim, and the reason `seamCurves` may be pure: a seam invents
// nothing at the instant it is written. Every point the two decks and the sum
// are given is a point the set plan already states, in the order it states
// them, and every hole cut in an event list is a hole it already named.
//
// It is checked against `tools/program.ts`'s own `sets` — the recording decks
// the committed digest's seam curves come from — so what is compared is the
// plan against the lock, over the three golden masters, and not two readings of
// the same expression.
check('the set plan is what a hand-over writes', () => {
  let seams = 0, points = 0, holes = 0;
  for (const m of Object.keys(GOLDEN_THEMES)) {
    const themes = GOLDEN_THEMES[m];
    const L = setLayout(m, themes, MIX_DEFAULTS);
    // The stand-ins the tool records with sit on the layout's own clock, so the
    // instants below are the instants it wrote.
    const decks = L.plans.map((track, i) => ({ track, program: programOf(track), clock: L.clock, startBeat: L.clock.beatAt(L.starts[i]) }));
    const written = seamProgram(m, themes);
    const rows = written.curves.slice();
    let at = 0;
    for (const s of L.seams) {
      seams++;
      const from = decks[s.from];
      const to = decks[s.to];
      const plan = seamCurves({
        at: s.at,
        bars: s.bars,
        barSeconds: s.barSeconds,
        swapAt: s.swapAt,
        filterMove: to.track.filterMove,
        outgoingBar: from.track.barSeconds,
        swapInFrom: deckThemeTime(from, s.swapAt),
        swapInTo: deckThemeTime(to, s.swapAt),
        sumGain: 1,
      }, MIX_DEFAULTS);
      must(plan.at === s.at && plan.end === s.end && plan.swapAt === s.swapAt,
        `master ${m} seam ${s.from}: the plan puts it at ${plan.at}/${plan.swapAt}/${plan.end} where the layout says ${s.at}/${s.swapAt}/${s.end}`);
      for (const line of plan.lines) {
        // The name the recorder gives the parameter. A deck's own channel is
        // `deckN.fader.gain`; its graph's bass send is `deckN.sub.dry.gain`,
        // which is the path `buses.sub.dry.gain` with the bus table's own
        // prefix off it.
        const p = line.deck === 'sum' ? 'mix.gain'
          : `deck${line.deck === 'from' ? s.from : s.to}.${line.param.replace(/^buses\./, '')}`;
        // A seam written from its own start folds nothing: every line opens
        // with one `set` at or after that instant, so the rows are the points.
        const before = line.points.filter((pt) => pt.t <= s.at);
        must(before.length <= 1 && (!before.length || before[0].k === 'set'),
          `master ${m} seam ${s.from}: ${p} has ${before.length} points at or before the seam begins`);
        for (const pt of line.points) {
          const row = rows.shift();
          must(row, `master ${m} seam ${s.from}: the seam wrote nothing for ${p} at ${pt.t}`);
          must(row.p === p && row.op === pt.k && row.t === pt.t && row.v === pt.v,
            `master ${m} seam ${s.from}: the plan says ${p} ${pt.k} ${pt.v} at ${pt.t} and the seam wrote ${row.p} ${row.op} ${row.v} at ${row.t}`);
          points++;
        }
      }
      for (const hole of plan.holes) {
        const deck = written.gaps[hole.deck === 'from' ? s.from : s.to];
        const list = hole.group === MIX_DEFAULTS.swapGroup ? deck.kickGaps : deck.subGaps;
        const want = hole.gap.map((v) => (Number.isFinite(v) ? v : String(v)));
        must(list.some((g) => g[0] === want[0] && g[1] === want[1]),
          `master ${m} seam ${s.from}: the ${hole.group} hole the plan cuts in deck ${hole.deck} — ${want.join(' to ')} — is not one the seam cut`);
        holes++;
      }
      at = s.end;
    }
    must(!rows.length, `master ${m}: the seams wrote ${rows.length} points the plan does not state`);
    must(at >= 0, 'unreachable');
  }
  return `${seams} hand-overs over 3 masters: every one of ${points} points is a point the set plan states, in its order, and every one of ${holes} holes in the low end is one it named`;
});

// --- one scheduling contract ------------------------------------------------
//
// Round E's other claim. A program says what a theme plays in its own seconds;
// a grid says where those seconds land on the clock a context is playing it on;
// `schedule` is the only thing that puts the two together, and the live pump,
// the single-theme player and both renders all ask it. So the two directions
// are worth saying out loud: a whole theme scheduled is the program's own event
// list, and the program's event list is what a whole theme schedules.
check('the one scheduling contract', () => {
  let events = 0, windows = 0, dropped = 0, leads = 0;
  for (const program of GOLDEN_PROGRAMS) {
    // Forwards: the whole of it, at no offset, is the events themselves, in
    // the order they are visited in — the list's own, except that an
    // anticipatory voice comes where its onset puts it (the reconciled review
    // of 09-24, R1): onsets never fall, and every event is there once.
    const all = schedule(program, offsetGrid(0));
    must(all.events.length === program.events.length,
      `a whole theme schedules ${all.events.length} of ${program.events.length} events`);
    must(all.next === program.events.length, `the cursor stops at ${all.next} of ${program.events.length}`);
    must(new Set(all.events.map((s) => s.pe)).size === program.events.length, 'a whole theme visits an event twice');
    for (let i = 0; i < all.events.length; i++) {
      const s = all.events[i];
      must(s.pe === visitAt(program, i), `event ${i} of a whole theme is not the program's own`);
      must(i === 0 || s.pe.onset >= all.events[i - 1].pe.onset, `event ${i} is visited before an event whose onset is earlier`);
      must(s.at === s.pe.onset, `event ${i} is scheduled at ${s.at} where its onset is ${s.pe.onset}`);
      if (s.pe.lead > 0) leads++;
    }
    // And backwards: the same theme filled a horizon at a time — the way a deck
    // is pumped — reaches every event exactly once, in the same order, at the
    // same instant, whatever the window.
    const offset = 11.25;
    const grid = offsetGrid(offset);
    const seen = [];
    let cursor = 0;
    for (let t = 0; cursor < program.events.length; t += 0.37) {
      const run = schedule(program, grid, cursor, offset + t);
      for (const s of run.events) seen.push(s);
      cursor = run.next;
      windows++;
      must(t < program.duration + 60, 'a theme did not finish being scheduled');
    }
    must(seen.length === program.events.length,
      `filling a horizon at a time reached ${seen.length} of ${program.events.length} events`);
    for (let i = 0; i < seen.length; i++) {
      must(seen[i].pe === all.events[i].pe, `event ${i} came out of the windows in the wrong order`);
      must(seen[i].at === all.events[i].pe.onset + offset,
        `event ${i} landed at ${seen[i].at} rather than ${all.events[i].pe.onset + offset}`);
    }
    events += program.events.length;
  }
  // A hole is a hole and not a pause: the events inside it are dropped and the
  // cursor still passes them, which is what a seam does to a low end it is
  // handing over.
  const program = GOLDEN_PROGRAMS[0];
  const group = MIX_DEFAULTS.swapGroup;
  const holed = schedule(program, offsetGrid(0, { [group]: [[0, 40]] }));
  const inside = program.events.filter((e) => e.gap === group && e.t >= 0 && e.t < 40).length;
  must(inside > 0, 'the theme the hole was cut in has nothing in it to drop');
  must(holed.events.length === program.events.length - inside,
    `a hole over the first forty seconds dropped ${program.events.length - holed.events.length} events where ${inside} belong to the ${group} hand-over`);
  must(holed.next === program.events.length, 'a hole stopped the cursor');
  dropped = inside;
  // The horizon is inclusive. An event whose onset is exactly the instant a
  // deck is filling to is filled now and not on the tick after it, which is a
  // beat's worth of difference at the wrong end of a look-ahead.
  let on = -1;
  for (let k = 201; k < program.events.length; k++) {
    const e = visitAt(program, k);
    if (!e.lead && e.onset !== visitAt(program, k - 1).onset) { on = k; break; }
  }
  must(on > 0, 'no event to fill a horizon exactly to');
  const upTo = schedule(program, offsetGrid(0), 0, visitAt(program, on).onset);
  must(upTo.next > on,
    `filling to ${visitAt(program, on).onset} exactly stopped at event ${upTo.next}, short of the event at ${on} whose onset that is`);

  // **An anticipatory voice is visited when its onset comes into reach**, and
  // not when its arrival does: a live pump filling 120 ms ahead on a 25 ms tick
  // reaches every swell of the golden themes at or before its onset, and a
  // start at that onset begins with it. Walking the list as it is written
  // reached each one 1.5 to 1.7 s late, all of them (R1).
  let reached = 0, worst = -Infinity;
  for (const p of GOLDEN_PROGRAMS) {
    let cursor = 0;
    for (let now = 0; cursor < p.events.length; now += 0.025) {
      const run = schedule(p, offsetGrid(0), cursor, now + 0.12);
      for (const s of run.events) if (s.pe.lead > 0) { reached++; worst = Math.max(worst, now - s.pe.onset); }
      cursor = run.next;
    }
    for (const e of p.events) if (e.lead > 0) {
      const k = firstEvent(p, e.onset);
      must(visitAt(p, k).onset >= e.onset && schedule(p, offsetGrid(0), k, e.onset).events.some((s) => s.pe === e),
        `a start at the anticipatory onset ${e.onset.toFixed(3)} does not begin with the event that starts there`);
    }
  }
  must(reached === leads, `the pump reached ${reached} of ${leads} anticipatory events`);
  must(!(worst > 1e-9), `an anticipatory event was reached ${worst.toFixed(3)} s after its onset`);
  return `14 themes: ${events} events schedule as themselves in the order they are visited at no offset and one for one over ${windows} windows at an offset, and all ${leads} anticipatory ones are reached at or before their onset by a 120 ms pump; a hole over forty seconds drops ${dropped} events of the ${group} hand-over and stops nothing`;
});

// --- live and offline schedule the same theme -------------------------------
//
// The same program, over the same window, on a deck's grid and on a render's:
// the set's clock maps a theme's seconds through beats and the render maps them
// through an offset, and what they schedule has to be the same events at the
// same instants. The browser suite has the live half of this against a real
// deck; this is the arithmetic, in node, over a golden theme.
check('live and offline schedule the same window', () => {
  const program = GOLDEN_PROGRAMS[0];
  const start = 4.5;
  const clock = makeSetClock(program.beat, 0);
  // A deck, as far as a grid is concerned: a theme on the set's clock, its
  // first bar at the beat the start instant falls on. The two mappings are the
  // deck's own (`packages/engine/src/deck.ts`), so what is compared is a set clock against an
  // offset and not two copies of one formula.
  const deck = { program, clock, startBeat: clock.beatAt(start) };
  const live = { at: (t) => deckContextTime(deck, t), time: (t) => deckThemeTime(deck, t), gaps: null };
  const offline = offsetGrid(start);
  let worst = 0, n = 0;
  let cursor = 0;
  for (let to = start; cursor < program.events.length; to += 0.12) {
    const a = schedule(program, live, cursor, to);
    const b = schedule(program, offline, cursor, to);
    must(a.next === b.next, `the two grids stop at different events: ${a.next} and ${b.next}`);
    must(a.events.length === b.events.length, 'the two grids schedule different numbers of events');
    for (let i = 0; i < a.events.length; i++) {
      must(a.events[i].pe === b.events[i].pe, 'the two grids schedule different events');
      worst = Math.max(worst, Math.abs(a.events[i].at - b.events[i].at));
      n++;
    }
    cursor = a.next;
  }
  must(n === program.events.length, `${n} events compared of ${program.events.length}`);
  must(worst < 1e-9, `a deck and a render put the same event ${(worst * 1000).toFixed(6)} ms apart`);
  return `seed 1 theme 0: ${n} events filled a 120 ms horizon at a time on the set's clock and on a render's offset land on the same instants to ${(worst * 1e9).toFixed(2)} ns`;
});

// --- the seams, over nine hundred pairs ------------------------------------
// A theme hands over in its last quarter, on a sixteen-bar line, and never
// inside the blend the theme before it is still finishing. The old rule — "the
// last breakdown past 55%" — put seed 15576's third theme on bar 144 of 240 and
// its own build, drop and last four minutes were never heard alone.
// Three quarters, written here rather than read out of src/mix.ts: a check
// that takes its threshold from the thing it is checking passes whatever the
// threshold becomes, which is how the old rule — the last breakdown past 55% —
// would have slipped back in without a word. A deliberate change to the floor
// is a deliberate change to this line as well.
const SEAM_QUARTER = 0.75;
check('the seam floor, 900 pairs', () => {
  must(SEAM_FLOOR === SEAM_QUARTER, `the style puts the seam floor at ${SEAM_FLOOR * 100}% where this check is written against ${SEAM_QUARTER * 100}%`);
  let pairs = 0, under = 0, off = 0, small = 0, overlap = 0;
  let lowest = { pct: 2 };
  for (let seed = 1; seed <= 100; seed++) {
    const L = setLayout(seed, 10);
    for (let i = 0; i < L.seams.length; i++) {
      const s = L.seams[i];
      pairs++;
      if (s.pct < SEAM_QUARTER - 1e-9) under++;
      if (!s.onLine) off++;
      if (s.boundary !== MIX_DEFAULTS.boundaryBars) small++;
      if (i > 0 && s.at < L.seams[i - 1].end - 1e-9) overlap++;
      if (s.pct < lowest.pct) lowest = { pct: s.pct, seed, theme: i, bar: s.bar };
    }
  }
  must(pairs === 900, `${pairs} pairs swept, not 900`);
  must(!under, `${under} seams begin before ${SEAM_QUARTER * 100}% of their theme`);
  must(!off, `${off} seams are off a ${MIX_DEFAULTS.boundaryBars}-bar line`);
  must(!overlap, `${overlap} seams begin inside the blend before them`);
  must(!small, `${small} seams fell back to a line shorter than ${MIX_DEFAULTS.boundaryBars} bars`);
  return `${pairs} pairs, none under ${SEAM_QUARTER * 100}%, none off a ${MIX_DEFAULTS.boundaryBars}-bar line, none inside the blend before it; the earliest is seed ${lowest.seed} theme ${lowest.theme} at bar ${lowest.bar}, ${(lowest.pct * 100).toFixed(1)}%`;
});

// --- a hand-over from here --------------------------------------------------
// Every seam above is *planned*: `seamPlan` says which bar of a theme hands
// over before a note is played. Since 09-19 a hand can ask for one from where
// the record is — a cast, a spell — and `seamFromHere` is the arithmetic of it
// (Eugene: "once the machine is started it never stops"). Three properties,
// swept over four hundred asks: it lands on a line and never behind the floor
// it was given, it never waits more than one line, and the blend is what gives
// way when there is no room, never the line.
//
// The longest a hand-asked hand-over may run is written here rather than read
// off the mix, for the reason the seam floor is: a check that takes its bound
// from the thing it is checking passes whatever the bound becomes. The rule is
// one phrase past the swap — the low end changes hands `swapAfterBars` into any
// blend, so past twice that the theme it replaced is lingering over music that
// has already replaced it.
const HAND_OVER_MOST = 16;
check('a hand-over from here lands on a line', () => {
  must(MIX_DEFAULTS.swapAfterBars * 2 === HAND_OVER_MOST,
    `the style swaps ${MIX_DEFAULTS.swapAfterBars} bars in, so a hand-asked blend is ${MIX_DEFAULTS.swapAfterBars * 2} bars where this check is written against ${HAND_OVER_MOST}`);
  let asks = 0, offLine = 0, behind = 0, waited = 0, tooShort = 0, tooLong = 0, tooFar = 0;
  let shortest = { bars: Infinity };
  const at = [0, 0.004, 0.13, 0.37, 0.5, 0.62, 0.755, 0.9, 0.97, 0.999];
  for (let seed = 1; seed <= 40; seed++) {
    const from = planTheme(String(seed), 0, {});
    const into = planTheme(String(seed + 1000), 0, {});
    for (const f of at) {
      const here = f * from.bars * from.barSeconds;
      for (const unit of [1, 4]) {
        const s = seamFromHere(from, here, into, { unit, most: HAND_OVER_MOST });
        asks++;
        if (s.bar % unit !== 0 || Math.abs(s.at - s.bar * from.barSeconds) > 1e-9) offLine++;
        if (s.at < here - 1e-9) behind++;
        if (s.at - here > unit * from.barSeconds + 1e-9) waited++;
        if (s.bars < 2) tooShort++;
        if (s.bars > HAND_OVER_MOST) tooLong++;
        // The blend may run past the end of the theme handing over — nothing
        // waits for a theme to finish — but never past the arriving theme.
        if (s.bars > Math.floor(into.bars / 2)) tooFar++;
        if (s.bars < shortest.bars) shortest = { bars: s.bars, seed, f, unit, bar: s.bar, of: from.bars };
      }
    }
  }
  must(asks === 800, `${asks} asks swept, not 800`);
  must(!offLine, `${offLine} hand-overs begin off the line they were asked for`);
  must(!behind, `${behind} hand-overs begin behind the floor they were given`);
  must(!waited, `${waited} hand-overs wait more than one line`);
  must(!tooShort, `${tooShort} blends are shorter than two bars`);
  must(!tooLong, `${tooLong} blends run longer than ${HAND_OVER_MOST} bars`);
  must(!tooFar, `${tooFar} blends run past half the theme arriving`);
  return `${asks} asks over 40 pairs, on a bar line and on a phrase line: none off the line, `
    + `none behind the floor, none waiting more than one line, and every blend between 2 and ${HAND_OVER_MOST} bars — `
    + `the shortest is seed ${shortest.seed} asked ${(shortest.f * 100).toFixed(1)}% in, at bar ${shortest.bar} of ${shortest.of}, ${shortest.bars} bars`;
});

// --- a spell is a value, and a link -----------------------------------------
// The two properties the never-stop transport reads a spell by: asking for the
// spell a set is already under must plan nothing, and what the address bar
// carries must be what was asked for. Both are by *value* and both treat a bird
// that is not named as the house, which is the rule `isHouse` already follows.
// --- the session journal ----------------------------------------------------
// `notes/archive/2026-09-plans/cited/PLAN-BIRDS-UX.md` §3b, and the one piece of step 1c that is pure
// arithmetic: what a press does to the walk, and what an arrival does to it.
// The transport is not here at all — the journal plays nothing and asks nothing
// of a mix — so every rule of it can be swept rather than driven in a browser,
// and the scenarios are left to answer the thing only a browser can, which is
// whether the music stopped.
check('back and forward walk the journal, and nothing is removed', () => {
  const bin = () => {
    const held = new Map();
    return {
      getItem: (k) => (held.has(k) ? held.get(k) : null),
      setItem: (k, v) => held.set(k, v),
      removeItem: (k) => held.delete(k),
      get raw() { return held; },
    };
  };
  const place = (seed, theme = 0, strategy = 'house-v1') => ({ seed, theme, strategy, spell: null });
  // A press and the music answering it, in the order they really happen.
  const press = (j, way) => {
    const m = way === 'back' ? j.back() : j.forward();
    return m;
  };

  // 1. A journal with nothing in it is the transport it always was: both
  //    presses fall through to the set's own neighbours.
  const fresh = createJournal({ store: bin() });
  must(press(fresh, 'forward').kind === 'set', 'forward on an empty journal claims an entry');
  must(press(fresh, 'back').kind === 'set', 'back on an empty journal claims an entry');

  // 2. A set playing writes one entry per theme, in order.
  const j = createJournal({ store: bin() });
  j.arrived(place('15576', 0));
  for (let i = 1; i <= 3; i++) { press(j, 'forward'); j.arrived(place('15576', i)); }
  must(j.entries.length === 4 && j.at === 3, `four themes played and the journal is ${j.entries.length} long at ${j.at}`);

  // 3. Two casts, then back, back: the first seed's own theme, and nothing
  //    removed. (Eugene's gate, in the journal's own terms.)
  press(j, 'forward'); j.arrived(place('92970', 0));
  press(j, 'forward'); j.arrived(place('21323', 0));
  const full = j.entries.length;
  const walkedBack = [];
  for (const _ of [0, 1]) {
    const m = press(j, 'back');
    must(m.kind === 'entry', 'a back with entries behind it fell through to the set');
    j.arrived(m.entry);
    walkedBack.push(`${m.entry.seed}#${m.entry.theme}`);
  }
  must(j.entries.length === full, `walking back changed the journal's length to ${j.entries.length} from ${full}`);
  must(walkedBack.join(' ') === '92970#0 15576#3', `back, back walked ${walkedBack.join(' ')}`);
  must(j.here.seed === '15576' && j.here.theme === 3 && j.at === 3,
    `back, back lands on ${j.here.seed}#${j.here.theme} at ${j.at}`);

  // 4. ...and forward, forward returns, along the same entries.
  const walkedOn = [];
  for (const _ of [0, 1]) {
    const m = press(j, 'forward');
    must(m.kind === 'entry', 'a forward with an entry ahead fell through to the set');
    j.arrived(m.entry);
    walkedOn.push(`${m.entry.seed}#${m.entry.theme}`);
  }
  must(walkedOn.join(' ') === '92970#0 21323#0', `forward, forward walked ${walkedOn.join(' ')}`);
  must(j.entries.length === full, 'walking forward wrote an entry');

  // 5. A theme that arrives while the pointer is not at the end goes in after
  //    the pointer and pushes the rest along: nothing is removed, and the two
  //    moves stay each other's inverse.
  const mid = createJournal({ store: bin() });
  mid.arrived(place('a', 0));
  press(mid, 'forward'); mid.arrived(place('a', 1));
  press(mid, 'forward'); mid.arrived(place('a', 2));
  press(mid, 'back'); mid.arrived(mid.entries[1]);
  mid.arrived(place('b', 0));   // a cast from the middle of the walk
  must(mid.entries.length === 4, `a cast from the middle left ${mid.entries.length} entries, not 4`);
  must(mid.entries.map((e) => `${e.seed}#${e.theme}`).join(' ') === 'a#0 a#1 b#0 a#2',
    `the walk reads ${mid.entries.map((e) => `${e.seed}#${e.theme}`).join(' ')}`);
  const there = press(mid, 'forward');
  must(there.kind === 'entry' && there.entry.seed === 'a' && there.entry.theme === 2,
    'forward past a cast made mid-walk does not reach what was ahead of it');

  // 6. A place arrived at twice is written once: a pause and a play cannot
  //    make a second entry of the same theme.
  const twice = createJournal({ store: bin() });
  must(twice.arrived(place('x', 0)) === 'written' && twice.arrived(place('x', 0)) === 'already',
    'the same theme was written into the journal twice');

  // 7. A back before the first entry, and a forward after the last, extend the
  //    journal at that end — which is why the two moves are inverses wherever
  //    the pointer stands.
  const ends = createJournal({ store: bin() });
  ends.arrived(place('s', 4));
  must(press(ends, 'back').kind === 'set', 'back before the first entry claimed one');
  ends.arrived(place('s', 3));
  must(ends.at === 0 && ends.entries.length === 2 && ends.entries[0].theme === 3,
    `back past the start put the theme at ${ends.at} of ${ends.entries.length}`);
  must(press(ends, 'forward').entry.theme === 4, 'forward does not return to where back came from');

  // 8. An evening has a length. Past the cap the oldest fall off the front and
  //    the pointer moves with them; what is kept is the end of the evening.
  const long = createJournal({ store: bin() });
  long.arrived(place('p', 0));
  for (let i = 1; i < JOURNAL_CAP + 50; i++) { press(long, 'forward'); long.arrived(place('p', i)); }
  must(long.entries.length === JOURNAL_CAP, `${long.entries.length} entries kept against a cap of ${JOURNAL_CAP}`);
  must(long.here.theme === JOURNAL_CAP + 49 && long.at === JOURNAL_CAP - 1, 'the pointer did not move with the trim');
  must(long.entries[0].theme === 50, `the oldest kept is theme ${long.entries[0].theme}`);

  // 9. It survives a reload for the length of a session, and not past one; and
  //    a walk that is not on the place this page is starting from is somebody
  //    else's and is left where it is.
  const store = bin();
  let clock = Date.parse('2026-09-19T21:00:00Z');
  const night = createJournal({ store, now: () => clock });
  night.arrived(place('15576', 0));
  press(night, 'forward'); night.arrived(place('92970', 0));
  press(night, 'back'); night.arrived(night.entries[0]);
  must(store.raw.has(JOURNAL_KEY), `the journal is not under ${JOURNAL_KEY}`);
  const back = createJournal({ store, now: () => clock + 20 * 60 * 1000 });
  must(back.load(place('15576', 0)), 'a reload twenty minutes later lost the journal');
  must(back.entries.length === 2 && back.at === 0, `the reload came back at ${back.at} of ${back.entries.length}`);
  must(back.hasForward && !back.hasBack, 'the pointer came back somewhere else');
  const elsewhere = createJournal({ store, now: () => clock + 20 * 60 * 1000 });
  must(!elsewhere.load(place('77777', 0)), "a link somebody sent picked up another session's walk");
  const tomorrow = createJournal({ store, now: () => clock + (SESSION_HOURS + 1) * 3600 * 1000 });
  must(!tomorrow.load(place('15576', 0)), `a journal ${SESSION_HOURS + 1} hours old is still read as tonight's`);

  // 10. And over a rolled walk, back and forward are exactly each other's
  //     inverse: however the evening went, n backs and n forwards land where
  //     they started.
  const rng = new Rng('check::journal');
  let pairs = 0;
  for (let t = 0; t < 200; t++) {
    const w = createJournal({ store: bin() });
    w.arrived(place(String(rng.int(1, 9)), 0));
    for (let i = 0; i < 12; i++) {
      const m = press(w, rng.chance(0.35) ? 'back' : 'forward');
      if (m.kind === 'entry') w.arrived(m.entry);
      else if (rng.chance(0.4)) w.arrived(place(String(rng.int(1, 9)), rng.int(0, 5)));
      else w.arrived(place(w.here.seed, Math.max(0, w.here.theme + m.by)));
    }
    const was = `${w.here.seed}#${w.here.theme}`;
    const len = w.entries.length;
    let steps = 0;
    while (w.hasBack && steps < 6) { const m = w.back(); w.arrived(m.entry); steps++; }
    for (let i = 0; i < steps; i++) { const m = w.forward(); w.arrived(m.entry); }
    must(`${w.here.seed}#${w.here.theme}` === was, `${steps} backs and ${steps} forwards landed on ${w.here.seed}#${w.here.theme}, not ${was}`);
    must(w.entries.length === len, `walking there and back changed the journal's length from ${len} to ${w.entries.length}`);
    pairs += steps;
  }
  return `a journal with nothing in it falls through to the set both ways; two casts then back, back lands on 92970#0 then 15576#3 `
    + `with the walk still ${full} entries long and forward, forward returning along the same two; a cast made mid-walk goes in after the pointer `
    + `and pushes what was ahead of it along; the same theme is never written twice; ${JOURNAL_CAP} entries are kept of ${JOURNAL_CAP + 50} `
    + `with the pointer carried and the oldest dropped; a reload twenty minutes on comes back at the same entry, a link of another seed picks up nothing, `
    + `and a walk ${SESSION_HOURS + 1} hours old is last night's; and over 200 rolled evenings ${pairs} backs and the same number of forwards `
    + `all land where they started with nothing added or removed`;
});

check('a spell set twice is the same spell, and a spell is a link', () => {
  must(sameSpell(null, HOUSE), 'nothing asked for is not the house');
  must(sameSpell({}, {}) && sameSpell({}, HOUSE), 'an empty spell is not the house');
  must(sameSpell({ ember: HOUSE.ember }, null), 'a bird at the house is not the house');
  must(!sameSpell({ veil: 0.85 }, null), 'a bird pulled reads as the house');
  must(!sameSpell({ veil: 0.85 }, { veil: 0.85, loom: 0.4 }), 'a second bird pulled makes no difference');
  must(sameSpell({ veil: 0.85, loom: 0.4 }, { loom: 0.4, veil: 0.85 }), 'the order of the birds matters');
  must(spellQuery(null) === null && spellQuery(HOUSE) === null && spellQuery({}) === null,
    `the house writes ${spellQuery(HOUSE)} into a link`);
  // Every partial spell a pull can make, round-tripped through the address bar
  // and back: three decimals is the finest a cell can be pulled to.
  const rng = new Rng('check::spell-link');
  let trips = 0;
  for (let i = 0; i < 400; i++) {
    const spell = {};
    for (const b of BIRDS) if (rng.chance(0.4)) spell[b] = Math.round(rng.float(0, 1) * 1000) / 1000;
    const text = spellQuery(spell);
    const back = parseSpell(text);
    const named = BIRDS.filter((b) => spell[b] !== undefined && spell[b] !== HOUSE[b]);
    must(sameSpell(back, spell), `${text} parses back as ${JSON.stringify(back)} against ${JSON.stringify(spell)}`);
    must((text ? text.split(',').length : 0) === named.length,
      `${named.length} birds are off the house and the link names ${text}`);
    if (text) trips++;
  }
  // **And a link is written the way a person writes one** (UX-1's bugs round):
  // a literal colon between a bird and its value, a literal comma between the
  // pairs, two decimals with the zeros kept, and the birds in the compass order.
  const hand = spellQuery({ ember: 1, tide: 0.3 });
  must(hand === 'em:1.00,ti:0.30', `a hand's two birds write the link ${hand}`);
  must(spellQuery({ loom: 0.6, gleam: 0.05 }) === 'gl:0.05,lo:0.60',
    'a link names its birds out of the compass order');
  // A value no hand asked for is a value a spell was rolled to, and it is
  // carried in full rather than rounded onto the nearest hundredth: the address
  // bar is the record, and a record that quantised on the way in would play
  // something else when it was opened.
  const rolled = spellQuery({ veil: 0.4837293 });
  must(parseSpell(rolled).veil === 0.4837293, `a rolled value goes into a link as ${rolled}`);
  // and it survives the trip through `URLSearchParams`, which is what the page
  // reads its own address back with
  // **The reader accepts both spellings** — the plain one this writes and the
  // escaped one every link anybody has already made carries, which arrives
  // decoded and is the same eight characters by the time a spell is read off it.
  const plain = new URLSearchParams(`spell=${hand}`);
  const escaped = new URLSearchParams('spell=ember%3A1.00%2Ctide%3A0.30');
  must(sameSpell(parseSpell(plain.get('spell')), parseSpell(escaped.get('spell'))),
    'a plainly written link and an escaped one are not the same spell');
  must(parseSpell(plain.get('spell')).ember === 1 && parseSpell(plain.get('spell')).tide === 0.3,
    'a plainly written link does not parse back');
  must(sameSpell(parseSpell('ember=1.00;tide=0.30'), parseSpell('ember:1.00,tide:0.30')),
    'the reader does not accept both a colon and an equals sign');
  return `${trips} of 400 rolled pulls carry into a link and parse back to the same spell by value; `
    + `a hand's spell is written ${hand} — literal colon, literal comma, two decimals, compass order — `
    + `a rolled value goes in full at ${rolled}, `
    + `a bird at the house is never written, the house is no link at all, and a spell that names its birds in another order is the same spell`;
});

// --- one grid through a blend ----------------------------------------------
// The review's counterexample: master seed 1's first pair, 104 into 104.1. The
// hand-over falls 18.461538 s after the seam and the arriving theme's eighth
// bar used to fall 17.7 ms before it, so the downbeat the bass changes hands on
// was excluded and the first kick came 559 ms late. The set now counts one
// grid, pinned for the length of the blend.
check('the set clock through a hand-over', () => {
  const plans = [0, 1].map((i) => planTheme('1', i, {}));
  const clock = makeSetClock(plans[0].beat, 0);
  const at = 100;
  const startBeat = clock.beatAt(at);
  const barSeconds = clock.pin(startBeat) * 4;
  const bar = (n) => clock.timeAt(startBeat + n * 4) - at;
  const handoff = MIX_DEFAULTS.swapAfterBars * barSeconds;
  const errorMs = (bar(MIX_DEFAULTS.swapAfterBars) - handoff) * 1000;
  const ownMs = (MIX_DEFAULTS.swapAfterBars * plans[1].barSeconds - handoff) * 1000;
  const longMs = (bar(64) - 64 * barSeconds) * 1000;
  must(Math.abs(errorMs) < 1e-6, `the arriving theme's swap bar misses the hand-over by ${errorMs.toFixed(4)} ms`);
  must(Math.abs(longMs) < 1e-6, `a 64-bar blend accumulates ${longMs.toFixed(4)} ms of offset`);
  must(Math.abs(ownMs) > 1, 'the two themes are at the same tempo, so this proves nothing; pick a pair that is not');
  return `seed 1's first pair at ${plans[0].bpm} into ${plans[1].bpm} BPM: the swap downbeat coincides to ${errorMs.toFixed(6)} ms where the arriving theme's own tempo would miss it by ${ownMs.toFixed(2)}, and a 64-bar blend accumulates ${longMs.toFixed(6)}`;
});

check('the tempo glide after a hand-over', () => {
  const plans = [0, 1].map((i) => planTheme('1', i, {}));
  const clock = makeSetClock(plans[0].beat, 0);
  const b = clock.beatAt(50);
  const bars = MIX_DEFAULTS.tempoGlideBars ?? 16;
  clock.glide(b, plans[1].beat, bars * 4);
  const bpmAt = (beat) => 60 / clock.spbAt(beat);
  must(Math.abs(bpmAt(b) - plans[0].bpm) < 0.01, `the glide starts at ${bpmAt(b).toFixed(3)}, not ${plans[0].bpm}`);
  must(Math.abs(bpmAt(b + bars * 4) - plans[1].bpm) < 0.01, `the glide ends at ${bpmAt(b + bars * 4).toFixed(3)}, not ${plans[1].bpm}`);
  must(Math.abs(bpmAt(b + bars * 8) - plans[1].bpm) < 0.01, 'the glide does not stay at the tempo it reached');
  let last = -Infinity;
  for (let k = 0; k <= bars * 8; k += 2) {
    const t = clock.timeAt(b + k);
    must(t > last, `the clock is not monotonic at beat ${k}`);
    last = t;
  }
  const trip = clock.beatAt(clock.timeAt(b + 37.5)) - (b + 37.5);
  must(Math.abs(trip) < 1e-6, `beatAt(timeAt()) is ${trip} beats off inside the glide`);
  return `${plans[0].bpm} to ${plans[1].bpm} over ${bars} bars, linear in BPM, monotonic, and beatAt(timeAt()) is exact to ${Math.abs(trip).toExponential(1)} beats`;
});

// --- the push curve writes its zero before a drop --------------------------
// `applyCurve` joins points with ramps, so a drop that wrote one point at its
// own downbeat and nothing before it ramped from wherever the section before
// had left off. On master seed 1 theme 2 that was eleven bars of breakdown
// driven into the drop: the quietest section in the theme measured 4 LU over
// the loudest mains, with no kick in it.
const MASTERS = ['1', '92970', '21323', '15576', '25417', '68299'];
const THEMES = 4;
const curveAt = (pts, bar) => {
  if (bar <= pts[0].bar) return pts[0].value;
  for (let i = 1; i < pts.length; i++) {
    if (bar > pts[i].bar) continue;
    const a = pts[i - 1], b = pts[i];
    const span = b.bar - a.bar;
    return span > 0 ? a.value + (b.value - a.value) * ((bar - a.bar) / span) : b.value;
  }
  return pts[pts.length - 1].value;
};
check('a drop writes its own zero first', () => {
  let drops = 0, afterBuild = 0, ramped = null, worst = 0;
  for (const m of MASTERS) {
    for (let i = 0; i < THEMES; i++) {
      const t = planTheme(m, i, {});
      const pts = pushCurve(t.arrangement, BASE_SETTINGS.push);
      for (let k = 1; k < pts.length; k++)
        must(pts[k].bar > pts[k - 1].bar, `master ${m} theme ${i}: the push curve has two points at bar ${pts[k].bar}`);
      const secs = t.arrangement.sections;
      for (let k = 0; k < secs.length; k++) {
        const s = secs[k];
        if (s.kind !== 'drop') continue;
        const prev = secs[k - 1];
        if (prev && prev.kind === 'build') { afterBuild++; continue; }
        drops++;
        const before = curveAt(pts, s.startBar - 1);
        if (before > worst) { worst = before; ramped = { m, i, bar: s.startBar, prev: prev && prev.kind }; }
        must(before <= 0.01,
          `master ${m} theme ${i}: the push reads ${before.toFixed(3)} a bar before the drop at ${s.startBar}, which follows a ${prev ? prev.kind : 'nothing'}`);
        must(Math.abs(curveAt(pts, s.startBar) - BASE_SETTINGS.push.dropLevel) < 1e-9,
          `master ${m} theme ${i}: the drop at bar ${s.startBar} does not reach ${BASE_SETTINGS.push.dropLevel} on its downbeat`);
      }
    }
  }
  return `${MASTERS.length * THEMES} themes: ${drops} drops that no build precedes all read ${worst.toFixed(3)} a bar before their downbeat and the drop level on it, and ${afterBuild} more ride a build in`;
});

// --- the event list is a list a scheduler can pour ---------------------------
check('the events of 24 themes', () => {
  let n = 0, worstLead = 0;
  for (const m of MASTERS) {
    for (let i = 0; i < THEMES; i++) {
      const t = planTheme(m, i, {});
      const bs = t.barSeconds;
      must(Number.isFinite(bs) && bs > 0, `master ${m} theme ${i} has a bar of ${bs} seconds`);
      let last = -Infinity;
      for (const e of t.events) {
        n++;
        const where = `master ${m} theme ${i}, ${e.voice} at bar ${e.bar}`;
        must(VOICES[e.voice], `${where}: no such voice`);
        must(typeof e.layer === 'string' && e.layer, `${where}: no layer, and the solo-stem renders filter on it`);
        must(Number.isFinite(e.t) && e.t >= 0, `${where}: its time is ${e.t}`);
        must(e.t >= last - 1e-9, `${where}: it comes at ${e.t} after an event at ${last}`);
        last = e.t;
        must(Number.isFinite(e.bar) && e.bar >= 0 && e.bar < t.bars, `${where}: bar ${e.bar} of ${t.bars}`);
        const into = e.t - e.bar * bs;
        must(into >= -1e-9 && into < bs + 1e-9, `${where}: it says bar ${e.bar} and falls ${into.toFixed(4)} s into a ${bs.toFixed(4)} s bar`);
        must(e.t <= t.bars * bs + 1e-6, `${where}: it falls past the end of the theme`);
        for (const k of Object.keys(e.p || {})) {
          const v = e.p[k];
          must(typeof v !== 'number' || Number.isFinite(v), `${where}: p.${k} is ${v}`);
        }
        // An anticipatory voice's time is its arrival and it has to be able
        // to start where its own descriptor says it does. Which voices those
        // are is the registry's answer: `anticipates` is the lead, and a check
        // that named the swell would pass whatever the catalogue became.
        const lead = BY_NAME[e.voice].anticipates?.(e.p) ?? 0;
        must(Number.isFinite(lead) && lead >= 0, `${where}: a lead of ${lead}`);
        if (lead > worstLead) worstLead = lead;
      }
    }
  }
  return `${n} events over ${MASTERS.length * THEMES} themes: every voice known, every layer named, every time finite, in order, inside its own bar and inside the theme; the longest anticipatory onset leads its arrival by ${worstLead.toFixed(2)} s`;
});

// --- the dice, and how far a throw reaches ----------------------------------
// The ring's own constants live in src/ring.ts, which is a page module and
// cannot be imported here. They are mirrored below and the mirror is checked
// against the source text, so the two cannot drift apart quietly.
const RING = fs.readFileSync(path.join(ROOT, 'src', 'ring.ts'), 'utf8');
const CANDIDATES = 12;
const TAP_BAND = 0.5;
const SEED_MIN = 1;
const SEED_MAX = 99999;
// **A throw is a clear attempt, and a plain roll** (Eugene, 09-23): the star
// casts on a release past forty degrees of turn and sixty screen pixels of
// travel, and lands on a random seed rather than on a rank of style distance.
const SPIN_CAST_DEG = 40;
const SPIN_CAST_PX = 60;
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

check('the ring\'s cast constants', () => {
  const want = [
    [`const CANDIDATES = ${CANDIDATES};`, 'the pool size'],
    [`const TAP_BAND = ${TAP_BAND};`, 'where a tap reaches'],
    [`const SEED_MIN = ${SEED_MIN};`, 'the first seed'],
    [`const SEED_MAX = ${SEED_MAX};`, 'the last seed'],
    [`const SPIN_CAST_DEG = ${SPIN_CAST_DEG};`, 'the turn a throw must pass'],
    [`const SPIN_CAST_PX = ${SPIN_CAST_PX};`, 'the travel a throw must pass'],
  ];
  for (const [line, what] of want)
    must(RING.includes(line), `${what} has moved in src/ring.ts: this file still expects \`${line}\``);
  return `${want.length} of them still read in src/ring.ts exactly as they are mirrored here`;
});

// The compass, mirrored the same way and for the same reason: where the eight
// cells stand round the star is the ceremonial order of `notes/diagrams/birds.md`
// and not the order the dice are rolled in, and which bird a cell is belongs to
// the die and not to the point it stands at. Both tables live in the page module
// and are read off its text here.
//
// Clockwise from north. The four elements hold the quarters and the four moods
// sit on the diagonals between their own kin, which is what makes the star's two
// squares separate matter from mood — the last column is checked, not assumed.
//
// **Upside down since 09-23** (Eugene: *"bass is gravity and gravity pulls
// things to the bottom"*): Ember north, Root south, Loom and Gleam down with
// Root, Veil and Spark up with Ember, Zephyr and Tide still east and west. A
// vertical mirror keeps every neighbour, so both of the order's gains below hold
// as they did.
const COMPASS = [
  ['bpm', 'ember', 'Ember', 'element'],
  ['figures', 'spark', 'Spark', 'mood'],
  ['timbre', 'zephyr', 'Zephyr', 'element'],
  ['key', 'gleam', 'Gleam', 'mood'],
  ['preset', 'root', 'Root', 'element'],
  ['density', 'loom', 'Loom', 'mood'],
  ['wet', 'tide', 'Tide', 'element'],
  ['fx', 'veil', 'Veil', 'mood'],
];

check('the eight cells stand in the compass order', () => {
  const cells = [...RING.matchAll(/\{\s*id:\s*'([a-z]+)',\s*layer:\s*'([a-zA-Z]+)'\s*\}/g)].map((m) => m[1]);
  must(cells.join(' ') === COMPASS.map((c) => c[0]).join(' '),
    `the star reads ${cells.join(', ')} clockwise from north where the compass says ${COMPASS.map((c) => c[0]).join(', ')}`);
  // and the bird each cell is, off the same file's own table
  for (const [id, bird, name] of COMPASS) {
    const row = new RegExp(`${id}:\\s*\\{\\s*key:\\s*'${bird}',\\s*name:\\s*'${name}',\\s*means:\\s*'([^']+)'`).exec(RING);
    must(row, `src/ring.ts does not say that the ${id} cell is ${name}`);
    must(row[1].length > 6 && row[1] === row[1].toLowerCase(),
      `${name}'s meaning reads ${JSON.stringify(row[1])}, which is not the one line birds.md gives it`);
  }
  // The gain the order was taken for: the star's even vertices are exactly the
  // four elemental birds and its odd ones exactly the four moods, so the two
  // squares the ring already draws say which is which without a word added.
  const even = COMPASS.filter((_, i) => i % 2 === 0).map((c) => c[3]);
  const odd = COMPASS.filter((_, i) => i % 2 === 1).map((c) => c[3]);
  must(even.every((k) => k === 'element') && odd.every((k) => k === 'mood'),
    'the star\'s two squares no longer separate matter from mood');
  // And the tie the tempo is derived across is an edge of the octagon.
  const iE = COMPASS.findIndex((c) => c[1] === 'ember');
  const iS = COMPASS.findIndex((c) => c[1] === 'spark');
  must(Math.abs(iE - iS) === 1 || Math.abs(iE - iS) === 7,
    `Ember stands at ${iE} and Spark at ${iS}, which is not one edge of the octagon`);
  // **And gravity pulls down.** Root, the low end, stands at the bottom and
  // Ember, the fire, at the top — and out is more on every bird, so Root pulled
  // out is pulled *down*, which is the most bass, and pushed up into the core
  // is nearly none: *"things float in the air"*.
  must(COMPASS[0][1] === 'ember' && COMPASS[4][1] === 'root', `${COMPASS[0][2]} stands north and ${COMPASS[4][2]} south`);
  must(COMPASS[2][1] === 'zephyr' && COMPASS[6][1] === 'tide', 'Zephyr and Tide left east and west');
  // (since K30 read off Root's own bands, the words the ring says, where the
  // pole words nothing read were kept for this line alone)
  const rootBands = (LABEL_TABLE.birds.root.bands || []).map((x) => x.word);
  must(rootBands[0] === 'thin' && rootBands[rootBands.length - 1] === 'heavy',
    `Root's bands run ${rootBands.join(' → ')} outward, which is not more low end outward`);
  return `${COMPASS.length} cells clockwise from north — ${COMPASS.map((c) => c[2]).join(', ')} — elements on the even vertices, moods on the odd, Ember beside Spark, `
    + `and Root at the bottom, its words ${rootBands.join(' → ')} outward`;
});

// **Round K13: every big label answers its own bird, and the lines tell the
// truth.** The labels (`src/bird-labels.ts`) cut the quantity each bird biases
// at thresholds solved from the composer; the influence table
// (`src/bird-influence.ts`) is the spell layer's biases against the dice each
// cell reads, and `tools/birds-matrix.json` is the measurement it is held to
// (`node tools/birds-memo.ts --matrix-json tools/birds-matrix.json`).
check('every bird\'s big word is a band of what it biases, cut where the composer switches, and moves at both walls', () => {
  const v2 = strategyById('house-v2').style;
  const bands = bandsOf(v2);
  const said = [];
  for (const b of BIRDS) {
    const row = LABEL_TABLE.birds[b];
    if (!row.bands) { must(row.big.plan, `${b} has neither bands nor a plan reading`); continue; }
    const cut = bands[b];
    for (const band of cut.slice(0, -1)) {
      must(Number.isFinite(band.upTo) && Number.isFinite(band.birdAt) && band.birdAt > 0 && band.birdAt < 1 && band.from,
        `${b}'s ${band.word} is cut at ${band.upTo} (${band.birdAt}) from "${band.from}"`);
    }
    for (let k = 1; k < cut.length - 1; k++) must(cut[k].upTo > cut[k - 1].upTo, `${b}'s bands do not rise`);
    const at = (v) => bandAt(b, { ...HOUSE, [b]: v }, v2).word;
    const [lo, home, hi] = [at(0), at(HOUSE[b]), at(1)];
    must(lo !== home && hi !== home && lo !== hi, `${b} reads ${lo} / ${home} / ${hi} at 0, the house and 1`);
    // and a band is a function of the bird's own value: no other bird moves it
    for (const o of BIRDS) if (o !== b) for (const v of [0, 1]) must(bandAt(b, { ...HOUSE, [o]: v }, v2).word === home, `${o} at ${v} moves ${b}'s word`);
    said.push(`${b} ${cut.map((x) => x.word + (x.birdAt != null ? ` <${percentShown(b, x.birdAt)}%` : '')).join(' ')}`);
  }
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'birds-matrix.json'), 'utf8'));
  for (const b of BIRDS) must(Math.min(...m.ownBigHouse[b]) >= 60, `${b}'s own big word moves on ${m.ownBigHouse[b].join(' and ')} % of seeds at its walls`);
  return `${said.join('; ')}; own big word at the walls ${BIRDS.map((b) => `${b} ${m.ownBigHouse[b].join('/')}`).join(', ')} % of seeds`;
});

// **Round K28: Spark's words are what the hats play, not what the dice
// rolled.** The hat analysis found 26925 theme 3 at ember 0.49, gleam and spark
// at the rim saying "eighths, 6 hits" off the rolled mask while the offbeat lane
// played four a bar; the subtitle is now read off the program. Held here with
// a count made independently of the reader: over the main section's bars, the
// distinct steps of the hats layer, the count most bars share — across the
// golden themes at the house and the spells the ring's scenarios play.
// **Round K30: a line names a part only where the program plays it** (the
// reviews of 09-26). Read independently of the labels' own reader: the drum
// lanes' events, the composition's record of what it drew, and the keys layer's
// voices — against every bird's sentence, over the golden fourteen at the house
// and the spells the reviews found the faults under (the benchmark's, Ember
// under the drums' edge with Spark and Tide at their walls, the Ambient key,
// and the walls of the birds whose bands name parts).
check('every part a bird\'s sentence names plays in the theme, and with the drums off no line says a beat', () => {
  const v2 = strategyById('house-v2').style;
  const spells = [null, { ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 }, { ember: 0.1 }, { ember: 0.1, spark: 1 }, { ember: 0.1, tide: 1 },
    { ember: 0.1, spark: 0, tide: 0.85, zephyr: 0.1, root: 0.5, veil: 0.3, loom: 0.8 }, { spark: 0.05 }, { spark: 0.4 }, { spark: 0.9 }, { gleam: 0 }, { gleam: 1 }, { loom: 0 }, { loom: 1 }, { root: 1 }, { ember: 0.1, root: 1 }, { tide: 1 }, { veil: 0 }, { veil: 1 }];
  const claims = [
    [/rolling hands/, (t) => t.sel.percussion === 'rolling', 'rolling hands'],
    [/hand percussion/, (t) => !!t.sel.percussion, 'hand percussion'],
    [/breaks kit/, (t) => t.drums && (t.sel['figure-groove'] || t.kit === 'breaks'), 'the breaks kit'],
    [/backbeat/, (t) => t.drums && !!t.sel['receding-backbeat'], 'a receding backbeat'],
    [/(?<!no )\bpedals?\b/, (t) => t.sel.harmony === 'pedal' || /pedal/.test(t.sel.bass || ''), 'a pedal'],
    // (Loom's loops say there is no pedal: since S9 its form under LOOPS_FORM draws no bass pedal)
    [/\bno pedal\b/, (t) => !/pedal/.test(t.sel.bass || ''), 'the absence of a bass pedal'],
    [/eight-bar pedals/, (t) => t.sel.bass === 'long-pedal', 'the long pedal'],
    [/\barch(es|ing)\b/, (t) => /arch/.test(t.sel.figure || '') || /arch|answer/.test(t.sel.ornament || ''), 'an arch'],
    [/drone up front/, (t) => t.scene === 'drone-forward', 'the drone in front'],
    [/drone behind/, (t) => t.scene === 'drone-back', 'the drone behind'],
    [/ornaments/, (t) => !!t.sel.ornament, 'an ornament'],
    [/a pulse/, (t) => !!t.sel.pulse, 'a pulse'],
  ];
  let n = 0, themes = 0, drumless = 0, keysWrong = 0;
  const seen = new Map();
  for (const spell of spells) for (const [seed, i] of [['1', 0], ['1', 3], ['92970', 1], ['21323', 2], ['3', 0], ['7', 0], ['18', 0], ['26925', 3]]) {
    const t = planTheme(seed, i, { preset: 'auto', strategy: 'house-v2', ...(spell ? { spell } : {}) });
    themes++;
    const trace = t.dice.composition ? JSON.parse(t.dice.composition) : { selected: {} };
    const facts = { sel: trace.selected || {}, scene: trace.scene, kit: trace.context?.kit, drums: t.events.some((e) => e.layer === 'kick' || e.layer === 'hats' || e.layer === 'clap') };
    const theme = { ...t, plan: [], spell: spell || undefined };
    if (!facts.drums) drumless++;
    for (const b of BIRDS) {
      if (b === 'zephyr') continue;   // its words are a timbre's name ("a pulse lead"), held below
      const says = sentenceOf(b, theme, v2) + ' ' + shortOf(b, theme, v2);
      for (const [re, holds, what] of claims) if (re.test(says)) { n++; must(holds(facts), `${seed}#${i} ${JSON.stringify(spell)}: ${b} says "${says}" and the theme plays no ${what}`); seen.set(what, (seen.get(what) || 0) + 1); }
      if (!facts.drums && b !== 'ember') must(!/\b(beat|backbeat|kick|four on the floor)\b/i.test(says) || /no beat/i.test(says), `${seed}#${i} ${JSON.stringify(spell)}: with no drum in the theme ${b} says "${says}"`);
    }
    // the keys Zephyr names play in the keys layer, or it says none play
    const keys = new Set(t.events.filter((e) => e.layer === 'keys').map((e) => (e.p && typeof e.p.preset === 'string' ? e.p.preset : e.voice)));
    const z = cellReading('zephyr', theme, v2).word;
    const named = [...keys].some((k) => timbrePhrase(k) && sentenceOf('zephyr', theme, v2).includes(timbrePhrase(k)));
    if (!(keys.size ? named : z === 'no keys')) keysWrong++;
    must(keys.size ? named : z === 'no keys', `${seed}#${i} ${JSON.stringify(spell)}: Zephyr says "${sentenceOf('zephyr', theme, v2)}" where the keys layer plays ${[...keys].join(', ') || 'nothing'}`);
  }
  return `${themes} themes under ${spells.length} spells (${drumless} with no drum at all): ${n} part claims, every one on a theme that plays it (${[...seen].map(([k, v]) => `${k} ${v}`).join(', ')}), no beat said where no drum plays, and Zephyr naming a keyboard that plays in every theme`;
});

check('Spark\'s subtitle counts the hats that play in the main, not the hits of the rolled mask', () => {
  const v2 = strategyById('house-v2').style;
  const cases = [
    ...['1', '92970', '21323'].flatMap((seed) => [0, 1, 2, 3].concat(seed === '1' ? [4, 5] : []).map((i) => ({ seed, i, spell: null }))),
    { seed: '26925', i: 3, spell: { ember: 0.49, gleam: 1, spark: 1 } },
    // the two poles `POLES` names further down, written out: that table is declared after this check runs
    { seed: '1', i: 0, spell: { ...HOUSE, ember: 0, spark: 0, tide: 0.92, veil: 0.85, loom: 0.9, root: 0.5, zephyr: 0.8 } },
    { seed: '1', i: 0, spell: { ...HOUSE, ember: 0.92, spark: 0.9, tide: 0.25, loom: 0.35, root: 0.85, veil: 0.5, gleam: 0.15 } },
    { seed: '51757', i: 0, spell: { ember: 0.16, tide: 1, root: 0.81, loom: 1 } },
    { seed: '27191', i: 11, spell: { ember: 0.10, tide: 0.85, zephyr: 0.01, root: 0.50, veil: 0.30, spark: 0, loom: 0.80 } },
    { seed: '15576', i: 0, spell: null },
  ];
  const said = [];
  let masksOff = 0;
  for (const c of cases) {
    const t = planTheme(c.seed, c.i, { preset: 'auto', strategy: 'house-v2', ...(c.spell ? { spell: c.spell } : {}) });
    const perBar = new Map();
    for (const e of t.events) if (e.layer === 'hats' && e.step != null) { if (!perBar.has(e.bar)) perBar.set(e.bar, new Set()); perBar.get(e.bar).add(e.step); }
    const mainBars = t.timeline.filter((r) => /main/i.test(r.section) && perBar.has(r.bar)).map((r) => r.bar);
    const pool = mainBars.length ? mainBars : [...perBar.keys()];
    const counts = new Map();
    for (const b of pool) { const k = [...perBar.get(b)].sort((x, y) => x - y).join(','); counts.set(k, (counts.get(k) || 0) + 1); }
    const modal = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const playing = modal ? modal[0].split(',').filter(Boolean).length : 0;
    const sub = cellReading('spark', { ...t, plan: [], spell: c.spell || undefined }, v2).sub;
    const n = Number((sub.match(/(\d+) hits?/) || [])[1]);
    must(n === playing, `${c.seed}#${c.i}${c.spell ? ' under a spell' : ''}: Spark says "${sub}" where the hats play ${playing} a bar in the main`);
    const rolled = String(t.dice.hatMask).split('').filter((x) => x === 'x').length;
    if (rolled !== playing) masksOff++;
    said.push(`${c.seed}#${c.i}${c.spell ? '*' : ''} ${playing}`);
  }
  return `${cases.length} themes (the golden fourteen at the house, and ${cases.length - 14} under the scenarios' spells, marked *): Spark's count is the hats' hits a bar in the main every time (${said.join(', ')}); the rolled mask would have said otherwise on ${masksOff}`;
});

check('every band of every bird says what the music is in one plain sentence and in five words at most, with no pole word in either', () => {
  const v2 = strategyById('house-v2').style;
  const all = allSentences();
  const bad = new RegExp(`\\b(${BANNED_WORDS.join('|')})\\b`, 'i');
  for (const x of all) {
    must(x.says && x.says.trim().length > 8, `${x.bird} (${x.where}) has no sentence`);
    const hit = bad.exec(x.says);
    must(!hit, `${x.bird} (${x.where}) says "${x.says}", which carries "${hit && hit[1]}"`);
  }
  // and the short line the panel and the track show: five words at most, no pole word, never the locked reading
  for (const x of allShorts()) {
    must(x.short && x.short.trim().length > 2, `${x.bird} (${x.where}) has no short line`);
    const n = x.short.replace(/\{[a-z]+\}/g, 'x').trim().split(/\s+/).length;
    must(n <= 5, `${x.bird} (${x.where}) says "${x.short}" in ${n} words, where five is the most`);
    const hit = bad.exec(x.short);
    must(!hit, `${x.bird} (${x.where}) says "${x.short}", which carries "${hit && hit[1]}"`);
  }
  // K14, Eugene's copy: say what it is — never "the record" (a listener does
  // not know one), "answering hands", "the field" or a "may"; and his word
  // "pedal" stays where it stood
  const vague = /\b(the record|record's|answering hands|hands answer|field|may)\b/i;
  for (const x of [...all.map((y) => ({ ...y, line: y.says })), ...allShorts().map((y) => ({ ...y, line: y.short }))]) {
    const hit = vague.exec(x.line);
    must(!hit, `${x.bird} (${x.where}) says "${x.line}", which carries "${hit && hit[1]}"`);
  }
  // K19: and what each control means, as the panel and the screen reader say it, never "bird"
  const meansBird = [...RING.matchAll(/means: '([^']*)'/g)].map((m) => m[1]).filter((m) => /\bbirds?\b/i.test(m));
  must(!meansBird.length, `a control's meaning says bird: ${meansBird.join(', ')}`);
  const pedals = all.filter((x) => /\bpedals?\b/i.test(x.says)).map((x) => `${x.bird} ${x.where}`);
  must(pedals.length >= 2, `"pedal" stands in ${pedals.length} sentences (${pedals.join(', ')}), where Gleam's held band and Loom's long one say it`);
  // every band has one, and every family of Ember's
  for (const b of BIRDS) for (const band of bandsOf(v2)[b]) must(band.says && band.short, `${b}'s ${band.word} has no sentence or no short line`);
  // K15: every band leans both ways, each lean its own line and sentence; and a
  // bird dragged across its middle band reads three lines before its word turns
  for (const b of BIRDS) for (const band of bandsOf(v2)[b]) {
    must(band.lean && band.lean.low.short && band.lean.high.short && band.lean.low.says && band.lean.high.says, `${b}'s ${band.word} does not lean both ways`);
    const lines = new Set([band.short, band.lean.low.short, band.lean.high.short]);
    must(lines.size === 3, `${b}'s ${band.word} leans to a line it already says`);
    must(band.from0 != null && band.to0 != null && band.to0 > band.from0, `${b}'s ${band.word} has no span to lean in`);
  }
  const leanWalk = (bird) => {
    const seen = [];
    for (let v = 0; v <= 1.0001; v += 0.01) {
      const sp = { ...HOUSE, [bird]: +v.toFixed(2) };
      const band = bandAt(bird, sp, v2);
      if (band.word !== bandsOf(v2)[bird][1].word) continue;
      const line = shortOf(bird, { ...t0, spell: sp }, v2);
      if (seen[seen.length - 1] !== line) seen.push(line);
    }
    return seen;
  };
  const t0 = (() => { const t = planTheme('1', 0, { masterSeed: '1', strategy: 'house-v2' }); return { bpm: t.bpm, key: t.key.name, presetName: t.presetLabel, preset: 'auto', dice: t.dice, bars: t.bars, plan: t.arrangement.sections }; })();
  for (const b of BIRDS) if (bandsOf(v2)[b].length) must(leanWalk(b).length === 3, `${b} across its middle band reads ${JSON.stringify(leanWalk(b))}`);
  // K15: every timbre the four keys lists of every strategy can draw has its
  // phrase, so no new timbre ships as "a vibes"
  const lacking = [];
  for (const id of STRATEGY_IDS) {
    const cat = strategyById(id).style.catalogue;
    if (!cat) continue;
    for (const l of candidateLists(cat)) if (['leadTimbres', 'sustainedLeads', 'padPartners', 'stabPartners'].includes(l.id)) for (const v of l.list()) if (!LABEL_TABLE.timbres[String(v)]) lacking.push(`${id} ${l.id} ${v}`);
  }
  must(!lacking.length, `timbres the keys can draw with no phrase: ${lacking.join(', ')}`);
  const wrongArticle = Object.values(LABEL_TABLE.timbres).filter((v) => /^a [aeiou]/i.test(v) || (/^an [^aeiou]/i.test(v) && !/^an FM\b/.test(v)));
  must(!wrongArticle.length, `a timbre phrase with the wrong article: ${wrongArticle.join(', ')}`);
  for (const k of Object.keys(LABEL_TABLE.birds.ember.family)) must(LABEL_TABLE.birds.ember.says[k], `Ember's ${k} has no sentence`);
  // and a real theme reads whole: a sentence at each wall of each bird
  const t = planTheme('1', 0, { masterSeed: '1', strategy: 'house-v2' });
  const theme = (spell) => ({ spell, bpm: t.bpm, key: t.key.name, presetName: t.presetLabel, preset: 'auto', dice: t.dice, bars: t.bars, plan: t.arrangement.sections });
  const said = [];
  for (const b of BIRDS) for (const v of [0, HOUSE[b], 1]) {
    const line = sentenceOf(b, theme({ ...HOUSE, [b]: v }), v2);
    must(line && !bad.test(line) && !/\{|undefined|null/.test(line), `${b} at ${v} reads "${line}"`);
    if (v === 1) said.push(line);
  }
  return `${all.length} sentences over ${BIRDS.length} birds, none with ${BANNED_WORDS.join(', ')}; at the rim on seed 1: ${said.join(' / ')}`;
});

check('the influence lines are the model\'s, held to the measured matrix both ways', () => {
  const v2 = strategyById('house-v2').style;
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'birds-matrix.json'), 'utf8'));
  const edges = edgesOf(v2);
  const has = (a, b) => edges.some((e) => e.from === a && e.to === b);
  const missing = [], unmeasured = [];
  for (const a of INFLUENCE_COMPASS) for (const b of INFLUENCE_COMPASS) {
    if (a === b) continue;
    if (m.house[a][b] >= 25 && !has(a, b)) missing.push(`${a}→${b} ${m.house[a][b]} %`);
  }
  for (const e of edges) if (!(Math.max(m.house[e.from][e.to], m.loose[e.from][e.to]) > 0)) unmeasured.push(`${e.from}→${e.to} via ${e.via.join(', ')}`);
  must(!missing.length, `measured on a quarter of the seeds or more and not declared: ${missing.join('; ')}`);
  // K14: and under the bar too, nothing is left unexplained. The two that
  // stood under it since K13 — Ember on Gleam's chords (8 % at the house,
  // through the figure that opens above 110 BPM, which the harmony pedal
  // requires) and Ember at 0 on Tide's section count (10 %, through the short
  // outro R38 gives only a theme with drums) — are rules of the composer, and
  // declared: Gleam reads the tempo family and Tide whether the drums are on.
  // An influence measured on any seed is declared, or named here with why.
  const EXPLAINED: Record<string, string> = {};
  const unexplained = [];
  for (const a of INFLUENCE_COMPASS) for (const b of INFLUENCE_COMPASS) {
    if (a === b || has(a, b) || EXPLAINED[`${a}→${b}`]) continue;
    if (m.house[a][b] > 0 || m.loose[a][b] > 0) unexplained.push(`${a}→${b} ${m.house[a][b]}/${m.loose[a][b]} %`);
  }
  must(!unexplained.length, `measured and neither declared nor explained: ${unexplained.join('; ')}`);
  must(!unmeasured.length, `declared and never measured: ${unmeasured.join('; ')}`);
  // every read names a die the spell layer knows, so a typo is not a missing edge
  const known = new Set(Object.values(biasesOf(v2)).flatMap((x) => [...x]));
  const lists = new Set(v2.candidates.map((r) => `list.${r.id}`));
  for (const b of BIRDS) for (const d of LABEL_TABLE.birds[b].reads) must(known.has(d) || lists.has(d), `${b} reads ${d}, which nothing in the spell layer names`);
  // round K13b: a dashed line is the octagon's own weight, one constant pair read by both
  must(/const THIN_LINE = \{ w: [\d.]+, op: [\d.]+ \};/.test(RING)
    && /\{ w: THIN_LINE\.w, op: THIN_LINE\.op, hw: /.test(RING)
    && /const dotW = \(\) => THIN_LINE\.w \* starK;/.test(RING)
    && /'stroke-linecap': 'butt', opacity: DASH_OP,/.test(RING)
    && !/linkMask/.test(RING),
    'the dashed lines and the octagon do not share THIN_LINE\'s weight, or the dashes are still masked at the centre');
  // K14: a dash's opacity is its own, one constant, so a dash reads 3:1 on the
  // black on the phone picture (the octagon's own stays THIN_LINE.op); and the
  // transport's ground is one alpha whatever the set is doing
  const dashOp = RING.match(/^const DASH_OP = ([\d.]+);$/m);
  const thinOp = RING.match(/const THIN_LINE = \{ w: [\d.]+, op: ([\d.]+) \};/);
  // (K24: and the focus mark, the ring's dash closed round a key, reads it too)
  must(dashOp && (RING.match(/\bDASH_OP\b/g) || []).length === 3 && /on && !quietFocus && \(visible \|\| lastInput === 'key'\) \? DASH_OP : 0/.test(RING) && +dashOp[1] > +thinOp[1] && +dashOp[1] <= 1,
    'the dashes and the focus mark do not read one DASH_OP of their own, over the octagon\'s and at most 1');
  const ground = RING.match(/^const CORE_GROUND = ([\d.]+);$/m);
  must(ground && +ground[1] === 0.55 && (RING.match(/class: 'ground'[^\n]*opacity: CORE_GROUND \}/g) || []).length === 1 && (RING.match(/class: 'ground'/g) || []).length === 1,
    'the transport\'s ground is not one CORE_GROUND of 0.55, written once');
  const links = linksOf(v2);
  const dotted = links.filter((l) => l.kind === 'dotted');
  // the frame is never downgraded: a declared pair two or one apart is its strong line
  for (const l of links) must((frameLine(l.a, l.b) ?? 'dotted') === l.kind, `${l.a}-${l.b} drawn ${l.kind}`);
  const name = (i) => INFLUENCE_COMPASS[i];
  return `${edges.length} declared edges over ${links.length} pairs, ${links.length - dotted.length} on the frame and ${dotted.length} dotted `
    + `(${dotted.map((l) => `${name(l.a)}–${name(l.b)}`).join(', ')}); every influence of 25 % or more declared and every declared edge measured `
    + `(${edges.map((e) => `${e.from}→${e.to} ${m.house[e.from][e.to]}/${m.loose[e.from][e.to]}`).join(', ')})`;
});

// The eight birds' glyphs, which are a committed table the page draws once per
// cell (`src/bird-glyph.ts`). Since 09-23 there is one drawing a bird and no
// morph, so what is held here is the grammar the page scales by multiplying
// every number — absolute M, L, C, Q and Z and nothing else, so no flag can be
// scaled — the box every point stays inside, and the three kinds of mark.
const GLYPHS = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'bird-glyphs.json'), 'utf8'));

check('every bird has one glyph, in the grammar and inside its box', () => {
  must(GLYPHS.kind === 'bird-glyphs' && GLYPHS.schema === 2 && GLYPHS.box === 13, 'bird-glyphs.json is not the one-drawing table');
  must(GLYPHS.birds.length === COMPASS.length, `${GLYPHS.birds.length} birds drawn against ${COMPASS.length} on the compass`);
  const drawn = GLYPHS.birds.map((b) => b.bird).sort();
  must(drawn.join(' ') === COMPASS.map((c) => c[1]).sort().join(' '), `the table draws ${drawn.join(', ')}`);
  must(!/morph|music|magic|points/.test(Object.keys(GLYPHS.birds[0]).join(' ')), 'a glyph still carries a second drawing');
  const half = GLYPHS.box / 2;
  let marks = 0;
  let widest = 0;
  let widestBird = '';
  // **And inside the node's circle**, not only its square (Eugene, 09-23: *"on
  // the wave to 1, lines cross the circle boundary"* — the square passed it).
  // The node is 20 ring units in radius and a glyph's box is drawn 1.7 of it
  // wide, so the circle is 7.65 of the box's units out; nothing drawn may
  // reach past 7.0, which leaves the ring's stroke and a hair of ground. The
  // drawn curve is sampled, not its control points, and every level of every
  // bird is held to it, not only the drawing a bird ships at the house.
  const RIM = 7.0;
  let reachMax = 0;
  let reachBird = '';
  const reach = (d) => {
    const t = d.match(/[MLCQZ]|-?\d*\.?\d+/g);
    let i = 0, cur = [0, 0], start = [0, 0], cmd = '', max = 0;
    const pt = () => [+t[i++], +t[i++]];
    const see = (x, y) => { max = Math.max(max, Math.hypot(x, y)); };
    while (i < t.length) {
      if (/[MLCQZ]/.test(t[i])) cmd = t[i++];
      if (cmd === 'M') { cur = pt(); start = cur; see(...cur); cmd = 'L'; }
      else if (cmd === 'L') { cur = pt(); see(...cur); }
      else if (cmd === 'C') {
        const a = pt(), b = pt(), c = pt();
        for (let k = 1; k <= 16; k++) {
          const u = k / 16, v = 1 - u;
          see(v * v * v * cur[0] + 3 * v * v * u * a[0] + 3 * v * u * u * b[0] + u * u * u * c[0],
            v * v * v * cur[1] + 3 * v * v * u * a[1] + 3 * v * u * u * b[1] + u * u * u * c[1]);
        }
        cur = c;
      } else if (cmd === 'Q') {
        const a = pt(), c = pt();
        for (let k = 1; k <= 16; k++) {
          const u = k / 16, v = 1 - u;
          see(v * v * cur[0] + 2 * v * u * a[0] + u * u * c[0], v * v * cur[1] + 2 * v * u * a[1] + u * u * c[1]);
        }
        cur = c;
      } else if (cmd === 'Z') cur = start;
    }
    return max;
  };
  const hold = (name, list) => {
    must(Array.isArray(list) && list.length > 0, `${name} has no marks`);
    for (const m of list) {
      const r = reach(m.d);
      must(r <= RIM + 1e-9, `${name}: a mark reaches ${r.toFixed(2)} from the centre, past the ${RIM} the node's circle allows`);
      if (r > reachMax) { reachMax = r; reachBird = name; }
    }
    for (const m of list) {
      marks++;
      must(/^M[-\d.\sMLCQZ]*$/.test(m.d), `${name}: ${m.d.slice(0, 40)} is not absolute M, L, C, Q and Z`);
      must(m.fill === undefined || m.fill === 'ground' || m.fill === 'ink', `${name}: a mark filled ${m.fill}`);
      const n = m.d.match(/-?\d*\.?\d+/g).map(Number);
      must(n.length % 2 === 0, `${name}: ${m.d.slice(0, 40)} has an odd count of numbers`);
      for (const v of n) {
        must(Math.abs(v) <= half + 1e-9, `${name}: ${v} is outside the ${GLYPHS.box}-unit box`);
        if (Math.abs(v) > widest) { widest = Math.abs(v); widestBird = name; }
      }
    }
  };
  for (const b of GLYPHS.birds) {
    const row = COMPASS.find((c) => c[1] === b.bird);
    must(b.name === row[2], `${b.bird} is drawn as ${b.name} and named ${row[2]} on the compass`);
    must(typeof b.label === 'string' && b.label.length > 0, `${b.name} says nothing about what it depicts`);
    hold(b.name, b.marks);
    // a bird may carry levels of its own drawing, keyed by its value in rising
    // order and ending at 1, and the drawing it ships is one of them
    if (b.variants) {
      let last = -1;
      for (const v of GLYPH_ROWS.find((r) => r.bird === b.bird).variants) {
        must(v.upTo > last && v.upTo <= 1, `${b.name}'s ${v.level} is keyed at ${v.upTo} after ${last}`);
        last = v.upTo;
        hold(`${b.name} (${v.level})`, v.marks);
      }
      must(last === 1, `${b.name}'s levels end at ${last}, not at 1`);
      must(b.variants.some((v) => JSON.stringify(v.marks) === JSON.stringify(b.marks)), `${b.name}'s drawing is none of its own levels`);
    }
  }
  // K15: a banded bird's level turns where its word does — at every band's
  // threshold, a hair either side, the level is the band's (or, for Tide's
  // four, the one the table maps it to), and each level is keyed to a band
  const v2g = strategyById('house-v2').style;
  const turned = [];
  for (const b of GLYPHS.birds) {
    if (!b.variants || !b.variants.some((v) => v.band != null)) continue;
    must(b.variants.every((v) => [].concat(v.band).every(Number.isInteger) && v.upTo === undefined), `${b.name}'s levels are keyed partly by band and partly by a number of their own`);
    const bands = bandsOf(v2g)[b.bird];
    const levelOfBand = (k) => b.variants.filter((v) => [].concat(v.band).includes(k)).map((v) => v.level);
    for (let k = 0; k < bands.length - 1; k++) {
      const at = bands[k].birdAt;
      const below = glyphLevelAt(b.bird, at - 1e-6), above = glyphLevelAt(b.bird, at + 1e-6);
      // (a level that draws both bands does not turn: Spark's bolt)
      if (levelOfBand(k).includes(above) && levelOfBand(k + 1).includes(above) && below === above) { turned.push(`${b.bird} ${below} across ${at.toFixed(3)}`); continue; }
      must(levelOfBand(k).includes(below) && levelOfBand(k + 1).includes(above), `${b.name} at its ${bands[k].word}/${bands[k + 1].word} edge (${at.toFixed(3)}) draws ${below} and ${above}`);
      turned.push(`${b.bird} ${below}|${above} at ${at.toFixed(3)}`);
    }
    // K30: and on the hundredth grid a hand can hold — the edges themselves
    // included — the glyph and the word are in one band (`<` against `<=` split
    // them at five edges)
    for (let h = 0; h <= 100; h++) {
      const v = h / 100;
      const word = bandAt(b.bird, { ...HOUSE, [b.bird]: v }, v2g).word;
      const k = bands.findIndex((x) => x.word === word);
      must(levelOfBand(k).includes(glyphLevelAt(b.bird, v)), `${b.name} at ${v.toFixed(2)} draws ${glyphLevelAt(b.bird, v)} under the word ${word}`);
    }
    // and inside a band the level never turns but where the table splits it
    for (let v = 0; v <= 1; v += 0.005) {
      const band = bands.findIndex((x) => x.birdAt == null || v < x.birdAt);
      must(levelOfBand(band).includes(glyphLevelAt(b.bird, v)), `${b.name} at ${v.toFixed(3)} draws ${glyphLevelAt(b.bird, v)} in its ${bands[band].word} band`);
    }
  }
  return `${turned.length} band edges where the glyph turns with the word (${turned.join(', ')}); `
    + `${GLYPHS.birds.length} birds, one drawing each and ${marks} marks in all (levels included), every one absolute M/L/C/Q/Z inside the ${GLYPHS.box}-unit box — the widest reaches ${widest} (${widestBird}) — and every level of every bird inside the node's circle, the furthest ${reachMax.toFixed(2)} of ${RIM} (${reachBird})`;
});

// --- the ring's colour ------------------------------------------------------
// `src/ring-colour.ts` is the port of the function `notes/diagrams/colours.md`
// was drawn with, and these are that file's own tests, moved here because a
// file that checks itself only when somebody runs it is not checked. The states
// are the sheet's: every single pull, both poles, both measured rooms, all 256
// corners of the house box and four thousand rolls of the whole space.
const PAGE = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');

// The two poles PLAN-MAGIC-V2 names, written as the birds that move.
const POLES = {
  ambient: { ...HOUSE, ember: 0, spark: 0, tide: 0.92, veil: 0.85, loom: 0.9, root: 0.5, zephyr: 0.8 },
  breaks: { ...HOUSE, ember: 0.92, spark: 0.9, tide: 0.25, loom: 0.35, root: 0.85, veil: 0.5, gleam: 0.15 },
};
// The fourteen golden themes as the calibration imprinted them
// (`notes/analysis/imprint-calibration.md` §1): ember, tide, zephyr, root,
// gleam, veil, spark, loom. They are the record itself, and the whole argument
// for `SFULL` is that all fourteen stay gold.
const GOLDEN_READINGS = [
  ['1#0', 0.39, 0.43, 0.57, 0.71, 0.32, 0.33, 0.54, 0.57],
  ['1#1', 0.34, 0.08, 0.69, 0.76, 0.42, 0.22, 0.56, 0.53],
  ['1#2', 0.38, 0.52, 0.24, 0.71, 0.34, 0.52, 0.26, 0.58],
  ['1#3', 0.42, 0.59, 0.43, 0.78, 0.42, 0.56, 0.34, 0.56],
  ['1#4', 0.39, 0.54, 0.40, 0.72, 0.29, 0.51, 0.29, 0.63],
  ['1#5', 0.36, 0.45, 0.42, 0.75, 0.39, 0.28, 0.57, 0.52],
  ['92970#0', 0.44, 0.69, 0.35, 0.69, 0.27, 0.40, 0.29, 0.61],
  ['92970#1', 0.38, 0.43, 0.58, 0.86, 0.23, 0.37, 0.55, 0.57],
  ['92970#2', 0.53, 0.65, 0.28, 0.78, 0.40, 0.48, 0.18, 0.58],
  ['92970#3', 0.45, 0.78, 0.29, 0.72, 0.41, 0.56, 0.24, 0.56],
  ['21323#0', 0.20, 0.53, 0.31, 0.67, 0.21, 0.52, 0.25, 0.62],
  ['21323#1', 0.42, 0.69, 0.41, 0.76, 0.37, 0.46, 0.19, 0.60],
  ['21323#2', 0.46, 0.58, 0.27, 0.66, 0.34, 0.42, 0.24, 0.65],
  ['21323#3', 0.39, 0.73, 0.30, 0.67, 0.38, 0.50, 0.26, 0.58],
].map(([label, ember, tide, zephyr, root, gleam, veil, spark, loom]) =>
  ({ label, spell: { ember, tide, zephyr, root, gleam, veil, spark, loom } }));

check('the house is the page\'s own gold, to the byte', () => {
  // the table the module carries is the gradient the page draws
  const stops = [...PAGE.matchAll(/<stop offset="([\d.]+)" stop-color="(#[0-9a-f]{6})" \/>/g)];
  must(stops.length === 4, `the page draws ${stops.length} gradient stops, where it has one gradient of four`);
  const gold = stops.slice(0, 4);
  GOLD_STOPS.forEach((s, i) => {
    must(+gold[i][1] === s.off && gold[i][2] === s.hex,
      `the page's #gold stop ${i} is ${gold[i][1]} ${gold[i][2]} where ring-colour.ts says ${s.off} ${s.hex}`);
  });
  // **One gradient** (09-23): nothing on the ring is cut in a gold that stays
  // put when the spell moves, so the second gradient and its class are gone
  // from the page and from the module, and nothing names them.
  must(!/goldFixed|goldBright/.test(PAGE) && !/goldFixed|goldBright/.test(RING),
    'the page or the ring still names a gradient that does not walk with the spell');
  must(new RegExp(`--pale: ${PALE};`).test(PAGE) && /--gold: #f2c14e;/.test(PAGE),
    'the stylesheet\'s two type tokens are not the gold and the pale gold the module re-bases');
  // and the function at the house is that gradient, to the byte
  const house = ringColour(HOUSE);
  must(house.hex === GOLD_STOPS[BASE].hex, `the house reads ${house.hex}, not ${GOLD_STOPS[BASE].hex}`);
  house.stops.forEach((s, i) => must(s.hex === GOLD_STOPS[i].hex,
    `the house's stop ${i} is ${s.hex}, not ${GOLD_STOPS[i].hex}`));
  // nothing asked for is the house, and so is the house written out by hand
  must(ringColour(null).hex === house.hex && ringColour({}).hex === house.hex, 'an unasked ring is not the gold');
  // Every fixed colour the ring inks is re-based by the same rule, and at the
  // house every one of them comes back the hex the page has always carried:
  // this is what the byte-for-byte compare of the two builds rests on.
  const inked = [...new Set([...RING.matchAll(/'(?:stroke|fill)', '(#[0-9a-f]{6})'\);/g)].map((m) => m[1]))];
  must(inked.length >= 6, `${inked.length} marks in src/ring.ts are drawn in the derived colour`);
  for (const hex of inked) must(restyle(hex, house) === hex,
    `at the house ${hex} re-bases to ${restyle(hex, house)}`);
  return `the page's four stops, the module's four, and ${inked.length} inked marks — ${inked.join(' ')} — all unmoved at the house`;
});

check('every colour the ring can wear clears the floor', () => {
  const states = [];
  for (const b of BIRDS) for (const v of [0, 0.15, 0.5, 0.85, 1]) states.push({ ...HOUSE, [b]: v });
  states.push(POLES.ambient, POLES.breaks);
  // and the middle of every row of the library, which is where a `?recipe=`
  // actually puts the ring
  for (const row of LIBRARY) {
    const box = boxOf(row);
    const mid = {};
    for (const b of BIRDS) mid[b] = (box[b][0] + box[b][1]) / 2;
    states.push(mid);
  }
  for (let i = 0; i < 256; i++) {          // every corner of the measured box
    const s = { ...HOUSE };
    BIRDS.forEach((b, k) => { s[b] = HOUSE[b] + ((i >> k) & 1 ? HOUSE_BOX[b] : -HOUSE_BOX[b]); });
    states.push(s);
  }
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 4000; i++) {         // and four thousand rolls of the space
    const s = {};
    for (const b of BIRDS) s[b] = rnd();
    states.push(s);
  }
  let worst = Infinity;
  let worstHex = '';
  // **And the type over every one of them** (the 09-20 switch's reading, the only
  // reading since 09-23). It is ink on this page, so it is swept exactly
  // where the line work and the gradient are swept rather than checked once at
  // the two colours somebody happened to look at. Two things are asked of it:
  // that it clears its own floor, which is the line work's; and that it is
  // never *darker* than the ink it is a tint of, because a tint that came out
  // dimmer than the lines around it would not be a tint at all.
  let worstType = Infinity;
  let worstTypeHex = '';
  let worstLift = Infinity;
  // **Under both palettes** (09-23): the warm one ships and the sheet's is one
  // line away, so the floor is held for whichever the switch says.
  for (const pal of Object.values(PALETTES)) for (const s of states) {
    const c = ringColour(s, pal);
    must(c.L >= K.LMIN - 1e-9 && c.L <= K.LMAX + 1e-3, `the lightness left the band at ${c.L}`);
    must(c.contrast >= K.INK_FLOOR, `the ink ${c.hex} reads ${c.contrast.toFixed(2)}:1, under the floor of ${K.INK_FLOOR}`);
    for (const st of c.stops) {
      const ct = contrastOnBlack(st.hex);
      if (ct < worst) { worst = ct; worstHex = st.hex; }
      must(ct >= K.STOP_FLOOR - 1e-9, `the stop ${st.hex} reads ${ct.toFixed(2)}:1, under the floor of ${K.STOP_FLOOR}`);
    }
    const tint = typeInk(c);
    const tc = contrastOnBlack(tint);
    if (tc < worstType) { worstType = tc; worstTypeHex = tint; }
    must(tc >= K.TYPE_FLOOR - 1e-9, `the tinted type ${tint} reads ${tc.toFixed(2)}:1, under the floor of ${K.TYPE_FLOOR}`);
    const lift = tc / c.contrast;
    if (lift < worstLift) worstLift = lift;
    must(lift >= 1 - 1e-9, `the tinted type ${tint} at ${tc.toFixed(2)}:1 is darker than the ink ${c.hex} at ${c.contrast.toFixed(2)}:1`);
  }
  // and at the house the switch changes nothing at all: `m` is nought there,
  // the offset is nought with it, and the words stay the token they have been
  must(typeInk(ringColour(HOUSE)) === GOLD_STOPS[BASE].hex,
    `the type at the house is ${typeInk(ringColour(HOUSE))}, not the page's own ${GOLD_STOPS[BASE].hex}`);
  must(paleInk(ringColour(HOUSE)) === PALE, `the pale type at the house is ${paleInk(ringColour(HOUSE))}, not ${PALE}`);
  return `${states.length} states, every ink over ${K.INK_FLOOR}:1 and every stop over ${K.STOP_FLOOR}:1 — the worst of them ${worst.toFixed(1)}:1 (${worstHex}); `
    + `and the tinted type over all ${states.length} of them, never under ${worstType.toFixed(1)}:1 (${worstTypeHex}) `
    + `and never darker than the ink it tints (the closest is ${worstLift.toFixed(2)}x), reading exactly ${GOLD_STOPS[BASE].hex} at the house`;
});

check('the record itself still reads as gold', () => {
  const off = (c) => Math.abs(((c.h - hexToLch(GOLD_STOPS[BASE].hex)[2] + 540) % 360) - 180);
  let box = 0;
  let worst = 0;
  let worstLabel = '';
  // under both palettes: the warm one leans every hue a little further round,
  // and the record has to stay gold under whichever the switch says
  for (const [name, pal] of Object.entries(PALETTES)) {
    for (let i = 0; i < 256; i++) {
      const s = { ...HOUSE };
      BIRDS.forEach((b, k) => { s[b] = HOUSE[b] + ((i >> k) & 1 ? HOUSE_BOX[b] : -HOUSE_BOX[b]); });
      box = Math.max(box, off(ringColour(s, pal)));
    }
    for (const g of GOLDEN_READINGS) {
      const d = off(ringColour(g.spell, pal));
      if (d > worst) { worst = d; worstLabel = `${g.label} (${name})`; }
    }
  }
  // The gain is fixed by the record and not by taste: at SFULL 1.0 all fourteen
  // stay within 12.1 degrees of the gold, and at 0.80 one of them lands 26.8
  // off and stops looking like deep house (`notes/diagrams/colours.md` §3).
  must(K.SFULL === 1, `SFULL is ${K.SFULL}, and the fourteen themes were measured at 1`);
  must(worst <= 13, `golden theme ${worstLabel} leaves the gold by ${worst.toFixed(1)} degrees`);
  // The box's own corners are not held to that and never were: a corner is all
  // eight birds pushed to the same side of the room at once, which is not a
  // theme and is not what the sheet measured. It is recorded, not required.
  must(box <= 40, `a corner of the house box leaves the gold by ${box.toFixed(1)} degrees, where the sheet measured 33.6`);
  // and the two poles are the two colours each palette's sheet says they are
  // (`notes/diagrams/colours.md` §4 and its 09-23 table)
  const POLE_HEX = { sheet: ['#6cc5fe', '#ff845a'], warm: ['#74bfff', '#ff845a'] };
  for (const [name, [amb, brk]] of Object.entries(POLE_HEX)) {
    const a = ringColour(POLES.ambient, PALETTES[name]).hex;
    const b = ringColour(POLES.breaks, PALETTES[name]).hex;
    must(a === amb, `the ambient pole under the ${name} palette is ${a}, not ${amb}`);
    must(b === brk, `the breaks pole under the ${name} palette is ${b}, not ${brk}`);
  }
  return `the fourteen golden themes within ${worst.toFixed(1)} degrees of the gold (${worstLabel}) under both palettes, the box's 256 corners within ${box.toFixed(1)}; the two poles read ${ringColour(POLES.ambient).hex} and ${ringColour(POLES.breaks).hex} under the palette that ships`;
});

// **The palette table** (09-23). A palette is the wheel and the warmth laid over
// it; whichever one is on, the house is the gold and the compass is in order.
check('every palette keeps the gold at the house and the compass in order', () => {
  must(PALETTE === PALETTES.warm, 'the palette that ships is not the warm set the 09-23 round chose');
  for (const [name, pal] of Object.entries(PALETTES)) {
    const house = ringColour(HOUSE, pal);
    must(house.hex === GOLD_STOPS[BASE].hex && house.stops.every((s, i) => s.hex === GOLD_STOPS[i].hex),
      `the ${name} palette reads ${house.hex} at the house`);
    must(pal.wheel.map((w) => w[0]).join(' ') === COMPASS.map((c) => c[1]).join(' '),
      `the ${name} palette's wheel is not the compass order`);
    // the warp is a warp and not a fold: at every strength up to the full one,
    // the eight hues keep the order they stand in round the circle
    must(pal.turn >= 0 && pal.turn < 57, `the ${name} palette turns hues by ${pal.turn}°, which folds the circle`);
    for (let t = 0; t <= 1.0001; t += 0.25) {
      const hs = pal.wheel.map((w) => warp(w[1], t * pal.turn, pal.toward, pal.shield));
      let turns = 0;
      // the wheel is in compass order, clockwise from north, and since round
      // K's mirror the hue rises clockwise: each step round is a step up
      for (let i = 0; i < 8; i++) turns += ((hs[(i + 1) % 8] - hs[i] + 360) % 360);
      must(Math.abs(turns - 360) < 1e-6, `the ${name} palette's wheel crosses itself at ${t} of its turn`);
    }
    // and not only the eight: every hue the ring can wear, a tenth of a degree apart
    let prev = warp(0, pal.turn, pal.toward, pal.shield);
    let total = 0;
    for (let k = 1; k <= 3600; k++) {
      const h = warp(k / 10, pal.turn, pal.toward, pal.shield);
      const step = ((h - prev + 540) % 360) - 180;
      must(step > 0, `the ${name} palette's warp folds back at ${k / 10}°`);
      total += step;
      prev = h;
    }
    must(Math.abs(total - 360) < 1e-6, `the ${name} palette's warp does not go once round the circle`);
  }
  const cool = POLES.ambient;
  return `${Object.keys(PALETTES).length} palettes, each the gold to the byte at the house with its wheel in compass order at every strength of its turn; `
    + `the warm set turns every hue up to ${PALETTES.warm.turn}° toward ${PALETTES.warm.toward}° and drains to a cream, and the cool pole is still ${ringColour(cool).hex}`;
});

check('the star sways inside the compass bound, and every bird stays in its domain', () => {
  // Since the cells are a compass, where the star stands is a reading and not a
  // decoration. Eugene, 09-23: *"the movement of the bird bullets should be a
  // bit slower — could be proportional to BPM — and the positions of birds
  // should not leave their domains for more than 15° left or right."* So the
  // sway is a curve of the tempo with two named anchors, every bird's drawn
  // position is clamped inside fifteen degrees of home, the star never turns
  // faster than a stated ceiling, and a pointer outside a bird's domain never
  // picks it. Read off the page module's own text.
  const num = (name) => {
    const m = new RegExp(`const ${name} = ([\\d.]+);`).exec(RING);
    must(m, `src/ring.ts no longer states ${name}`);
    return +m[1];
  };
  const anchor = (name) => {
    const m = new RegExp(`const ${name} = \\{ bpm: ([\\d.]+), sway: ([\\d.]+), drift: ([\\d.]+), pace: ([\\d.]+) \\};`).exec(RING);
    must(m, `src/ring.ts no longer names ${name}`);
    return { bpm: +m[1], sway: +m[2], drift: +m[3], pace: +m[4] };
  };
  const fast = anchor('SWAY_FAST');
  const slow = anchor('SWAY_SLOW');
  const domain = num('BIRD_DOMAIN');
  const hit = num('BIRD_HIT_DOMAIN');
  const speed = num('STAR_SPEED');
  must(domain === 15, `a bird may stand ${domain} degrees from home, where Eugene allows fifteen`);
  must(slow.bpm < fast.bpm && slow.sway < fast.sway && slow.drift < fast.drift && slow.pace < fast.pace,
    'the sway is not smaller and slower at the slow anchor');
  // the widest the sway, the drift and the wander of a vertex can reach, which
  // must sit inside the domain without the clamp ever being needed for the
  // sway alone: the wander is STAR_FLEX x 0.6 x 1.7 units at the rest radius
  const flex = (num('STAR_FLEX') * 0.6 * 1.7 * 180) / (Math.PI * num('R_STAR'));
  const widest = fast.sway + fast.drift + flex;
  must(widest <= domain - 1, `the sway, its drift and the wander reach ${widest.toFixed(2)} degrees where the domain allows ${domain - 1}`);
  must(/const want2 = clamp\(sway \+ drift, -\(BIRD_DOMAIN - 1\), BIRD_DOMAIN - 1\);/.test(RING),
    'the star\'s continuous turn is not held a degree inside the birds\' domains');
  // **and a finger's spin is its own additive turn on top** (round K3): outside
  // the clamp and the ceiling, measured against nothing but a whole turn, which
  // it always settles onto — so a bird's domain is measured against the
  // continuous part alone
  must(/const turn = starShown \+ spinAngle;/.test(RING), 'a spin is not an additive turn on top of the clamped sway');
  must(/const turned = \(swayDeg \* Math\.PI\) \/ 180;/.test(RING), 'a bird\'s domain is measured against the spin as well as the sway');
  must(/return at == null \? inDomain\(i, x, y\) : \[x, y\];/.test(RING), 'a bird\'s drawn position is not clamped into its domain');
  must(/if \(Math\.abs\(d\) > \(BIRD_HIT_DOMAIN \* Math\.PI\) \/ 180\) continue;/.test(RING), 'a pointer outside a bird\'s domain can still pick it');
  must(hit > domain && hit < 20 && hit < 45 - hit, `a pointer picks a bird out to ${hit} degrees from home`);
  must(/starShown \+ clamp\(want2 - starShown, -step, step\)/.test(RING), 'the star\'s turn has no speed ceiling');
  // the curve is monotone in the tempo, and the anchors are what it reads
  const curve = (bpm) => {
    const t = Math.min(1, Math.max(0, Math.log(bpm / slow.bpm) / Math.log(fast.bpm / slow.bpm)));
    const q = t * t * (3 - 2 * t);
    return slow.sway + (fast.sway - slow.sway) * q;
  };
  let last = -1;
  for (let bpm = 40; bpm <= 180; bpm++) { const v = curve(bpm); must(v >= last - 1e-9, `the sway shrinks from ${bpm - 1} to ${bpm}`); last = v; }
  must(/const aim = swayCurve\.sway \* Math\.sin\(TAU \* starFrac\);/.test(RING),
    'the star no longer reads the theme as a bounded excursion about north');
  // **And it is eased onto that reading, never stepped to it** (09-23): a
  // pull's seam starts the next theme at nought; at sixty frames a second the
  // largest jump the reading can make is met at the lesser of the ease and the
  // speed ceiling a frame.
  const ease = num('SWAY_EASE');
  must(/sway = sway == null \? aim : sway \+ \(aim - sway\) \* k;/.test(RING), 'the excursion is set to its reading rather than eased onto it');
  const worstFrame = Math.min(2 * fast.sway * (1 - Math.exp(-16.7 / ease)), (speed * 16.7) / 1000);
  must(worstFrame < 1, `the star may jump ${worstFrame.toFixed(2)} degrees in a frame`);
  return `the sway ${slow.sway}° with ${slow.drift}° of drift at ${slow.pace} pace at ${slow.bpm} BPM and below, ${fast.sway}° with ${fast.drift}° at full pace at ${fast.bpm} and above, `
    + `${curve(104).toFixed(1)}° at 104; the widest it and the wander reach is ${widest.toFixed(2)}° against a domain of ${domain}° held a degree inside, every bird's drawn position clamped into it, `
    + `a pointer further than ${hit}° from a bird's home never picking it, and the star never turning faster than ${speed}° a second (${worstFrame.toFixed(2)}° a frame at worst)`;
});

check('every control is one size, read off the ring\'s square', () => {
  // Eugene, round K3: *"increase the bird circles to match the size of the play
  // controls; moreover increase all button circles on mobile by about 30 %. The
  // size should be based on the ring's square size."* One radius for the four
  // actions and the eight birds, and one threshold, the geometry's own.
  const num = (name) => { const m = new RegExp(`const ${name} = ([\\d.]+);`).exec(RING); must(m, `src/ring.ts no longer states ${name}`); return +m[1]; };
  const r = num('CTRL_R');
  const k = num('CTRL_SMALL_K');
  const side = num('CTRL_SMALL_SIDE');
  must(!/\bR_NODE\b|\bR_ACT_G\b/.test(RING), 'a bird or an action is still drawn at a radius of its own');
  must(Math.abs(k - 1.3) < 1e-9, `the small ring's controls are ${k} times as big, where Eugene asked for about 30 %`);
  // a control 2 x CTRL_R units across is 44 CSS pixels at this side, and not above it
  must(Math.round((44 / (2 * r)) * 1000) === side, `the threshold is ${side} px where a ${2 * r}-unit control reaches 44 px at ${Math.round((44 / (2 * r)) * 1000)}`);
  must(/const next = CTRL_R \* \(side < CTRL_SMALL_SIDE \? CTRL_SMALL_K : 1\);/.test(RING), 'the control size is not read off the ring\'s square');
  must(/new ResizeObserver\(\(\) => sizeControls\(true\)\)\.observe\(tiltEl\)/.test(RING), 'the control size does not follow the square when it changes');
  // round K4: on the small square the birds stand further in, so a bird at its
  // largest clears the lane band by BIRD_BAND_CLEAR — the same arithmetic as
  // sizeControls, restated — and the house is still between 0 % and the rim
  must(/const rim = R_BAND_IN - BIRD_BAND_CLEAR - birdR \* SIZE_RIM;/.test(RING) && /starR = zero \+ \(rim - zero\) \/ \(RIM_PERCENT \/ 100\);/.test(RING),
    'the small square\'s rim is not put where a bird at its largest clears the lane band');
  const clear = num('BIRD_BAND_CLEAR');
  const small = +(r * k * num('BIRD_SMALL_OF_CTRL')).toFixed(3);
  const zero = num('R_STAR') * num('PULL_IN');
  const rim = num('R_BAND_IN') - clear - small * num('SIZE_RIM');
  const house = zero + (rim - zero) / (RIM_PERCENT / 100);
  must(clear >= 8 && house > zero && rim > house && house + small < num('R_BAND_IN'),
    `on the small square the house is ${house.toFixed(1)} and the rim ${rim.toFixed(1)} against the band at ${num('R_BAND_IN')}`);
  // round K5: on the large square a bird is its own radius, 0.74 of a control
  // and over the 20 it was before K3; on the small square the control's own
  const bird = num('BIRD_R');
  must(bird > 20 && bird < r, `a bird on the large square is ${bird} units, not between the old 20 and a control's ${r}`);
  must(/birdR = side < CTRL_SMALL_SIDE \? \+\(ctrlR \* BIRD_SMALL_OF_CTRL\)\.toFixed\(3\) : BIRD_R;/.test(RING), 'a bird is not a share of the control on the small square and its own size on the large one');
  const smallOf = num('BIRD_SMALL_OF_CTRL');
  must(smallOf < 1 && smallOf >= 0.85, `a bird on the small square is ${smallOf} of a control, not "a bit smaller"`);
  // round K6: the star's lines are heavier on the small square, by one factor
  must(/const STAR_SMALL_K = 1\.3;/.test(RING) && /starK = side < CTRL_SMALL_SIDE \? STAR_SMALL_K : 1;/.test(RING)
    && /'stroke-width': \+\(st\.w \* starK\)\.toFixed\(3\)/.test(RING), 'the star\'s lines are not drawn heavier on the small square by STAR_SMALL_K');
  must(!/drawBirdGlyph\([^)]*ctrlR/.test(RING) && !/return \{ x, y, r: ctrlR/.test(RING), 'a bird is still drawn or measured at a control\'s radius');
  return `every control ${r} units of radius, ${(r * k).toFixed(1)} on a square under ${side} px — the side at which a ${2 * r}-unit control is 44 px across — and a bird ${bird} on the large square (${(bird / r).toFixed(2)} of a control) and ${num('BIRD_SMALL_OF_CTRL')} of a control on the small one, following the square as it changes; `
    + `a bird at the rim ${num('SIZE_RIM')} of a control on every square, and on the small one the house at ${house.toFixed(1)} and the rim at ${rim.toFixed(1)}, a bird at its largest ${clear} units clear of the lane band`;
});

// K30: Ember's glyph levels are solved from the composer's own turns, never
// typed — the drums' edge and the end of the steady band at the house's Spark
// K30 (the reviews of 09-26): the constants that drifted are one value each —
// the same spell is `SPELL_SAME` on the ring as in the view, the build's dash
// is `ORN_DASH`, and the glyph's levels cut where the words' bands do
// **Round K33: which ledger lines are faults, and how many a session sends.**
check('the ledger\'s reported faults are the output clip, a thrown stage, a voice not prepared and a late note at a start, capped once a kind and six a session', () => {
  const at = (kind, what, fields = {}) => ({ n: 1, at: 0, clock: null, seed: '1', theme: 1, bar: 1, kind, what, fields });
  const want = [
    [at('clip', 'out reached full scale'), true], [at('hot', 'melodic ran hot, over 0 dBFS before the limiter'), false],
    [at('fault', 'the mix tick threw'), true], [at('fault', 'the limiter\'s processor threw'), true], [at('fault', 'the planner threw under a link'), true],
    [at('prepare', 'a theme\'s voices could not be prepared and fall back to the live path'), true],
    [at('late', '3 notes reached late', { cause: null }), false], [at('late', '3 notes reached late', { cause: 'resume' }), true],
    [at('late', '2 events were dropped a bar behind the head'), false], [at('seam', 'a seam began'), false],
  ];
  for (const [e, yes] of want) must(isReported(e) === yes, `${e.kind} "${e.what}" ${JSON.stringify(e.fields)} is ${yes ? 'not ' : ''}reported`);
  must(REPORT_CAPS.perKind === 1 && REPORT_CAPS.perSession === 6, `the caps are ${JSON.stringify(REPORT_CAPS)}`);
  const MIX = fs.readFileSync(path.join(ROOT, 'src', 'mix.ts'), 'utf8');
  must(/note\('prepare', 'a theme\\'s voices could not be prepared/.test(MIX) && /addEventListener\('processorerror'/.test(MIX), 'a voice not prepared is not its own kind, or the limiter\'s processor is not heard');
  const LINK = fs.readFileSync(path.join(ROOT, 'src', 'link.ts'), 'utf8');
  must(/e instanceof TypeError \|\| e instanceof ReferenceError/.test(LINK), 'a TypeError under a link is read as a refusal');
  return `${REPORTED_KINDS.map((r) => r.kind).join(', ')} reported (a late note only at a start), a hot bus, an ordinary late note and a dropped event not; each kind once a session and ${REPORT_CAPS.perSession} in all; the limiter's processor heard, a voice not prepared its own kind, a bug under a link a fault and not a refusal`;
});

// **Round R1 of the reports: every error the page catches and the audit calls
// ours is reported, from the catch that holds it** (the held-errors audit of
// 09-26, `notes/reviews/held-errors-2026-09-26.md`). The kinds are data
// (`CAUGHT`, a row of `REPORTED_KINDS` each), and each catch of the audit's
// Report bucket is named here by the text that opens it: a catch in this list
// that swallows without calling `report` with its kind fails the check, and so
// does a `report(` anywhere in the page under a kind the table does not hold or
// at a place this list does not name.
const REPORT_SITES = [
  ['mix.ts', 'try { ahead(); } catch (err) {', 'transport', 1],
  ['control.ts', 'try { m.stop(); } catch (e) {', 'transport', 1],
  ['control.ts', 'try { quiet = m.stop() || 0; } catch (e) {', 'transport', 1],
  ['control.ts', 'try { mine.stop(); } catch (e) {', 'transport', 1],
  ['control.ts', '.catch((err) => { console.error(err);', 'transport', 2],
  ['control.ts', 'await prepareLimiter(c)', 'limiter', 1],
  ['control.ts', "console.error('deep-house: the set could not start', err);", 'start', 1],
  ['control.ts', 'got = mixPointSeconds(t, blendBarsFor(t, blendAsked(t)), 16);', 'plan', 1],
  ['control.ts', 'try { fn(r); } catch (err) {', 'page', 1],
  ['control.ts', '{ strategy: state.strategy }); } catch (e) {', 'link', 1],
  ['control.ts', 'recipe: here.recipe, accompaniment: here.accompaniment, development: here.development })}` }).spell;', 'link', 1],
  ['control.ts', '} catch (e) { /* a page with no history to write on */', 'address', 3],
  ['ring.ts', '// A plan that cannot be drawn says nothing rather than taking the ring', 'plan', 1],
  ['ring.ts', 'try { take(plannedReadout(control.planned(about, r.seed, strategy, spell), r, spell)); } catch (e) {', 'plan', 1],
  ['ring.ts', 'try { return control.planned(0, seed, control.state.strategy) as unknown as PlannedTheme; } catch (e) {', 'plan', 1],
  ['ring.ts', "console.error('deep-house: the machine view would not open', err);", 'view', 1],
  ['ring.ts', '} catch (e) { /* a page with no history to write on */', 'address', 1],
  ['motion.ts', 'try { fn(on); } catch (err) {', 'page', 1],
];
check('every error the page catches and the audit calls ours is reported from its catch, under a kind the table holds', () => {
  const kinds = CAUGHT.map((c) => c.report);
  for (const k of kinds) must(REPORTED_KINDS.some((r) => r.kind === 'fault' && r.report === k), `${k} is not a row of REPORTED_KINDS`);
  const at = (fields) => ({ n: 1, at: 0, clock: null, seed: '1', theme: 1, bar: 1, kind: 'fault', what: 'x', fields });
  for (const k of kinds) must(isReported(at({ report: k })) && reportedAs(at({ report: k })) === k, `a ${k} line is not reported under ${k}`);
  must(!isReported(at({ report: 'nothing' })) && reportedAs(at({})) === 'fault' && isReported(at({})), 'an unnamed report is reported, or a plain fault is not');
  // what is ours, and what is the listener's machine
  const dom = (name) => Object.assign(new Error('x'), { name });
  must(ours(new TypeError('x')) && ours(new Error('ours')) && ours(dom('IndexSizeError')), 'a bug of ours is read as the environment');
  for (const n of ['NotAllowedError', 'NotSupportedError', 'InvalidStateError', 'AbortError', 'QuotaExceededError', 'SecurityError']) must(!ours(dom(n)), `a ${n} is read as ours`);
  must(!ours(new TypeError('Failed to fetch dynamically imported module: x.js')) && !ours(new TypeError('Importing a module script failed.')), 'a lost chunk is read as ours');
  must(aBug(new TypeError('x')) && aBug(new RangeError('x')) && !aBug(new Error('a refusal')), 'a refusal is read as a bug');
  // one line per kind and words, and nothing for the environment
  const before = ledgerLines(3600).length;
  report('page', 'the check writes a line', new TypeError('once'));
  report('page', 'the check writes a line', new TypeError('once'));
  report('page', 'the check writes a line', dom('NotAllowedError'));
  const wrote = ledgerLines(3600).slice(before);
  must(wrote.length === 1 && wrote[0].kind === 'fault' && wrote[0].fields.report === 'page' && wrote[0].fields.error === 'once', `report wrote ${JSON.stringify(wrote)}`);
  // the sites: each catch calls report with its kind, and nothing else does
  const calls = new Map();
  for (const [file, open, kind, n] of REPORT_SITES) {
    must(kinds.includes(kind), `${file}: ${kind} is not a kind of CAUGHT`);
    const src = fs.readFileSync(path.join(ROOT, 'src', file), 'utf8');
    const found = src.split(open).length - 1;
    must(found === n, `${file}: "${open}" opens ${found} places, not ${n}`);
    let from = 0;
    for (let i = 0; i < n; i++) {
      const j = src.indexOf(open, from);
      must(src.slice(j, j + open.length + 320).includes(`report('${kind}'`), `${file}: the catch at "${open}" holds its error without reporting it as ${kind}`);
      from = j + open.length;
    }
    calls.set(`${file}|${kind}`, (calls.get(`${file}|${kind}`) || 0) + n);
  }
  for (const k of kinds) must(REPORT_SITES.some((s) => s[2] === k), `${k} has no site`);
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'private' ? [] : walk(path.join(d, e.name))) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []));
  let total = 0;
  for (const f of walk(path.join(ROOT, 'src'))) {
    const rel = path.relative(path.join(ROOT, 'src'), f);
    if (rel === 'ledger.ts') continue;
    const src = fs.readFileSync(f, 'utf8');
    const per = new Map();
    for (const m of src.matchAll(/\breport\('([a-z]+)'/g)) { must(kinds.includes(m[1]), `${rel} reports under ${m[1]}, which CAUGHT does not hold`); per.set(m[1], (per.get(m[1]) || 0) + 1); total += 1; }
    for (const [k, c] of per) must((calls.get(`${rel}|${k}`) || 0) === c, `${rel} calls report('${k}' ${c} times where the list names ${calls.get(`${rel}|${k}`) || 0}`);
  }
  return `${kinds.length} kinds (${kinds.join(', ')}), each a row of REPORTED_KINDS; ${total} report calls at ${REPORT_SITES.length} named catches, none that holds its error without one; a bug read as ours, a refused permission, a lost chunk and a refusal not; one line per kind and words`;
});

check('the ring\'s drifted constants are one value each', () => {
  const uses = (RING.match(/\bSPELL_SAME\b/g) || []).length;
  must(uses >= 3 && !/<=\s*5e-4|<\s*0\.006\b/.test(RING), `the ring asks "the same spell" ${uses} times through SPELL_SAME and still carries a tolerance of its own`);
  must(/build: \{ short: 'bld', dash: ORN_DASH\.join\(' '\)/.test(RING) && (RING.match(/'9 6'/g) || []).length === 0, 'the build dash is typed apart from ORN_DASH');
  const GLYPH_SRC = fs.readFileSync(path.join(ROOT, 'src', 'bird-glyph.ts'), 'utf8');
  must(/v\.inclusive \? value <= v\.upTo : value < v\.upTo/.test(GLYPH_SRC), 'the glyph levels are not cut the way the bands are');
  return `SPELL_SAME read ${uses} times on the ring (a bird landed, an outside ask, the drop's merge) and no tolerance of its own; the build dash is ORN_DASH; a banded level holds under its threshold as its band does`;
});

check('Ember\'s glyph turns where its drums and its word do', () => {
  const bad = [];
  for (let h = 0; h <= 100; h++) {
    const v = h / 100, d = derive(asSpell({ ...HOUSE, ember: v }));
    const want = !d.drumsOn ? 'one' : d.tempoFamily === 'house' || d.tempoFamily === 'unmetered' ? 'two' : 'three';
    if (glyphLevelAt('ember', v) !== want) bad.push(`${v.toFixed(2)} ${glyphLevelAt('ember', v)}/${want}`);
  }
  must(!bad.length, `Ember's glyph and its drums or tempo disagree at ${bad.join(', ')}`);
  must(!/"upTo":\s*0\.(18|66)\b/.test(fs.readFileSync(path.join(ROOT, 'src', 'bird-glyphs.json'), 'utf8').split('"bird": "ember"')[1].split('"bird":')[0]), 'Ember\'s glyph levels are typed numbers again');
  return 'over the hundredths Ember draws one flame with the drums off, two up to where the pulse leaves the steady band, three after — both turns read off spell.ts';
});

check('the transport\'s marks round their corners the way the die does', () => {
  // Eugene, 09-23: *"for the player control arrows, smooth the angles: on a
  // circular ring design it is fair to avoid super-sharp 90° corners; the dice
  // SVG is the reference aesthetic."* One corner radius, the die's own, and the
  // die itself drawn exactly as before with it.
  must(/const dieCorner = \(R: number\) => R \* 1\.12 \* 0\.075;/.test(RING), 'the die\'s corner is not one stated number');
  must(/const U = R \* 1\.4;[^\n]*\n\s*const rr = dieCorner\(R\);/.test(RING), 'the die no longer draws with its own corner');
  // K26: the pair turned as one, 5.5° to the left, about the centre of its turned corners
  must(/^const DIE_TURN = -5\.5;$/m.test(RING) && /translate\(\$\{\(-\(x0 \+ x1\) \/ 2\)\.toFixed\(2\)\} \$\{\(-\(y0 \+ y1\) \/ 2\)\.toFixed\(2\)\}\) rotate\(\$\{DIE_TURN\}\)/.test(RING), 'the pair is not one turn of 5.5° to the left, centred on its turned corners');
  for (const R of [20, 35, 50]) must(R * 1.12 * 0.075 === (R * 1.12) * 0.075, 'the die\'s corner moved in the refactor');
  const marks = [
    [/d \+= `\$\{roundCorner\(\[x, -h\], \[x \+ dir \* w, 0\], \[x, h\], dieCorner\(R\)\)\} `;/, 'the skip and back chevrons'],
    [/d: roundQuad\(\[\[-w \* 0\.6, -h\], \[w, 0\], \[-w \* 0\.6, h\]\], dieCorner\(R\)\)/, 'the play triangle'],
    [/const TRI = roundQuad\(\[\[C - 26, C - 37\], \[C \+ 41, C\], \[C - 26, C \+ 37\]\], dieCorner\(CTRL_R\)/, 'the big play mark'],
  ];
  for (const [re, what] of marks) must(re.test(RING), `${what} is drawn with sharp corners`);
  const ends = (RING.match(/\.\.\.ROUND_ENDS/g) || []).length;
  must(ends >= 5, `${ends} transport paths say round joins and ends, where the chevrons, play, pause and both strokes of the big mark are five`);
  return `the chevrons, the play triangle, the pause bars and the big play mark round their joins and ends, and every true corner is drawn with the die's own radius, `
    + `${(35 * 1.12 * 0.075).toFixed(2)} units on a node — the big mark's scaled with it — and the die, 1.40 R since K23 and turned 5.5° to the left since K26, still drawn with that corner`;
});

check('the pulse reaches further the slower the tempo, and is today\'s at a house tempo', () => {
  // Eugene, 09-23: at about 60 BPM and below the beat's ring is a wide slow
  // swell, *"to support deep meditative waves of ambience"*; at a house tempo
  // and above it is the pulse the ring has always had. One curve, two named
  // anchors, read off the page module's own text.
  const anchor = (name) => {
    const m = new RegExp(`const ${name} = \\{ bpm: ([\\d.]+), trace: ([\\d.]+) \\};`).exec(RING);
    must(m, `src/ring.ts no longer names ${name}`);
    return { bpm: +m[1], trace: +m[2] };
  };
  const fast = anchor('PULSE_FAST');
  const slow = anchor('PULSE_SLOW');
  must(slow.bpm <= 60 && fast.bpm > slow.bpm, `the slow anchor is at ${slow.bpm} and the fast at ${fast.bpm}`);
  must(fast.trace === 16, `the fast anchor is ${fast.trace} units, which is not the seven out and nine wide the ring has always drawn`);
  must(slow.trace / fast.trace >= 4, `the slow pulse is only ${(slow.trace / fast.trace).toFixed(1)} times the fast one`);
  // the page's curve, restated
  const trace = (bpm) => {
    const t = Math.min(1, Math.max(0, Math.log(bpm / slow.bpm) / Math.log(fast.bpm / slow.bpm)));
    return slow.trace + (fast.trace - slow.trace) * t * t * (3 - 2 * t);
  };
  must(/const bpm = pulseBpmAsked \?\? tempoNow\(last\);/.test(RING) && /const k = pulseTrace\(bpm\) \/ PULSE_FAST\.trace;/.test(RING), 'the pulse does not read its reach off the tempo the grid is at');
  // **K14: the corona** — the reach is the curve's, and nothing travels: every
  // stroke stands on the rim and only its width and its light move
  must(/const trace = PULSE_FAST\.trace \* k \* \(1 \+ \(CORONA_REACH_SLOW - 1\) \* soft \* soft\);\n\s*const reach = trace \* \(CORONA_REST \+ \(1 - CORONA_REST\) \* e\);/.test(RING), 'the corona\'s reach is not the curve\'s (the slow end\'s longer), at its rest share at the floor of the swell');
  // K17: the crown lies under the birds on the star's sheet, and the wave is back above sixty
  must(/coronaG = el\('g', \{ id: 'corona', 'aria-hidden': 'true' \}, starSvg\);\n\s*starSvg\.insertBefore\(coronaG, starSvg\.firstChild\);/.test(RING), 'the corona is not the first thing on the star\'s sheet, under the birds');
  // K19: the beat is the ring's first (09-20, 2ffc978): the rim lifted 7 e on the hard envelope, whole every beat, lighter every third, none once a bar
  must(/const weight = every === 1 \? 1 : every === 3 \? BEAT_MID : 0;\n\s*paintBeat\(k, weight, REDUCED \? 0 : hard\);/.test(RING)
    && /const r = \(R_CORE \+ 7 \* k \* e\)\.toFixed\(2\);/.test(RING)
    && /\(weight \* \(0\.05 \+ 0\.26 \* e\)\)/.test(RING) && /\(weight \* \(0\.14 \+ 0\.52 \* e\)\)/.test(RING),
    'the fast beat is not the ring\'s first: the rim lifted seven units on the beat, its light the 09-20 ring\'s');
  // and the breath under the reading keeps the beat in every band
  must(/const eb = every === 1 \? \(REDUCED \? 0 : hard\) : e;/.test(RING), 'the breath under the reading does not keep the beat in every band');
  // K15: the slow crown 30 % further, the fast unchanged
  const slowK = +(/const CORONA_REACH_SLOW = ([\d.]+);/.exec(RING) || [])[1];
  must(slowK === 1.56, `the slow crown reaches ${slowK} of its trace`);
  must(/const w = reach \* PULSE_LAYERS\[j\];[\s\S]{0,160}put\(pulseRings\[j\], 'r', \(R_CORE \+ w \/ 2\)\.toFixed\(2\)\);/.test(RING)
    && /put\(pulseRing2, 'r', R_CORE\);/.test(RING) && (RING.match(/R_CORE \+ 7 \* k \* e/g) || []).length === 1,
    'a stroke of the corona does not stand on the rim, or something besides the ring\'s first beat (K19) lifts off it');
  // **and at a slow tempo it swells and its edges fade** (round K3): the
  // envelope is a logarithm up over PULSE_RISE of the beat and a logarithm down
  // to nought at the next, restated here, with its steepest frame at 50 BPM
  const rise = +/const PULSE_RISE = ([\d.]+);/.exec(RING)[1];
  const K = +/const PULSE_LOG_K = ([\d.]+);/.exec(RING)[1];
  const L = Math.log1p(K);
  const swell = (b) => (b < rise ? Math.log1p((K * b) / rise) / L : 1 - Math.log1p((K * (b - rise)) / (1 - rise)) / L);
  must(swell(0) === 0 && Math.abs(swell(rise) - 1) < 1e-12 && Math.abs(swell(1)) < 1e-12, 'the swell does not start and end at nought with its peak between');
  const step = (60 / 50) ** -1 / 60;   // a sixtieth of a second, in beats at 50 BPM
  let worst = 0;
  for (let b = 0; b + step <= 1; b += step / 4) worst = Math.max(worst, Math.abs(swell(b + step) - swell(b)));
  // the light at the band's middle is 0.26 x the envelope, whatever the layers
  const opacityStep = 0.26 * worst;
  must(opacityStep < 0.04, `at 50 BPM the pulse's light steps ${opacityStep.toFixed(3)} in a frame`);
  // **and across it a continuous fade** (round K4), since K14 from the rim
  // out: twenty strokes, the whole reach and then each a twentieth narrower,
  // their light solved to an exponential falling from the rim to nought at
  // the reach — restated here, strip by strip
  must(/const PULSE_LAYERS = Array\.from\(\{ length: 20 \}, \(_, j\) => 1 - j \/ 20\);/.test(RING), 'the corona is not twenty strokes a twentieth apart');
  const fall = +(/const CORONA_FALL = ([\d.]+);/.exec(RING) || [])[1];
  must(fall > 0 && /return \(Math\.exp\(-CORONA_FALL \* x\) - Math\.exp\(-CORONA_FALL\)\) \/ \(1 - Math\.exp\(-CORONA_FALL\)\);/.test(RING),
    'the corona\'s profile is not an exponential from the rim to nought at its reach');
  const layers = Array.from({ length: 20 }, (_, j) => 1 - j / 20);
  const profile = (u) => (Math.exp(-fall * u) - Math.exp(-fall)) / (1 - Math.exp(-fall));
  const strips = layers.map((w, j) => profile((w + (layers[j + 1] ?? 0)) / 2));
  let jump = 0;
  for (let j = 1; j < strips.length; j++) {
    must(strips[j] > strips[j - 1], 'the pulse\'s light falls somewhere between its edge and its middle');
    jump = Math.max(jump, strips[j] - strips[j - 1]);
  }
  must(jump <= 0.14, `two neighbouring strips of the pulse differ by ${jump.toFixed(3)} of its middle`);
  must(strips[0] < 0.15, `the pulse's edge is ${strips[0].toFixed(3)} of its middle, which is not near transparent`);
  // **and how often it comes** (round K4, Eugene's breaks): once a bar at sixty
  // and below, every third beat to ninety, every beat above — read off the
  // table and asked at both sides of each break
  const every = /const PULSE_EVERY = \[\{ upTo: 60, beats: 4 \}, \{ upTo: 90, beats: 3 \}, \{ upTo: Infinity, beats: 1 \}\];/.test(RING);
  must(every, 'the pulse does not come once a bar to sixty, every third beat to ninety and every beat above');
  must(/const every = pulseEvery\(bpm\);\n\s*const e = pulseEnvelope\(last\.beatPhase, last\.barPhase, soft, every, \(last\.bar \* 4 \+ last\.beatInBar\) % every\);/.test(RING),
    'the pulse is not drawn at the rate its tempo says, counted from the bar line');
  let last = Infinity;
  for (let bpm = 40; bpm <= 180; bpm += 1) {
    const v = trace(bpm);
    must(v <= last + 1e-9, `the pulse reaches further at ${bpm} than at ${bpm - 1}`);
    last = v;
  }
  must(trace(104) === fast.trace && trace(169) === fast.trace, 'the pulse at 104 or 169 is not today\'s');
  must(trace(50) === slow.trace, `the pulse at 50 reaches ${trace(50)}, not the slow anchor`);
  return `${fast.trace} units at ${fast.bpm} BPM and above (today's pulse, exactly), ${slow.trace} at ${slow.bpm} and below, `
    + `an S-curve in the log of the tempo between: ${trace(80).toFixed(1)} at 80, ${trace(70).toFixed(1)} at 70`;
});

// --- the eight cells as controls (UX-1) ------------------------------------
//
// The radius a cell stands at *is* the bird's value, and the one thing that
// rule has to keep is that an untouched ring does not move: at the house every
// cell must land on `R_STAR` exactly, by arithmetic and not by a branch, or
// there is no pixel-identity proof to take. The map is mirrored here off the
// page module's own text, read back as arithmetic, and checked at the house, at
// both ends and for being one-to-one all the way between.
const ringNum = (name) => {
  const m = new RegExp(`const ${name} = ([\\d.]+);`).exec(RING);
  must(m, `src/ring.ts no longer states ${name}`);
  return +m[1];
};

check('a cell\'s radius is its bird\'s value, and the house is exactly where it was', () => {
  const inR = ringNum('PULL_IN');
  const zone = HOUSE_ZONE;
  const star = ringNum('R_STAR');
  // **The radius is the percent** (09-23): 0.72 R at 0 %, the rest radius at
  // the house's 100 %, and one straight line on out to the rim — so the rim is
  // `PULL_IN + (1 - PULL_IN) x RIM_PERCENT / 100` of the rest radius, 1.084.
  must(/const PULL_IN = 0\.72;/.test(RING), 'a bird at 0 no longer stands at the plan\'s 0.72 of the rest radius');
  // (The page's own `PULL_OUT`, which this used to hold to the line below, was
  // read by nothing and went in round (f) of the reconciled review; the rim is
  // the arithmetic below, from the percent's own `RIM_PERCENT`.)
  must(/return starR \* \(pullIn \+ \(1 - pullIn\) \* \(percentOf\(b, v\) \/ 100\)\);/.test(RING),
    'a cell\'s radius is not its percent of the house on one straight line');
  // on a desktop's square the rest radius and the 0 % share are the constants
  must(/starR = R_STAR;\n\s*pullIn = PULL_IN;/.test(RING) && /let starR = R_STAR;/.test(RING) && /let pullIn = PULL_IN;/.test(RING),
    'on a desktop\'s square the star does not stand at R_STAR with its 0 % at PULL_IN');
  const outR = inR + ((1 - inR) * RIM_PERCENT) / 100;
  must(outR > 1 && star * outR < ringNum('R_BAND_IN'), `the rim stands at ${(star * outR).toFixed(1)}, inside the lane band`);
  // the page's own map, restated as the arithmetic it is
  const radius = (b, v) => star * (inR + (1 - inR) * (percentOf(b, v) / 100));
  let worstHouse = 0;
  for (const b of BIRDS) {
    const h = HOUSE[b];
    // **the house is the rest radius, to the bit** — this is the identity proof
    must(radius(b, h) === star, `${b} at the house lands at ${radius(b, h)} and not ${star}`);
    worstHouse = Math.max(worstHouse, Math.abs(radius(b, h) - star));
    must(Math.abs(radius(b, 0) - star * inR) < 1e-9, `${b} at 0 lands at ${(radius(b, 0) / star).toFixed(4)} R`);
    must(Math.abs(radius(b, 1) - star * outR) < 1e-9, `${b} at 1 lands at ${(radius(b, 1) / star).toFixed(4)} R`);
    let last = -1;
    for (let v = 0; v <= 1.0001; v += 0.01) {
      const r = radius(b, Math.min(v, 1));
      must(r > last, `${b} does not rise all the way out: ${r} at ${v.toFixed(2)} after ${last}`);
      last = r;
    }
    // **the snap zone is a percent of the house, the same either side** (R64):
    // under a step, so a step off the house is held and not swallowed, and
    // the value it stands for on each half is that half's share of the percent
    must(zone > 0 && zone < PULL_STEP, `the house zone is ${zone} % against a ${PULL_STEP} % step`);
    must(nearHouse(b, valueOfPercent(b, 100 - zone + 0.01)) && nearHouse(b, valueOfPercent(b, 100 + zone - 0.01))
      && !nearHouse(b, valueOfPercent(b, 100 - PULL_STEP)) && !nearHouse(b, valueOfPercent(b, 100 + PULL_STEP)),
      `${b}: the snap is not ${zone} % either side of the house`);
  }
  // and a value a cell can be pulled to survives the address bar, which is the
  // only place a held bird lives — **the link carries the 0..1 value**, and
  // the percent is the ring's reading of it and nothing else
  let worstUrl = 0;
  for (const b of BIRDS) for (let v = 0; v <= 1.0001; v += 0.017) {
    const asked = +Math.min(1, v).toFixed(3);
    const back = parseSpell(spellQuery({ [b]: asked }) || `${b}:${asked}`);
    worstUrl = Math.max(worstUrl, Math.abs(back[b] - asked));
  }
  must(worstUrl === 0, `a pulled value comes back off a link ${worstUrl} away from what was asked`);

  // **The bird under the hand, one for one** (round K8: *"there is some drag
  // ratio and delay; I want the bird to follow the hand precisely in the
  // allowed region"*). The hand's travel along the spoke is the node's, from
  // where the pull took it, between the 0 % and 130 % radii; across it, the
  // same within the play; the value is read back off that radius. UX-1's
  // second scale for the hand (a third of the star's radius, never under 120
  // px) is gone.
  must(/const hand = clamp\(d\.R0 \+ alongSpoke\(c, at\) - d\.r0, lo, hi\);/.test(RING), 'a dragged bird does not stand where the hand has moved it along its spoke');
  // **except in the magnet at the house** (round K11): at the house the bird
  // stays until the hand is `HOUSE_HOLD` points off, off it the bird snaps home
  // inside `HOUSE_ZONE`, and everywhere else it is the hand's radius — on both
  // hands, the drag and the phone's slider, through the one function
  must(/const p = magnet\(\(\(hand \/ starR - pullIn\) \/ \(1 - pullIn\)\) \* 100, c\.value === home\);\n\s*const R = p === 100 \? radiusFor\(c\.bird, home\) : hand;/.test(RING),
    'a drag does not read the house\'s magnet, or stands anywhere but the house or the hand');
  must(/const p = magnet\(Number\(panelSlider\.value\), c\.value === HOUSE\[c\.bird\]\);/.test(RING), 'the phone\'s slider has no gravity at the house');
  must(HOUSE_HOLD > 0 && HOUSE_HOLD < PULL_STEP && HOUSE_ZONE < PULL_STEP, `the magnet is ${HOUSE_ZONE} in and ${HOUSE_HOLD} out, where a ${PULL_STEP} % step off the house has to hold`);
  for (const [p, at, want] of [[100 + HOUSE_HOLD, true, 100], [100 - HOUSE_HOLD, true, 100], [100 + HOUSE_HOLD + 0.5, true, 100 + HOUSE_HOLD + 0.5],
    [100 + HOUSE_ZONE, false, 100], [100 + PULL_STEP, false, 100 + PULL_STEP], [100 + PULL_STEP, true, 100 + PULL_STEP], [100 - PULL_STEP, true, 100 - PULL_STEP]])
    must(magnet(p, at) === want, `a hand at ${p} % ${at ? 'on' : 'off'} the house puts the bird at ${magnet(p, at)} %, not ${want}`);
  must(/cellSide\[i\] = cellSideTo\[i\] = clamp\(d\.S0 \+ acrossSpoke\(c, at\) - d\.a0, -reach, reach\);/.test(RING), 'a dragged bird does not follow the hand across its spoke');
  must(!/PULL_TRAVEL|travelFor\(|travelUnits\(/.test(RING), 'a second scale for the hand is still in the ring');
  must(/if \(hand\) followHand\(hand\);/.test(RING) && /if \(!hand && !cellsMoved && now - flexAt < 33\) return(?: false)?;/.test(RING),
    'a dragged bird is not placed under the hand on every frame');
  // **and the hand's travel is signed along the spoke and not a radius**: a
  // radius has no sign, so a drag through the middle of the ring turned round
  // and read as a pull outward
  must(/\(pt\.x - C\) \* Math\.cos\(a\) \+ \(pt\.y - C\) \* Math\.sin\(a\)/.test(RING),
    'a pull reads a radius rather than a signed distance along its own spoke');
  must(!/polar\(unturn\(toSvg\(e, Z_INNER\)\)\)\.r/.test(RING),
    'a pull still reads the pointer\'s radius somewhere');
  // the value read back off a radius is the value that radius was drawn for,
  // to the hundredth a link carries — so a bird dropped where the hand is
  // stays where the hand left it
  let worstBack = 0;
  for (const b of BIRDS) for (let v = 0; v <= 1.0001; v += 0.01) {
    const want = +Math.min(v, 1).toFixed(2);
    const R = radius(b, want);
    const p = ((R / star - inR) / (1 - inR)) * 100;
    const got = +Math.min(1, Math.max(0, valueOfPercent(b, Math.min(RIM_PERCENT, Math.max(0, p))))).toFixed(2);
    worstBack = Math.max(worstBack, Math.abs(got - want));
  }
  must(worstBack <= 0.01 + 1e-9, `a radius reads back ${worstBack} away from the value it was drawn for`);

  // **The star bends with the birds** (Eugene, 09-20: *"the previous approach of
  // moving the lines to the birds was a stellar UX idea"*). The three shapes go
  // through wherever the eight cells stand, so a vertex **is** a node and the
  // shape of the star is the shape of the spell — and at the house every
  // `cellR` is `R_STAR` by the arithmetic above, which is why the pull can move
  // the frame and the untouched ring still comes out as the pixels it was
  // blessed with.
  must(/function starPaths[^]*?vertexAt\(i, t\)/.test(RING),
    'the star\'s three shapes are drawn through the rest radius and not through the cells');
  // **And the spoke and its tick scale are gone with it.** They were the mark
  // that stood in for the bending while the star was rigid; a second drawing of
  // the one thing the star now says for itself is one mark too many.
  must(!/\bspokes\b|\bticks\[/.test(RING),
    'the hairline spoke or its tick scale is still drawn beside the nodes');
  // The words stand off each bird where it is drawn (round K3): its place and
  // its size, a fixed gap from its edge.
  must(/const \[x, y\] = rot\(c\.x \+ c\.dx, c\.y \+ c\.dy, t\);/.test(RING) && /let along = b\.r \+ WORD_GAP/.test(RING),
    'the word placer reads the rest radius and not where the eight actually stand');

  return `0.72 R at 0 %, ${star} at the house and ${outR.toFixed(3)} R at ${RIM_PERCENT} % on all ${BIRDS.length} birds — the radius is the percent — the house exact to ${worstHouse}, `
    + `monotone over 101 values, the snap zone ${zone} % either side, `
    + `and every value a cell can be pulled to round-trips through a link unchanged; `
    + `a dragged bird stands where the hand has moved it, one unit for one along its spoke and across its play, every frame, `
    + `signed along the spoke so a drag through the middle goes on reading less, a radius reading back to within ${worstBack.toFixed(2)} of its value; `
    + `and the star's three shapes are drawn through the eight cells themselves, so a pull bends the frame it is read against and the lift leaves it bent`;
});

// --- a bird as a percent of its house (09-23) -------------------------------
//
// Eugene: *"0.45 is not obvious."* The ring prints a bird as a percent of its
// house — 0 % at 0, 100 % at the house, 130 % at 1 — and the value underneath,
// the composer's and the link's, is the 0..1 it always was (his amendment of
// the same day: *"the URL stays the stable value that never changes"*). The
// mapping is `src/bird-percent.ts` and nothing else, and this holds it.
check('a bird reads as a percent of its house, and the link still carries the value', () => {
  let worstTrip = 0;
  let worstShown = 0;
  let steps = 0;
  for (const b of BIRDS) {
    const h = HOUSE[b];
    // the three anchors, exact: the house is a hundred to the bit both ways
    must(percentOf(b, h) === 100 && valueOfPercent(b, 100) === h, `${b}'s house reads ${percentOf(b, h)} %, and 100 % reads ${valueOfPercent(b, 100)}`);
    must(percentOf(b, 0) === 0 && valueOfPercent(b, 0) === 0, `${b} at 0 reads ${percentOf(b, 0)} %`);
    must(Math.abs(percentOf(b, 1) - RIM_PERCENT) < 1e-12 && valueOfPercent(b, RIM_PERCENT) === 1, `${b} at 1 reads ${percentOf(b, 1)} %`);
    // **round-trips to the calibration's precision, and far below it**: the
    // house is measured to a thousandth, and every thousandth comes back
    let last = -1;
    for (let k = 0; k <= 1000; k++) {
      const v = k / 1000;
      const p = percentOf(b, v);
      must(p > last, `${b}'s percent does not rise at ${v}: ${p} after ${last}`);
      last = p;
      worstTrip = Math.max(worstTrip, Math.abs(valueOfPercent(b, p) - v));
    }
    // every whole percent a step can ask for reads back as itself
    for (let q = 0; q <= RIM_PERCENT; q++) {
      must(percentShown(b, valueOfPercent(b, q)) === q, `${b} at ${q} % reads back as ${percentShown(b, valueOfPercent(b, q))} %`);
      steps++;
    }
    // and a hand's hundredth is printed as the whole percent nearest it: the
    // readout is never more than half a percent's width from the value
    for (let k = 0; k <= 100; k++) {
      const v = k / 100;
      const width = v <= h ? h / 100 : (1 - h) / (RIM_PERCENT - 100);
      worstShown = Math.max(worstShown, Math.abs(valueOfPercent(b, percentShown(b, v)) - v) / width);
    }
  }
  must(worstTrip < 1e-12, `a value comes back off its percent ${worstTrip} away`);
  must(worstShown <= 0.5 + 1e-9, `a printed percent stands ${worstShown.toFixed(3)} of a percent from its value`);
  // the ring prints the percent, and the link writes the value
  must(/const title = COARSE \? pct : pct \? `\$\{BIRD\[c\.id\]\.name\} \$\{pct\}` : BIRD\[c\.id\]\.name;/.test(RING),
    'the bird\'s title line does not print its percent');
  must(/const pct = owned \? percentText\(c\.bird, c\.value\) : '';/.test(RING), 'the percent is printed at the house, or off something other than the value');
  must(spellQuery({ ember: 0.62, tide: 0.3 }) === 'em:0.62,ti:0.30', `a hand's spell writes ${spellQuery({ ember: 0.62, tide: 0.3 })} into the link`);
  return `0 % at 0, 100 % at the house exactly and ${RIM_PERCENT} % at 1 on all ${BIRDS.length} birds, monotone, a thousandth reading back `
    + `to ${worstTrip.toExponential(1)}, all ${steps} whole percents reading back as themselves, a hand's hundredth printed within `
    + `${worstShown.toFixed(2)} of a percent's width; and the link still writes the value (${spellQuery({ ember: 0.62, tide: 0.3 })})`;
});

check('a cell is a control exactly where a held bird reaches the plan', () => {
  // A control that changes nothing breaks the ring's first rule, so the page
  // reads a fact and never a name: the strategy's style must carry `derived`,
  // which is what makes a held bird reach a plan at all (derive-lite). The
  // record carries no switches, so the record's page has no control on it.
  must(/const cellsControl = \(id: string \| null \| undefined\) => \{/.test(RING),
    'src/ring.ts no longer decides by the strategy\'s own switch whether a cell is a control');
  must(/switchOn\(s\.style, 'derived'\)/.test(RING),
    'the cells are a control on something other than the `derived` switch');
  const on = [];
  const off = [];
  for (const id of STRATEGY_IDS) (switchOn(STRATEGIES[id].style, 'derived') ? on : off).push(id);
  must(off.includes(DEFAULT_STRATEGY), `${DEFAULT_STRATEGY} is the record and would carry controls`);
  must(on.length, 'no strategy this build ships lets a held bird reach a plan');
  // and what that means for the record: a held bird would move nothing there
  const spell = { ...HOUSE, ember: 0.9, spark: 0.85 };
  const rec = planTheme('1', 1, { masterSeed: '1', strategy: DEFAULT_STRATEGY });
  const pulled = planTheme('1', 1, { masterSeed: '1', strategy: DEFAULT_STRATEGY, spell });
  must(rec.bpm === pulled.bpm && rec.dice.hatMask === pulled.dice.hatMask && rec.preset === pulled.preset,
    `a pull moves the record's own tempo, room or hat figure (${rec.bpm} to ${pulled.bpm}, ${rec.preset} to ${pulled.preset})`);
  return `${on.join(', ')} carries the derived switch and its cells are controls; ${off.join(', ')} carries none and its cells are readings — `
    + `and a spell two birds from the house leaves the record at ${rec.bpm} bpm in the same room on the same hat figure`;
});

check('every bird names what it means, the ring says the reading and not the ends, and a pull is heard', () => {
  // Eugene, 09-20, twice: *"it is not clear which direction makes it more or
  // less"* and *"now there is no direct response to any bird, a delay and a
  // follow-up wait."* Two rules, and both are a table this holds.
  //
  // **Out is more, on all eight.** Each bird declares the two ends it runs
  // between, so a cell a hand is pulling says the end it is heading for instead
  // of leaving a listener to work out which way round a spoke goes.
  // (K30: the pole words themselves went — no surface has read them since
  // K13, and a regex here was the one thing keeping them in the page; each
  // cell still names its bird and what it means)
  const poles = [...RING.matchAll(/\{ key: '([a-z]+)', name: '([A-Za-z]+)', means: '([^']+)' \}/g)]
    .map((m) => ({ bird: m[1], name: m[2], means: m[3] }));
  must(poles.length === BIRDS.length, `${poles.length} of ${BIRDS.length} birds name themselves and what they mean`);
  for (const p of poles) must(BIRDS.includes(p.bird), `${p.bird} is not one of the eight`);
  must(new Set(poles.map((p) => p.bird)).size === BIRDS.length, 'two cells claim the same bird');
  // and since round K13 the ring does not say the convention: what a cell
  // explains is the reading, one sentence (`valueLine`, `sentenceOf`)
  must(/return sentenceOf\(c\.bird, /.test(RING) && !/out is more/.test(RING.replace(/^\s*(\/\/|\*).*$/gm, '')),
    'the explanation is not the one sentence, or still says which way is more');

  // **And which half of a pull is heard at once.** The immediate half is the
  // seasoning — the settings a voice is played inside its own declared range —
  // and every knob property the registry declares has to have a word for each
  // of its two directions, or a pull would move something the ring cannot name.
  // (the words for each knob's two directions went in K30: the "now" half of a
  // pull's line went in K11 and nothing read them since; what stays is that
  // the live half is the deck's)
  // the live half is the deck's and never the plan's: what is rewritten is a
  // note nothing has been built for yet
  const DECK = fs.readFileSync(path.join(ROOT, '..', 'engine', 'src', 'deck.ts'), 'utf8');
  must(/export function seasonDeck/.test(DECK), 'a deck cannot be seasoned after it was built');
  must(/const from = Math\.max\(0, deck\.index \| 0\);/.test(DECK),
    'the live seasoning does not begin at the first note the scheduler has not visited');
  must(/deck\.program = \{ \.\.\.deck\.program, events: events\.slice\(\) \};/.test(DECK),
    'the live seasoning writes into the cached program the digest hashes');
  const MIX = fs.readFileSync(path.join(ROOT, 'src', 'mix.ts'), 'utf8');
  must(/function reseason\(\): number \{/.test(MIX), 'a spell set while a set plays does not reach the notes');
  return `all ${poles.length} birds name themselves and what they mean, and the explanation says the reading, not the ends, since round K13 `
    + `(${poles.map((p) => `${p.name}: ${p.means}`).slice(0, 3).join('; ')}…); `
    + `and the immediate half is written onto the notes past the scheduler's own cursor, in the deck's own copy of its program`;
});

check('the plan a face reads is the plan the spell asks for', () => {
  // **A held bird is part of what names a plan.** `control.ts` memoises a
  // planned theme, and the memo's key did not carry the spell: `setSpell`
  // emptied it and a line later re-filled it with the theme ahead planned under
  // the spell still *playing*, so the swap — which asks for that theme again —
  // was handed the stale plan and the ring read the arriving theme as though no
  // bird were held. MEASURED on the built page before the fix: a pull on Ember
  // promised 169.1 bpm on the cell's own sub-line and the ring printed 104.1
  // when it landed, while the music went where it had been asked, which is
  // Eugene's "the ring pulse is not in sync with the BPM".
  const CONTROL = fs.readFileSync(path.join(ROOT, 'src', 'control.ts'), 'utf8');
  must(/spellQuery\(spell\) \|\| 'house'/.test(CONTROL),
    'the plan memo is not keyed on the spell the plan was made under');
  must(/state\.mix \? state\.mix\.spellAsked : undefined/.test(CONTROL),
    'the theme that is coming is not planned under the spell that has been asked for');
  // and the arithmetic under it: two spells, two plans, and the same spell the
  // same plan — which is what a key has to separate
  const house = planTheme('1', 1, { masterSeed: '1', strategy: 'house-v2' });
  const held = planTheme('1', 1, { masterSeed: '1', strategy: 'house-v2', spell: { ...HOUSE, ember: 1 } });
  const again = planTheme('1', 1, { masterSeed: '1', strategy: 'house-v2', spell: { ...HOUSE, ember: 1 } });
  must(house.bpm !== held.bpm, `a pull on Ember leaves the tempo at ${house.bpm} and there is nothing for a key to separate`);
  must(held.bpm === again.bpm, 'the same spell plans two different themes');
  return `the memo carries the spell in its key and the theme that is coming is planned under the spell that has been asked for; `
    + `seed 1 theme 2 is ${house.bpm} bpm at the house and ${held.bpm} with Ember held at 1, which is what the key has to keep apart`;
});

check('the ring\'s marks for a held bird are the value and nothing beside it', () => {
  // Every mark a real value (`NOTES.md`, *The ring*): the radius is the value,
  // the percent on the title line says it in words, and **a bird's two
  // indicators are the die's two** (Eugene, 09-23: *"reuse the dice button's
  // progress indicator"*): the sector filling **inside** the node is the wait
  // from a drop to the phrase line the value applies at — the die's own
  // `spiralPath`, the die's own ink and weight — and the sweep round the
  // **outline** is the long press that lets every bird go, as the die's
  // outline is its own reset. **The filled centre is gone** (*"it does not read
  // as a custom value; the bird's position and its percentage are enough"*),
  // and so is the hairline promise ring that stood outside the node.
  must(!/\bFILL_R\b|\bFILL_HIT\b|c\.fill\b|nextArc/.test(RING), 'a filled centre or the old promise ring is still drawn');
  // (the ink is the die's own `#f2c14e`, re-based onto the colour the spell
  // asked for since the ring-look round: every gold on the ring walks with it)
  // **One family, drawn once** (round K11: the gold at 0.18 was a grey nobody
  // saw): every wait's fill is `waitFill` — the ring's gold at `WAIT_ALPHA`,
  // at least half strength — and every reset's sweep is `sweepArc` and
  // `paintSweep`, the same gold at full strength, `SWEEP_PX` screen pixels wide
  // (and on the ring's live colour, as every fill, sweep, halo and ornament is:
  // the colour it is wearing, never the one it has been asked for — round K12c)
  must(!/toneAsked\(WAIT_INK\)/.test(RING) && !/waitFill\([^)]*, true\)/.test(RING), 'a wait is drawn in the asked colour and not the one the ring wears');
  must(/const pendFill = waitFill\('path', \{ d: '' \}, knot\);/.test(RING),
    'the wait is not drawn inside the bird\'s own node, at nought, in the die\'s own ink');
  must(/cutSpiral = waitFill\('path', /.test(RING) && /cutWedge = waitFill\('rect', /.test(RING),
    'the die and the steps no longer fill themselves with the ink the birds copy');
  // (M14) the wait's ink lives in wait.ts, shared with the record tools
  must(WAIT_ALPHA >= 0.4 && WAIT_ALPHA <= 0.8, `a wait fills at ${WAIT_ALPHA}, which a phone outdoors does not see`);
  must(ringNum('SWEEP_PX') >= 2, `a reset's sweep is ${ringNum('SWEEP_PX')} px wide`);
  // **A bird's hover halo is the transport's, exactly** (round K12b: *"the
  // highlight of the player circle buttons and the bird circles are not the
  // same — we need to match"*): one pair of constants, read by both, and no
  // stroke of either halo written with a number of its own
  must(/const HALO_WIDE = \{ w: [\d.]+, op: [\d.]+ \};/.test(RING) && /const HALO_CRISP = \{ w: [\d.]+, op: [\d.]+ \};/.test(RING),
    'the halo is not one pair of constants');
  must((RING.match(/'stroke-width': HALO_WIDE\.w/g) || []).length === 2 && (RING.match(/'stroke-width': HALO_CRISP\.w/g) || []).length === 2
    && /put\(h\.crisp, 'opacity', on \? HALO_CRISP\.op : 0\);/.test(RING) && /put\(c\.markCrisp, 'opacity', \(HALO_CRISP\.op \* c\.markAt\)/.test(RING)
    && !/MARK_(?:WIDE|CRISP)/.test(RING), 'a bird\'s halo and the transport\'s are drawn with different numbers');
  must(ringNum('ORN_PX') >= 1.2 && ringNum('ORN_GAP') >= 1 && /const ORN_DASH = \[9, 6\];/.test(RING) && /function runBirdMarks\(now: number\)/.test(RING),
    'a bird in action draws no ornament, or not the track\'s dash');
  must(!/opacity: 0\.18, 'clip-path'|fill: toneAsked\('#f2c14e'\), opacity: 0\.18/.test(RING), 'a wait is still drawn at the old 0.18');
  must(/put\(c\.pendFill, 'd', spiralPath\(p, birdR - 1\.5\)\);/.test(RING), 'the wait inside a bird is not the die\'s own sector');
  const arcs = [...RING.matchAll(/= sweepArc\(/g)].length;
  must(arcs === 2 && /opacity: 0,\n\s*transform: `rotate\(-90 /.test(RING), `${arcs} outlines sweep from twelve o'clock at nought opacity, where there are two: a bird's long press and the die's`);
  must(/const holdArc = sweepArc\(x, y, birdR, hg\);/.test(RING) && /holdRing = sweepArc\(/.test(RING), 'a still press on a bird or the die draws no outline sweeping round it');
  must((RING.match(/paintSweep\((?:arc|holdRing), p, (?:birdR|ctrlR)\);/g) || []).length === 2, 'the two sweeps are not drawn by the one routine');
  // the promise's own clock is the seam's, which is the same two numbers the
  // pressed node's fill is drawn from
  must(/function seamWalk\(r: Readout\): number \{/.test(RING), 'the colour no longer reads a hand-over\'s own clock');
  must(/1 - left \/ span/.test(RING), 'the walk is not one divided by the other');
  must(/const e = seamWalk\(r\);[\s\S]{0,600}?paintToned\(e\);/.test(RING), 'the colour walk is not on the seam\'s own clock');
  // and the one word the round adds is a control's own name, in the band the
  // four actions already say theirs in
  const words = [...RING.matchAll(/txt\(gLabels, '([a-z ]+)'/g)].map((m) => m[1]);
  must(words.includes('release'), 'the release-all offer is not said in the free band');
  must(words.length === 1, `the free band now says ${words.join(', ')}, which is more than one added word`);
  // the two presses, and no key at all
  must(ringNum('RELEASE_MS') >= 500, `a long press on the centre is ${ringNum('RELEASE_MS')} ms`);
  // an arrow and a page on a focused cell step the percent the face speaks,
  // on the phone's own grid (R64: they were 0.05 and 0.2 of a value)
  must(PULL_STEP === 5 && PULL_PAGE === 20 && TAP_STEP === PULL_STEP && !/const (?:HOUSE_ZONE|PULL_STEP|PULL_PAGE|TAP_STEP) = /.test(RING),
    `an arrow steps ${PULL_STEP} %, a page ${PULL_PAGE} %, the phone ${TAP_STEP} %, or the ring states its own`);
  must(/stepPercent\(c\.bird, c\.value, 1, PULL_STEP\)/.test(RING) && /stepPercent\(c\.bird, c\.value, -1, PULL_PAGE\)/.test(RING),
    'an arrow or a page key does not step the percent');
  // and a focused cell answers arrows, pages and a delete, which is
  // accessibility on a control — and nothing else, because the page has one
  // key and it is the space bar. (The seed field answers Escape, which is a
  // text field closing and not a shortcut.)
  const body = /function cellKey\(c: CellNode, ev: KeyboardEvent\) \{([\s\S]*?)\n\}/.exec(RING);
  must(body, 'src/ring.ts no longer says what keys a focused cell answers');
  const keys = [...body[1].matchAll(/k === '([A-Za-z]+)'/g)].map((m) => m[1]).sort();
  must(keys.join(' ') === 'ArrowDown ArrowLeft ArrowRight ArrowUp Backspace Delete PageDown PageUp',
    `a focused cell answers ${keys.join(', ')}`);
  must(/ev\.stopPropagation\(\)/.test(body[1]), 'a key a focused cell answers reaches the page as well');
  // **What a hand on a bird does** (Eugene's list of 09-23), each a number in
  // the page module and each within the range he gave it: the lift, the play
  // off the axis, the double click, the hold, and the phone's step.
  must(ringNum('LIFT') > 0 && ringNum('LIFT') <= 0.25, `a lifted bird grows ${ringNum('LIFT')}, which is not "a little"`);
  must(ringNum('OFF_AXIS_PX') >= 40 && ringNum('OFF_AXIS_PX') <= 50, `a dragged bird plays ${ringNum('OFF_AXIS_PX')} px off its axis, not 40-50`);
  must(ringNum('OFF_AXIS_EDGE') > 0 && ringNum('OFF_AXIS_EDGE') < 0.5, 'the play off the axis does not close at both ends of the spoke');
  // A still press on a bird is the die's own hold, `HOLD_MS`, by name: the
  // bird's copy of the number went in round (f) of the reconciled review (D40).
  must(ringNum('HOLD_MS') === 700 && !/\bBIRD_HOLD_MS\b/.test(RING), `the hold is ${ringNum('HOLD_MS')} ms, or a bird keeps a hold of its own`);
  must(ringNum('SIZE_CORE') < 1 && ringNum('SIZE_RIM') > 1, 'a bird is not smaller at the core and bigger at the rim');
  // round K4: never more than 5 % bigger than a control, on any square
  must(ringNum('SIZE_RIM') <= 1.05, `a bird at the rim is ${ringNum('SIZE_RIM')} of a control, over the 5 % Eugene allows`);
  must(TAP_STEP > 0 && Number.isInteger(TAP_STEP), 'the phone steps a bird by something that is not whole percents');
  // and the drop is the one call to the music: a drag draws, the lift asks
  must(/liftCell\(c, false\);\n\s*endPull\(c, last\);/.test(RING), 'the value is not asked for at the drop');
  must(!/setPull\([^)]*\);\s*\n\s*control\.setSpell/.test(RING) && (RING.match(/control\.setSpell\(/g) || []).length === 1,
    'the spell is set somewhere other than the one commit');
  return `the radius is the value, the percent on the title line says it, and a bird's two indicators are the die's: the sector filling `
    + `inside the node is the wait to the phrase line, off the seam's own clock, the same two numbers the die fills from, and the sweep `
    + `round the outline is the long press; no filled centre and no ring outside the node; a still press on any bird `
    + `lets every bird go after ${ringNum('HOLD_MS')} ms, the die's own hold; a lifted bird grows ${ringNum('LIFT')} and plays `
    + `${ringNum('OFF_AXIS_PX')} px off its axis through the middle of the spoke; the phone and an arrow step ${TAP_STEP} % at a press, a page ${PULL_PAGE} %; one added word, "release", `
    + `said in the four actions' own band after ${ringNum('RELEASE_MS')} ms, taken by a second press and by no key; `
    + `a focused cell answers ${keys.length} keys and every one of them stops there`;
});

check('a throw is a clear attempt, and lands on a plain roll', () => {
  // Eugene, 09-23: *"only an obvious drag spins the ring: press, a significant
  // travel of the pointer, release — and drop 'how far the drag, how far the
  // seed': the next roll is a plain random seed."* So the release casts only
  // past both marks, and what it casts is the transport's own random seed.
  const body = /case 'spin': \{([\s\S]*?)\n    \}\n/.exec(RING);
  must(body, 'src/ring.ts no longer says what a release of the star does');
  must(/if \(spun < SPIN_CAST_DEG \|\| d\.px < SPIN_CAST_PX\)/.test(body[1]), 'a release casts without both a clear turn and a clear travel');
  // **only a finger** (round K3): a mouse's drag on the open ring is nothing
  // (since K14 a finger's touch is decided by its motion, and round the ring
  // it is the star's spin wherever it began: `decideFinger`)
  must(/else if \(hit\.kind === 'spin' && e\.pointerType === 'touch'\) dragging = fingerDrag\(null/.test(RING)
    && /if \(e\.pointerType === 'touch'\) \{[\s\S]{0,160}dragging = fingerDrag\(hit\.cell/.test(RING)
    && /const sd = spinDrag\('spin', d\.f0, null, e\);/.test(RING), 'a mouse can still spin the ring, or a finger\'s swipe round it is not the spin');
  must(!/spinDrag\('cell'/.test(RING), 'a mouse\'s drag on a reading cell can still become a spin');
  must(/castPlain\(spun, vel\);/.test(body[1]) && !/castNewSeed|bandOf|powerOf/.test(body[1]), 'a throw still reaches into a ranking by how hard it was thrown');
  must(/const seed = String\(control\.newSeed\(\)\);/.test(RING), 'a throw does not land on the transport\'s own roll');
  must(!/\bBANDS\b|\bbandOf\b|\bpowerOf\b/.test(RING), 'the power bands are still in the page');
  must(SPIN_CAST_DEG >= 30 && SPIN_CAST_PX >= 40, `a throw casts at ${SPIN_CAST_DEG} degrees and ${SPIN_CAST_PX} px, which a mis-drag reaches`);
  return `a release casts past ${SPIN_CAST_DEG} degrees of turn and ${SPIN_CAST_PX} screen pixels of travel and not before, and lands on the transport's own random seed`;
});

// A tap on the die asks for the room or the key, which is the pair nothing else
// can disguise. Casting four or five times used to land on four or five
// versions of the same record.
//
// **Through the ring's own pool and pick** (`src/cast-pool.ts`), and planned as
// the page plans a candidate: the engine a bare link plays, house-v2, with the
// spell and recipe a seed of its own is cast under, which at a bare link is the
// house. This check copied the ring's call and so tested the record: every
// candidate planned with no strategy was house-v1 on a v2 page (R59).
check('twenty taps from seed 1', () => {
  const preset = 'auto';
  const strategy = 'house-v2';
  const plan = (seed) => {
    const cast = recipesFor({ masterSeed: seed, strategy, search: '' });
    return planTheme(seed, 0, { masterSeed: seed, preset, strategy, spell: cast.spell, recipe: cast.track });
  };
  let here = SEED_MIN;
  let cur = plan(String(here));
  must(cur.style.id === 'deep-house-v2', `a candidate under ${strategy} was planned in the style ${cur.style.id}`);
  const walk = [String(here)];
  const rnd = mulberry(20260917);
  let narrowest = 99;
  for (let tap = 0; tap < 20; tap++) {
    const pool = castPool({ cur, here, dir: 0, rnd, plan, candidates: CANDIDATES, seedMin: SEED_MIN, seedMax: SEED_MAX });
    must(pool.length > 0, `tap ${tap + 1} from seed ${here}: not one candidate could be planned under ${strategy}`);
    const fresh = pool.filter((c) => FLOOR.fresh(c.parts));
    must(fresh.length > 0, `tap ${tap + 1} from seed ${here}: not one of ${pool.length} candidates moves the room or the key`);
    if (fresh.length < narrowest) narrowest = fresh.length;
    must(pool.every((c) => c.plan.style.id === 'deep-house-v2'), `tap ${tap + 1}: a candidate was planned outside house-v2`);
    const pick = pickCast(pool, TAP_BAND, FLOOR.fresh);
    must(FLOOR.fresh(pick.parts), `tap ${tap + 1} landed on seed ${pick.seed}, which is the same room and the same key`);
    must(pick.distance > 0, `tap ${tap + 1} landed on a record no die apart from the one playing`);
    here = Number(pick.seed);
    cur = pick.plan;
    walk.push(String(here));
  }
  must(new Set(walk).size === walk.length, `the walk came back to a seed it had already played: ${walk.join(' ')}`);
  return `${walk.length - 1} taps under ${strategy}, through the ring's own pool, each moving the room or the key, none repeating a seed; the narrowest pool of ${CANDIDATES} still offered ${narrowest} records that did`;
});

// --- the loudness fit is the one that was measured --------------------------
//
// Nine themes and what the fit says about them, **stated here rather than read
// out of the code this checks**, the way the seam floor and the ring's cast
// constants are: a check that takes its answer from the thing it is checking
// passes whatever that thing becomes. If a coefficient, a centre, the window
// rule, a column, either slope or a timbre's declared loudness moves, these
// numbers move with it and this fails naming the theme. A theme on each side of
// the target is in the list on purpose, because the two slopes are not one.
//
// They were read off the build of 2026-09-17 that the 120-theme measurement
// blessed (tools/loudness-fit.ts, tmp/analysis/loudness-fit.md).
const LOUDNESS_PREDICTIONS = [
  // master seed, theme, predicted LUFS, trim dB
  ['1', 0, -12.9961, -0.005],
  ['1', 1, -13.9744, 1.46],
  ['1', 2, -13.5329, 0.799],
  ['92970', 0, -12.5152, -0.633],
  ['21323', 2, -13.5808, 0.87],
  ['15576', 0, -13.2867, 0.43],
  ['15576', 1, -12.1831, -1.066],
  ['25417', 1, -11.8646, -1.482],
  ['68299', 1, -13.1407, 0.211],
];

check('the loudness fit reproduces what it was measured on', () => {
  for (const [seed, n, lufs, trim] of LOUDNESS_PREDICTIONS) {
    const t = planTheme(seed, n, {});
    const got = predictedLufs(t);
    must(Math.abs(got - lufs) < 0.001, `master seed ${seed} theme ${n} is predicted at ${got.toFixed(4)} LUFS where the fit was blessed at ${lufs}`);
    must(t.trimDb === trim, `master seed ${seed} theme ${n} trims ${t.trimDb} dB where the fit was blessed at ${trim}`);
    must(loudnessTrimDb(t) === t.trimDb, `master seed ${seed} theme ${n}: the trim on the plan is ${t.trimDb} and the fit says ${loudnessTrimDb(t)}`);
  }
  // And nothing in a wide sweep leaves the clamp or comes back as anything but
  // a number, because the trim becomes an AudioParam and a NaN there is silence.
  const P = BASE_SETTINGS.loudness;
  let lo = Infinity, hi = -Infinity, sum = 0, count = 0;
  for (let s = 1; s <= 60; s++) {
    for (let i = 0; i < 3; i++) {
      const t = planTheme(String(s), i, {});
      must(Number.isFinite(t.trimDb), `master seed ${s} theme ${i} trims ${t.trimDb}`);
      must(Math.abs(t.trimDb) <= P.clampDb, `master seed ${s} theme ${i} trims ${t.trimDb} dB, past the ${P.clampDb} dB clamp`);
      // The window the fit reads has to be inside the theme, always.
      const w = loudnessWindow(t, STYLE.loudness.windowBars);
      must(w.from >= 0 && w.from + w.bars <= t.bars && w.bars >= 1, `master seed ${s} theme ${i}: the loudness window is bars ${w.from}..${w.from + w.bars} of ${t.bars}`);
      lo = Math.min(lo, t.trimDb); hi = Math.max(hi, t.trimDb); sum += t.trimDb; count++;
    }
  }
  // Every coefficient has to name a column that exists, or it is read as zero
  // and the record is levelled by a fit nobody can see is broken.
  for (const k of Object.keys(P.coef)) must(LOUDNESS_COLUMNS[k], `the table's loudness.coef names ${k}, which is not a column in src/loudness.ts`);
  // ...and reads a *number* off a plan: a `share_` column is read off the
  // style's own lane gates by name, so a lane renamed under a fit that still
  // names the old word reads `undefined`, the prediction is NaN, the trim is
  // NaN, and the theme's output gain is a NaN AudioParam, which is silence
  // with no line in any log. Held here for every strategy against its own
  // coefficients, on a planned theme rather than on a mock.
  for (const id of STRATEGY_IDS) {
    const style = STRATEGIES[id].style;
    const f = loudnessFeatures(planTheme('1', 0, { preset: 'auto', strategy: id }), style);
    for (const k of Object.keys(style.settings.loudness.coef)) {
      const v = LOUDNESS_COLUMNS[k](f);
      must(Number.isFinite(v), `${id}: the column ${k} reads ${v} off a planned theme, and a coefficient on that is a NaN trim`);
    }
  }
  const mean = sum / count;
  must(Math.abs(mean) < 0.5, `the trim averages ${mean.toFixed(2)} dB over ${count} themes, so it is moving the record and not levelling it`);
  // ...and the same sweep under **every other strategy**, against its own
  // model. A second palette gets its own coefficients (round K6) and what has to
  // hold of any of them is the same three things: a finite number, inside the
  // clamp, and a clamp that is a clamp rather than the place the model lives.
  // The mean is **not** held to the record's half a decibel: a model fitted on a
  // palette that measures louder than the record levels it *down*, and house-v2
  // does, which is the fit working and not the fit moving anything.
  const others = [];
  for (const id of STRATEGY_IDS.filter((x) => x !== DEFAULT_STRATEGY)) {
    const M = STRATEGIES[id].style.settings.loudness;
    let n = 0, at = 0, sum2 = 0, lo2 = Infinity, hi2 = -Infinity;
    for (let sd = 1; sd <= 60; sd++) {
      for (let i = 0; i < 3; i++) {
        const t = planTheme(String(sd), i, { preset: 'auto', strategy: id });
        must(Number.isFinite(t.trimDb), `${id}: master seed ${sd} theme ${i} trims ${t.trimDb}`);
        must(Math.abs(t.trimDb) <= M.clampDb, `${id}: master seed ${sd} theme ${i} trims ${t.trimDb} dB, past the ${M.clampDb} dB clamp`);
        if (Math.abs(Math.abs(t.trimDb) - M.clampDb) < 1e-9) at++;
        sum2 += t.trimDb; lo2 = Math.min(lo2, t.trimDb); hi2 = Math.max(hi2, t.trimDb); n++;
      }
    }
    must(at / n < 0.1, `${id}: ${at} of ${n} themes sit on the ±${M.clampDb} dB clamp, which is a model out of travel and not a clamp`);
    others.push(`${id} ${n} trims between ${lo2.toFixed(2)} and ${hi2.toFixed(2)} averaging ${sum2 / n >= 0 ? '+' : ''}${(sum2 / n).toFixed(2)}, ${at} on the clamp`);
  }
  return `${LOUDNESS_PREDICTIONS.length} themes predicted to a thousandth of a decibel, ${Object.keys(P.coef).length} coefficients all naming a column, and ${count} trims between ${lo.toFixed(2)} and ${hi.toFixed(2)} dB averaging ${mean >= 0 ? '+' : ''}${mean.toFixed(2)}; ${others.join('; ')}`;
});

// house-v2 levels a theme by its **loudest** main, and never trims it past the
// headroom its peakiest main has (09-22). Seed 20 theme 0 is why: its first
// long main past bar 16 has the pad gated off, the fit read it quiet and handed
// the theme +2.90 dB, and where the swell pad and the glass stabs play together
// that drove the limiter 10.8 dB deep in 22 % of its blocks. What is held here
// is the plan side of it, over seeds 1-200 and every theme a set of three
// plays; tools/loudness-fit.ts --limiter is the render side.
check('house-v2 levels its loudest main and never trims past its headroom', () => {
  const v1 = STRATEGIES['house-v1'].style;
  const v2 = STRATEGIES['house-v2'].style;
  const M = v2.settings.loudness;
  const W = v2.loudness.windowBars;
  must(M.window === 'loudest', `house-v2's loudness model reads the ${M.window ?? 'first'} window`);
  must(!('window' in v1.settings.loudness) && !('headroom' in v1.settings.loudness), 'house-v1\'s model acquired a window rule or a headroom');
  // The record reads the window it always read, bar for bar.
  for (let sd = 1; sd <= 60; sd++) for (let i = 0; i < 3; i++) {
    const t = planTheme(String(sd), i, {});
    const a = trimWindow(t, v1), b = loudnessWindow(t, v1.loudness.windowBars);
    must(a.from === b.from && a.bars === b.bars, `house-v1 master seed ${sd} theme ${i}: the trim is fitted at bar ${a.from} where the record's rule says ${b.from}`);
  }
  const residual = v2LoudnessFit.residual.crossValidated;
  const slope = (t) => (t >= 0 ? M.slopeUp : M.slopeDown);
  let n = 0, moved = 0, positive = 0, held = 0, worst = -Infinity, worstAt = '';
  for (let sd = 1; sd <= 200; sd++) for (let i = 0; i < 3; i++) {
    const t = planTheme(String(sd), i, { preset: 'auto', strategy: 'house-v2' });
    const w = trimWindow(t, v2);
    const first = loudnessWindow(t, W);
    const sec = t.arrangement.sections.find((x) => x.startBar <= w.from && w.from + w.bars <= x.startBar + x.bars);
    const mains = t.arrangement.sections.some((x) => x.kind === 'main' && x.bars >= W);
    if (mains) must(sec && sec.kind === 'main' && w.bars === W && w.from >= 2, `house-v2 master seed ${sd} theme ${i}: the trim is fitted at bars ${w.from}..${w.from + w.bars}, which is not eight bars of one main`);
    const loud = predictedLufs(t, v2, w);
    must(loud >= predictedLufs(t, v2, first) - 1e-9, `house-v2 master seed ${sd} theme ${i}: the window the trim is fitted for reads ${loud.toFixed(2)} LUFS, quieter than the first main's ${predictedLufs(t, v2, first).toFixed(2)}`);
    if (w.from !== first.from) moved++;
    // No theme is predicted, at its loudest main and with its trim, over the
    // target by more than the fit's own error: the clamp is the only thing that
    // could leave one there, and it may not.
    const after = loud + t.trimDb * slope(t.trimDb);
    must(after <= M.targetLufs + residual, `house-v2 master seed ${sd} theme ${i}: predicted ${after.toFixed(2)} LUFS at its loudest main with its trim, more than the fit's ${residual} LU over ${M.targetLufs}`);
    if (after > worst) { worst = after; worstAt = `${sd}#${i}`; }
    // ...and no trim past the headroom, less the model's margin, unless the
    // clamp stopped it first.
    const room = headroomDb(t, v2);
    if (M.headroom) {
      must(room != null && Number.isFinite(room), `house-v2 master seed ${sd} theme ${i}: no headroom read`);
      const cap = room - M.headroom.marginDb;
      must(t.trimDb <= cap + 1e-3 || t.trimDb === -M.clampDb, `house-v2 master seed ${sd} theme ${i}: trims ${t.trimDb} dB past its headroom of ${cap.toFixed(2)}`);
      if (cap < (M.targetLufs - loud) / slope(M.targetLufs - loud)) held++;
    }
    if (t.trimDb > 0) positive++;
    n++;
  }
  // The theme that was heard, held to what it guards rather than to a sign: it
  // is levelled at the loudest of its mains, never below the first long main
  // past bar 16 that handed it +2.90 dB on 09-22 (bars 82-90, the pad gated
  // off), and its trim never passes the headroom that window has. Whether that
  // window then stays under the per-theme line is a render, and is
  // `tools/loudness-fit.ts --strategy house-v2 --limiter`'s to say.
  const s20 = planTheme('20', 0, { preset: 'auto', strategy: 'house-v2' });
  const w20 = trimWindow(s20, v2);
  must(predictedLufs(s20, v2, w20) >= predictedLufs(s20, v2, loudnessWindow(s20, W)) - 1e-9,
    `house-v2 seed 20 theme 0 is levelled at bars ${w20.from}..${w20.from + W}, which the fit reads quieter than the first main's window`);
  must(s20.trimDb <= headroomDb(s20, v2) - M.headroom.marginDb + 1e-3,
    `house-v2 seed 20 theme 0 trims ${s20.trimDb} dB, past its headroom of ${(headroomDb(s20, v2) - M.headroom.marginDb).toFixed(2)}`);
  return `house-v1 reads its first-main window on 180 themes; house-v2 fits ${n} themes at their loudest main (${moved} of them not the first main's window), none predicted more than ${residual} LU over the target (worst ${worst.toFixed(2)} at ${worstAt}), ${held} held by the headroom, ${positive} trimmed up; seed 20 trims ${s20.trimDb} dB at bars ${w20.from}..${w20.from + W}, inside its headroom`;
});

// **The trim reads its window once, and reads it as the walk did** (the
// reconciled review of 09-24, R31). A plan's trim and its headroom used to find
// the loudest window twice, and each of the hundred-odd windows walked every
// event of the theme — seed 1's first theme 266 walks of 4508 events, 1.2
// million visits, two thirds of a house-v2 plan. The events are put in bars
// once now; this holds that the window found is the walked one, the features
// read there are the walked features to the bit, and the reads are a budget
// stated here: at most WALKS walks' worth of the theme's events per trim.
check('the trim finds its window once, and finds the one the walk found', () => {
  const v2 = strategyById('house-v2').style;
  const W = v2.loudness.windowBars;
  const WALKS = 16;
  let worst = 0, worstAt = '', n = 0;
  for (let sd = 1; sd <= 24; sd++) for (const spell of [null, { ember: 0.6 }]) {
    const t = planTheme(String(sd), 0, { strategy: 'house-v2', spell });
    // the walk, as it was: every eight bars of every main, read by the whole fit
    let best = null, loudest = -Infinity;
    for (const s of t.arrangement.sections) {
      if (s.kind !== 'main' || s.bars < W) continue;
      for (let from = Math.max(2, s.startBar); from + W <= Math.min(t.bars, s.startBar + s.bars); from++) {
        const v = predictedLufs(t, v2, { from, bars: W });
        if (v > loudest) { loudest = v; best = { from, bars: W }; }
      }
    }
    const w = trimWindow(t, v2);
    const at = `seed ${sd} theme 0${spell ? ' at ember 0.6' : ''}`;
    if (best) must(w.from === best.from && w.bars === best.bars, `${at}: the trim is fitted at bar ${w.from} and the walk finds bar ${best.from}`);
    const a = loudnessFeatures(t, v2), b = loudnessFeatures(t, v2, w);
    for (const k of Object.keys(b)) must(Object.is(a[k], b[k]), `${at}: ${k} reads ${a[k]} through the bars and ${b[k]} by the walk`);
    // and how many events a trim reads, against the theme's own count
    let reads = 0;
    const events = new Proxy(t.events, { get(o, k, r) { if (typeof k === 'string' && /^\d+$/.test(k)) reads++; return Reflect.get(o, k, r); } });
    must(loudnessTrimDb({ ...t, events }, v2) === t.trimDb, `${at}: the trim is not the plan's`);
    const walks = reads / t.events.length;
    must(walks <= WALKS, `${at}: a trim reads ${reads} events, ${walks.toFixed(1)} walks of the theme's ${t.events.length}, over the budget of ${WALKS}`);
    if (walks > worst) { worst = walks; worstAt = at; }
    n++;
  }
  return `${n} house-v2 themes fitted at the window the walk finds, the features to the bit; a trim reads at most ${worst.toFixed(1)} walks of its theme's events (${worstAt}), the budget ${WALKS}`;
});

// **The lead statistic is the session's last few minutes, not its first**
// (R91): it stopped filling at 4096 notes, so an hour in it still described the
// first minutes, and every note paid a string round trip to be kept.
check('the scheduler\'s lead statistic keeps the newest notes', () => {
  const ctx = { currentTime: 0, baseLatency: 0, outputLatency: 0 };
  for (let i = 0; i < 6000; i++) startTime(ctx, i < 1000 ? 1 : 2);
  const s = leadStats();
  must(s.notes === 4096, `it holds ${s.notes} notes, not the last 4096`);
  must(s.min === 2 && s.max === 2, `after 1000 notes led by one second and 5000 by two, it reads ${s.min}..${s.max}`);
  return `after 6000 notes it holds the last ${s.notes}, all led by two seconds as they were`;
});

check('the style distance is a distance', () => {
  const a = planTheme('1', 0, {});
  const b = planTheme('15576', 1, {});
  must(styleDistance(a, a).distance === 0, 'a theme is not nought away from itself');
  must(Math.abs(styleDistance(a, b).distance - styleDistance(b, a).distance) < 1e-12, 'it is not symmetric');
  let hi = 0, lo = 1;
  for (let s = 2; s <= 61; s++) {
    const d = styleDistance(a, planTheme(String(s), 0, {})).distance;
    must(d >= 0 && d <= 1, `seed ${s} scores ${d}`);
    if (d > hi) hi = d;
    if (d < lo) lo = d;
  }
  must(hi > 0.5, `no seed in sixty gets further than ${hi.toFixed(3)} from seed 1, so the scale is not being used`);
  return `nought against itself, symmetric, and sixty other seeds against seed 1 spread ${lo.toFixed(3)} to ${hi.toFixed(3)}`;
});

// --- the exact-boundary sampler --------------------------------------------
//
// The review's counterexample, in full: `pick` is `floor(u * n)` and `weighted`
// subtracts until `r <= 0`, so over two equal entries `u = 0.5` is the second
// for one and the first for the other, and a weight-0 entry catches `u = 0`
// outright. A finite random sweep that misses the boundaries is not a proof of
// anything; this is the proof, and it is the reason `pickWeighted` exists.
//
// What is checked: that for every list length the legacy dice actually draw
// from, and for every value of `u` that can sit on a boundary — nought, each
// `k/n`, the two floats either side of each `k/n`, `k/n` plus and minus
// 2^-52, and the largest `u` the generator can return — `pickWeighted` with
// equal weights is `pick`, entry for entry; that a weight-0 entry inserted at
// any position changes nothing for any of them; and that both consume exactly
// one number from the stream, because a sampler that drew twice would
// reshuffle everything behind it however right its answer was.
const BITS = new DataView(new ArrayBuffer(8));
// The float next door, in either direction: `k/n ± 2^-52` is a boundary probe
// and this is the real neighbour, which for a `u` near nought is much closer.
function nextFloat(x, dir) {
  if (x === 0) return dir > 0 ? Number.MIN_VALUE : 0;
  BITS.setFloat64(0, x);
  BITS.setBigUint64(0, BITS.getBigUint64(0) + BigInt(dir));
  return BITS.getFloat64(0);
}
// One draw at a stated `u`, with the number of times the stream was asked.
function drawAt(u, take) {
  const r = new Rng(1);
  let draws = 0;
  r.next = () => { draws++; return u; };
  return { got: take(r), draws };
}
check('the exact-boundary sampler', () => {
  const EPS = Math.pow(2, -52);
  const MAX_U = 1 - Math.pow(2, -53); // the largest double under one
  let boundaries = 0, zeroed = 0, random = 0;
  for (let n = 1; n <= 12; n++) {
    const list = Array.from({ length: n }, (_, i) => `e${i}`);
    const us = [0, MAX_U, 1 - EPS];
    for (let k = 0; k <= n; k++) {
      const b = k / n;
      us.push(b, b + EPS, b - EPS, nextFloat(b, 1), nextFloat(b, -1));
    }
    for (const u of us) {
      if (!(u >= 0 && u < 1)) continue; // the generator returns [0, 1)
      const a = drawAt(u, (r) => r.pick(list));
      const b = drawAt(u, (r) => r.pickWeighted(list, () => 1));
      must(a.got === b.got, `n=${n}, u=${u}: pick gives ${a.got} and pickWeighted gives ${b.got}`);
      must(a.draws === 1 && b.draws === 1, `n=${n}, u=${u}: ${a.draws} draws against ${b.draws}`);
      boundaries++;
      // And the disabled entry, at every position in the list: it is dropped
      // before anything is drawn, so it cannot catch a boundary.
      for (let at = 0; at <= n; at++) {
        const padded = [...list.slice(0, at), 'disabled', ...list.slice(at)];
        const c = drawAt(u, (r) => r.pickWeighted(padded, (v) => (v === 'disabled' ? 0 : 1)));
        must(c.got === a.got, `n=${n}, u=${u}, a weight-0 entry at ${at}: ${c.got} where pick gives ${a.got}`);
        zeroed++;
      }
    }
  }
  // And a hundred thousand ordinary draws on top, over every length.
  const rnd = mulberry(20260917);
  for (let i = 0; i < 100000; i++) {
    const u = rnd();
    for (let n = 1; n <= 12; n++) {
      const list = Array.from({ length: n }, (_, k) => `e${k}`);
      const a = drawAt(u, (r) => r.pick(list));
      const b = drawAt(u, (r) => r.pickWeighted(list, () => 1));
      must(a.got === b.got, `n=${n}, u=${u}: pick gives ${a.got} and pickWeighted gives ${b.got}`);
      random++;
    }
  }
  // And the review's counterexample itself, kept as a live fact rather than as a
  // paragraph: `weighted` really does disagree with `pick` at the boundary, so
  // this whole check has a reason and the reason can be read off a run. If
  // these three ever stop holding, `weighted`'s semantics have moved and every
  // list that draws through it has moved with them.
  must(drawAt(0.5, (r) => r.pick(['a', 'b'])).got === 'b', 'pick no longer gives the second of two at u = 0.5');
  must(drawAt(0.5, (r) => r.weighted([{ v: 'a', w: 1 }, { v: 'b', w: 1 }])).got === 'a',
    'weighted no longer gives the first of two at u = 0.5, so the counterexample this sampler answers has moved');
  must(drawAt(0, (r) => r.weighted([{ v: 'off', w: 0 }, { v: 'a', w: 1 }, { v: 'b', w: 1 }])).got === 'off',
    'weighted no longer hands u = 0 to a weight-0 entry');
  must(drawAt(0, (r) => r.pickWeighted(['off', 'a', 'b'], (v) => (v === 'off' ? 0 : 1))).got === 'a',
    'pickWeighted hands u = 0 to the entry it dropped');

  // The unequal case is the same half-open interval, scaled: weights 1, 2, 1
  // over four make the cuts at 0.25 and 0.75, and each cut belongs to the
  // entry above it.
  const three = ['a', 'b', 'c'];
  const w = (v) => ({ a: 1, b: 2, c: 1 })[v];
  const cuts = [[0, 'a'], [0.249999, 'a'], [0.25, 'b'], [0.749999, 'b'], [0.75, 'c'], [MAX_U, 'c']];
  for (const [u, want] of cuts) {
    const got = drawAt(u, (r) => r.pickWeighted(three, w)).got;
    must(got === want, `weights 1,2,1 at u=${u} give ${got} and not ${want}`);
  }
  // Nothing with no weight is ever drawn, and a list with no weight at all is
  // an empty list, which is what `pick([])` is.
  must(drawAt(0, (r) => r.pickWeighted(['x'], () => 0)).got === undefined, 'a list of nothing but zeros drew something');
  must(drawAt(0, (r) => r.pickWeighted([], () => 1)).got === undefined, 'an empty list drew something');
  for (let i = 0; i < 2000; i++) {
    const got = drawAt(i / 2000, (r) => r.pickWeighted(['off', 'a', 'off', 'b'], (v) => (v === 'off' ? 0 : 1))).got;
    must(got === 'a' || got === 'b', `a zero-weight entry was drawn at u=${i / 2000}`);
  }
  return `lengths 1-12: ${boundaries} boundary values and ${random} random ones agree with pick entry for entry on one draw each, ${zeroed} of them with a weight-0 entry inserted at every position, and the unequal case cuts at ${cuts.length} stated intervals`;
});


// --- the catalogue is complete, and every table names something real --------
// Round B's gate. The registry is a lookup table and never a pool, which only
// means anything if three things hold: every descriptor is complete, every
// table and every frozen candidate list resolves to something the machine can
// actually play, and nothing has quietly started naming an instrument again.
// All of it is arithmetic over two dozen objects, so it costs about a
// millisecond and runs on every commit.
const TYPE_OF = {
  string: (v) => typeof v === 'string' && v.length > 0,
  boolean: (v) => typeof v === 'boolean',
  array: (v) => Array.isArray(v),
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  function: (v) => typeof v === 'function',
  'string-or-null': (v) => v === null || (typeof v === 'string' && v.length > 0),
  'function-or-null': (v) => v === null || typeof v === 'function',
};
const TIMBRE_FIELDS = { family: 'string', struck: 'boolean', hold: 'number', brightnessHz: 'number', loudnessDb: 'number' };
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

check('every descriptor is complete', () => {
  const seen = new Set();
  let fields = 0, timbres = 0;
  for (const d of REGISTRY) {
    const where = `the descriptor for ${d && d.name}`;
    for (const [k, type] of Object.entries(FIELDS)) {
      must(k in d, `${where} has no ${k}`);
      must(TYPE_OF[type](d[k]), `${where}: ${k} is ${JSON.stringify(d[k])} where a ${type} was wanted`);
      fields++;
    }
    must(!seen.has(d.name), `${where}: two voices are called ${d.name}`);
    seen.add(d.name);
    must(FAMILIES.includes(d.family), `${where}: ${d.family} is not one of ${FAMILIES.join(', ')}`);
    must(d.roles.length, `${where}: it plays no role at all`);
    for (const r of d.roles) must(ROLES.includes(r), `${where}: ${r} is not one of ${ROLES.join(', ')}`);
    must(BUSES.includes(d.bus), `${where}: ${d.bus} is not one of ${BUSES.join(', ')}`);
    must(d.level in BASE_SETTINGS.levels, `${where}: its level ${d.level} is not in the table's levels`);
    must(d.plays === null || ARRANGEMENT_LAYERS.includes(d.plays), `${where}: it says it is gated by ${d.plays}`);
    must(!d.mood.length, `${where}: mood carries words and nothing reads them`);
    for (const [t, facts] of Object.entries(d.timbres)) {
      for (const [k, type] of Object.entries(TIMBRE_FIELDS))
        must(typeof facts[k] === type, `${where}: timbre ${t}'s ${k} is ${JSON.stringify(facts[k])}`);
      must(Number.isFinite(facts.loudnessDb), `${where}: timbre ${t} has no measured loudness`);
      timbres++;
    }
    for (const t of d.dispatches) must(t in TIMBRES, `${where}: it dispatches ${t}, which no module declares`);
  }
  return `${REGISTRY.length} voices, ${fields} fields, ${timbres} timbres, ${new Set(REGISTRY.map((d) => d.family)).size} of the ${FAMILIES.length} families in use`;
});

check('the derived tables are the registry, in its order', () => {
  const names = REGISTRY.map((d) => d.name);
  must(same(Object.keys(VOICES), names), 'VOICES is not the registry in the registry\'s order');
  must(same(Object.keys(VOICE_BUS), names), 'VOICE_BUS is not the registry in the registry\'s order');
  must(same(Object.keys(VOICE_LEVEL), names), 'VOICE_LEVEL is not the registry in the registry\'s order');
  for (const d of REGISTRY) {
    must(VOICES[d.name] === d.render, `VOICES.${d.name} is not the function its module registered`);
    must(VOICE_BUS[d.name] === d.bus && VOICE_LEVEL[d.name] === d.level, `${d.name}'s bus or level does not match its descriptor`);
  }
  const timbres = [];
  for (const d of REGISTRY) for (const t of Object.keys(d.timbres)) timbres.push(t);
  must(same(Object.keys(TIMBRES), timbres), 'TIMBRES is not the modules\' own tables in the registry\'s order');
  // And the tables the page and the fit read.
  must(LAYER_ORDER === ARRANGEMENT_LAYERS, 'control.ts keeps a layer order of its own');
  must(same(Object.keys(LAYER_LABEL), ARRANGEMENT_LAYERS), 'LAYER_LABEL is not one word per arrangement layer, in order');
  for (const L of LANES) {
    for (const l of L.layers) must(ARRANGEMENT_LAYERS.includes(l), `lane ${L.id} gates on ${l}, which no voice is gated by`);
    for (const e of L.events) must(EVENT_LAYERS.includes(e), `lane ${L.id} reads events on ${e}, which no voice writes`);
    must(L.events.length, `lane ${L.id} draws no events at all: no registered voice plays a role it names`);
  }
  const laneLayers = LANES.flatMap((L) => L.events);
  must(same([...laneLayers].sort(), [...EVENT_LAYERS].sort()), 'the lanes do not cover every event layer exactly once');
  // The stage's three lanes are the layers the registry says may be treated.
  const treated = layersWhere((d) => d.treat);
  must(same([...STAGE_LAYERS].sort(), [...treated].sort()), `the stage moves ${STAGE_LAYERS.join(', ')} where the registry says ${treated.join(', ')} may be moved`);
  must(same(Object.keys(STAGE_LEVEL).sort(), [...treated].sort()), 'the compiler\'s LEVEL table is not one row per treatable layer');
  for (const l of STAGE_HARMONIC) must(STAGE_LAYERS.includes(l), `the stage calls ${l} harmonic and does not move it`);
  // The eight cells of the ring, mirrored out of the page module the way its
  // cast constants are, because it cannot be imported in node.
  const cells = [...RING.matchAll(/\{\s*id:\s*'([a-z]+)',\s*layer:\s*'([a-zA-Z]+)'\s*\}/g)].map((m) => [m[1], m[2]]);
  must(cells.length === ARRANGEMENT_LAYERS.length, `${cells.length} cells on the star against ${ARRANGEMENT_LAYERS.length} arrangement layers`);
  must(same(cells.map((c) => c[1]).sort(), [...ARRANGEMENT_LAYERS].sort()), 'the star\'s eight cells are not the eight arrangement layers, one each');
  // And the arrangement itself names nothing else.
  const track = planTheme('1', 0, {});
  for (const row of track.timeline)
    for (const l of row.layers) must(ARRANGEMENT_LAYERS.includes(l), `the arrangement switched on ${l}, which no voice is gated by`);
  return `${Object.keys(VOICES).length} voices, ${Object.keys(TIMBRES).length} timbres, ${ARRANGEMENT_LAYERS.length} arrangement layers, ${EVENT_LAYERS.length} event layers, ${LANES.length} lanes, ${cells.length} cells and the stage's ${STAGE_LAYERS.length} all agree with the registry`;
});

check('every frozen candidate list resolves', () => {
  let entries = 0;
  for (const c of CATALOGUE) {
    const list = c.list();
    must(Array.isArray(list) && list.length, `${c.id} (${c.where}) is not a list with anything in it`);
    for (const v of list) {
      entries++;
      if (c.of === 'room') {
        must(v in PRESETS, `${c.id}: no room called ${v}`);
        must(PRESETS[v].bench, `${c.id}: the room ${v} was never measured against a benchmark minute`);
      } else if (c.of === 'timbre') {
        must(v in TIMBRES, `${c.id}: ${v} is a timbre no registered voice makes`);
      } else if (c.of === 'mask') {
        must(v && typeof v.m === 'string' && v.m.length, `${c.id}: a mined row with no mask on it`);
      } else {
        must(v !== undefined && v !== null && v !== '', `${c.id}: an empty candidate`);
      }
    }
    if (c.of === 'timbre') for (const v of list) {
      const by = REGISTRY.filter((d) => d.name === v || d.dispatches.includes(v));
      must(by.length, `${c.id}: ${v} is declared but no registered voice plays it`);
    }
  }
  // Named by reference: the lists that live beside the measurement that
  // produced them have to still be the lists the dice actually read.
  const T = BASE_SETTINGS.timbre;
  const byId = Object.fromEntries(CATALOGUE.map((c) => [c.id, c.list()]));
  must(same(byId.leadTimbres, T.lead.map((o) => o.v)), 'the catalogue\'s lead list is not the table\'s timbre.lead');
  must(same(byId.sustainedLeads, T.sustained), 'the catalogue\'s sustained list is not the table\'s timbre.sustained');
  must(same(byId.padPartners, T.padPartner.map((o) => o.v)), 'the catalogue\'s pad partners are not the table\'s timbre.padPartner');
  must(same(byId.stabPartners, T.stabPartner.map((o) => o.v)), 'the catalogue\'s stab partners are not the table\'s timbre.stabPartner');
  must(same(byId.densities, BASE_SETTINGS.density.weights.map((o) => o.v)), 'the catalogue\'s densities are not the table\'s density.weights');
  must(same(byId.densityLabels, byId.densities), 'the density words and the density die do not name the same three things');
  must(same(byId.keyRoots, BASE_SETTINGS.key.roots), 'the catalogue\'s roots are not the table\'s key.roots');
  for (const id of UNREACHABLE) must(byId[id], `the reachability note names ${id}, which is not a candidate list`);
  return `${CATALOGUE.length} lists, ${entries} candidates, every room measured, every timbre made by a registered voice; ${UNREACHABLE.length} of the lists are unreachable in the released catalogue and say so`;
});

check('the loudness fit still names no instrument', () => {
  const rooms = Object.keys(PRESETS);
  const voices = REGISTRY.map((d) => d.name);
  const families = [...FAMILIES, ...new Set(Object.values(TIMBRES).map((t) => t.family))];
  const timbres = Object.keys(TIMBRES);
  const banned = new Set([...rooms, ...voices, ...families, ...timbres]);
  const keys = Object.keys(loudnessFeatures(planTheme('1', 0, {})));
  for (const k of keys)
    must(!banned.has(k), `the fit reads a feature called ${k}, which is the name of a room, a voice, a family or a timbre`);
  return `${keys.length} feature keys, none of them the name of any of ${banned.size} rooms, voices, families or timbres`;
});

// --- the style, and the line round it ---------------------------------------
//
// Round F of PLAN-V1-NEXT put every deep house number in one file and left the
// engine reading a style it is handed. Three checks hold that: the style has
// everything the engine asks it for, no engine module can reach for one, and
// the three things that are written down and never reached stay that way.

// Every field the machine reads off a style, stated. It is held at both ends:
// each path has to exist, and each path has to be *read* by planning a theme,
// compiling its performance and laying out a set through a style that records
// what is asked of it — so a row here that nothing reads fails, and a field the
// engine starts reading has to be written down.
const STYLE_READS = [
  'base', 'settings', 'corpus', 'rooms',
  'sections.kinds', 'sections.labelToKind',
  // ...and, since round K6, the lane table: which parts this music has, who may
  // play each of them and where each one's notes come from. It is read by the
  // composer on every bar of every theme and by the loudness model's own window,
  // which is what makes the number of parts a property of the music.
  'lanes',
  'catalogue.rooms', 'catalogue.fxPalettes', 'catalogue.densityLabel',
  'catalogue.leadTimbres', 'catalogue.sustainedLeads', 'catalogue.padPartners', 'catalogue.stabPartners',
  'catalogue.densities', 'catalogue.keyRoots', 'catalogue.melodyBars',
  'figures.padUnder', 'figures.tremolo', 'figures.slowAttack', 'figures.ownFigure',
  'loudness.windowBars',
  // the stage's rules
  'stage.block', 'stage.window', 'stage.staleBars', 'stage.holdBar', 'stage.touchOnsets',
  'stage.liftDensity', 'stage.openAtBackDensity',
  'stage.dipDb', 'stage.dipQ', 'stage.dipMakeupDb',
  'stage.level', 'stage.risePerBar', 'stage.fallPerBar',
  'stage.frontWet', 'stage.frontLp', 'stage.backWet', 'stage.backLp',
  'stage.letUpEvery', 'stage.letUpTo',
  'stage.treatments', 'stage.padOnlyTreatments', 'stage.rota',
  'stage.releaseAt', 'stage.releaseOver', 'stage.treatment',
  'stage.bassOpen', 'stage.bassRunBars', 'stage.bassChangeOpen', 'stage.bassFrontOpen',
  'stage.wideDouble', 'stage.doubleTop', 'stage.phraseColour',
  // the set's, every one of which is read by spreading `set` into the options
  'set.themeBarPercentiles', 'set.themeBarsMin', 'set.themeBarsMax',
  'set.shortBlendChance', 'set.shortBlendBars', 'set.longBlendBars',
  'set.boundaryBars', 'set.skipBars', 'set.filterMoveChance',
  'set.outgoingLpHz', 'set.outgoingHpHz', 'set.seamSubTrimDb', 'set.seamSumTrimDb',
  'set.swapAfterBars', 'set.tempoGlideBars', 'set.harmonicMixing',
  'set.swapGroup', 'set.bassGroup', 'set.keySteps', 'set.seamFloor',
  // and the blocks of the table the composer and the seam read by name
  'base.tempo', 'base.key', 'base.register', 'base.density', 'base.groove',
  'base.harmony', 'base.arrangement', 'base.master', 'base.push', 'base.sends',
  'base.space', 'base.sidechain', 'base.levels', 'base.loudness', 'base.timbre',
  'base.swing', 'base.hatNudge', 'base.kick', 'base.hats', 'base.clap', 'base.bass',
  'base.strings', 'base.keys', 'base.piano',
  // and, since phase 0 of PLAN-MAGIC-V2, the gate's own rows: `biasFor` builds
  // one weight per entry of every list the style exposes, and the rows are what
  // says which lists those are and how long each is. The rows were written for
  // the gate and are read by the machine now; the list they carry is still a
  // function, so nothing here can go stale behind a reference.
  'candidates',
  // ...and, since phase 1, what this music measured as. `biasFor` reads the
  // signature of every candidate of every list above to work out the weight it
  // carries, so a style that states a table nothing consults would be a table
  // that had quietly stopped deciding anything.
  'signatures',
];

// Fields a style has that the machine does not read, each for a stated reason:
// the name the locks and the listings go by; the reachability note, which is a
// fact about the lists and not a list; the one list the released catalogue
// cannot reach, because both rooms carry their own `voicingStyle` and
// short-circuit the die (fact 1 of the style's reachability note); and the
// middle of the stage's gradient, which needs two layers behind the lead and
// there are only ever two harmonic layers in all (fact 4). They are checked to
// be there and checked *not* to be read: one of them starting to be read is a
// composition change and a re-bless, not a repair.
//
// `candidates` used to be here and moved up into the reads in phase 0 of
// PLAN-MAGIC-V2: the spell layer builds its weights off exactly those rows.
const STYLE_UNREAD = [
  'id', 'label', 'unreachable',
  'catalogue.voicingStyles', 'stage.backMidShare',
];

check('the style is complete, and every field of it is read', () => {
  const at = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), STYLE);
  for (const path of [...STYLE_READS, ...STYLE_UNREAD])
    must(at(path) !== undefined, `the style has no ${path}`);

  // A style that records what is asked of it. It is a proxy over a *thawed*
  // copy, because a proxy may not hand back something other than what a frozen
  // target holds — and by the time this runs the style is frozen through, since
  // a plan carries it and the check above deep-freezes two plans to prove the
  // compiler writes to nothing. Functions (a section kind's `layers`) pass
  // through the copy as they are.
  const thaw = (v) => {
    if (Array.isArray(v)) return v.map(thaw);
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v)) o[k] = thaw(v[k]);
      return o;
    }
    return v;
  };
  const read = new Set();
  const wrap = (v, at_) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
    return new Proxy(v, {
      get(t, k) {
        const path = typeof k === 'string' ? (at_ ? `${at_}.${k}` : k) : at_;
        if (typeof k === 'string') read.add(path);
        return wrap(t[k], path);
      },
    });
  };
  const probe = wrap(thaw(STYLE), '');
  // A dozen themes across both rooms and a set laid out over them: enough that
  // every list a die of this style can reach is reached, and the ones that are
  // not are the ones the reachability note names.
  for (const seed of ['1', '92970', '21323', '15576', '25417', '68299']) {
    for (let i = 0; i < 2; i++) {
      const t = planTheme(seed, i, { preset: 'auto', style: probe });
      compilePerformance(t, settingsOf(t), { style: probe, boundaryBars: MIX_DEFAULTS.boundaryBars });
    }
  }
  setLayout('1', 2, { style: probe, themeBars: 32 });
  // ...and one theme generated on its own, which is where the key is drawn: a
  // set states its own root and a track does not.
  generate({ style: probe, seed: 4242, minutes: 1, preset: 'auto' });
  // ...and one theme planned off the house, which is where the signatures are
  // read: at the house the bias is the identity and consults nothing, which is
  // the whole of phase 0's claim and is why it takes a pulled bird to reach
  // them.
  planTheme('1', 0, { preset: 'auto', style: probe, spell: { ...HOUSE, tide: 0.85 } });
  const unread = STYLE_READS.filter((path) => !read.has(path));
  must(!unread.length, `the style states ${unread.length} fields nothing reads: ${unread.slice(0, 4).join(', ')}`);
  const stray = STYLE_UNREAD.filter((path) => read.has(path));
  must(!stray.length, `${stray.join(', ')} is read by the machine and the style says nothing reaches it`);
  return `${STYLE_READS.length} stated fields, every one present and every one read while twelve themes were planned and compiled, a set laid out and a track generated; ${STYLE_UNREAD.length} more present and reached by none of it; ${read.size} distinct reads in all`;
});

check('no engine module reaches for a style', () => {
  // The app is where a style is named, and since round K5a of PLAN-KITCHEN it
  // is **one** file: the strategy table, which is the list of which music this
  // build can play. `src/mix.ts` used to be the other one; it asks the table
  // now, so the rule is about a single module instead of two. Every other
  // module of either package must not contain the string.
  //
  // Round W of PLAN-V1-NEXT took the last exemption away. `style.ts` used to
  // reach for the deep house module once, with `typeof import(...)`, to take
  // the shape of its table; the shape is written out in the contract now and
  // the style *satisfies* it, so the allowed number of references from the
  // machine to this music is nought, of any kind, type or value.
  const APP = new Set(['packages/deep-house/src/strategies/index.ts']);
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'styles' ? [] : walk(full);
    return /\.(js|ts|tsx)$/.test(e.name) ? [full] : [];
  });
  const files = PACKAGES.flatMap((pkg) => walk(path.join(REPO, 'packages', pkg, 'src')))
    .map((f) => path.relative(REPO, f));
  // A module specifier and nothing else: the product's own name turns up in a
  // log line and a DOM id, and a comment may say where the style lives.
  const IMPORTS = /(?:from|import)\s*\(?\s*['"][^'"]*styles\/[^'"]*['"]/;
  const offenders = [];
  for (const rel of files) {
    if (APP.has(rel)) continue;
    const lines = fs.readFileSync(path.join(REPO, rel), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (IMPORTS.test(line)) offenders.push(`${rel}:${i + 1}`);
    });
  }
  must(!offenders.length, `${offenders.length} modules name a style: ${offenders.slice(0, 3).join(', ')}`);
  return `${files.length} modules across the two packages, ${files.length - APP.size} of them naming no style at all, of any kind; the app names one in ${[...APP].map((f) => path.basename(f)).join(' and ')}`;
});

check('the engine does not know the composer', () => {
  // The boundary, as a fact about specifiers rather than a promise about
  // intentions. A composer may read the machine — `@deep-house/engine/voices`
  // is on the app's side of a hundred imports — and the machine may not read a
  // composer, because an engine that imports a composer is an engine that
  // cannot be lifted out of this repository.
  //
  // So: every module of `packages/engine`, source and tools alike, may name
  // node's own modules and files inside its own package, and nothing else. A
  // relative path that climbs out of the package is caught by resolving it; a
  // bare specifier is caught by not being node's.
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.(js|ts|tsx|mjs)$/.test(e.name) ? [full] : [];
  });
  const ENGINE = path.join(REPO, 'packages', 'engine');
  const files = walk(ENGINE);
  // The same reading of a line the release audit makes: `from` is an ordinary
  // English word and a TypeScript union of two of them is not an import.
  const isImport = (line) => /\b(?:import|export)\b/.test(line) || /^\s*\}\s*from\b/.test(line);
  const SPEC = [/\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]/g];
  const offenders = [];
  let inside = 0;
  for (const file of files) {
    const rel = path.relative(REPO, file);
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (!isImport(line)) return;
      for (const re of SPEC) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(line))) {
          const spec = m[1];
          if (spec.startsWith('node:')) continue;
          const where = `${rel}:${i + 1}`;
          if (!spec.startsWith('.')) { offenders.push(`${where} names ${spec}`); continue; }
          // Vite's own suffixes are not part of the path.
          const target = path.resolve(path.dirname(file), spec.split('?')[0]);
          if (!target.startsWith(ENGINE + path.sep)) offenders.push(`${where} reaches ${path.relative(REPO, target)}`);
          else inside++;
        }
      }
    });
  }
  must(!offenders.length, `${offenders.length} engine modules import from outside the package: ${offenders.slice(0, 3).join('; ')}`);
  return `${files.length} modules under packages/engine, ${inside} imports between them and not one leaving the package — no path out of it, and no name of one`;
});

/**
 * How many times each named stream was actually asked for while `run` ran.
 * MEASURED the way PLAN-SCALE measured it: `Rng` assigns `next` in its
 * constructor, so an accessor on the prototype catches every stream at birth,
 * wraps it and counts. A die that draws nothing and a lane that draws once a
 * theme are both facts about the record, and both are read here.
 */
function streamCounts(run) {
  const counts = new Map();
  const proto = Object.getOwnPropertyDescriptor(Rng.prototype, 'next');
  Object.defineProperty(Rng.prototype, 'next', {
    configurable: true,
    get() { return undefined; },
    set(fn) {
      const tag = String(this.seed).split('::').slice(1).join('::');
      Object.defineProperty(this, 'next', {
        configurable: true, writable: true,
        value: () => { counts.set(tag, (counts.get(tag) || 0) + 1); return fn(); },
      });
    },
  });
  try {
    run();
  } finally {
    if (proto) Object.defineProperty(Rng.prototype, 'next', proto);
    else delete Rng.prototype.next;
  }
  return counts;
}

check('the reachability facts are still facts', () => {
  // (1) Four dice draw zero, counted off the streams they would draw from.
  let themes = 0;
  const counts = streamCounts(() => {
    for (const m of Object.keys(GOLDEN_THEMES))
      for (let i = 0; i < GOLDEN_THEMES[m]; i++) { planTheme(m, i, { preset: 'auto' }); themes++; }
  });
  const silent = ['voicing', 'bass', 'stab', 'hat', 'timbre:again'];
  for (const tag of silent)
    must(!counts.get(tag), `the ${tag} die draws ${counts.get(tag)} times over the golden themes, where the style's note says it draws none`);
  must(counts.get('preset') === themes, `the preset die drew ${counts.get('preset')} times over ${themes} themes`);
  // ...and why: both rooms carry their own figures, and the pool is those two.
  const pool = STYLE.catalogue.rooms;
  must(pool.length === 2, `the room pool is ${pool.length} long and the note is written for two`);
  for (const id of pool) {
    const shape = STYLE.rooms[id].shape || {};
    for (const k of ['voicingStyle', 'bassMask', 'stabMask', 'hatMask'])
      must(shape[k] !== undefined, `the room ${id} does not carry its own ${k}, so the die it short-circuits would start drawing`);
  }

  // (2) Three sidechain numbers are overridden by every room, and one is not.
  for (const id of pool) {
    const sc = (STYLE.rooms[id].params || {}).sidechain || {};
    for (const k of ['depthDb', 'minimumAt', 'recoverBy'])
      must(sc[k] !== undefined, `the room ${id} no longer writes its own sidechain.${k}, which the style's note says every room does`);
    must(sc.lowDepthDb === undefined, `the room ${id} now writes its own sidechain.lowDepthDb, which the style's note says no room does`);
  }

  // (3) `kick.startHzSlow` does not exist — not in the table, not in a room.
  must(!('startHzSlow' in STYLE.base.kick), 'the table now has a kick.startHzSlow, which changes every slow theme');
  for (const id of pool)
    must(!('startHzSlow' in ((STYLE.rooms[id].params || {}).kick || {})),
      `the room ${id} now writes a kick.startHzSlow, which changes its slow themes`);

  // And the lists the style calls unreachable are lists it has.
  const byId = Object.fromEntries(CATALOGUE.map((c) => [c.id, c]));
  for (const id of UNREACHABLE) must(byId[id], `the reachability note names ${id}, which is not a candidate list`);
  return `${themes} golden themes: the ${silent.join(', ')} streams drew nothing at all, both rooms still carry all four of their own figures and all three of their own sidechain numbers and none of them a lowDepthDb, and kick.startHzSlow is still in no table`;
});

// --- the spell layer, and that it is the identity ---------------------------
//
// Phase 0 of PLAN-MAGIC-V2 puts a layer above the dice and the whole of its
// claim is that at the house vector the layer is not there. Both digests say
// so on fourteen themes; this says it in the three places a digest cannot
// reach — the bias itself, a plan planned twice, and what happens when a bird
// actually moves.

// A plan's own fingerprint, with the style replaced by its name: everything
// below the style is data, and the style is the same object either way.
const planDigest = (t) =>
  crypto.createHash('sha256').update(canonical({ ...t, style: t.style.id })).digest('hex').slice(0, 16);

// --- the strategies, and that the second one is the first one ---------------
//
// Round K5a of PLAN-KITCHEN. A composition strategy is a versioned thing inside
// one engine, and `house-v2` is the second of them: the same style data by
// reference, a catalogue with the whole kitchen in it at weight nought, four
// switches that are off and a third room slot that is empty. The claim of the
// round is that at this commit it plans exactly what `house-v1` plans, and the
// two digests are where that is proved; these are the three things a digest
// cannot say — that an absent strategy is the record, that the data really is
// the same data, and that the widened lists are widened the way they say.

check('an absent strategy is the record', () => {
  must(DEFAULT_STRATEGY === 'house-v1', `the default is ${DEFAULT_STRATEGY}`);
  must(STRATEGY_IDS.join(', ') === 'house-v1, house-v2', `the strategies are ${STRATEGY_IDS.join(', ')}`);
  const v1 = STRATEGIES['house-v1'];
  // Everything that is *not asking for one*: nothing, an empty string, spaces,
  // a null, and an id nothing answers to. All five are the record, because an
  // unversioned old link resolving to v1 is what the whole scheme rests on.
  for (const asked of [undefined, null, '', '   ', 'house-v3', 'nonsense'])
    must(strategyById(asked) === v1, `${JSON.stringify(asked)} did not resolve to house-v1`);
  must(strategyById('house-v2') === STRATEGIES['house-v2'], 'house-v2 does not resolve to itself');
  // ...and the same off a query string, which is the road a link takes.
  must(strategyFromQuery('') === null, 'an empty query asked for a strategy');
  must(strategyFromQuery('?seed=99895') === null, 'a plain seed link asked for a strategy');
  must(strategyFromQuery('?v=') === null, 'an empty ?v= asked for one');
  must(strategyFromQuery('?v=2') === 'house-v2', '?v=2 was not read');
  must(strategyFromQuery('?strategy=house-v2') === null, 'the retired ?strategy= spelling was read');
  must(strategyById(strategyFromQuery('?seed=1&spell=ember:0.7')) === v1, 'an old spell link is not the record');
  // And a plan is a plan: naming the default is naming nothing.
  let same = 0;
  for (const m of Object.keys(GOLDEN_THEMES)) {
    for (let i = 0; i < GOLDEN_THEMES[m]; i++) {
      const plain = planDigest(planTheme(m, i, { preset: 'auto' }));
      must(planDigest(planTheme(m, i, { preset: 'auto', strategy: 'house-v1' })) === plain,
        `master ${m} theme ${i} moved when the default was named`);
      must(planDigest(planTheme(m, i, { preset: 'auto', strategy: 'house-v3' })) === plain,
        `master ${m} theme ${i} moved under a strategy that does not exist`);
      same++;
    }
  }
  return `${STRATEGY_IDS.length} strategies, ${DEFAULT_STRATEGY} the default; five ways of asking for nothing and an unknown id all resolve to the record, four query strings read the way they are written, and ${same} golden themes plan the same bytes whether the default is named or not`;
});

check('house-v2 is house-v1\'s data with eleven switches on', () => {
  const v1 = STRATEGIES['house-v1'].style;
  const v2 = STRATEGIES['house-v2'].style;
  // (1) The data, field by field. Everything that is *the record* is still v1's
  // own object, held by reference rather than transcribed, so the two cannot
  // drift — which matters more after K5b and not less: the opening is supposed
  // to be a catalogue and four switches, so every block that is neither has to
  // be provably the same object and not a copy somebody kept in step.
  const SAME = ['corpus', 'sections', 'figures', 'loudness', 'signatures'];
  for (const k of SAME) must(v2[k] === v1[k], `house-v2's ${k} is not house-v1's own object`);
  // The set table is house-v2's own since round S4 of the composer: v1's, with
  // its lengths a fifth shorter, its seam floor at 0.82 and the finer seam line,
  // and every other field v1's value.
  const OWN_SET = ['themeBarPercentiles', 'themeBarsMin', 'themeBarsMax', 'seamFloor', 'seamLineInside'];
  must(v2.set !== v1.set && Object.isFrozen(v2.set), 'house-v2 has no set table of its own');
  for (const k of Object.keys(v1.set)) if (!OWN_SET.includes(k)) must(v2.set[k] === v1.set[k], `house-v2's set.${k} is not house-v1's`);
  must(!('seamLineInside' in v1.set) && v1.set.seamFloor === 0.75, 'house-v1\'s set table moved');
  // `base` and `settings` are held **field by field** rather than by reference
  // since round K6, because the loudness block is house-v2's own:
  // loudness model, which is fitted on a palette and whose palette is not the
  // record's. The 09-21 listening pass also gives the saw lead a softer style
  // articulation and optional keyboard voicing. Everything else stays v1's,
  // and the
  // record's own coefficients have to be untouched to the byte — which is what
  // makes this an exception and not a fork.
  let sameFields = 0;
  for (const [table, byReference] of [['base', true], ['settings', false]]) {
    const a = v1[table];
    const b = v2[table];
    must(a !== b, `house-v2's ${table} is house-v1's own object, and K6 gave it its own loudness block`);
    must(!('keyboardPatches' in a), `house-v1's ${table} acquired new keyboard voicing`);
    must(same(Object.keys(a), Object.keys(b).filter(k => k !== 'keyboardPatches')),
      `house-v2's ${table} does not have house-v1's fields plus keyboard voicing`);
    must(same(Object.keys(b.keyboardPatches), ['ep']), `house-v2's ${table} unexpectedly revoices another keyboard`);
    for (const k of Object.keys(a)) {
      if (k === 'loudness' || k === 'sawLead') continue;
      // `base` is v1's with two keys replaced and keyboard voicing added; every other
      // block of it is v1's own object and is held to that. `settings` is what
      // the resolver makes of a base table, and a resolver copies — so it is
      // held to the same *value* instead, field by field, which is the strongest
      // thing that can be true of it.
      if (byReference) must(a[k] === b[k], `house-v2's ${table}.${k} is not house-v1's own object`);
      else must(JSON.stringify(a[k]) === JSON.stringify(b[k]), `house-v2's ${table}.${k} is not house-v1's value`);
      sameFields++;
    }
    must(a.loudness !== b.loudness, `house-v2's ${table}.loudness is house-v1's own model`);
  }
  // ...and the record's own coefficients are untouched, to the byte.
  must(JSON.stringify(v1.settings.loudness) === JSON.stringify(v1.base.loudness),
    'house-v1\'s resolved loudness model is not its table\'s own');
  const v2L = v2.settings.loudness;
  must(v2L.targetLufs === v1.settings.loudness.targetLufs && v2L.clampDb === v1.settings.loudness.clampDb,
    `house-v2 levels to ${v2L.targetLufs} LUFS within ${v2L.clampDb} dB where the record levels to ${v1.settings.loudness.targetLufs} within ${v1.settings.loudness.clampDb}`);
  for (const k of Object.keys(v2L.coef)) must(LOUDNESS_COLUMNS[k], `house-v2's loudness.coef names ${k}, which is no column in src/loudness.ts`);
  must(Object.keys(v2L.coef).length && Object.keys(v2L.centre).length === Object.keys(v2L.coef).length,
    'house-v2\'s loudness model has no coefficients, or a centre for each of them');
  must(v2L.slopeUp > 0 && v2L.slopeUp < 1 && v2L.slopeDown > 0 && v2L.slopeDown < 1,
    `house-v2's master gives back ${v2L.slopeUp} and ${v2L.slopeDown} per decibel, which is not a limiter`);
  // The lane table is the one block that is neither the same object nor a
  // transcription: round K6 widens four of its twelve rows and leaves eight
  // alone, and *leaves alone* has to mean the same object for the same reason.
  let sameLanes = 0;
  must(v2.lanes.length === v1.lanes.length, `house-v2 has ${v2.lanes.length} lanes against house-v1's ${v1.lanes.length}`);
  v1.lanes.forEach((row, i) => {
    const b = v2.lanes[i];
    must(b.id === row.id, `house-v2's lane ${i} is ${b.id} where house-v1's is ${row.id}`);
    if (b === row) { sameLanes++; return; }
    // A widened row differs in its candidates and in nothing else but the one
    // field K6 moves: the sixteenth lane's figure source.
    for (const k of Object.keys(row)) {
      if (['voices', 'list', 'incumbent', 'figure'].includes(k)) continue;
      must(JSON.stringify(b[k]) === JSON.stringify(row[k]), `the lane ${row.id}'s ${k} moved and no rule of K6 owns it`);
    }
    must(b.figure === row.figure || b.id === 'sixteenth', `the lane ${row.id} changed its figure source and only the sixteenth lane may`);
  });
  // (2) The nine switches, all on, and each of them naming something real.
  // Four are K5b's, one for each reachability fact at the head of
  // `deep-house.ts`; the fifth is derive-lite's `derived`, the sixth modulation
  // M1's `knobs`, the seventh PLAN-MOTIF T1's `motif` and the eighth
  // `notes/archive/2026-09-plans/cited/PLAN-DEVELOP.md` §1's `leadEntry`, and those four are a different kind of
  // switch — they open a door the record does not have rather than a die the
  // record short-circuits — and are on the same list because it is the same
  // sentence: a composition decision a strategy carries. The ninth,
  // `sectionEdges`, is the reconciled review's R16 and R111: a kick dropout
  // and a drop's drive stop at the section's edge, which the record's shared
  // generator does not, so it is a switch and v1 never asks. The tenth,
  // `sectionPhrases`, is R16 and R38 and Eugene's answer to question 4: a
  // theme with a grid counts its phrases from each section's start. The
  // eleventh, `leadIns`, is R34 and question 11: a return's lead-in is
  // scheduled by rules and not by a coin. The twelfth, `swellIn`, is round S1
  // of the composer: a held layer entering a quiet passage swells in. The
  // thirteenth, `busSweeps`, is round S2: the melodic bus's filter moved by
  // the section; the fourteenth, `glueFades`, its glue noises by a curve; the
  // fifteenth and sixteenth are round S3's, `sparseTexture` and `bassSolo`;
  // the seventeenth and eighteenth round S6's, `hatRing` and `hatSections`;
  // the nineteenth round S13's `openingSound`; the twentieth S14's `glueGates`;
  // the twenty-first S18's `laneFloors`; the twenty-second S21's `neverSilent`.
  const sw = v2.switches;
  // Every switch is on: `bassSolo`, round S3's experiment, was written off
  // until Eugene had heard it, and is on since S17 ("commit it").
  for (const [k, v] of Object.entries(sw)) must(v === true, `the switch ${k} is off, and every one of them is on`);
  must(Object.keys(sw).length === 22, `${Object.keys(sw).length} switches, and there are four reachability facts, one derived state, one set of knobs, one theme, one lead entry, one section's edges, one section's phrases, one set of lead-ins, one entrance swell, one bus sweep, one set of glue fades, one sparse texture, one bass solo, one hat ring, one hat by section, one opening sound, one glue gate, one set of lane floors and one silence rule`);
  must(sw.derived === true, 'house-v2 does not read the derived state');
  must(sw.knobs === true, 'house-v2 does not season the voices it draws');
  must(sw.motif === true, 'house-v2 draws no theme');
  must(sw.leadEntry === true, 'house-v2 lets a groove run pad-alone');
  must(sw.sectionEdges === true, 'house-v2 lets a kick dropout take a section\'s first bar');
  must(sw.sectionPhrases === true, 'house-v2 counts its phrases on the set\'s line');
  must(sw.leadIns === true, 'house-v2 rolls a coin for its riser');
  must(sw.swellIn === true, 'house-v2 steps a held layer into a quiet passage');
  must(sw.busSweeps === true, 'house-v2 leaves the melodic bus unswept');
  must(sw.glueFades === true, 'house-v2 cuts its glue noises in and out');
  must(sw.sparseTexture === true, 'house-v2 leaves its whistle buried');
  must(sw.bassSolo === true, 'house-v2 leaves out the bass solo Eugene asked to commit');
  must(sw.hatRing === true, 'house-v2 lets a bird promote a ringing hat');
  must(sw.hatSections === true, 'house-v2 ticks its hat through every breakdown');
  must(sw.openingSound === true, 'house-v2 lets a theme open silent');
  must(sw.glueGates === true, 'house-v2 blows its noise glue through a dark, slow theme');
  must(sw.neverSilent === true, 'house-v2 leaves a gap of silence in the middle of a theme');
  must(sw.laneFloors === true, 'house-v2 lets a room\'s clap or shaker at -60 silence a snare or a conga');
  must(!('switches' in v1), 'house-v1 carries switches, and the record reads none');
  // (3) Three of K5b's four take a field off every room, and neither the fourth
  // nor derive-lite's fifth takes any: `avoidOrgan` is handed to `generate` by
  // the set, and `derived` is read by `generate` off the spell. So the rooms
  // must differ from v1's in exactly the fields the switches own and in no
  // other.
  const OWNED = ['voicingStyle', 'bassMask', 'stabMask', 'hatMask'];
  const SIDECHAIN = ['depthDb', 'minimumAt', 'recoverBy'];
  let taken = 0;
  for (const id of Object.keys(v1.rooms)) {
    const a = v1.rooms[id];
    const b = v2.rooms[id];
    must(b, `house-v2 has no room called ${id}`);
    for (const k of Object.keys(a.shape || {})) {
      if (OWNED.includes(k)) { must(!(k in b.shape), `the room ${id} still carries its own ${k}`); taken++; continue; }
      must(JSON.stringify(b.shape[k]) === JSON.stringify(a.shape[k]), `the room ${id}'s ${k} moved and no switch owns it`);
    }
    for (const k of SIDECHAIN) {
      if (a.params && a.params.sidechain && k in a.params.sidechain) {
        must(!(k in (b.params.sidechain || {})), `the room ${id} still overrides sidechain.${k}`);
        taken++;
      }
    }
    // ...and nothing else about a room moved: every other block is v1's.
    for (const k of Object.keys(a.params || {})) {
      if (k === 'sidechain') continue;
      must(JSON.stringify(b.params[k]) === JSON.stringify(a.params[k]), `the room ${id}'s params.${k} moved and no switch owns it`);
    }
  }
  must(taken > 0, 'the switches are on and took nothing off any room');
  // (4) The stage is v1's stage with one field added — the placement table the
  // rota draws — and the live rota it exposes.
  for (const k of Object.keys(v1.stage))
    must(k === 'treatments' ? Array.isArray(v2.stage[k]) : v2.stage[k] === v1.stage[k], `the stage's ${k} moved`);
  // Round S12 adds the second: the bass bus's level, a hint down (1 to 2 dB,
  // Eugene's "calm it down a hint while not reducing range"), which v1 never has.
  must(v1.stage.bassBusDb === undefined, 'house-v1 has a bass bus level');
  must(v2.stage.bassBusDb <= -1 && v2.stage.bassBusDb >= -2, `the bass bus is at ${v2.stage.bassBusDb} dB, not a hint of 1 to 2 down`);
  must(Object.keys(v2.stage).length === Object.keys(v1.stage).length + 2,
    `the stage has ${Object.keys(v2.stage).length} fields against v1's ${Object.keys(v1.stage).length}, one palette and one bass bus level`);
  must(Array.isArray(v2.stage.palette) && v2.stage.palette.length === v2.catalogue.treatmentRota.length,
    'the stage\'s palette is not one row per rota entry');
  // (5) The third room slot: still declared, still empty. K5b leaves it alone
  // on purpose — a room is a benchmark minute and nobody has measured one.
  must(v2.catalogue.roomSlots === v2.catalogue.rooms.length + 1,
    `${v2.catalogue.roomSlots} slots against ${v2.catalogue.rooms.length} rooms — the empty one is not one`);
  // (6) And the whole of it on the golden themes, from the other side: every
  // one of them plans different bytes now. The style's *name* is left out of
  // this hash and out of no other, so what is being compared is the music.
  const music = (t) => crypto.createHash('sha256').update(canonical({ ...t, style: null })).digest('hex').slice(0, 16);
  let themes = 0;
  let moved = 0;
  for (const m of Object.keys(GOLDEN_THEMES)) {
    for (let i = 0; i < GOLDEN_THEMES[m]; i++) {
      if (music(planTheme(m, i, { preset: 'auto', strategy: 'house-v2' })) !== music(planTheme(m, i, { preset: 'auto' }))) moved++;
      themes++;
    }
  }
  must(moved === themes, `${themes - moved} of ${themes} golden themes still plan house-v1's bytes under house-v2`);
  return `${SAME.length} blocks of house-v1's own data held by reference, ${sameFields} fields of base and settings unchanged, with loudness and saw articulation house-v2's own, ${sameLanes} of ${v1.lanes.length} lane rows the same objects, ${Object.keys(sw).length} switches all on (the fifth derive-lite's own, the sixth modulation M1's, the seventh the theme and the eighth the lead's entry, the ninth a section's edges), ${taken} fields taken off the rooms by the three that own one and every other field of every room v1's own, the stage v1's with a placement table of ${v2.stage.palette.length} rows and the bass bus at ${v2.stage.bassBusDb} dB added, a third room slot still declared and still empty, and all ${themes} golden themes planning different bytes under the two`;
});

check('every list house-v2 widened is widened by the rule', () => {
  const v1 = STRATEGIES['house-v1'].style;
  const v2 = STRATEGIES['house-v2'].style;
  const byId1 = Object.fromEntries(v1.candidates.map((c) => [c.id, c]));
  let entries = 0;
  let newcomers = 0;
  let live = 0;
  for (const c of v2.candidates) {
    const list = c.list();
    must(Array.isArray(list) && list.length, `${c.id} (${c.where}) is not a list with anything in it`);
    for (const v of list) {
      entries++;
      if (c.of === 'room') must(v in v2.rooms, `${c.id}: no room called ${v}`);
      else if (c.of === 'timbre') must(v in TIMBRES, `${c.id}: ${v} is a timbre no registered voice makes`);
      else if (c.of === 'voice') must(v in BY_NAME, `${c.id}: ${v} is a voice the registry does not hold`);
      else if (c.of === 'effect') {
        // A rota entry is either a gesture the stage's own treatment table
        // knows, or `fx:<id>` naming a registered effect. Nothing else.
        const fx = String(v).startsWith('fx:');
        if (fx) must(String(v).slice(3) in EFFECTS_BY_ID, `${c.id}: ${v} names no registered effect`);
        else must(v2.stage.treatment[v] !== undefined || v === 'hole', `${c.id}: ${v} is neither a gesture nor an effect`);
      } else if (c.of === 'mask') must(v && typeof v.m === 'string' && v.m.length, `${c.id}: a mined row with no mask on it`);
      else must(v !== undefined && v !== null && v !== '', `${c.id}: an empty candidate`);
    }
    // A widened list begins with v1's own list, entry for entry and weight for
    // weight, and everything after it is a newcomer at nought. That is the
    // whole of why the digests hold: `pickWeighted` drops a nought before it
    // draws, and `weighted` can only ever return one at the head of its ladder.
    const before = byId1[c.id] ? byId1[c.id].list() : null;
    if (before) {
      must(same(list.slice(0, before.length), before), `${c.id}: the first ${before.length} entries are not house-v1's`);
    }
  }
  // The weights themselves, off the catalogue rather than off the gate's walk,
  // because the gate walks values and the weights are what this round is about.
  //
  // K5b's rule, as three statements about every row:
  //
  //   an **incumbent** is house-v1's entry at house-v1's weight and carries
  //   neither `opened` nor `dropped` — rule 2 has nothing to say about it;
  //   a **newcomer** carries `opened`, which is what rule 2 made of it, and its
  //   weight is either that number or nought;
  //   a newcomer at **nought** carries `dropped`, naming the rule that took the
  //   weight away and why — because a weight of nought with no reason on it is
  //   a decision nobody can argue with later.
  const weighted = ['leadTimbres', 'padPartners', 'stabPartners', 'backbeatVoices', 'offbeatVoices', 'sixteenthVoices', 'textureVoices', 'treatmentRota'];
  let opened = 0;
  let droppedRows = 0;
  for (const id of weighted) {
    const list = v2.catalogue[id];
    // house-v1's own list where it has one; where it has none — the four lanes
    // and the rota are house-v2's own lists — the incumbents are the rows no
    // rule opened, which is what an incumbent is.
    const before = v1.catalogue[id] || list.filter((e) => e.opened === undefined);
    must(Array.isArray(list) && list.length, `${id} is not a weighted list`);
    list.forEach((e, i) => {
      const incumbent = before && i < before.length;
      if (incumbent && v2.flagged.some((f) => f.id === e.v)) {
        // An incumbent the ear has since ruled out: in its place, at nought,
        // with rule 3's reason on the row.
        droppedRows++;
        must(e.v === before[i].v && e.w === 0 && e.opened === undefined && e.dropped && e.dropped.by === 'rule 3',
          `${id}[${i}]: the retired incumbent ${e.v} is at ${e.w} without rule 3's verdict`);
        return;
      }
      if (incumbent) {
        live++;
        must(e.w === before[i].w && e.v === before[i].v,
          `${id}[${i}] is ${e.v}@${e.w} where house-v1 has ${before[i].v}@${before[i].w}`);
        must(e.opened === undefined && e.dropped === undefined, `${id}: the incumbent ${e.v} carries a rule's verdict`);
        return;
      }
      newcomers++;
      must(typeof e.opened === 'number' && e.opened >= 0, `${id}: ${e.v} does not say what rule 2 opened it at`);
      if (e.w > 0) {
        opened++;
        must(e.w === e.opened, `${id}: ${e.v} is live at ${e.w} and rule 2 opened it at ${e.opened}`);
        must(!e.dropped, `${id}: ${e.v} is live and carries a reason for being dropped`);
        return;
      }
      droppedRows++;
      must(e.w === 0, `${id}: ${e.v} carries a weight of ${e.w}`);
      must(e.dropped && e.dropped.by && e.dropped.why, `${id}: ${e.v} is at nought and says nothing about why`);
    });
  }
  // Rule 3: everything flagged opens at nought whatever the arithmetic said.
  for (const f of v2.flagged) {
    for (const id of weighted) {
      for (const e of v2.catalogue[id]) {
        if (e.v !== f.id && e.v !== `fx:${f.id}`) continue;
        must(e.w === 0 && e.dropped && e.dropped.by === 'rule 3', `${f.id} is flagged and is live at ${e.w}`);
      }
    }
  }
  // Rule 4's own list, which is the number Eugene trades against: every row it
  // dropped, with what it costs, and nothing in it that is live.
  for (const d of DROPPED_FOR_COST) {
    const row = v2.catalogue.treatmentRota.find((e) => e.v === d.id);
    must(row && row.w === 0, `${d.id} is on the dropped list and is live at ${row && row.w}`);
    must(d.units > 0, `${d.id} was dropped for a cost of ${d.units}`);
  }
  return `${v2.candidates.length} lists, ${entries} candidates, every timbre made by a registered voice, every voice in the registry and every treatment a gesture or a registered effect; ${live} incumbents at house-v1's own weights at the head of every list, ${opened} newcomers opened by rule 2 and ${droppedRows} held at nought with the rule and the reason on the row (${v2.flagged.length} by ear, ${DROPPED_FOR_COST.length} by the ceiling, costing ${DROPPED_FOR_COST.map((d) => `${d.id.replace('fx:', '')} ${d.units}`).join(', ')})`;
});

check('the four lanes are the record\'s own, and the kitchen is behind them', () => {
  const v1 = STRATEGIES['house-v1'].style;
  const v2 = STRATEGIES['house-v2'].style;
  // What the record actually plays in each percussion role, MEASURED rather
  // than taken from a list somebody wrote: every voice that fires, grouped by
  // the roles its own descriptor declares.
  //
  // The fourteen golden themes are not enough on their own, and finding out why
  // is worth the four hundred extra: **the riser fires in five themes out of
  // seven hundred and ninety-eight** — it is a chance inside a chance, the
  // `open` and `deep` palettes only, at the last phrase of a build — and none
  // of the fourteen rolls one. A lane measured off the fourteen alone would
  // have said the record has no riser in it. So the sweep is the golden themes
  // plus masters 1 to 199, two themes each, which is deterministic, costs four
  // hundred milliseconds, and catches it twice (160#0 and 169#1).
  const played = new Set();
  for (const plan of GOLDEN_PLANS) for (const e of plan.events) played.add(e.voice);
  let swept = 0;
  for (let seed = 1; seed < 200; seed++) {
    for (let n = 0; n < 2; n++) {
      for (const e of planTheme(String(seed), n, { preset: 'auto' }).events) played.add(e.voice);
      swept++;
    }
  }
  const ROLES_OF = { backbeatVoices: 'backbeat', offbeatVoices: 'offbeat', sixteenthVoices: 'sixteenth', textureVoices: 'texture' };
  const notes = [];
  let dormant = 0;
  for (const [id, role] of Object.entries(ROLES_OF)) {
    const list = v2.catalogue[id];
    // The **incumbents** are the head of the list, and they are exactly what
    // the record plays in that role. K5b gave the kitchen behind them a weight,
    // so "live" is no longer the question; what has to stay true is that the
    // record's own instruments are the ones at the front at their own weight.
    const incumbents = list.filter((e) => e.opened === undefined).map((e) => e.v);
    const record = REGISTRY.filter((d) => d.roles.includes(role) && played.has(d.name)).map((d) => d.name);
    must(same(incumbents, record),
      `${id}: the incumbents are ${incumbents.join(', ')} and the record plays ${record.join(', ')} in the ${role} role`);
    must(same(list.slice(0, incumbents.length).map((e) => e.v), incumbents), `${id}: the incumbents are not at the head of the list`);
    for (const e of list) {
      const d = BY_NAME[e.v];
      must(d, `${id}: ${e.v} is not a registered voice`);
      must(d.roles.includes(role), `${id}: ${e.v} does not declare the ${role} role`);
      if (e.opened !== undefined) {
        dormant++;
        // Live at what rule 2 opened it at — or at nought with rule 3's word on
        // the row, which is a candidate an ear has reserved and not a hole.
        must((e.w === e.opened && e.w > 0) || (e.w === 0 && e.dropped && e.dropped.by === 'rule 3'),
          `${id}: ${e.v} opened at ${e.opened} and is at ${e.w}${e.dropped ? ` (${e.dropped.by})` : ''}`);
      }
    }
    // ...and every registered voice that declares the role is in the list, so a
    // lane is the registry's own answer and not a selection.
    const all = REGISTRY.filter((d) => d.roles.includes(role)).map((d) => d.name);
    must(same(list.map((e) => e.v), all), `${id} is not every voice that declares ${role}`);
    // ...and since round K6 the list is **read**: one or more lanes of the
    // style's own table name it, and the composer asks each of them who is
    // playing. K5b's line here was its opposite — the four were the four names
    // in house-v2's reachability note — and the note is empty now.
    must(!v2.unreachable.includes(id), `${id} is drawn and is still in the reachability note`);
    const readers = v2.lanes.filter((l) => l.list === id);
    must(readers.length, `${id} is named by no lane, so nothing draws it`);
    notes.push(`${role} ${incumbents.length}+${list.length - incumbents.length} on ${readers.length} lane${readers.length > 1 ? 's' : ''}`);
  }
  must(!v2.unreachable.length, `house-v2's reachability note is ${v2.unreachable.join(', ')} and K6 emptied it`);
  // And from the other side, MEASURED the way the v1 reachability note is
  // measured: every lane stream is really asked for, once per theme.
  // A lane a drone in front holds off in the plan is not asked (one foreground,
  // 09-22): it plays nothing, so it draws nothing.
  const heldOff = new Map();
  const counts = streamCounts(() => {
    for (let seed = 1; seed <= 20; seed++) {
      const t = planTheme(String(seed), 0, { preset: 'auto', strategy: 'house-v2' });
      if (t.dice.scene === 'drone-forward') for (const lane of v2.lanes) if (lane.withdraw?.some((w) => w.scene === t.dice.scene)
        && !t.events.some((e) => e.layer === layerOf(lane.voices?.[0]?.v))) heldOff.set(lane.id, (heldOff.get(lane.id) || 0) + 1);
    }
  });
  for (const lane of v2.lanes) {
    if (!lane.voices) continue;
    // An ordinary replacement is a generated cell (`composition:`) or a catalogue
    // row's, keyed by the row's own identity since the composer fix round of
    // 09-22 (`pin:<id>:`), so it plays the same streams the row plays pinned.
    const ordinaryReplacement = lane.role === 'sixteenth'
      ? [...counts.entries()].filter(([k]) => /^lane:(composition|pin:[a-z0-9-]+\/[a-z0-9-]+):sixteenth:0$/.test(k)).reduce((n, [, c]) => n + c, 0) : 0;
    const draws = (counts.get(`lane:${lane.id}`) || 0) + ordinaryReplacement + (heldOff.get(lane.id) || 0);
    must(draws === 20, `the lane ${lane.id} and its ordinary replacement drew ${draws} times over 20 themes (${heldOff.get(lane.id) || 0} held off by a drone in front)`);
  }
  must(counts.get('sixteenth') === 20, `the sixteenth lane's own figure drew ${counts.get('sixteenth') || 0} times over 20 themes`);
  return `${Object.keys(ROLES_OF).length} lists, each of them every registered voice that declares its role and no other; the incumbents of all four are exactly what ${GOLDEN_PLANS.length + swept} themes of the record play in that role and stand at the head of their list (${notes.join(', ')}), ${dormant} kitchen voices behind them at the third rule 2 opened them at — and since K6 every one of them is drawn by a lane of the style's own table, which is why house-v2's reachability note is empty`;
});

// The level a kitchen drum arrives at on a lane, measured against the lane's
// incumbent on the record's own figure (`tools/imprint/lane-trim.ts --bless`,
// the music review of 09-19). The file is a measurement; this holds the style
// to it: every trim names a newcomer of the lane it is on, is a finite decibel
// inside a sane bound, the lane's row carries exactly the file's number and the
// incumbent carries none — so the record's events carry no gain at all.
check('every lane trim is a measured decibel on a newcomer, and the incumbent carries none', () => {
  const v2 = STRATEGIES['house-v2'].style;
  const v1 = STRATEGIES['house-v1'].style;
  const file = LANE_TRIMS;
  must(file.strategy === 'house-v2', `the trims file is for ${file.strategy}`);
  let trims = 0;
  let measured = 0;
  let shapes = 0;
  const notes = [];
  for (const [laneId, block] of Object.entries(file.lanes || {})) {
    const lane = v2.lanes.find((l) => l.id === laneId);
    must(lane && lane.voices, `the trims file names a lane ${laneId} house-v2 has not got, or one with no list`);
    const inc = lane.incumbent ?? lane.voices[0].v;
    must(block.incumbent === inc, `${laneId}: the file measured against ${block.incumbent} and the lane's incumbent is ${inc}`);
    for (const [v, db] of Object.entries(block.trims || {})) {
      trims++;
      const e = lane.voices.find((c) => c.v === v);
      must(e, `${laneId}: a trim for ${v}, which is not a candidate of the lane`);
      must(e.opened !== undefined, `${laneId}: a trim on the incumbent ${v}`);
      must(Number.isFinite(db) && Math.abs(db) <= 18, `${laneId}: ${v}'s trim is ${db}`);
      must(db === 0 ? e.trimDb === undefined : e.trimDb === db, `${laneId}: ${v} carries ${e.trimDb} where the file says ${db}`);
      must(block.measured && block.measured[v] && block.measured[inc], `${laneId}: ${v}'s trim has no measurement behind it`);
    }
    measured += Object.keys(block.measured || {}).length;
    notes.push(`${laneId} ${Object.keys(block.trims || {}).length} against ${inc}`);
    // **The second reading** (09-20, step 5b): where a candidate's energy is and
    // how sharp it arrives, off the same samples the trims came off. A window
    // the lane fired in has one; a window it did not, has none, because a ratio
    // of two noughts is not a reading. The bands are shares of one whole, so
    // they are per cents and they are bounded; the crest is a decibel.
    for (const [v, windows] of Object.entries(block.measured || {})) {
      for (const [w, m] of Object.entries(windows)) {
        const sh = (block.shape || {})[v] && block.shape[v][w];
        if (!(m.events > 0 && Number.isFinite(m.lufs))) { must(!sh, `${laneId}/${v}/${w}: a shape for a window the lane never fired in`); continue; }
        must(sh, `${laneId}/${v}/${w}: metered and no shape read off it`);
        must(THIRDS.includes(sh.peakHz), `${laneId}/${v}/${w}: the loudest band is ${sh.peakHz} Hz, which is not a third-octave the meter has`);
        for (const k of ['share', 'mid', 'high', 'low'])
          must(Number.isFinite(sh[k]) && sh[k] >= 0 && sh[k] <= 100, `${laneId}/${v}/${w}: ${k} is ${sh[k]} per cent`);
        must(sh.share <= sh.mid + sh.high + sh.low + 0.15 || sh.peakHz > 2000 && sh.peakHz < 4000,
          `${laneId}/${v}/${w}: the loudest band holds ${sh.share} % and the three bands together hold ${(sh.mid + sh.high + sh.low).toFixed(1)} %`);
        must(Number.isFinite(sh.crestDb) && sh.crestDb > 0, `${laneId}/${v}/${w}: a crest of ${sh.crestDb} dB`);
        shapes++;
      }
    }
  }
  // **The woodblock's measurement** (09-20). It was reserved on these four
  // numbers and released on 09-22 by Eugene, who asked for more percussion:
  // if it is heard out of line its sound is corrected, the class is not
  // removed. So it is live on the lane at rule 2's weight, and the numbers
  // stay checked as the brief for that correction, each read back out of the
  // measurement, so the day the lane is measured again they fail with it.
  // The shaker is the lane's incumbent and the part the woodblock stands in.
  const six = file.lanes.sixteenth;
  must(!STRATEGIES['house-v2'].style.flagged.some((f) => f.id === 'woodblock'), 'the woodblock is flagged again');
  const block = v2.lanes.find((l) => l.role === 'sixteenth').voices.find((e) => e.v === 'woodblock');
  must(block && block.w > 0 && block.w === block.opened, `the woodblock is at ${block && block.w} on the sixteenth lane, not rule 2's opening`);
  const wins = Object.keys(six.shape.woodblock);
  for (const w of wins) {
    const wb = six.shape.woodblock[w];
    const sk = six.shape.shaker[w];
    must(wb.mid > 85 && wb.high < 2, `the woodblock's ${w} window is ${wb.mid} % mid and ${wb.high} % high`);
    must(sk.high > 65 && sk.mid < 5, `the shaker's ${w} window is ${sk.high} % high and ${sk.mid} % mid`);
    must(wb.share > sk.share, `the woodblock piles ${wb.share} % into one band against the shaker's ${sk.share} %`);
    must(wb.crestDb > sk.crestDb, `the woodblock's crest is ${wb.crestDb} dB against the shaker's ${sk.crestDb}`);
    // ...and it is the lane's sharpest, which is what a 6.1 dB boost boosted.
    for (const [v, ws] of Object.entries(six.shape))
      if (ws[w]) must(ws[w].crestDb <= wb.crestDb, `${v} has a crest of ${ws[w].crestDb} dB on ${w}, over the woodblock's ${wb.crestDb}`);
  }
  must(six.trims.woodblock > 0, `the woodblock's trim is ${six.trims.woodblock} dB and the reason calls it a boost`);
  // ...and nothing else on any lane carries a trim: not an incumbent, not a
  // candidate the file did not measure, and nothing at all under house-v1.
  for (const lane of v2.lanes) {
    for (const e of lane.voices || []) {
      if (e.trimDb === undefined) continue;
      const block = file.lanes[lane.id];
      must(block && block.trims && block.trims[e.v] === e.trimDb, `${lane.id}: ${e.v} carries a trim of ${e.trimDb} the file does not`);
      must(e.opened !== undefined, `${lane.id}: the incumbent ${e.v} carries a trim`);
    }
  }
  for (const lane of v1.lanes) for (const e of lane.voices || []) must(e.trimDb === undefined, `house-v1's ${lane.id} carries a trim`);
  // And the record's drum events carry no gain: every event of the four
  // percussion lanes' incumbents, in every golden plan under house-v1. (The
  // glue's own events carry a gain of their own and always have.)
  const drums = new Set(v1.lanes.filter((l) => l.voices && l.gate && l.role !== 'kick' && l.role !== 'bassline').flatMap((l) => l.voices.map((e) => e.v)));
  let drumEvents = 0;
  for (const plan of GOLDEN_PLANS) for (const e of plan.events) {
    if (!drums.has(e.voice)) continue;
    drumEvents++;
    must(e.p.gain === undefined, `a house-v1 event of ${e.voice} carries a gain`);
  }
  const wbWin = Object.keys(six.shape.woodblock)[0];
  return `${trims} trims on ${Object.keys(file.lanes || {}).length} lanes${file.measuredAt ? `, measured ${file.measuredAt}` : ' (not yet measured: the identity)'}${file.readAt ? ` and read again ${file.readAt}` : ''}, ${measured} candidates metered alone on their lane (${notes.join(', ') || 'none'}) and ${shapes} windows of them read for shape; every trim on a newcomer of its own lane at the file's number, no incumbent trimmed, house-v1's lanes untouched and none of the record's ${drumEvents} events of ${[...drums].join(', ')} carries a gain — and the woodblock, released to the lane, still reads the four numbers it was once reserved on (${six.shape.woodblock[wbWin].mid} % of it in 400 Hz-2 kHz against the shaker's ${six.shape.shaker[wbWin].mid}, ${six.shape.woodblock[wbWin].share} % in the ${six.shape.woodblock[wbWin].peakHz} Hz band alone, the lane's highest crest at ${six.shape.woodblock[wbWin].crestDb} dB, and a trim that was a +${six.trims.woodblock} dB boost onto it)`;
});

check('a style declares its own lanes, and nothing assumes how many', () => {
  // Round K6, and Eugene's decision of 09-18 as a gate: *a style declares its
  // own lanes, and their number is the style's* — "we could have up to 12, and
  // for some styles it could be only 2, like ambient".
  //
  // (1) The table is a table: closed vocabularies, a role the registry knows, a
  // figure source the generator has a function for, a bus its candidates agree
  // on, and a gate the section grammar really carries.
  const ROLES = VOICE_REGISTRY.ROLES;
  const BUSES = VOICE_REGISTRY.BUSES;
  let rows = 0;
  for (const id of STRATEGY_IDS) {
    const style = STRATEGIES[id].style;
    must(Array.isArray(style.lanes) && style.lanes.length, `${id} declares no lanes`);
    const seen = new Set();
    const gates = new Set(Object.keys(style.sections.kinds.main.layers(0, 1)));
    for (const lane of style.lanes) {
      rows++;
      must(!seen.has(lane.id), `${id}: two lanes called ${lane.id}`);
      seen.add(lane.id);
      must(ROLES.includes(lane.role), `${id}: the lane ${lane.id} plays ${lane.role}, which is no role`);
      must(FIGURE_SOURCES.includes(lane.figure), `${id}: the lane ${lane.id} takes its figure from ${lane.figure}, which is no figure source`);
      must(lane.gate === null || gates.has(lane.gate), `${id}: the lane ${lane.id} is gated on ${lane.gate}, which the section grammar does not carry`);
      must(lane.voices === null || (Array.isArray(lane.voices) && lane.voices.length), `${id}: the lane ${lane.id} carries an empty candidate list`);
      if (lane.voices === null) must(lane.timbre, `${id}: the lane ${lane.id} draws neither a voice nor a timbre`);
      for (const e of lane.voices || []) {
        must(BY_NAME[e.v], `${id}: the lane ${lane.id} names ${e.v}, which is no registered voice`);
        must(BY_NAME[e.v].roles.includes(lane.role), `${id}: ${e.v} cannot play the ${lane.role} the lane ${lane.id} is`);
        // The lane states its bus and the instruments have to agree with it —
        // one number in one place, checked rather than copied. `null` is a lane
        // whose voice decides, which is the two harmonic ones and the glue.
        if (lane.bus !== null) must(BY_NAME[e.v].bus === lane.bus, `${id}: the lane ${lane.id} lands on ${lane.bus} and ${e.v} on ${BY_NAME[e.v].bus}`);
        must(BUSES.includes(BY_NAME[e.v].bus), `${id}: ${e.v} lands on ${BY_NAME[e.v].bus}, which is no bus`);
      }
      if (lane.incumbent) must((lane.voices || []).some((e) => e.v === lane.incumbent), `${id}: the lane ${lane.id}'s incumbent ${lane.incumbent} is not in its own list`);
    }
    // ...and every gate the grammar carries belongs to a lane, so a section
    // cannot switch on a layer that nothing plays.
    for (const g of gates) must(style.lanes.some((l) => l.gate === g), `${id}: the grammar gates ${g}, which is no lane`);
  }
  // (2) The record's own table: **twelve lanes, one candidate each**, which is
  // the whole of why K6 moved no seed. A draw over a list of one is that one,
  // off a stream of the lane's own.
  const v1 = STRATEGIES['house-v1'].style;
  must(v1.lanes.length === 12, `house-v1 has ${v1.lanes.length} lanes`);
  for (const lane of v1.lanes)
    must(lane.voices === null || lane.voices.length === 1, `house-v1's ${lane.id} carries ${(lane.voices || []).length} candidates, and the record has one of each`);
  // (3) And the count is not assumed anywhere: two fixture styles, one with two
  // lanes and one with twelve that are **not** the record's twelve, plan and
  // compile. `npm test` renders both of them offline through the real graph in
  // two engines, which is the half a node-only gate cannot do.
  const fixtures = [];
  for (const [name, style] of Object.entries(FIXTURES)) {
    const track = planTheme('16', 0, { preset: 'auto', style, themeBars: 32 });
    must(track.events.length > 0, `${name} planned ${track.events.length} events`);
    const program = compilePerformance(track, settingsOf(track), { style, boundaryBars: MIX_DEFAULTS.boundaryBars });
    must(program.events.length === track.events.length, `${name}: ${track.events.length} events compiled to ${program.events.length}`);
    for (const e of program.events) {
      must(BY_NAME[e.voice], `${name}: an event of ${e.voice}, which is no registered voice`);
      must(e.layer === BY_NAME[e.voice].layer, `${name}: an event of ${e.voice} carries the layer ${e.layer} and the descriptor says ${BY_NAME[e.voice].layer}`);
      must(e.bus === BY_NAME[e.voice].bus, `${name}: an event of ${e.voice} lands on ${e.bus} and the descriptor says ${BY_NAME[e.voice].bus}`);
    }
    // ...and the one scheduling contract really finds them: what a render
    // pours, without a context to pour it into.
    const sounding = schedule(program, offsetGrid(0), 0, program.duration).events.length;
    must(sounding === program.events.length, `${name}: ${sounding} of ${program.events.length} events reach a schedule`);
    const drawn = laneVoices(style, track.seed, biasFor(null, style));
    const played = new Set(program.events.map((e) => e.voice));
    const lanesSounding = style.lanes.filter((l) => played.has(l.voices ? drawn[l.id] : voicePlaying(l.gate, track.dice[l.timbre]))).length;
    fixtures.push(`${name} ${style.lanes.length} lanes, ${lanesSounding} sounding, ${program.events.length} events`);
  }
  // (3b) A gate two lanes share is one share. The loudness features read the
  // style's own gates by name, and a gate named by three lanes was divided by
  // the window three times over — the twelve-lane fixture's `share_sixteenths`
  // read 1/64 and its `share_clap` 1/8 with every gate on in every bar (the outside review,
  // 09-19). Held here on both fixtures and both strategies: one `share_` per
  // distinct gate, every share inside 0..1, and the two shared gates of the
  // twelve-lane fixture, which its grammar never switches off, at exactly 1.
  for (const [name, style] of [...Object.entries(FIXTURES), ...STRATEGY_IDS.map((id) => [id, STRATEGIES[id].style])]) {
    const gates = [...new Set(style.lanes.filter((l) => l.gate).map((l) => l.gate))];
    const track = planTheme('16', 0, { preset: 'auto', style, themeBars: 32 });
    const f = loudnessFeatures(track, style);
    const shares = Object.keys(f).filter((k) => k.startsWith('share_'));
    must(shares.length === gates.length, `${name}: ${shares.length} shares for ${gates.length} distinct gates`);
    for (const k of shares) must(f[k] >= 0 && f[k] <= 1, `${name}: ${k} reads ${f[k]}, outside 0..1`);
    if (name === 'twelveLane') for (const k of ['share_sixteenths', 'share_clap'])
      must(f[k] === 1, `${name}: ${k} reads ${f[k]} where its gate is on in every bar and shared by more than one lane`);
  }
  // (3c) Two lanes on one figure with two gates: each emits under its own gate
  // after the one shared draw, and not under the first lane's. A clap lane on
  // and a snare lane off used to write 70 claps and 70 snares (the outside
  // review, 09-19, §1 of its composition review); it writes the claps and no
  // snare now. The mirror — the clap off and the snare on — is the other half
  // of the same question: a group is asked when any of its lanes' gates is on,
  // so the snare plays alone. Both digests held either side of that rule,
  // because no bar of the record has a hat group's first gate off and another
  // of its gates on (MEASURED: 0 of 2 048 golden bars, 0 of 59 536 over seeds
  // 1-199, both strategies).
  const pair = {};
  for (const [name, style] of Object.entries(twoGates)) {
    const track = planTheme('16', 0, { preset: 'auto', style, themeBars: 32 });
    pair[name] = { clap: track.events.filter((e) => e.voice === 'clap').length, snare: track.events.filter((e) => e.voice === 'snare').length };
  }
  must(pair.clapOnSnareOff.clap > 0 && pair.clapOnSnareOff.snare === 0,
    `two gates on one figure, the clap on and the snare off: ${pair.clapOnSnareOff.clap} claps and ${pair.clapOnSnareOff.snare} snares`);
  must(pair.clapOffSnareOn.clap === 0 && pair.clapOffSnareOn.snare > 0,
    `two gates on one figure, the clap off and the snare on: ${pair.clapOffSnareOn.clap} claps and ${pair.clapOffSnareOn.snare} snares`);
  // (4) A source is called once per bar however many lanes it feeds, and the
  // record's twelve lanes are seven sources: the hat mask feeds three of them.
  const groups = sourcesOf(v1.lanes);
  must(groups.length === 7, `house-v1's twelve lanes are ${groups.length} figure sources`);
  must(groups.find((g) => g.figure === 'hatMask').lanes.length === 3, 'the hat mask no longer feeds three lanes');
  must(groups.find((g) => g.figure === 'glue').lanes.length === 4, 'the glue is no longer four lanes');
  return `${STRATEGY_IDS.length} strategies and 2 fixtures, ${rows} lane rows in all: every role the registry's, every figure source one the generator has a function for, every gate one the section grammar carries and every gate of the grammar a lane's, and every candidate's own bus the one its lane declares. house-v1 is twelve lanes of one candidate each over seven figure sources (the hat mask feeding three of them and the glue four); ${fixtures.join('; ')}`;
});

check('the rota is the stage\'s six, and the kitchen the ceiling admitted behind them', () => {
  const v1 = STRATEGIES['house-v1'].style;
  const v2 = STRATEGIES['house-v2'].style;
  const rota = v2.catalogue.treatmentRota;
  // (1) The six gestures are still the head of the list, in v1's order, at v1's
  // weight — and behind them stand the instances rule 4 let in.
  const gestures = rota.filter((e) => e.kind === 'gesture');
  must(same(gestures.map((e) => e.v), v1.stage.treatments),
    'the gestures are not the stage\'s own six in its own order');
  must(same(rota.slice(0, gestures.length).map((e) => e.v), v1.stage.treatments),
    'the six gestures are not at the head of the rota');
  must(same(v2.stage.treatments, rota.filter((e) => e.w > 0).map((e) => e.v)),
    'the stage\'s live rota is not every entry above nought, in the list\'s order');
  // (2) Round K1 §6's map: each gesture says which instances it would be built
  // out of, and every one of those is a registered effect. `hole` names none,
  // because a hole moves events and no DSP is involved at all.
  let mapped = 0;
  for (const e of rota) {
    if (e.kind !== 'gesture') continue;
    must(Array.isArray(e.over), `the gesture ${e.v} carries no map`);
    for (const id of e.over) { must(EFFECTS_BY_ID[id], `${e.v} maps onto ${id}, which is no registered effect`); mapped++; }
    must(e.v === 'hole' ? e.over.length === 0 : e.over.length > 0, `${e.v}'s map is the wrong shape for what it is`);
  }
  // (3) One instance per registered effect, in the registry's order, and each
  // of them either at the weight rule 2 opened it at or at nought with rule 4's
  // arithmetic on the row.
  const instances = rota.filter((e) => e.kind === 'effect');
  must(same(instances.map((e) => e.v), EFFECT_REGISTRY.map((d) => `fx:${d.id}`)),
    'the instances are not one per registered effect in the registry\'s order');
  let admitted = 0;
  for (const e of instances) {
    if (e.w > 0) { admitted++; must(e.w === e.opened, `${e.v} is live at ${e.w} and was opened at ${e.opened}`); continue; }
    must(e.dropped, `${e.v} is at nought and says nothing about why`);
  }
  // ...and what got in is exactly what the ceiling can afford: two lanes of the
  // dearest admitted instance on top of the record's own cast.
  const dearest = admitted ? Math.max(...instances.filter((e) => e.w > 0).map((e) => costOf([e.v.slice(3)]))) : 0;
  must(CAST_UNITS + dearest * TREATED_LANES <= CATALOGUE_CEILING,
    `the dearest admitted instance is ${dearest} units on each of ${TREATED_LANES} lanes, which is ${CAST_UNITS + dearest * TREATED_LANES} against ${CATALOGUE_CEILING}`);
  for (const e of instances) {
    if (e.w > 0) continue;
    if (e.dropped.by !== 'rule 4') continue;
    // Every dropped instance really is one the ceiling could not take.
    must(CAST_UNITS + costOf([e.v.slice(3)]) * TREATED_LANES > CATALOGUE_CEILING,
      `${e.v} was dropped for cost and would have fitted`);
  }
  // (4) The palette places every one of them, on lanes and at moments out of
  // the two closed vocabularies, and the six gestures are placed exactly where
  // the stage already puts them.
  const lanes = new Set(PALETTE_LANES);
  const moments = new Set(MOMENTS);
  const byId = Object.fromEntries(v2.palette.map((r) => [r.id, r]));
  const families = new Set();
  for (const e of rota) {
    const row = byId[e.v];
    must(row, `${e.v} is in the rota and not in the palette`);
    must(row.lanes.length, `${e.v} is placed on no lane`);
    must(row.moments.length, `${e.v} is placed at no moment`);
    for (const l of row.lanes) must(lanes.has(l), `${e.v} is placed on ${l}, which is no lane`);
    for (const m of row.moments) must(moments.has(m), `${e.v} is placed at ${m}, which is no moment`);
    families.add(row.family);
  }
  for (const g of v1.stage.treatments) {
    const want = v1.stage.padOnlyTreatments.includes(g) ? ['pad'] : ['pad', 'keys'];
    must(same(byId[g].lanes, want), `the palette puts ${g} on ${byId[g].lanes.join('+')} and the stage puts it on ${want.join('+')}`);
  }
  const heard = v2.palette.filter((r) => r.note).length;
  // (5) And the table is really read: every lane the rota draws for must have
  // something placed on it somewhere, or the placement table would be a
  // decoration and the stage would be silent for a reason nobody stated.
  for (const lane of ['pad', 'keys']) {
    const on = v2.palette.filter((r) => r.w > 0 && r.lanes.includes(lane));
    must(on.length, `nothing at all is placed on the ${lane} lane`);
    const moments = new Set(on.flatMap((r) => r.moments));
    must(moments.has('main'), `nothing is placed on the ${lane} lane at the main groove, which is most of every theme`);
  }
  return `${rota.length} entries: the stage's ${v1.stage.treatments.length} gestures at the head of the list in v1's order, ${mapped} instances named by round K1 §6's map and every one of them registered, ${instances.length} kitchen instances in the registry's order across ${families.size} families of which ${admitted} the ceiling admitted (the dearest of them ${dearest} units, so ${CAST_UNITS}+${dearest * TREATED_LANES}=${CAST_UNITS + dearest * TREATED_LANES} against ${CATALOGUE_CEILING}) and ${instances.length - admitted} it could not, every row placed on lanes and at moments out of the two closed vocabularies (${PALETTE_LANES.length} and ${MOMENTS.length}), the six gestures exactly where the stage already puts them, and ${heard} rows carrying a note from the kitchen review`;
});

// --- what each strategy is about to ask a phone for --------------------------
//
// `packages/engine/tools/budget.ts` is the measuring half of this: it renders
// every instrument, prices it against one cheap effect through a minute of
// noise, and works the ceiling out from what this machine can do. It needs a
// browser and eleven seconds, so what runs here is the **arithmetic** over the
// classes it already blessed into the descriptors — which is the half that has
// to run on every commit, because what changes between commits is a candidate
// list and not an instrument.
//
// The ceiling is **220 units**, STATED here and MEASURED there: round K4 read
// it at 216 to 223 on this machine at `--phone 4 --headroom 1.5`, and 220 is
// the middle of that band. A node check has no browser to measure with, so it
// is written down with the band it came out of beside it rather than inferred.
const CEILING = 220;

// --- every knob the rota writes is one its effect declares, inside its range ---
//
// Round K5b's phase bug, as a class: the rota rolls six numbers per segment and
// writes them onto an instance's knobs by name, and `clampParam` at the far end
// is the only thing that decides what a number out of range becomes — which is
// how a phase rolled in radians was written onto a knob declared as a ratio and
// clamped to 1 on five sixths of the range, a constant where a roll was meant,
// found by reading the blessed snapshot rather than by any gate. This is the
// gate: every insert of every golden theme under every strategy, every declared
// knob it writes inside the declared range, so the next unit mismatch fails a
// line instead of shipping as a clamp. A knob the effect does not declare is
// counted and not a fault: `resolveParams` drops it before the sound, and the
// program digest is what holds the rota's own six to their numbers.
check('every knob the rota writes is one its effect declares, inside its range', () => {
  let inserts = 0, knobs = 0;
  const undeclared = new Map();
  const ids = new Set();
  for (const id of STRATEGY_IDS) {
    for (const m of Object.keys(GOLDEN_THEMES)) {
      for (let i = 0; i < GOLDEN_THEMES[m]; i++) {
        const program = programOf(planTheme(m, i, { preset: 'auto', strategy: id }));
        for (const e of program.events) {
          const fx = e.p && e.p.fx;
          if (!fx) continue;
          inserts++;
          ids.add(fx.id);
          const d = EFFECTS_BY_ID[fx.id];
          must(d, `${id}: master ${m} theme ${i} event ${e.i} carries an insert of ${fx.id}, which is not a registered effect`);
          for (const [k, v] of Object.entries(fx.params)) {
            const spec = d.params[k];
            if (!spec) { undeclared.set(k, (undeclared.get(k) || 0) + 1); continue; }
            knobs++;
            must(Number.isFinite(v), `${id}: master ${m} theme ${i} event ${e.i}: ${fx.id}.${k} is written ${v}`);
            must(v >= spec.min && v <= spec.max,
              `${id}: master ${m} theme ${i} event ${e.i}: ${fx.id}.${k} is written ${v}, outside its declared ${spec.min}..${spec.max} (${spec.unit}), and clampParam would have hidden it`);
          }
        }
      }
    }
  }
  must(inserts > 0, 'no golden theme of any strategy compiled an effect insert, so this holds nothing');
  const dropped = [...undeclared].map(([k, n]) => `${k} x${n}`).join(', ');
  return `${inserts} inserts of ${ids.size} effects (${[...ids].sort().join(', ')}) over the golden themes of ${STRATEGY_IDS.length} strategies: ${knobs} declared knobs written, every one finite and inside its declared range; ${dropped || 'no'} undeclared knobs written and dropped at resolveParams`;
});

/**
 * One strategy's worst case, in the units `budget.ts` prices everything in.
 *
 * **The cast is per lane.** The record's own cast is every registered voice the
 * arrangement gates — nine of them, which is `budget.ts`'s own `V1_CAST`
 * arrived at by asking the registry instead of by writing a list — and a lane
 * that has become a candidate list is priced at its **dearest live candidate**,
 * because a lane plays one of them at a time and what a phone has to survive is
 * the worst draw. Priced as a flat list instead, a kitchen wired at weight
 * nought would read as five times the record it is byte-identical to.
 *
 * **The chain is one instance per treated lane**, which is round K5b's own
 * resolution of the question K5a left open. The rota draws *one* kind per lane
 * per segment of eight or sixteen bars, so twenty-six instances never stand up
 * together: the worst case is the dearest admitted instance on each of the
 * stage's harmonic lanes. Priced as all of them at once instead — which is
 * round K4's framing of the *kitchen* and is the right framing for a kitchen —
 * a rota nobody can hear more than two of at a time would read as thirty-two
 * units, and the number reported beside it is that one, so the two framings can
 * be compared rather than argued about.
 *
 * **The cast is per lane too**, and a lane whose candidates a *timbre* list
 * chooses between counts as a lane: since K5b the keys and pad layers really do
 * draw an instrument out of the kitchen, and the voice an event carries is the
 * one the registry says makes the timbre that was drawn.
 */
function worstCase(strategy) {
  const style = strategy.style;
  const cast = REGISTRY.filter((d) => d.plays);
  const lists = (style.candidates || []).filter((c) => c.of === 'voice');
  // What each arrangement role may actually be rendered by, asked of the
  // catalogue's timbre lists through the registry's own `voicePlaying`. Under
  // house-v1 every answer is the role's own voice; under house-v2 the keys and
  // the pad may be any instrument the widened lists can name.
  const byRole = {};
  for (const c of (style.candidates || [])) {
    if (c.of !== 'timbre') continue;
    const weights = style.catalogue[c.id];
    const live = Array.isArray(weights) && weights.length && typeof weights[0] === 'object'
      ? weights.filter((e) => e.w > 0).map((e) => e.v) : c.list();
    for (const t of live) {
      for (const role of ['keys', 'pad']) {
        const v = voicePlaying(role, t);
        (byRole[role] = byRole[role] || new Set()).add(v);
      }
    }
  }
  let voices = 0;
  const lanes = [];
  for (const d of cast) {
    const row = lists.find((c) => c.list().includes(d.name));
    const fromLists = row ? style.catalogue[row.id].filter((e) => e.w > 0).map((e) => e.v) : null;
    const fromTimbres = byRole[d.plays] && byRole[d.plays].has(d.name) ? [...byRole[d.plays]] : null;
    const pool = fromLists || fromTimbres || [d.name];
    const worst = pool.reduce((a, b) => (costOfVoices([b]) > costOfVoices([a]) ? b : a));
    voices += costOfVoices([worst]);
    lanes.push(pool.join(','));
  }
  const live = (style.catalogue.treatmentRota || []).filter((e) => e.w > 0 && e.kind === 'effect').map((e) => e.v.slice(3));
  const allAtOnce = costOf(live);
  const dearest = live.length ? Math.max(...live.map((id) => costOf([id]))) : 0;
  const perLane = dearest * STAGE_HARMONIC.length;
  // **The glue is reported and not summed**, and round K6 is when that stopped
  // being implicit. The cast is `plays`-gated: the four voices that fill the
  // section glue declare `plays: null`, so `budget.ts --lanes` has never
  // priced them and the 215 the ceiling is anchored on has never held them. K6
  // makes those lanes really draw, and a drawn candidate can be dearer than the
  // one the record puts there — so the number is stated here. It is not added
  // to the ceiling because a glue one-shot is a boundary and not a lane that
  // sounds bar by bar; the day it is summed, the 215 is re-measured with it.
  const glue = (style.lanes || []).filter((l) => !l.gate && l.voices)
    .map((l) => Math.max(...l.voices.filter((e) => e.w > 0).map((e) => costOfVoices([e.v]))));
  return { voices, live, allAtOnce, perLane, dearest, total: voices + perLane, lanes, glue: glue.reduce((a, b) => a + b, 0), glueLanes: glue.length };
}

// This table prices declared style lanes and their insert rota. It does not
// price the optional composition ornament/pulse or their lazy spatial returns.
check('each strategy\'s declared lane table fits under the recorded ceiling', () => {
  const lines = [];
  for (const id of STRATEGY_IDS) {
    const w = worstCase(STRATEGIES[id]);
    must(w.voices === CAST_UNITS,
      `${id}'s worst-case cast is ${w.voices} units and the record's measured cast is ${CAST_UNITS}`);
    must(w.total <= CEILING, `${id} is ${w.voices}+${w.perLane}=${w.total} units against a ceiling of ${CEILING}`);
    lines.push(`${id} ${w.voices}+${w.perLane}=${w.total}`);
  }
  // The ceiling in the catalogue and the ceiling here are one number, and the
  // catalogue is where the admission rule reads it: two files stating a limit
  // is two files that will one day state different ones.
  must(CATALOGUE_CEILING === CEILING, `the catalogue rations at ${CATALOGUE_CEILING} and this check at ${CEILING}`);
  must(TREATED_LANES === STAGE_HARMONIC.length, `the catalogue prices ${TREATED_LANES} treated lanes and the stage has ${STAGE_HARMONIC.length}`);
  const v1 = worstCase(STRATEGIES['house-v1']);
  const v2 = worstCase(STRATEGIES['house-v2']);
  must(v1.live.length === 0, `house-v1's rota is building ${v1.live.join(', ')}, and the record's six are all gestures`);
  must(v2.live.length > 0, 'house-v2 admitted no effect instance at all, so the golden opened on nothing');
  // The other framing, reported and not asserted: what the same rota would cost
  // if every admitted instance were built at once. It is the number the trade
  // is made against, and it is Eugene's to make.
  return `${lines.join(', ')} against a ceiling of ${CEILING}. The cast is identical under both because a lane is priced at its dearest live candidate and every lane's dearest is still the voice the record plays — the kitchen's pads and keys are mid or dear where the record's are dear. `
    + `The chain is what moved: house-v2 builds ${v2.live.length} of the ${STRATEGIES['house-v2'].style.catalogue.treatmentRota.filter((e) => e.kind === 'effect').length} instances, the dearest of them ${v2.dearest} units, one per treated lane — ${v2.perLane} units, against ${v2.allAtOnce} if all ${v2.live.length} stood up at once, which is ${CAST_UNITS + v2.allAtOnce} and over. `
    + `The section glue is ${v2.glueLanes} lanes more, ${v1.glue} units under house-v1 and ${v2.glue} under house-v2 at their dearest live candidates — reported and not summed, because a glue one-shot is a boundary and not a lane that sounds bar by bar, and the measured 215 has never held it. `
    + `Optional composition parts and lazy spatial returns are not priced by this table; their device budget needs a separate measurement. `
    + `The ${DROPPED_FOR_COST.length} the ceiling refused cost ${DROPPED_FOR_COST.map((d) => `${d.id.replace('fx:', '')} ${d.units}`).join(', ')}, and the cheapest of those would be ${CAST_UNITS + Math.min(...DROPPED_FOR_COST.map((d) => d.units)) * TREATED_LANES} against ${CEILING}`;
});

check('house-v2 leans a timbre list that house-v1 could not', () => {
  const v1 = STRATEGIES['house-v1'].style;
  const v2 = STRATEGIES['house-v2'].style;
  // The starting point, and it is the phase-1 finding said as a field: over a
  // whole mix **no bird separates the lead timbres**, so house-v1's own
  // signature for that list drives on nothing at all.
  must(v1.signatures.lists.leadTimbres.drives.length === 0,
    `house-v1's lead list now drives on ${v1.signatures.lists.leadTimbres.drives.join(', ')}, and the phase-1 finding was that it drives on nothing`);
  const layers = v2.layers;
  must(layers && layers.kind === 'layer', 'house-v2 carries no layer table');
  const heard = v1.catalogue.leadTimbres.map((o) => o.v);
  for (const t of heard) must(layers.rows[t], `${t} has no per-layer reading`);

  // Every entry a die can reach, and its weight, which is the thing the bias
  // actually decides. The **weights** are where the direction is asserted and
  // the **shares** are where it is reported: two hundred themes over a list of
  // twenty-five is four or five themes a candidate, which is a sample that can
  // say a distribution moved and cannot say which way one entry went.
  const live = v2.catalogue.leadTimbres.filter((e) => e.w > 0).map((e) => e.v);
  const at = (spell) => {
    const w = measuredWeights(spell, v2).leadTimbres;
    const out = {};
    v2.catalogue.leadTimbres.forEach((e, i) => { if (e.w > 0) out[e.v] = w[i]; });
    return out;
  };
  const atHouse = at(HOUSE);
  for (const t of live) must(Math.abs(atHouse[t] - 1) < 1e-12, `${t}'s weight at the house is ${atHouse[t]} and the identity is 1`);

  const N = 200;
  const shares = (strategy, spell) => {
    const out = {};
    for (let i = 0; i < N; i++) {
      const t = planTheme(String(1000 + i), 0, { spell, strategy });
      out[t.dice.leadTimbre] = (out[t.dice.leadTimbre] || 0) + 1;
    }
    return out;
  };
  const key = (o) => Object.keys(o).sort().map((k) => `${k}:${o[k]}`).join(' ');
  const houseV1 = shares('house-v1', null);
  const houseV2 = shares('house-v2', null);
  // house-v2's own opening: the record's seven are still the likely draw,
  // because rule 2 opened every newcomer at a third of the mean and a third of
  // the mean is not half the list — and the kitchen really is drawn.
  const old = new Set(heard);
  const kept = Object.entries(houseV2).filter(([t]) => old.has(t)).reduce((a, [, n]) => a + n, 0);
  const newly = N - kept;
  must(newly > 0, 'house-v2 drew none of the kitchen\'s lead timbres in 200 themes');
  must(kept > newly, `house-v2 drew the kitchen ${newly} times in ${N} and the record's own ${kept}: the record is no longer the likely draw`);

  let moved = 0;
  const lines = [];
  for (const b of BIRDS) {
    const spell = { ...HOUSE, [b]: 0.85 };
    // house-v1 does not move, on any bird: nothing in its table separates its
    // seven, so every weight of its list is 1 and the draw is `pick`.
    must(key(shares('house-v1', spell)) === key(houseV1), `house-v1's lead shares moved on a pull of ${b}`);
    // ...and house-v2's weights move **in the direction the readings predict**:
    // the timbre whose own reading sits highest on the pulled bird gains on the
    // one that sits lowest. Not "the weights are different" — which way.
    const after = at(spell);
    const sorted = live.filter((t) => layers.rows[t]).sort((x, y) => layers.rows[y].mean[b] - layers.rows[x].mean[b]);
    const top = sorted[0];
    const bottom = sorted[sorted.length - 1];
    must(after[top] > after[bottom],
      `a pull on ${b} left ${top} (reading ${layers.rows[top].mean[b]}) at ${after[top].toFixed(3)} and ${bottom} (${layers.rows[bottom].mean[b]}) at ${after[bottom].toFixed(3)}`);
    must(after[top] > 1 && after[bottom] < 1,
      `a pull on ${b} did not move ${top} above and ${bottom} below the identity: ${after[top].toFixed(3)} and ${after[bottom].toFixed(3)}`);
    // ...and the draw really follows: the distribution over 200 themes is not
    // the one at the house.
    const drawn = shares('house-v2', spell);
    must(key(drawn) !== key(houseV2), `a pull on ${b} left house-v2's 200 themes rolling exactly the house's leads`);
    moved++;
    lines.push(`${b} ${top} x${after[top].toFixed(1)} / ${bottom} x${after[bottom].toFixed(2)}`);
  }
  // And nothing left the pool or owned it: no weight of the list is at either
  // clamp, so what moved the shares is the measurement and not the limit.
  const w = Object.values(at({ ...HOUSE, ember: 0.85 }));
  must(Math.min(...w) > WEIGHT_FLOOR && Math.max(...w) < WEIGHT_CEILING,
    `a lead weight is at the clamp: ${w.map((x) => x.toFixed(3)).join(', ')}`);
  return `house-v1's lead list drives on none of the eight and its shares over ${N} themes are the same on every pull; house-v2 reads ${live.length} names off the per-layer table, every weight exactly 1 at the house, and on all ${moved} birds the highest reading goes above the identity and the lowest below it (${lines.slice(0, 3).join('; ')}, ...) with every weight inside the clamp (${Math.min(...w).toFixed(2)} to ${Math.max(...w).toFixed(2)} against ${WEIGHT_FLOOR} and ${WEIGHT_CEILING}). At the house house-v2 draws the record's own seven ${kept} times in ${N} and the kitchen's ${newly}`;
});

check('the spell layer is the identity at the house', () => {
  const bias = biasFor(HOUSE, STYLE);
  must(bias.house, 'the house vector does not read as the house');
  must(biasFor(null, STYLE) === bias, 'no spell at all is not the same bias as the house vector');
  // Every weight of every list the style exposes, and every range.
  let weights = 0;
  for (const row of CATALOGUE) {
    const w = bias.weights[row.id];
    must(w, `the bias has nothing to say about ${row.id}`);
    must(w.length === row.list().length, `the bias for ${row.id} is ${w.length} weights over ${row.list().length} entries`);
    for (const x of w) must(x === 1, `a weight of ${x} on ${row.id} is not the identity`);
    weights += w.length;
  }
  for (const [k, v] of Object.entries(bias.ranges)) must(v === 1, `the range ${k} is ${v} and not the identity`);

  // The same numbers written out by hand are the same bias: the house is a
  // value and never an object identity.
  const byHand = asSpell({ ember: 0.394, tide: 0.558, zephyr: 0.377, root: 0.717, gleam: 0.359, veil: 0.473, spark: 0.275, loom: 0.578 });
  must(isHouse(byHand) && biasFor(byHand, STYLE) === bias, 'the house vector written out by hand is not the house');

  // The fourteen golden themes, planned with the spell and without it.
  // Under every strategy (the reconciled review of 09-24, R100): it was the
  // record's style alone, so house-v2's layer-table path was never held to it.
  let themes = 0;
  for (const strategy of STRATEGY_IDS)
  for (const [master, n] of Object.entries(GOLDEN_THEMES).flatMap(([m, c]) => Array.from({ length: c }, (_, i) => [m, i]))) {
    const plain = planTheme(master, n, { strategy });
    for (const spell of [HOUSE, byHand, { ...HOUSE }]) {
      const withSpell = planTheme(master, n, { strategy, spell });
      must(planDigest(plain) === planDigest(withSpell), `${strategy} seed ${master} theme ${n} moved when the house spell was named`);
    }
    themes++;
  }

  // **The identity is the arithmetic and not the cache.** `biasFor` hands back a
  // frozen identity at the house without doing the sums, which is a saving and
  // not the claim; the claim is that the sums themselves come out at one. So
  // the measured path is run with the house vector in it, and every weight it
  // computes has to be 1 **exactly** — `===`, not within a millionth. It is
  // exact by construction: a weight is one exponent over the same exponent at
  // the house, and at the house those are the same double.
  // **Every strategy's style** (R100): the record's alone used to be run, and
  // house-v2's layer table goes round a path of its own.
  let computedWeights = 0;
  for (const strategy of STRATEGY_IDS) {
    const style = STRATEGIES[strategy].style;
    const computed = measuredWeights(asSpell(HOUSE), style);
    for (const row of style.candidates) {
      const w = computed[row.id];
      must(w && w.length === row.list().length, `${strategy}: the measured path has ${w ? w.length : 'no'} weights for ${row.id}`);
      for (let i = 0; i < w.length; i++)
        must(w[i] === 1, `${strategy}: the measured path puts ${w[i]} on ${row.id}[${i}] at the house, which is not the identity`);
      computedWeights += w.length;
    }
    for (const [k, v] of Object.entries(measuredRanges(asSpell(HOUSE), style)))
      must(v === 1, `${strategy}: the measured path puts the range ${k} at ${v} at the house`);
  }

  // And a bird that actually moves reaches the dice. Which bird moves which
  // list is the measurement's to say (`style.signatures`), so the check asks
  // the table rather than naming a shape: every list some bird drives has to
  // lean when one of its own birds is pulled, and no lean may take a candidate
  // out of the pool.
  const SIG = STYLE.signatures;
  let leaned = 0;
  for (const [id, list] of Object.entries(SIG.lists)) {
    if (!list.drives.length) continue;
    const pulled = biasFor({ ...HOUSE, [list.drives[0]]: 0.95 }, STYLE);
    must(!pulled.house, 'a pulled spell still reads as the house');
    const w = pulled.weights[id];
    must(w.some((x) => x !== 1), `${id} is driven by ${list.drives[0]} and did not move when it was pulled`);
    for (const x of w)
      must(x >= WEIGHT_FLOOR && x <= WEIGHT_CEILING && x > 0,
        `a weight of ${x} on ${id} is outside ${WEIGHT_FLOOR}..${WEIGHT_CEILING}, which would take a candidate out of the pool`);
    leaned++;
  }
  let moved = 0;
  const pull = { ...HOUSE, [SIG.lists.rooms.drives[0]]: 0.95 };
  for (const [master, c] of Object.entries(GOLDEN_THEMES)) {
    for (let n = 0; n < c; n++) {
      if (planDigest(planTheme(master, n)) !== planDigest(planTheme(master, n, { spell: pull }))) moved++;
    }
  }
  must(moved > 0, 'a pulled bird changed no plan at all, so the weights are not being drawn through');

  // What the house derives to, so a change to the table shows up here.
  const d = derive(HOUSE);
  must(d.tempoFamily === 'house' && d.drumsOn && d.kit === 'fourFloor',
    `the house derives to ${d.tempoFamily}, drums ${d.drumsOn}, kit ${d.kit}`);
  must(d.pulse === HOUSE_DERIVED.pulse, 'derive is not a function of the spell alone');

  // The two query parameters, read where the composer reads them.
  const asked = parseSpell('ember:0.7,tide:0.3');
  must(asked.ember === 0.7 && asked.tide === 0.3, 'the spell parameter did not read its two birds');
  for (const b of BIRDS) if (b !== 'ember' && b !== 'tide') must(asked[b] === HOUSE[b], `the spell parameter moved ${b}, which it did not name`);
  must(parseSpell('ember:0.7,gloom:0.2') === null, 'a bird nobody has was read as a spell');
  must(parseSpell('') === null && parseSpell(null) === null, 'nothing was read as a spell');
  must(spellFromQuery('?spell=root:0.9').root === 0.9, 'the query string did not reach the spell');
  must(spellFromQuery('?rate=1') === null, 'a query with no spell in it made one');
  must(recipeFromQuery('?recipe=house/deep-house') === 'house/deep-house', 'the recipe parameter did not read its id');

  return `${themes} golden themes of ${STRATEGY_IDS.join(" and ")} plan the same hash with the house spell named and without it, over ${weights} weights on ${CATALOGUE.length} lists and ${Object.keys(bias.ranges).length} ranges all at 1 — and ${computedWeights} weights of every strategy's style at 1 down the measured path with no cache in front of it; ${leaned} lists lean when a bird of their own is pulled, none of them past ${WEIGHT_FLOOR}..${WEIGHT_CEILING}, and a pull on ${SIG.lists.rooms.drives[0]} moves ${moved} of the fourteen`;
});

// --- the signatures, and that the bias is them ------------------------------
//
// Phase 1's whole claim is that the weights came off a measurement rather than
// out of an argument. So the table is checked for being a measurement — every
// list, every candidate, a count behind each, and a provenance that says what
// was rendered and on which scale — and then the bias is checked for being that
// table and nothing else.

check('the signatures are a measurement, and the bias is the signatures', () => {
  const sig = STYLE.signatures;
  must(sig && sig.kind === 'signatures' && sig.schema === 1, 'the style carries no signature table');
  must(sig.style === STYLE.id, `the signatures are ${sig.style}'s and the style is ${STYLE.id}`);
  const p = sig.provenance;
  for (const field of ['date', 'tool', 'seeds', 'themes', 'window', 'anchors'])
    must(p && p[field], `the signatures do not say their ${field}`);
  must(p.themes >= 100, `the signatures stand on ${p.themes} themes`);
  must(/anchors\.json@/.test(p.anchors), `the signatures do not name the scale they were read on: ${p.anchors}`);

  // The table is parallel to the catalogue: every list it speaks about is a
  // list the style has, every candidate it names is in that list, and every
  // candidate of a list it speaks about has a row — a candidate the sweep never
  // reached says so with a count of nought rather than by being absent.
  const byId = Object.fromEntries(CATALOGUE.map((c) => [c.id, c]));
  let rows = 0;
  let measured = 0;
  const inert = [];
  for (const [id, list] of Object.entries(sig.lists)) {
    must(byId[id], `the signatures speak about ${id}, which is not a candidate list`);
    must(list.die === byId[id].die, `the signatures say ${id} is drawn by ${list.die} and the style says ${byId[id].die}`);
    const entries = byId[id].list().map(String);
    for (const k of Object.keys(list.candidates))
      must(entries.includes(k), `the signatures name ${id}.${k}, which is not in the list`);
    for (const k of entries) {
      must(list.candidates[k], `${id}.${k} has no row in the signatures`);
      const c = list.candidates[k];
      must(Number.isFinite(c.n) && c.n >= 0, `${id}.${k} has no count`);
      if (c.n > 1) {
        for (const b of BIRDS) {
          must(Number.isFinite(c.mean[b]) && c.mean[b] >= 0 && c.mean[b] <= 1, `${id}.${k}'s ${b} is ${c.mean[b]}`);
          must(Number.isFinite(c.sd[b]), `${id}.${k}'s ${b} has no spread`);
        }
      }
      rows++;
      if (c.n >= MIN_SIGNATURE) measured++;
    }
    // Every bird is either driving this list or measured and silent, and no
    // bird is both: "we did not look" is not one of the answers.
    must(list.drives.length + list.silent.length === BIRDS.length,
      `${id} accounts for ${list.drives.length + list.silent.length} birds of ${BIRDS.length}`);
    for (const b of list.drives) {
      must(!list.silent.includes(b), `${id} has ${b} both driving and silent`);
      // `spread`, the field the table carries: it read `spreads`, which nothing
      // carries, and `undefined !== null` held for ever (the typescript round
      // and Grok, 09-19).
      must(Number.isFinite(sig.spread[b]) && sig.spread[b] > 0, `${id}'s ${b} has no spread`);
      must(list.spreads[b].between >= list.spreads[b].within,
        `${id} says ${b} drives it, and its spread across the candidates (${list.spreads[b].between}) is under its spread within them (${list.spreads[b].within})`);
    }
    for (const b of list.silent)
      must(list.spreads[b].between < list.spreads[b].within || list.drawn < 2,
        `${id} says ${b} is silent, and it separates the candidates`);
    // A list whose die is never asked for over a set's themes has a weight that
    // cannot do anything, and there are exactly two of them for two recorded
    // reasons: both rooms carry their own `voicingStyle` and short-circuit that
    // die (the style's reachability note, fact 1), and **a set states its own
    // root before `generate` draws one**, so the twelve key roots are reached by
    // a track generated on its own and by no theme of a set. A third appearing
    // is a composition change and shows up here.
    if (!list.draws) {
      must(STYLE.unreachable.includes(id) || id === 'keyRoots',
        `${id} was asked for ${list.draws} times over the sweep and nothing says it is unreachable`);
      inert.push(id);
    }
  }
  for (const b of BIRDS) must(sig.spread[b] > 0, `the kernel has no width on ${b}`);

  // And the bias is exactly that and nothing else: a list no bird drives draws
  // at 1 whatever the spell, which is `pick`.
  const far = asSpell(Object.fromEntries(BIRDS.map((b) => [b, HOUSE[b] > 0.5 ? 0.05 : 0.95])));
  const bias = biasFor(far, STYLE);
  let quiet = 0;
  for (const row of CATALOGUE) {
    const list = sig.lists[row.id];
    if (list && list.drives.length) continue;
    for (const w of bias.weights[row.id]) must(w === 1, `${row.id} is driven by no bird and carries a weight of ${w}`);
    quiet++;
  }
  const driven = Object.entries(sig.lists).filter(([, l]) => l.drives.length);
  const wired = Object.entries(sig.ranges).filter(([, r]) => r.wired);
  return `${p.themes} themes on ${p.anchors}, ${rows} candidate rows over ${Object.keys(sig.lists).length} lists and ${measured} of them with ${MIN_SIGNATURE} themes or more behind them; ${driven.length} lists are driven by a bird (${driven.map(([id, l]) => `${id} by ${l.drives.join('/')}`).join(', ')}), ${quiet} draw at 1 whatever is asked of them, ${inert.length} are weighted and never drawn in a set (${inert.join(', ')}), and ${wired.length} of the ${Object.keys(sig.ranges).length} continuous draws carry a fitted slope`;
});

// --- a bird moves the record the way its own signature says it will ----------
//
// The direction is never asserted here. It is read off the table — the share a
// candidate takes, weighted by what that candidate measured as — so this check
// cannot be satisfied by a bias that leans confidently the wrong way, which is
// the failure a hand-written curve makes and a measured one cannot.

/** The share each candidate of each list takes over `n` themes under one spell. */
function shares(spell, n = 200) {
  const out = {};
  for (let i = 1; i <= n; i++) {
    const t = planTheme(String(i), 0, { spell });
    for (const [id, c] of Object.entries(drawsOf(t))) {
      if (c === null || c === undefined) continue;
      (out[id] = out[id] || {});
      out[id][String(c)] = (out[id][String(c)] || 0) + 1;
    }
  }
  for (const id of Object.keys(out)) {
    const total = Object.values(out[id]).reduce((a, b) => a + b, 0);
    for (const k of Object.keys(out[id])) out[id][k] /= total;
  }
  return out;
}

/** Where a list's composition sits on one bird: the share-weighted signature. */
function composition(sig, id, share, bird) {
  let mass = 0;
  let sum = 0;
  for (const [k, p] of Object.entries(share[id] || {})) {
    const c = sig.lists[id].candidates[k];
    if (!c || !c.mean) continue;
    mass += p;
    sum += p * c.mean[bird];
  }
  return mass ? sum / mass : null;
}

check('a bird pulled moves the composition the way its signature says', () => {
  const sig = STYLE.signatures;
  const THEMES = 200;
  const lines = [];
  let tested = 0;
  let unwired = [];
  for (const b of BIRDS) {
    // A list whose die a set never reaches is measured and weighted and cannot
    // move a theme; asking whether it moved one would be asking about the room
    // that short-circuits it, twice.
    const drives = Object.entries(sig.lists).filter(([, l]) => l.drives.includes(b) && l.draws).map(([id]) => id);
    const ranges = Object.entries(sig.ranges).filter(([, r]) => r.wired && r.bird === b).map(([k]) => k);
    if (!drives.length && !ranges.length) { unwired.push(b); continue; }
    const low = shares({ ...HOUSE, [b]: 0.15 }, THEMES);
    const high = shares({ ...HOUSE, [b]: 0.85 }, THEMES);
    for (const id of drives) {
      const a = composition(sig, id, low, b);
      const z = composition(sig, id, high, b);
      must(a !== null && z !== null, `${id} drew nothing under a pulled ${b}`);
      must(z > a, `${b} pulled up moved ${id}'s composition from ${a.toFixed(3)} to ${z.toFixed(3)}, which is the wrong way`);
      // What that is in plain shares: the candidate with the most of this bird.
      const top = Object.entries(sig.lists[id].candidates)
        .filter(([, c]) => c.mean).sort((x, y) => y[1].mean[b] - x[1].mean[b])[0][0];
      lines.push(`${b} 0.15->0.85 takes ${id}'s ${top} from ${((low[id]?.[top] || 0) * 100).toFixed(0)}% to ${((high[id]?.[top] || 0) * 100).toFixed(0)}%`);
      tested++;
    }
    for (const key of ranges) {
      const fit = sig.ranges[key];
      const a = biasFor({ ...HOUSE, [b]: 0.15 }, STYLE).ranges[key];
      const z = biasFor({ ...HOUSE, [b]: 0.85 }, STYLE).ranges[key];
      must(Math.sign(z - a) === Math.sign(fit.slope),
        `${b} pulled up moved ${key} from ${a.toFixed(3)} to ${z.toFixed(3)}, against a slope of ${fit.slope}`);
      lines.push(`${b} 0.15->0.85 takes ${key} from ${a.toFixed(2)} to ${z.toFixed(2)}`);
      tested++;
    }
  }
  return `${tested} predictions, every one in the direction the signatures make: ${lines.join('; ')}${unwired.length ? `; ${unwired.join(', ')} drive no list and no range and move nothing` : ''}`;
});

check('the weighted pool moves toward the spell', () => {
  // The node-only proxy for the closed loop that `notes/archive/2026-09-kitchen/rounds/phase-1.md`
  // runs with renders: where the *signatures* say a biased pool will land,
  // against where the spell asked it to. The real test is audio and takes an
  // hour; this is the arithmetic under it and takes no time at all, so a
  // regression in the bias shows up here and not only in a round's write-up.
  const sig = STYLE.signatures;
  /** Where a list's pool sits on one bird, weighted by the bias and by how
   * often the die reaches each candidate at all. */
  const pool = (spell, id, bird) => {
    const list = sig.lists[id];
    const entries = CATALOGUE.find((c) => c.id === id).list().map(String);
    const w = biasFor(spell, STYLE).weights[id];
    let mass = 0;
    let sum = 0;
    entries.forEach((k, i) => {
      const c = list.candidates[k];
      if (!c || !c.mean || !c.n) return;
      const m = w[i] * c.n;
      mass += m;
      sum += m * c.mean[bird];
    });
    return mass ? sum / mass : null;
  };
  let moved = 0;
  const lines = [];
  for (const [id, list] of Object.entries(sig.lists)) {
    if (!list.draws) continue;
    for (const b of list.drives) {
      for (const v of [0.15, 0.85]) {
        const spell = { ...HOUSE, [b]: v };
        const here = pool(spell, id, b);
        const there = pool(HOUSE, id, b);
        must(here !== null, `${id} has no pool on ${b}`);
        must(Math.sign(here - there) === Math.sign(v - HOUSE[b]),
          `${id}'s pool on ${b} moved from ${there.toFixed(3)} to ${here.toFixed(3)} when ${b} was asked for ${v}`);
        moved++;
      }
      lines.push(`${id} on ${b}: ${pool({ ...HOUSE, [b]: 0.15 }, id, b).toFixed(3)} / ${pool(HOUSE, id, b).toFixed(3)} / ${pool({ ...HOUSE, [b]: 0.85 }, id, b).toFixed(3)}`);
    }
  }
  return `${moved} pulls, every one moving the weighted pool the way it was asked: ${lines.join('; ')}`;
});

// --- derive-lite: what the derived state is, and what it reaches -------------
//
// Three lines, and between them they are the round's whole claim. The first
// says `derive()` answers the landscape sheet; the second and third say a
// strategy that reads it composes a different plan, and that the record and the
// house do not.

/**
 * The seven regions of `notes/diagrams/landscape.md` §1, as their centres. They
 * are written out here and not imported, because the sheet is a *document*: the
 * regions are authored from production convention and nothing in the product
 * knows a region's name (`PLAN-MAGIC-V2` rule 1). What this line holds is the
 * sheet's §2 table — what each centre derives to — so that the day `derive()`
 * moves, the document that was written against it fails with it.
 */
const LANDSCAPE = [
  { region: 'ambient', spell: { ember: 0.08, tide: 0.90, zephyr: 0.35, root: 0.55, gleam: 0.45, veil: 0.15, spark: 0.10, loom: 0.90 }, family: 'unmetered', kit: 'fourFloor', drums: false },
  { region: 'dub techno', spell: { ember: 0.42, tide: 0.82, zephyr: 0.30, root: 0.72, gleam: 0.30, veil: 0.35, spark: 0.25, loom: 0.72 }, family: 'house', kit: 'fourFloor', drums: true },
  { region: 'minimal', spell: { ember: 0.34, tide: 0.45, zephyr: 0.35, root: 0.66, gleam: 0.35, veil: 0.22, spark: 0.28, loom: 0.82 }, family: 'house', kit: 'fourFloor', drums: true },
  { region: 'deep house', spell: { ember: 0.39, tide: 0.56, zephyr: 0.38, root: 0.72, gleam: 0.36, veil: 0.47, spark: 0.28, loom: 0.58 }, family: 'house', kit: 'fourFloor', drums: true },
  { region: 'techno', spell: { ember: 0.70, tide: 0.40, zephyr: 0.50, root: 0.76, gleam: 0.25, veil: 0.45, spark: 0.38, loom: 0.55 }, family: 'techno', kit: 'fourFloor', drums: true },
  { region: 'breaks / garage', spell: { ember: 0.62, tide: 0.45, zephyr: 0.55, root: 0.60, gleam: 0.45, veil: 0.55, spark: 0.70, loom: 0.40 }, family: 'techno', kit: 'breaks', drums: true },
  { region: 'drum and bass', spell: { ember: 0.90, tide: 0.25, zephyr: 0.70, root: 0.85, gleam: 0.30, veil: 0.60, spark: 0.85, loom: 0.35 }, family: 'drumAndBass', kit: 'breaks', drums: true },
];

check('the derived state is the landscape sheet, and the house is the house', () => {
  // **The identity, stated as the three words the composer reads.** It is the
  // gate the whole round hangs off: a change to the pulse that moved any of
  // these three would move house-v2's digests, and the two lock lines above
  // would fail before this one did.
  must(HOUSE_DERIVED.drumsOn === true, 'the house derives to drums off');
  must(HOUSE_DERIVED.kit === 'fourFloor', `the house derives to a ${HOUSE_DERIVED.kit} kit`);
  must(HOUSE_DERIVED.tempoFamily === 'house', `the house derives to the ${HOUSE_DERIVED.tempoFamily} band`);
  must(HOUSE_DERIVED.tempoRange[0] === 95 && HOUSE_DERIVED.tempoRange[1] === 115,
    `the house band is ${HOUSE_DERIVED.tempoRange.join('-')}`);
  // ...and `derive()` is a pure function of the eight, so the frozen record of
  // what the house derives to is what the house derives to.
  must(canonical(derive(HOUSE)) === canonical(HOUSE_DERIVED), 'HOUSE_DERIVED is not derive(HOUSE)');

  // Every region of the sheet, and the two words §2's table gives it.
  const rows = [];
  for (const r of LANDSCAPE) {
    const d = derive(asSpell(r.spell));
    must(d.tempoFamily === r.family, `${r.region} derives to the ${d.tempoFamily} band and the sheet says ${r.family}`);
    must(d.kit === r.kit, `${r.region} derives to a ${d.kit} kit and the sheet says ${r.kit}`);
    must(d.drumsOn === r.drums, `${r.region} derives to drums ${d.drumsOn ? 'on' : 'off'} and the sheet says ${r.drums ? 'on' : 'off'}`);
    rows.push(`${r.region} ${d.pulse.toFixed(3)} ${d.family || d.tempoFamily}`);
  }
  // **The finding the proposed pulse exists for**: a four-floor techno is
  // reachable, which under `0.35 + 0.65 x spark` took ember >= 0.87 and left
  // nothing above it for drum and bass. Stated as the two facts rather than as
  // the formula, so it survives a change to the weights that keeps the result.
  const techno = LANDSCAPE.find((r) => r.region === 'techno');
  const dnb = LANDSCAPE.find((r) => r.region === 'drum and bass');
  must(derive(asSpell(techno.spell)).tempoFamily === 'techno' && derive(asSpell(techno.spell)).kit === 'fourFloor',
    'fast straight music is still excluded: the techno centre is not a four-floor in the techno band');
  must(derive(asSpell(dnb.spell)).pulse > derive(asSpell(techno.spell)).pulse,
    'drum and bass does not sit above techno on the pulse');
  // ...and the two axes are really independent, which is the other half of it:
  // a broken kit at the house tempo and a straight kit at the drum and bass
  // tempo are both reachable, and neither was under the old weights.
  const brokenSlow = derive(asSpell({ ...HOUSE, spark: 0.80 }));
  const straightFast = derive(asSpell({ ...HOUSE, ember: 0.85 }));
  const straightFastest = derive(asSpell({ ...HOUSE, ember: 1 }));
  must(brokenSlow.kit === 'breaks' && brokenSlow.tempoFamily === 'house',
    `spark alone gives ${brokenSlow.kit} in the ${brokenSlow.tempoFamily} band`);
  must(straightFast.kit === 'fourFloor' && straightFast.tempoFamily === 'techno',
    `ember alone gives ${straightFast.kit} in the ${straightFast.tempoFamily} band`);
  // ...and the top of the ember scale is still straight, which is the half of
  // the old formula's fault that was easy to miss: under `0.35 + 0.65 x spark`
  // ember at 1 with spark at the house reached only 0.53, the middle of the
  // house band, so *no* pull on ember alone left the house at all.
  must(straightFastest.kit === 'fourFloor' && straightFastest.tempoFamily === 'drumAndBass',
    `ember at 1 gives ${straightFastest.kit} in the ${straightFastest.tempoFamily} band`);
  return `the house is drums on, a fourFloor kit and the house band 95-115, and derive(HOUSE) is the frozen record of it; all ${LANDSCAPE.length} regions of notes/diagrams/landscape.md derive to the family and the kit its table says (${rows.join('; ')}); a four-floor techno and a broken kit at the house tempo are both reachable, and drum and bass sits above techno on the pulse`;
});

check('drums off is a plan with no drum grid in it', () => {
  // The claim, on twenty seeds of house-v2 rather than on one: **ember under
  // 0.18 is a plan with no percussion event in it** — not a mix with the drums
  // muted, and not a filter over the events. The lane is gated in the plan,
  // which is what a machine view draws and what a timeline says.
  const v2 = STRATEGIES['house-v2'].style;
  const GATES = new Set(v2.lanes.filter((l) => l.gate && ['kick', 'offbeat', 'sixteenth', 'backbeat'].includes(l.role)).map((l) => l.gate));
  const PERC = new Set(v2.lanes.filter((l) => ['kick', 'offbeat', 'sixteenth', 'backbeat'].includes(l.role)).flatMap((l) => (l.voices || []).map((e) => String(e.v))));
  must(GATES.size === 5, `house-v2 has ${GATES.size} percussion gates and the record has five`);
  const off = { ...HOUSE, ember: 0.10 };
  let events = 0;
  let percussion = 0;
  let sections = 0;
  let onGates = 0;
  let ducked = 0;
  let crashes = 0;
  const seeds = [];
  for (let i = 0; i < 20; i++) seeds.push(String(1000 + i * 137));
  for (const seed of seeds) {
    const t = planTheme(seed, 1, { strategy: 'house-v2', spell: off });
    events += t.events.length;
    // No event of any percussion lane's candidate list, on any layer.
    for (const e of t.events) if (PERC.has(e.voice)) percussion++;
    // ...and the gate really is off in the plan, phrase by phrase.
    for (const s of t.arrangement.sections) for (const ph of s.phrases) for (const g of GATES) if (ph.layers[g]) onGates++;
    // ...and the timeline row says so too, which is what a readout reads.
    for (const row of t.timeline) for (const g of GATES) if (row.layers.includes(g)) onGates++;
    sections += t.arrangement.sections.length;
    // The duck is laid at every kick and there is no kick, so the sidechain is
    // a list of nought points: at rest by arithmetic and not by a mute.
    ducked += compilePerformance(t, settingsOf(t)).duck.length;
    // The one honest residue: a texture lane may still draw a crash at a
    // section boundary, because `texture` is not a percussion role and gating
    // it by the bus one of its candidates lands on would be a rule about an
    // instrument. Counted rather than forbidden.
    for (const e of t.events) if (e.voice === 'crash') crashes++;
    must(t.events.length > 0, `seed ${seed} planned nothing at all with the drums off`);
    must(t.arrangement.sections.length >= 2, `seed ${seed} has ${t.arrangement.sections.length} sections with the drums off`);
  }
  must(percussion === 0, `${percussion} percussion events survived ember 0.10 over ${seeds.length} seeds`);
  must(onGates === 0, `${onGates} percussion gates are still on in the plan`);
  must(ducked === 0, `${ducked} sidechain points were laid with no kick to lay them at`);
  // ...and the record itself is untouched by any of it: house-v1 carries no
  // switches, so the same spell plans the same drums it always did.
  const v1 = planTheme('1000', 1, { spell: off });
  const v1perc = v1.events.filter((e) => PERC.has(e.voice)).length;
  must(v1perc > 0, 'house-v1 read the derived state, and it never may');
  return `${seeds.length} seeds of house-v2 at ember 0.10: ${events} events, ${percussion} of them percussion, all 5 percussion gates off in every phrase of ${sections} sections and in every timeline row, ${ducked} sidechain points laid, and ${crashes} crashes drawn by a texture lane at a boundary; the same spell under house-v1 plans ${v1perc} percussion events on one seed, because the record reads no derived state at all`;
});

check('a knob is declared by a property and moved by a bird, and the house is every default', () => {
  // (1) The two vocabularies are one vocabulary. The engine declares the eight
  // bird names so a knob can say which one moves it; this file is where that
  // list is held to the composer's own, word for word and in order, because a
  // knob naming a ninth bird is a knob nothing would ever turn.
  must(KNOB_BIRDS.length === BIRDS.length && KNOB_BIRDS.every((b, i) => b === BIRDS[i]),
    `the engine's knob birds are ${KNOB_BIRDS.join(', ')} and the composer's are ${BIRDS.join(', ')}`);

  // (2) Every declaration is well formed, and the completeness readout is what
  // it says. The engine's own gate runs this too; it runs here because this is
  // the file that runs on every commit.
  const faults = REGISTRY.flatMap((d) => knobFaults(d));
  must(!faults.length, `the knob contract: ${faults.join('; ')}`);
  const declaring = REGISTRY.filter((d) => Object.keys(VOICE_KNOBS[d.name]).length);
  must(declaring.length > 0, 'no voice declares a knob at all');

  // (3) **The mapping, and the identity at the house.** Every declared knob of
  // every voice, at the house vector, comes back at exactly the number the
  // descriptor measured — not near it, the same double — and `knobsFor` hands
  // back an empty table, which is what is never written onto a plan.
  let knobs = 0;
  for (const d of declaring) {
    for (const [name, spec] of Object.entries(VOICE_KNOBS[d.name])) {
      knobs++;
      must(knobSetting(spec, asSpell(HOUSE)) === spec.default,
        `${d.name}/${name} is ${knobSetting(spec, asSpell(HOUSE))} at the house and its default is ${spec.default}`);
      must(Number.isFinite(spec.slopeDb), `${d.name}/${name} has no measured slope`);
      must((KNOB_UNITS as readonly string[]).includes(spec.unit), `${d.name}/${name} is in ${spec.unit}`);
      // ...and the two ends are the two ends, in the sense the row declares.
      const low = asSpell({ ...HOUSE, [spec.bird]: 0 });
      const high = asSpell({ ...HOUSE, [spec.bird]: 1 });
      const at0 = knobSetting(spec, low);
      const at1 = knobSetting(spec, high);
      must(Math.abs(at0 - (spec.sense > 0 ? spec.min : spec.max)) < 1e-9,
        `${d.name}/${name} at ${spec.bird} 0 is ${at0} and its ${spec.sense > 0 ? 'min' : 'max'} is ${spec.sense > 0 ? spec.min : spec.max}`);
      must(Math.abs(at1 - (spec.sense > 0 ? spec.max : spec.min)) < 1e-9,
        `${d.name}/${name} at ${spec.bird} 1 is ${at1} and its ${spec.sense > 0 ? 'max' : 'min'} is ${spec.sense > 0 ? spec.max : spec.min}`);
      // ...and nothing between them ever leaves the declared range, which is
      // the promise the artefact gate is a proof of.
      for (let i = 0; i <= 100; i++) {
        const v = knobSetting(spec, asSpell({ ...HOUSE, [spec.bird]: i / 100 }));
        must(v >= spec.min - 1e-9 && v <= spec.max + 1e-9, `${d.name}/${name} reaches ${v} at ${spec.bird} ${i / 100}, outside ${spec.min}..${spec.max}`);
      }
    }
  }
  const tables = Object.fromEntries(declaring.map((d) => [d.name, VOICE_KNOBS[d.name]]));
  must(!Object.keys(knobsFor(HOUSE, tables)).length, 'the house asks for a setting, and every setting at the house is its own default');
  must(!Object.keys(knobsFor(null, tables)).length, 'an absent spell asks for a setting');

  // (4) **The taste table is the landscape sheet**, and deep house is the
  // identity: the region limit narrows the engine limit and never widens it,
  // and until the ring's centre names a region the engine limit is what a pull
  // reaches. A row that narrowed deep house would be a hand on the record.
  const regions = Object.keys(KNOB_TASTE);
  must(regions.length === 7, `${regions.length} regions in the taste table, and the landscape sheet has seven`);
  must(regions.includes(HOUSE_REGION), `the house region ${HOUSE_REGION} is not in the taste table`);
  for (const [region, row] of Object.entries(KNOB_TASTE)) {
    for (const [name, band] of Object.entries(row)) {
      must(band[0] >= 0 && band[1] <= 1 && band[0] < band[1], `${region}'s ${name} is ${band[0]}..${band[1]}`);
    }
  }
  for (const d of declaring) {
    for (const [name, spec] of Object.entries(VOICE_KNOBS[d.name])) {
      must(knobInRegion(name, spec, HOUSE_REGION) === spec, `${d.name}/${name} is narrowed at the house region, and deep house is the identity`);
      for (const region of regions) {
        const narrow = knobInRegion(name, spec, region);
        must(narrow.min >= spec.min - 1e-9 && narrow.max <= spec.max + 1e-9, `${region} widens ${d.name}/${name} past the ends the gate proved`);
      }
    }
  }

  // (5) The record never asks. house-v1 carries no switches at all, so a spell
  // as far from the house as a spell goes plans a theme with no knobs on it.
  const far = asSpell({ ember: 0.9, tide: 0.9, zephyr: 0.9, root: 0.9, gleam: 0.9, veil: 0.9, spark: 0.1, loom: 0.9 });
  const v1 = planTheme('1', 1, { spell: far }) as any;
  must(!v1.knobs, 'house-v1 seasoned a voice, and the record reads no knob at all');
  const v2house = planTheme('1', 1, { strategy: 'house-v2' }) as any;
  must(!v2house.knobs, 'house-v2 at the house wrote a knob table onto the plan');
  const v2far = planTheme('1', 1, { strategy: 'house-v2', spell: far }) as any;
  must(v2far.knobs && Object.keys(v2far.knobs).length > 0, 'house-v2 off the house seasoned nothing at all');
  // ...and what reaches a note is what the plan says, and only on the voices it names.
  const program = programOf(v2far);
  const seasoned = new Set<string>();
  for (const ev of program.events) {
    if (!ev.p || !ev.p.knobs) continue;
    seasoned.add(ev.voice);
    must(JSON.stringify(ev.p.knobs) === JSON.stringify(v2far.knobs[ev.voice]), `${ev.voice} plays a setting the plan does not name`);
  }
  must([...seasoned].sort().join() === Object.keys(v2far.knobs).sort().join(),
    `the plan seasons ${Object.keys(v2far.knobs).join(', ')} and the program plays ${[...seasoned].join(', ')}`);
  const bare = programOf(v2house);
  must(!bare.events.some((e: any) => e.p && e.p.knobs), 'a house program carries a knob on a note');

  return `${knobs} knobs on ${declaring.length} voices, each of them at the number its own descriptor measures when the spell is the house — ${knobReadout()}; `
    + `every knob reaches exactly its declared end at its bird's 0 and 1 in the sense it declares and never leaves the range between them over 101 pulls; `
    + `the taste table is the landscape sheet's seven regions and deep house is the identity on all three, so the engine range is what a pull reaches; `
    + `house-v1 plans ${v1.events.length} events with no knob on any of them under a spell ${BIRDS.length} birds from the house, and house-v2 seasons ${Object.keys(v2far.knobs).length} voices (${Object.keys(v2far.knobs).join(', ')}) under the same one`;
});

// **Faster drums, lighter bass**: the first thing the derived state asks of a
// knob (Eugene, 09-20, on ember-high — "when the drums speed up the bass should
// get lighter, otherwise it gets muddier on faster progressions"). Three claims
// and they are three different kinds: the lean is **nought at the house family**,
// as arithmetic; it **falls with the family** and it falls by however far the
// landscape sheet's own hold column has travelled, so it is not a number
// somebody typed; and it lands the bass **inside that sheet's band** for the
// family it landed in, on the voice the lane table calls the bass and no other.
check('a faster family leans the bass lane down, and the house family leans it by nought', () => {
  const style = STRATEGIES['house-v2'].style;
  const FAMILIES = [
    ['house', {}, 'house', 'deep house'],
    ['techno', { ember: 0.85 }, 'techno', 'techno'],
    ['dnb', { ember: 0.90, spark: 0.85 }, 'drumAndBass', 'drum and bass'],
    ['slow', { ember: 0.10 }, 'unmetered', 'deep house'],
  ];
  // (1) The lean itself: nought at the house and at unmetered, and the sheet's
  // own distance elsewhere, as numbers.
  const LEAN = { house: 0, techno: 0.5, dnb: 0.6, slow: 0 };
  const leans = new Map();
  for (const [name, pull, family, region] of FAMILIES) {
    const d = derive(asSpell({ ...HOUSE, ...pull }));
    must(d.tempoFamily === family, `${name} derives to ${d.tempoFamily} and the sheet says ${family}`);
    const lean = tempoBassLean(d);
    // **Stated, not recomputed** (the reconciled review of 09-24, R132): this
    // line used to write `tempoBassLean`'s own expression out again and compare
    // the two, which no change to either could fail. The numbers are the
    // landscape sheet's hold column as it stands; a move of the sheet or of
    // the rule moves them, and this says which.
    must(lean === LEAN[name], `${name} leans ${lean}, and the sheet's hold column put it at ${LEAN[name]}`);
    leans.set(name, lean);
  }
  must(leans.get('house') === 0, `the house family leans the bass by ${leans.get('house')}`);
  must(leans.get('slow') === 0, `an unmetered theme leans the bass by ${leans.get('slow')}, and it has no drums to speed up`);
  must(leans.get('techno') > 0 && leans.get('dnb') > leans.get('techno'),
    `the lean is ${leans.get('house')} / ${leans.get('techno')} / ${leans.get('dnb')} and it has to rise with the family`);
  // ...and at nought it is the identity on every knob of every voice, to the
  // bit, which is the line the digests prove and this states in one place.
  for (const [voice, knobs] of Object.entries(VOICE_KNOBS)) {
    for (const [name, spec] of Object.entries(knobs)) {
      for (let i = 0; i <= 20; i++) {
        const set = knobSetting(spec, asSpell({ ...HOUSE, [spec.bird]: i / 20 }));
        must(tempoBassSetting(spec, set, 0) === set, `${voice}/${name} moves at a lean of nought`);
      }
    }
  }
  // (2) On a plan: which voice is the bass lane's is the lane table's answer,
  // and it is the only one that leans.
  const bassLane = style.lanes.filter((l) => l.role === 'bassline');
  must(bassLane.length === 1, `house-v2 has ${bassLane.length} bass lanes`);
  const bassVoice = bassLane[0].voices[0].v;
  const rows = [];
  let houseHold = null;
  for (const [name, pull, , region] of FAMILIES) {
    // Tide up, so every voice that declares `hold` really asks for one and the
    // lean has something to lean on; the bass is the only one that may move.
    const spell = { ...HOUSE, tide: 0.85, ...pull };
    const t = planTheme('1', 1, { strategy: 'house-v2', spell });
    const asked = knobsFor(spell, Object.fromEntries(Object.keys(t.knobs || {}).map((v) => [v, VOICE_KNOBS[v]])));
    for (const [voice, row] of Object.entries(t.knobs || {})) {
      for (const [knob, set] of Object.entries(row)) {
        const spec = VOICE_KNOBS[voice][knob];
        must(set >= spec.min - 1e-9 && set <= spec.max + 1e-9, `${name}: ${voice}/${knob} is ${set}, outside ${spec.min}..${spec.max}`);
        const leaned = voice === bassVoice && TEMPO_BASS_KNOBS.includes(knob);
        if (!leaned) must(set === asked[voice][knob], `${name}: ${voice}/${knob} moved and only the bass lane's hold and mass may`);
      }
    }
    const hold = (t.knobs && t.knobs[bassVoice] || {}).hold;
    must(Number.isFinite(hold), `${name}: the bass lane asked for no hold with tide at 0.85`);
    if (name === 'house') houseHold = hold;
    // (3) ...and it lands inside the landscape sheet's band for the family's
    // own region, as a fraction of the knob's engine range.
    const spec = VOICE_KNOBS[bassVoice].hold;
    const frac = (hold - spec.min) / (spec.max - spec.min);
    const band = KNOB_TASTE[region].hold;
    must(frac >= band[0] - 1e-9 && frac <= band[1] + 1e-9,
      `${name}: the bass holds ${hold} — ${frac.toFixed(3)} of its range — and ${region}'s band is ${band[0]}..${band[1]}`);
    rows.push(`${name} ${t.bpm} BPM hold ${hold.toFixed(3)} (${frac.toFixed(2)} of the range)`);
  }
  // (4) **The floor, with Tide at the house** (R132's second half). The claim
  // above is made with Tide pulled to 0.85, where every voice asks for a hold;
  // `tempoBassSetting` enforces only the ceiling, so the band's floor is a
  // claim of its own and is held here where the bass asks for the least.
  // Measured 09-24 on seed 1's second theme: techno at 0.27 and drum and bass
  // at 0.22 of the range, over floors of 0.2 and 0.1 (the house and unmetered
  // ask no hold at all there) — the review's "falls under" was disputed by
  // probe, and this is the line that would say so if it ever did.
  const floors = [];
  for (const [name, pull, , region] of FAMILIES) {
    const t = planTheme('1', 1, { strategy: 'house-v2', spell: { ...HOUSE, ...pull } });
    const hold = (t.knobs && t.knobs[bassVoice] || {}).hold;
    if (!Number.isFinite(hold)) { floors.push(`${name} asks no hold`); continue; }
    const spec = VOICE_KNOBS[bassVoice].hold;
    const frac = (hold - spec.min) / (spec.max - spec.min);
    const band = KNOB_TASTE[region].hold;
    must(frac >= band[0] - 1e-9, `${name} with Tide at the house: the bass holds ${frac.toFixed(3)} of its range, under ${region}'s floor of ${band[0]}`);
    floors.push(`${name} ${frac.toFixed(2)} (floor ${band[0]})`);
  }
  // ...and faster really is lighter, on the same spell, which is his sentence.
  const held = FAMILIES.map(([name]) => (planTheme('1', 1, { strategy: 'house-v2', spell: { ...HOUSE, tide: 0.85, ...FAMILIES.find((f) => f[0] === name)[1] } }).knobs[bassVoice] || {}).hold);
  must(held[1] < held[0] && held[2] < held[1], `the bass holds ${held.map((h) => h.toFixed(3)).join(' / ')} across house, techno and drum and bass`);
  must(held[3] === houseHold, `an unmetered theme holds ${held[3]} where the house holds ${houseHold}`);
  return `the lean is stated here as the landscape sheet's hold column puts it — 0 at the house family and at unmetered, ${leans.get('techno')} at techno, ${leans.get('dnb')} at drum and bass — and it is the identity on all ${Object.values(VOICE_KNOBS).reduce((n, k) => n + Object.keys(k).length, 0)} knobs at nought over 21 pulls each; on a plan with tide at 0.85 the bass lane (${bassVoice}, the lane table's own answer) is the only voice that moves and it lands inside the sheet's band every time — ${rows.join('; ')} — while ${TEMPO_BASS_KNOBS.join(' and ')} are the only two knob names the rule touches; with Tide at the house, ${floors.join(', ')}`;
});

check('the loudness model reads what the seasoning did, and nothing at the house', () => {
  // The fit sums each sounding family's declared `loudnessDb`; a knob adds its
  // **measured** slope times how far it was moved, which is the whole of
  // PLAN-MODULATION §4's first cost and how it is paid.
  const house = planTheme('1', 1, { strategy: 'house-v2' }) as any;
  must(knobDbOf(house.knobs, 'pad') === 0, 'the house is worth a decibel of seasoning');
  const style = STRATEGIES['house-v2'].style;

  // Over two hundred themes at each pull: the mean setting of every knob and
  // what the model says it is worth. It is the table the refit round (M2) is
  // handed, and it is here rather than in a note so it cannot go stale.
  const rows: string[] = [];
  const PULLS: Array<[string, Partial<Record<string, number>>]> = [
    ['tide 0.85', { tide: 0.85 }], ['tide 0.15', { tide: 0.15 }],
    ['zephyr 0.85', { zephyr: 0.85 }], ['zephyr 0.15', { zephyr: 0.15 }],
    ['ember 0.85', { ember: 0.85 }],
  ];
  for (const [name, pull] of PULLS) {
    const spell = asSpell({ ...HOUSE, ...pull });
    const per: Record<string, { n: number; sum: number }> = {};
    let seasoned = 0;
    let dbSum = 0;
    let shift = 0;
    for (let i = 0; i < 200; i++) {
      const t = planTheme(String(1000 + i), (i % 4) + 1, { strategy: 'house-v2', spell }) as any;
      const h = planTheme(String(1000 + i), (i % 4) + 1, { strategy: 'house-v2' }) as any;
      shift += predictedLufs(t, style) - predictedLufs(h, style);
      if (!t.knobs) continue;
      seasoned++;
      for (const [voice, row] of Object.entries(t.knobs as Record<string, Record<string, number>>)) {
        dbSum += knobDbOf(t.knobs, voice);
        for (const [knob, set] of Object.entries(row)) {
          const k = `${voice}/${knob}`;
          const a = per[k] || (per[k] = { n: 0, sum: 0 });
          a.n++;
          a.sum += set;
        }
      }
    }
    const said = Object.entries(per).sort().map(([k, a]) => `${k} ${(a.sum / a.n).toPrecision(3)} x${a.n}`).join(', ');
    rows.push(`${name}: ${seasoned}/200 themes seasoned, ${(dbSum / Math.max(1, seasoned)).toFixed(2)} dB of slope a theme, ${(shift / 200).toFixed(2)} LUFS predicted — ${said}`);
  }
  // At the house the prediction may not move by a thousandth: the trim is a
  // committed digest and a model that drifted at rest would move every theme.
  let atHouse = 0;
  for (let i = 0; i < 20; i++) {
    const t = planTheme(String(2000 + i), 1, { strategy: 'house-v2' }) as any;
    atHouse += Math.abs(loudnessTrimDb(t, style) - loudnessTrimDb({ ...t, knobs: undefined }, style));
  }
  must(atHouse === 0, `the trim moved by ${atHouse} dB over 20 house themes with no seasoning on any of them`);
  return `the knob term is nought at the house on 20 themes and the trim does not move; off it, over 200 themes a pull — ${rows.join(' | ')}`;
});

check('a derived tempo family is one grid, and a broken kit is a snare', () => {
  const v2 = STRATEGIES['house-v2'].style;
  const BANDS = { unmetered: [40, 70], house: [95, 115], techno: [120, 140], drumAndBass: [160, 180] };
  // The tempo, first: a theme lands in the band its own pulse derived, the set
  // it is in runs on one grid, and the deck's clock is that grid.
  const rows = [];
  let themes = 0;
  for (const [name, pull] of [['house', {}], ['techno', { ember: 0.85 }], ['dnb', { ember: 0.90, spark: 0.85 }], ['slow', { ember: 0.10 }]]) {
    const spell = { ...HOUSE, ...pull };
    const d = derive(asSpell(spell));
    const [lo, hi] = BANDS[d.tempoFamily];
    const plan = setLayout('1', 3, { style: v2, spell, themeBars: 32 });
    for (const t of plan.plans) {
      themes++;
      must(t.bpm >= lo - 1 && t.bpm <= hi + 1, `${name}: theme ${t.index} is ${t.bpm} BPM and the ${d.tempoFamily} band is ${lo}-${hi}`);
      // One grid for the set: every theme of it is the same tempo but for the
      // session's own drift, which is a tenth of a BPM a minute.
      must(Math.abs(t.bpm - plan.plans[0].bpm) < 2, `${name}: the set is not on one grid (${plan.plans.map((x) => x.bpm).join(', ')})`);
      must(Math.abs(t.barSeconds - (60 / t.bpm) * 4) < 1e-12, `${name}: theme ${t.index}'s bar is not its own tempo`);
    }
    // The clock a deck counts on is the set's own, and it opens on the derived
    // tempo: `makeSetClock` takes seconds a beat, and the bar it reports at
    // beat nought is the first theme's own bar.
    must(Math.abs(plan.clock.barSecondsAt(0) - plan.plans[0].barSeconds) < 1e-9,
      `${name}: the set clock opens at a bar of ${plan.clock.barSecondsAt(0)} and the plan's is ${plan.plans[0].barSeconds}`);
    rows.push(`${name} ${d.tempoFamily} ${plan.plans.map((t) => t.bpm).join('/')}`);
  }
  // ...and at the house it is the room's own tempo to the bit, which is the
  // identity the digests prove and this states in one line.
  const houseSet = setLayout('1', 3, { style: v2, spell: HOUSE, themeBars: 32 });
  const plainSet = setLayout('1', 3, { style: v2, themeBars: 32 });
  must(houseSet.plans.every((t, i) => t.bpm === plainSet.plans[i].bpm),
    'the house spell moved the set\'s tempo, and it may not');

  // The kit, second. The table is the strategy's and it is authored.
  const breaks = v2.catalogue.breakMasks;
  must(breaks.length >= 4 && breaks.length <= 6, `${breaks.length} authored breaks, and the plan asked for four to six`);
  for (const b of breaks) {
    must(/^[x.]{16}$/.test(b.m), `${b.name}'s kick mask is ${b.m}`);
    must(/^[xo.]{16}$/.test(b.s), `${b.name}'s snare mask is ${b.s}`);
    must(b.m.includes('x') && b.s.includes('x'), `${b.name} has no kick or no snare in it`);
    // A break is not a four on the floor with the kick moved: it does not put
    // a kick on all four beats.
    must(![0, 4, 8, 12].every((i) => b.m[i] === 'x'), `${b.name} is a four on the floor`);
    must(b.c > 0, `${b.name} is drawn at ${b.c}`);
    // **The thinning of 09-20**, as the three things the table was thinned to:
    // the kick in two or three places, the snare on the backbeat only, and a
    // bass budget on the row that is a pedal or a pump.
    const kicks = [...b.m].filter((c) => c === 'x').length;
    must(kicks >= 2 && kicks <= 3, `${b.name}'s kick fires ${kicks} times a bar`);
    const hits = [...b.s].filter((c) => c === 'x').length;
    must(hits >= 1 && hits <= 2, `${b.name}'s snare fires ${hits} times a bar`);
    must(!b.s.includes('o'), `${b.name}'s snare carries a ghost, and the table is the backbeat only since 09-20`);
    must(b.b === 1 || b.b === 2, `${b.name} leaves the bass ${b.b} notes, and a break leaves it a pedal or a pump`);
  }
  const names = new Set(breaks.map((b) => b.name));
  must(names.size === breaks.length, 'two authored breaks share a name');
  // The snare really is the backbeat lane, and it really is a snare: the list
  // is the strategy's, every entry of it declares the backbeat role, and none
  // of them is the clap the record plays.
  const back = v2.catalogue.breaksBackbeatVoices;
  must(back.length > 0, 'the broken kit has no backbeat list');
  for (const e of back) {
    must(BY_NAME[e.v], `${e.v} is not a registered voice`);
    must(BY_NAME[e.v].roles.includes('backbeat'), `${e.v} does not declare the backbeat role`);
    must(e.v !== 'clap', 'the broken kit plays the record\'s own clap');
  }
  // ...and a broken theme really plays it, with the kick on the break's steps.
  let broken = 0;
  let snares = 0;
  let claps = 0;
  const drawn = new Set();
  for (let i = 0; i < 20; i++) {
    const t = planTheme(String(2000 + i * 91), 1, { strategy: 'house-v2', spell: { ...HOUSE, spark: 0.80 } });
    broken++;
    must(t.dice.breakMask, `a broken theme drew no break`);
    drawn.add(t.dice.breakMask);
    const row = breaks.find((b) => b.name === t.dice.breakMask);
    const steps = new Set(t.events.filter((e) => e.voice === 'kick').map((e) => e.step));
    for (const st of steps) must(row.m[st] === 'x', `the kick fired on step ${st} and ${row.name} does not`);
    snares += t.events.filter((e) => e.voice === 'snare').length;
    claps += t.events.filter((e) => e.voice === 'clap').length;
  }
  must(snares > 0 && claps === 0, `${broken} broken themes played ${snares} snares and ${claps} claps`);

  // --- the taste rail: a break must leave the bass room -----------------------
  //
  // `notes/diagrams/landscape.md` asks for it in words and Eugene's ear asked
  // for it twice ("too complex and hardly listenable", "no musical value in this
  // particular clip"), so here it is as a number: **a break may not be busier on
  // the drum lanes than the four on the floor it replaced.** That is a real
  // ceiling and not a slack one — the first cut of the table was over it, at
  // 10.97 events a bar against 8.87 — and it is stated as the record's own
  // figure rather than as a constant somebody typed, so it follows the record.
  //
  // Counted per bar **the drums are playing in**, over the same twenty seeds at
  // the house and at spark 0.80, on the four drum layers; and the bass beside
  // it, which is what the room is for.
  const DRUM_LAYERS = new Set(['kick', 'clap', 'hats', 'shaker']);
  const density = (spell) => {
    let bars = 0; let drum = 0; let bass = 0;
    const per = new Map();
    for (let i = 0; i < 20; i++) {
      const t = planTheme(String(2000 + i * 91), 1, { strategy: 'house-v2', spell });
      const hit = t.events.filter((e) => DRUM_LAYERS.has(BY_NAME[e.voice].layer));
      bars += new Set(hit.map((e) => e.bar)).size;
      drum += hit.length;
      bass += t.events.filter((e) => BY_NAME[e.voice].layer === 'bass').length;
      for (const e of hit) per.set(BY_NAME[e.voice].layer, (per.get(e.voice ? BY_NAME[e.voice].layer : '') || 0) + 1);
    }
    return { drum: drum / bars, bass: bass / bars, per: new Map([...per].map(([k, n]) => [k, n / bars])) };
  };
  const floorDensity = density(HOUSE);
  const brokenDensity = density({ ...HOUSE, spark: 0.80 });
  must(brokenDensity.drum <= floorDensity.drum,
    `a break lays ${brokenDensity.drum.toFixed(2)} events a bar on the drum lanes and the four on the floor lays ${floorDensity.drum.toFixed(2)}`);
  // ...and the sixteenth lane is off under one, which is a third of that cut.
  must(!brokenDensity.per.get('shaker'),
    `the sixteenth lane lays ${(brokenDensity.per.get('shaker') || 0).toFixed(2)} events a bar under a break`);
  // ...and the bass really has fewer notes to say, which is the room itself.
  must(brokenDensity.bass < floorDensity.bass,
    `a break leaves the bass ${brokenDensity.bass.toFixed(2)} notes a bar and the four on the floor leaves it ${floorDensity.bass.toFixed(2)}`);
  // ...and a four-floor theme draws no break at all, which is what keeps the
  // house's own stream where it was.
  const straight = planTheme('2000', 1, { strategy: 'house-v2', spell: HOUSE });
  must(!straight.dice.breakMask, 'a theme at the house drew a break');
  // ...and its kick is on all four, which is the figure a break is not. Which
  // instrument takes the backbeat at the house is the kitchen's draw and not
  // this line's business — house-v2 widened that list in K5b — so what is
  // asserted is the *figure*, which is what the kit decides.
  const floor = new Set(straight.events.filter((e) => e.voice === 'kick').map((e) => e.step));
  must([0, 4, 8, 12].every((i) => floor.has(i)), `a theme at the house lost its four on the floor (${[...floor].sort((a, b) => a - b).join(',')})`);
  return `4 pulls laid out as sets of 3, ${themes} themes all inside their derived band and every set on one grid whose clock is the plan's own bar (${rows.join('; ')}), and the house spell moves the set's tempo by nothing; ${breaks.length} authored breaks, none of them a four on the floor, every kick in 2-3 places, every snare on the backbeat only and every row leaving the bass a pedal or a pump, ${drawn.size} of them drawn over 20 broken themes that played ${snares} snares and 0 claps with every kick on its own break's steps — and a break lays ${brokenDensity.drum.toFixed(2)} events a bar on the drum lanes against the four on the floor's ${floorDensity.drum.toFixed(2)}, with the sixteenth lane off under one and ${brokenDensity.bass.toFixed(2)} notes of bass a bar against ${floorDensity.bass.toFixed(2)}`;
});

// --- a recipe names no voice, no effect and no engine number -----------------
const VOCAB = vocabularyOf(STYLE, VOICE_REGISTRY);

// The listener's own rows, read the way a library is read — through
// `loadRecipes`, at the top level, because the loader is async and a check is
// not. They live outside git (`notes/` is ignored), so an empty read is a skip
// said out loud and never a pass.
const LISTENER_ROWS = await loadRecipes(path.join(REPO, 'notes', 'recipes'), VOCAB);

check('a recipe names roles, families, properties and birds, and nothing else', () => {
  // The committed row is the row the code builds, so the file and `src/spell.ts`
  // cannot drift apart.
  const onDisk = JSON.parse(fs.readFileSync(path.join(ROOT, 'recipes', 'house.json'), 'utf8'));
  must(canonical(onDisk) === canonical(houseRecipe()), 'recipes/house.json is not the house row this build makes');
  must(validate(onDisk, VOCAB).length === 0, `the house row does not pass its own gate: ${validate(onDisk, VOCAB).join('; ')}`);
  // Its box is the measured spread round the measured centre.
  for (const b of BIRDS) {
    const [lo, hi] = onDisk.birds[b];
    must(Math.abs((lo + hi) / 2 - HOUSE[b]) < 1e-9, `the house row's ${b} is not centred on the house vector`);
    must(Math.abs((hi - lo) / 2 - HOUSE_BOX[b]) < 1e-9, `the house row's ${b} is not the measured box wide`);
  }

  // Every way a row can name the machine, refused, each naming the field.
  const faults = {
    'a voice where a role belongs': (r) => { r.wants = { roles: ['piano'] }; },
    'a timbre by name': (r) => { r.wants = { timbres: { lead: 'rhodes' } }; },
    'a room by name': (r) => { r.wants = { room: 'growl' }; },
    'an effect palette': (r) => { r.wants = { palette: 'tight' }; },
    'an engine number': (r) => { r.wants = { reverbSeconds: 2.4 }; },
    'a voice as a key': (r) => { r.wants = { sub: { level: 1 } }; },
    'a property nobody declares': (r) => { r.wants = { timbres: { lead: { cutoffHz: 800 } } }; },
    'a slot nobody fills': (r) => { r.wants = { timbres: { organ: { struck: true } } }; },
    'a forbid that is a voice': (r) => { r.forbids = ['clap']; },
    'a ninth bird': (r) => { r.birds.gloom = [0.2, 0.3]; },
    'a bird outside 0..1': (r) => { r.birds.ember = [0.3, 1.4]; },
    'a bird running backwards': (r) => { r.birds.tide = [0.7, 0.2]; },
    'a scope nobody has': (r) => { r.scope = 'chorus'; },
    'a section nobody has': (r) => { r.scope = 'section'; r.applies = 'the bit I like'; },
    'an origin nobody has': (r) => { r.origin = 'taste'; },
    'a chef score off the bench\'s scale': (r) => { r.score = { chef: 5, likes: 0 }; },
    'a like count that is not a count': (r) => { r.score = { chef: 0, likes: 2.5 }; },
    'a pick that is not yes or no': (r) => { r.picked = 'maybe'; },
    // ...and the shapes the outside review of 09-19 found the gate waving through:
    // a known field of the wrong kind, which the walker only ever read as a
    // string leaf, and a property shape round a property nobody declares.
    'wants that is null': (r) => { r.wants = null; },
    'a role that is a number': (r) => { r.wants = { roles: 42 }; },
    'forbids that are not words': (r) => { r.forbids = [true, 42, null]; },
    'birds that is a list': (r) => { r.birds = []; },
    'a property that is infinite': (r) => { r.wants = { timbres: { pad: { hold: Infinity } } }; },
    'a shape round a property nobody declares': (r) => { r.wants = { timbres: { pad: { bananaMin: -100 } } }; },
  };
  for (const [what, mutate] of Object.entries(faults)) {
    const row = JSON.parse(JSON.stringify(HOUSE_RECIPE));
    mutate(row);
    const bad = validate(row, VOCAB);
    must(bad.length > 0, `${what} was accepted`);
  }

  // And the two listener rows of 09-18, if they are here: they live outside git
  // (`notes/` is ignored), so their absence is a skip and never a pass.
  let listener = 0;
  for (const { file, recipe, problems } of LISTENER_ROWS) {
    must(problems.length === 0, `${path.basename(file)} does not pass the gate: ${problems.join('; ')}`);
    must(recipe && recipe.origin === 'listener', `${path.basename(file)} is not a listener's row`);
    listener++;
  }
  return `the house row is the committed file and passes; ${Object.keys(faults).length} stated faults all refused; ${listener ? `${listener} listener rows out of notes/recipes pass` : 'no listener rows here to read'}`;
});

check('the shipped library is classified, valid and traceable', () => {
  // `src/recipes.ts` is what the page carries and `recipes/` is what is
  // committed; they are the same rows or the library on the page is not the
  // library in the tree.
  const dir = path.join(ROOT, 'recipes');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  must(files.length === LIBRARY.length, `${files.length} rows in recipes/ and ${LIBRARY.length} in the library`);
  const onDisk = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  for (const row of onDisk)
    must(LIBRARY.some((r) => canonical(r) === canonical(row)), `${row.id} is committed and is not in the library the page carries`);
  for (const row of LIBRARY) {
    const bad = validate(row, VOCAB);
    must(bad.length === 0, `${row.id} does not pass the gate: ${bad.join('; ')}`);
    // Ship only scopes with actual players: tracks, registered motifs and
    // explicitly placed local layers. Storage alone is not playback support.
    must(row.scope === 'track' ? row.applies === null : (row.scope === 'motif' && REGISTERS.includes(row.applies)) || (row.scope === 'layer' && row.placement?.roles.length === 1 && row.placement.roles[0] === row.applies),
      `${row.id} is a ${row.scope} row and the library carries tracks, motifs and explicitly placed layers`);
    must(recipeById(row.id) === row && recipeById(row.id.split('/')[1]) === row, `${row.id} is not findable by its own id`);
  }

  // The two room rows are the signature table's own numbers, so a re-measure
  // that moved a room and left the row behind fails here rather than quietly.
  const sig = STYLE.signatures.lists.rooms;
  const total = Object.values(sig.candidates).reduce((a, c) => a + (c.n || 0), 0);
  let rooms = 0;
  for (const room of STYLE.catalogue.rooms) {
    const row = recipeById(`house/${room}-room`);
    must(row, `the library has no row for the ${room} room`);
    const c = sig.candidates[room];
    for (const b of BIRDS) {
      const [lo, hi] = row.birds[b];
      must(Math.abs(lo - Math.round(Math.max(0, c.mean[b] - c.sd[b]) * 1000) / 1000) < 1e-9
        && Math.abs(hi - Math.round(Math.min(1, c.mean[b] + c.sd[b]) * 1000) / 1000) < 1e-9,
        `the ${room} row's ${b} is ${lo}-${hi} and the signatures say ${c.mean[b]} +/- ${c.sd[b]}`);
    }
    must(Math.abs(row.weight - Math.round((c.n / total) * 1000) / 1000) < 1e-9,
      `the ${room} row's weight is ${row.weight} and its share of the record is ${c.n}/${total}`);
    // A room row is one cluster and the house row is both, so each room's box
    // has to be inside the house's on the birds the calibration found separate
    // them — and it has to be somewhere else than the other room's.
    const other = recipeById(`house/${STYLE.catalogue.rooms.find((r) => r !== room)}-room`);
    const apart = BIRDS.filter((b) => row.birds[b][1] < other.birds[b][0] || row.birds[b][0] > other.birds[b][1]);
    must(apart.length > 0, `the ${room} row overlaps the other room on every one of the eight birds`);
    rooms++;
  }

  // The chef's score and the listeners' likes, and the one claim that lets them
  // ship under the golden: **at nought and nought the draw weight is the share
  // to the bit**, so a library nobody has scored yet draws exactly as it always
  // did. Then the shape of each factor, stated rather than described: the
  // chef's hand spans a factor of eight, and it takes sixty-seven likes to
  // be worth one +3 from him.
  for (const row of LIBRARY) {
    must(weightOf(row) === (row.weight ?? 1), `${row.id} draws at ${weightOf(row)} and its share is ${row.weight}`);
    must(!row.score || (row.score.chef === 0 && row.score.likes === 0), `${row.id} carries a score already`);
  }
  const at = (chef, likes) => weightOf({ ...HOUSE_RECIPE, weight: 1, score: { chef, likes } });
  must(at(0, 0) === 1, 'an unscored row does not draw at its own share');
  must(Math.abs(at(3, 0) / at(-3, 0) - 8) < 1e-9, `the chef's whole scale is a factor of ${at(3, 0) / at(-3, 0)} and not eight`);
  must(at(0, 67) > at(3, 0) && at(0, 66) < at(3, 0), `sixty-seven likes is not what a +3 is worth (${at(0, 67).toFixed(3)} against ${at(3, 0).toFixed(3)})`);
  must(at(0, 1000) < at(3, 0) * 1.5, 'a thousand likes runs away with the draw');

  // And the three ways a row reaches the dice — by name, by the planner's own
  // draw, and not at all — all off `::spell` and none on a path the golden
  // takes.
  must(spellFor({ masterSeed: 1 }, LIBRARY) === null, 'a set with nothing asked of it drew a recipe');
  must(spellFor({ masterSeed: 1, search: '?rate=1' }, LIBRARY) === null, 'a query with no recipe in it drew one');
  let refusedMissing = false;
  try { spellFor({ masterSeed: 1, search: '?recipe=nobody/has-this' }, LIBRARY); } catch { refusedMissing = true; }
  must(refusedMissing, 'a missing recipe silently fell back to an ordinary roll');
  // ...and the composer refusing is only half of it: **the page refuses
  // visibly** (Eugene, 09-22: a bad link is never a black page). `linkRead`
  // takes every part of a link the page cannot play off the address, with the
  // line the ring shows and the sentence the console says, and what is left
  // plans. One row per way a link goes wrong; a good link comes back untouched.
  const LINKS = [
    ['?seed=1&recipe=nobody/has-this', ['recipe']],
    ['?v=2&seed=5&recipe=house/hand-rolling', ['recipe']],
    ['?seed=%00%01&theme=zero&bar=-3', ['seed', 'theme', 'bar']],
    ['?seed=5&spell=ember:lots', ['spell']],
    ['?seed=5&v=9', ['v']],
    ['?seed=5&recipe=../../mining/attempts/x.json', ['recipe']],
    ['?seed=5&development=nope&accompaniment=maybe', ['accompaniment', 'development']],
    ['?v=2&seed=5&recipe=house/sub-room&development=shaped', ['development']],
  ];
  for (const [search, want] of LINKS) {
    const got = linkRead(search as string, { pageDefault: 'house-v1' });
    const params = got.problems.map((p) => p.param).join(',');
    must(params === (want as string[]).join(','), `the link ${search} was refused on ${params || 'nothing'}, not ${(want as string[]).join(',')}`);
    must(got.problems.every((p) => p.short && p.short.length <= 32 && p.long), `the link ${search} was refused without a line that fits the ring`);
    for (const p of want as string[]) must(!new URLSearchParams(got.search).has(p), `the link ${search} kept its ${p}`);
  }
  const good = '?v=2&seed=5&recipe=house/hand-rolling&accompaniment=auto&development=shaped&theme=2&bar=34&spell=ember:0.60,tide:0.30';
  must(!linkRead(good, { pageDefault: 'house-v1' }).problems.length, 'a link the page plays in full was refused');
  let rolled = 0;
  const auto = new Map();
  // `spellFor` says which row `?recipe=auto` drew, once per set, on the console
  // — a line a listener wants and four hundred of which buried this check's own
  // sixty lines. The draw is what is being counted, so the sentence is not.
  const say = console.log;
  console.log = () => {};
  try {
  for (let i = 1; i <= 400; i++) {
    const master = String(i);
    for (const row of LIBRARY) {
      const spell = spellFor({ masterSeed: master, search: `?recipe=${row.id}${row.scope === 'layer' ? '&accompaniment=auto' : ''}` }, LIBRARY);
      if (row.scope !== 'track') must(spell === null, `${row.id} moved birds while selecting a phrase`);
      else {
        must(spell, `?recipe=${row.id} rolled nothing`);
        must(Object.keys(outsideBox(row, spell)).length === 0, `a roll of ${row.id} landed outside its own box`);
      }
      // The short id is the same row and therefore the same roll.
      const short = spellFor({ masterSeed: master, search: `?recipe=${row.id.split('/')[1]}${row.scope === 'layer' ? '&accompaniment=auto' : ''}` }, LIBRARY);
      must(canonical(short) === canonical(spell), `${row.id} and its short name rolled different spells`);
      rolled++;
    }
    // `?recipe=auto` draws among the rows by their weights first, off the same
    // stream, and whatever it draws it rolls inside.
    // `?recipe=auto` draws among the **track** rows by their weights, off the
    // same stream, and rolls inside whatever it drew. A melody family is not a
    // night's spell and is never reached this way (`drawable` in `src/mix.ts`),
    // so what is counted is the row the draw actually named.
    const cast = recipesFor({ masterSeed: master, search: '?recipe=auto' }, LIBRARY);
    must(cast.spell && cast.track, 'the planner drew no row at all');
    must(cast.track.scope === 'track', `the planner drew a ${cast.track.scope} row as a whole set's spell`);
    must(Object.keys(outsideBox(cast.track, cast.spell)).length === 0, `the planner's draw on seed ${master} is outside the row it named`);
    auto.set(cast.track.id, (auto.get(cast.track.id) || 0) + 1);
  }
  } finally { console.log = say; }
  const shares = [...auto].map(([id, k]) => `${id} ${((k / 400) * 100).toFixed(0)}%`).join(', ');
  return `${LIBRARY.length} rows, every one committed, valid and findable; ${rooms} of them are a room's own cluster out of ${total} measured themes, each apart from the other on at least one bird; ${rolled} rolls all inside the box they were rolled in, and 400 draws of ?recipe=auto name ${shares}, never a melody family`;
});

check('a spell rolled inside a recipe stays inside it', () => {
  const box = boxOf(HOUSE_RECIPE);
  const rng = new Rng('the house recipe::spell');
  let rolls = 0;
  const seen = Object.fromEntries(BIRDS.map((b) => [b, [1, 0]]));
  for (let i = 0; i < 1000; i++) {
    const spell = spellFrom(HOUSE_RECIPE, rng);
    for (const b of BIRDS) {
      must(spell[b] >= box[b][0] && spell[b] <= box[b][1],
        `roll ${i} put ${b} at ${spell[b]}, outside ${box[b][0]}-${box[b][1]}`);
      seen[b][0] = Math.min(seen[b][0], spell[b]);
      seen[b][1] = Math.max(seen[b][1], spell[b]);
    }
    rolls++;
  }
  // A row that says nothing about a bird leaves it to the randomiser, which is
  // the house's own box and not a point.
  const quiet = boxOf({ ...HOUSE_RECIPE, birds: { ember: [0.8, 0.9] } });
  must(quiet.ember[0] === 0.8 && quiet.ember[1] === 0.9, 'a named bird did not keep its range');
  for (const b of BIRDS) {
    if (b === 'ember') continue;
    must(quiet[b][0] === HOUSE[b] - HOUSE_BOX[b] && quiet[b][1] === HOUSE[b] + HOUSE_BOX[b],
      `a bird the row does not name is not the house's own box`);
  }
  // And a roll inside the box is not the house vector: the centre die rolls in
  // the box, which is the point of having one.
  must(!isHouse(spellFrom(HOUSE_RECIPE, rng)), 'a roll inside the box came out exactly at the centre');
  const filled = BIRDS.map((b) => (seen[b][1] - seen[b][0]) / (box[b][1] - box[b][0]));
  return `${rolls} rolls of the house row, all eight birds inside the box every time, and the narrowest of the eight still filled ${(Math.min(...filled) * 100).toFixed(1)}% of its own range`;
});

// --- the map between the dice and the readings -------------------------------
//
// `rounds/calibration-map.md`. A recipe's `birds` is a box of **readings** and
// what the randomiser rolls is **dice**, and until this round nothing mapped
// one onto the other: the dry run asked Loom for 0.381 and read back 0.758.
// These are the gates on the map that closes it.
check('the calibration map is the identity at the house and monotone everywhere', () => {
  must(strategyById('house-v1').calibration === null && strategyById('house-v1').legacyCalibration === null,
    'house-v1 carries a calibration map, and nothing under it reads one: its switches are off and '
    + 'every number in recipes/ was cut out of the golden it plays');
  const cal = strategyById('house-v2').legacyCalibration; // the one map there is: replay of v2.8 captures
  if (!cal) {
    return 'house-v2 carries no map yet, so every box is still read as dice — the fault of '
      + 'rounds/analysts-tooling.md §7, open until one is blessed';
  }

  // 1. The stamp. A map is a measurement and a measurement under another
  // instrument is not this one, so the encoder it was fitted under has to name
  // the anchors file this checkout carries.
  must(cal.schema === CALIBRATION_SCHEMA, `the map is schema ${cal.schema} and this build reads ${CALIBRATION_SCHEMA}`);
  must(cal.strategy === 'house-v2', `the map says it is ${cal.strategy}'s and it is house-v2 that carries it`);
  const anchors = crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(ROOT, 'tools', 'imprint', 'anchors.json'))).digest('hex').slice(0, 8);
  must(cal.encoder.includes(`anchors.json@${anchors}`),
    `the map was fitted under ${cal.encoder} and this checkout's anchors are anchors.json@${anchors}`);

  // 2. The identity at the house *die*, four ways, and **to the bit**. Forward
  // is origin + delta; origin is the live house-spell reading, not the golden
  // vector. `origin + 0` is `origin`.
  const forward = forwardOf(cal);
  const inverse = inverseOf(cal);
  const origins = originSpell(cal);
  for (const b of BIRDS) {
    const m = cal.birds[b];
    must(m, `the map says nothing about ${b}`);
    must(m.house === HOUSE[b], `${b}'s house knot is at ${m.house} and the house is ${HOUSE[b]}`);
    must(typeof m.origin === 'number' && Number.isFinite(m.origin), `${b} has no live origin`);
    must(atKnots(m.knots, HOUSE[b]) === 0, `${b}'s displacement at the house is ${atKnots(m.knots, HOUSE[b])} and not nought`);
    must(forward(b, HOUSE[b]) === m.origin, `forward(${b}, house die) is ${forward(b, HOUSE[b])} and not the live origin ${m.origin}`);
    must(inverse(b, m.origin) === HOUSE[b], `inverse(${b}, origin) is ${inverse(b, m.origin)} and not the house die`);
  }
  must(sameSpell(forwardSpell(cal, asSpell(HOUSE)), origins), 'the house die does not read as the live origin');
  must(sameSpell(inverseSpell(cal, origins), HOUSE), 'the live origin is not asked for with the house dice');
  // A reading above Ember's reach is the house die, not 0.90: that plateau is
  // tempo, not the encoder, and 0.90 is a different piece.
  const emberHigh = inverse('ember', Math.min(1, cal.birds.ember.reach[1] + 0.1));
  must(Math.abs(emberHigh - HOUSE.ember) < 1e-9,
    `ember above its reach asked for die ${emberHigh} and not the house`);
  must(cal.table && cal.table.length >= 200, `the sweep table has ${cal.table ? cal.table.length : 0} rows, not the 265 of the design`);

  // 3. Monotone, which is what having an inverse means, and the round trip
  // that follows from it: a die mapped forward and back is a die that reads the
  // same, whether or not it is the same die — which is exactly the promise on a
  // bird whose curve is flat and whose reach is nought.
  let flat = 0;
  const rng = new Rng('the calibration map::round trip');
  for (const b of BIRDS) {
    const m = cal.birds[b];
    const up = m.knots[m.knots.length - 1][1] >= m.knots[0][1];
    for (let i = 1; i < m.knots.length; i++) {
      must(m.knots[i][0] > m.knots[i - 1][0], `${b}'s knots are not in order of the die`);
      must(up ? m.knots[i][1] >= m.knots[i - 1][1] : m.knots[i][1] <= m.knots[i - 1][1],
        `${b}'s map doubles back between ${m.knots[i - 1][0]} and ${m.knots[i][0]}, so it has no inverse`);
    }
    if (m.reach[1] - m.reach[0] < 1e-9) flat++;
    for (let i = 0; i < 200; i++) {
      const x = rng.float(0, 1);
      const read = forward(b, x);
      must(read >= m.reach[0] - 1e-9 && read <= m.reach[1] + 1e-9,
        `${b} at ${x.toFixed(3)} reads ${read.toFixed(3)}, outside its own stated reach ${m.reach.join('..')}`);
      // A plateau inverts to the house-nearest die, so the reading that comes
      // back is the origin of that plateau, within PLATEAU of what was asked.
      must(Math.abs(forward(b, inverse(b, read)) - read) <= PLATEAU + 1e-9,
        `${b} does not round-trip: ${x.toFixed(3)} reads ${read.toFixed(3)} and asking for that reads `
        + `${forward(b, inverse(b, read)).toFixed(3)}`);
    }
  }

  // 4. The residual, per bird, against the ceiling the sweep was blessed under.
  const ceiling = cal.provenance.residualCeiling;
  must(Number.isFinite(ceiling), 'the map does not say what residual it was blessed under');
  for (const b of BIRDS) {
    must(cal.birds[b].residual <= ceiling,
      `${b}'s held-out residual is ${cal.birds[b].residual} against a ceiling of ${ceiling}`);
  }
  const worst = Math.max(...BIRDS.map((b) => cal.birds[b].residual));
  const short = BIRDS.filter((b) => cal.birds[b].window === 'short').length;
  return `${BIRDS.length} birds mapped under ${cal.encoder}; the house die reads as the live origin on all eight to the bit; `
    + `${short} valid at eight bars and ${BIRDS.length - short} only at ${cal.windows.long.split(' ')[0]} seconds; `
    + `${flat} with no reach at all; worst held-out residual ${worst.toFixed(3)} against ${ceiling}; `
    + `table ${cal.table ? cal.table.length : 0} rows`;
});

// A box is readings; the dice the randomiser rolls between are what the map
// hands back. Both halves of that sentence, as arithmetic over the library.
check('a recipe is rolled in dice and lands in readings', () => {
  const cal = strategyById('house-v2').legacyCalibration; // the one map there is: replay of v2.8 captures
  if (!cal) return 'house-v2 carries no map, so a row is rolled exactly where it is written';
  // The live origin inverts to the house die. The golden HOUSE vector is not
  // this identity — a house-v2 eight-bar render of the sweep's seeds is.
  must(sameSpell(inverseSpell(cal, originSpell(cal)), HOUSE), 'the live origin no longer asks for the house die');

  let rolls = 0;
  let inside = 0;
  const misses = {};
  const say = console.log;
  console.log = () => {};
  try {
    for (let i = 1; i <= 200; i++) {
      const master = String(i);
      const cast = recipesFor({ masterSeed: master, strategy: 'house-v2', search: '?recipe=auto' }, LIBRARY);
      must(cast.spell && cast.track, 'the planner drew no row at all');
      const dice = diceBoxOf(cast.track, cal);
      for (const b of BIRDS) {
        must(cast.spell[b] >= dice[b][0] - 1e-12 && cast.spell[b] <= dice[b][1] + 1e-12,
          `seed ${master} rolled ${b} at ${cast.spell[b]} outside the dice box ${dice[b].join('..')}`);
      }
      // And where the map says that roll will land, which is the half a box was
      // always about. A bird the die cannot reach lands where it can, and that
      // is counted rather than excused.
      const out = outsideBox(cast.track, forwardSpell(cal, asSpell(cast.spell)));
      if (!Object.keys(out).length) inside++;
      else for (const b of Object.keys(out)) misses[b] = (misses[b] || 0) + 1;
      rolls++;
    }
  } finally { console.log = say; }
  const cannot = unreachable(cal, boxOf(HOUSE_RECIPE));
  const named = Object.entries(misses).sort((a, b) => b[1] - a[1]).map(([b, k]) => `${b} ${k}`).join(', ');
  return `${rolls} draws of ?recipe=auto under house-v2, every one inside the dice box the map handed back; `
    + `${inside} of ${rolls} are predicted to read back inside the row's own box on all eight birds`
    + (named ? `; what puts one out: ${named}` : '')
    + (cannot.length ? `; the house row asks ${cannot.map((c) => c.bird).join(', ')} outside what the die can reach` : '');
});

// --- the interpreter: what `wants` does, and what it refuses to pretend ------
//
// The outside review's §4, answered as arithmetic: two rows with the same box
// and opposite wants must not plan the same record, and a row with nothing to
// say must plan exactly the record it always did.
check('a recipe with no wants is the identity, and two rows with one box plan two records', () => {
  const v2 = strategyById('house-v2');
  const vocab = vocabularyOf(v2.style, VOICE_REGISTRY);
  const bias = biasFor(HOUSE, v2.style);

  // 1. The identity, three ways: no row at all, a row with `wants: {}` (which
  // is the house row on disk) and a row whose only want is one this build
  // cannot interpret. All three hand the **same object** back, so a plan made
  // under one is the plan made under none, to the bit.
  for (const [what, row] of [
    ['no row', null],
    ['the house row', HOUSE_RECIPE],
    ['a row whose wants are all unsupported', { ...HOUSE_RECIPE, wants: { stage: { back: ['sustained'] } } }],
  ]) {
    const w = interpretWants(row, v2.style, bias);
    must(w.bias === bias, `${what} did not hand the bias straight back`);
    must(w.identity && !w.silent.length, `${what} changed something`);
  }
  // ...and on the plan itself, over every golden theme of both strategies.
  let same = 0;
  for (const id of STRATEGY_IDS) {
    const st = strategyById(id);
    for (const [master, n] of Object.entries(GOLDEN_THEMES)) {
      for (let i = 0; i < n; i++) {
        const bare = planTheme(master, i, { strategy: id, style: st.style });
        const with_ = planTheme(master, i, { strategy: id, style: st.style, recipe: HOUSE_RECIPE });
        must(planDigest(bare) === planDigest(with_),
          `${id} ${master}#${i} moved under a row with no wants`);
        same++;
      }
    }
  }

  // 2. The review's own probe: one box, opposite wants. The two rows below say
  // nothing about a bird at all, so the spell is the house's and every
  // difference between the two plans is the interpreter's.
  const drumless = {
    ...HOUSE_RECIPE, id: 'probe/drumless', name: 'drumless', birds: {},
    wants: { roles: ['sustained'] }, forbids: ['drum', 'kick', 'offbeat', 'sixteenth', 'backbeat'],
  };
  const drummed = {
    ...HOUSE_RECIPE, id: 'probe/drummed', name: 'drummed', birds: {},
    wants: { roles: ['kick'], stage: { front: 'bassline', lead: 'figure' } }, forbids: [],
  };
  must(validate(drumless, vocab).length === 0, 'the drumless probe does not validate');
  must(validate(drummed, vocab).length === 0, 'the drummed probe does not validate');
  const quiet = planTheme('1', 1, { strategy: 'house-v2', style: v2.style, recipe: drumless });
  const loud = planTheme('1', 1, { strategy: 'house-v2', style: v2.style, recipe: drummed });
  const perc = (t) => t.events.filter((e) => ['kick', 'drums'].includes(BY_NAME[e.voice]?.bus)
    || (BY_NAME[e.voice]?.roles || []).some((r) => ['kick', 'offbeat', 'sixteenth', 'backbeat'].includes(r))).length;
  must(perc(quiet) === 0, `a row that forbids the drums planned ${perc(quiet)} drum events`);
  must(perc(loud) > 0, 'a row that asks for a kick planned no drums');
  must(planDigest(quiet) !== planDigest(loud), 'two rows with one box planned one record');
  // And the drumless one says so in the timeline, phrase by phrase, the way
  // derive-lite's own does — the lane is off in the plan and not filtered out
  // of the events afterwards.
  must(quiet.timeline.every((r) => !r.layers.includes('kick')), 'a forbidden lane is still in the timeline');

  // 3. The lean is the stated one: a candidate one whole tolerance outside a
  // want draws at the bias's own floor, and a membership miss at half of it.
  must(Math.abs(Math.exp(-WANT_LEAN) - WEIGHT_FLOOR) < 0.001,
    `one tolerance out is ${Math.exp(-WANT_LEAN).toFixed(4)}, not the pool's floor ${WEIGHT_FLOOR}`);

  // 4. The `hold` floor, which is the whole lesson of the eight verdicts: a row
  // that wants a lead held at least as much as the electric piano is a row the
  // pluck cannot satisfy, and the pluck is the timbre Eugene rejected twice.
  const held = {
    ...HOUSE_RECIPE, id: 'probe/held', birds: {},
    wants: { timbres: { lead: { struck: true, struckRequired: false, hold: 0.37, holdMin: 0.185, holdMax: null } } },
  };
  must(validate(held, vocab).length === 0, 'the hold probe does not validate');
  const leaned = interpretWants(held, v2.style, bias);
  const list = v2.style.candidates.find((c) => c.id === 'leadTimbres');
  const names = list.list().map((e) => String(e && e.v !== undefined ? e.v : e));
  const w = leaned.bias.weights.leadTimbres;
  const pluck = names.indexOf('pluck');
  // The pluck is 0.74 of a tolerance under the floor, so it is not *at* the
  // pool's floor — it is the lowest weight in the list by a distance, which is
  // the claim that matters: the timbre he rejected twice is the one the row
  // reaches for last.
  must(pluck >= 0, 'house-v2 draws no pluck');
  must(w[pluck] < 0.2 * bias.weights.leadTimbres[pluck], `the pluck is at ${w[pluck]} against an identity of ${bias.weights.leadTimbres[pluck]}`);
  must(TIMBRES[names[w.indexOf(Math.min(...w))]].hold < 0.185, 'the lowest weight of the list is not a timbre under the floor');
  const ep = names.indexOf('ep');
  must(w[ep] === bias.weights.leadTimbres[ep], 'a timbre that satisfies the want was leaned');
  const under = names.filter((t, i) => w[i] < bias.weights.leadTimbres[i]);
  must(under.every((t) => TIMBRES[t].hold < 0.185), 'a timbre over the floor was leaned down');
  must(names.every((t, i) => TIMBRES[t].hold >= 0.185 || w[i] < bias.weights.leadTimbres[i]),
    'a timbre under the floor was not leaned at all');

  // 5. And the report is a report: every block says applied, unsupported or
  // unsatisfied, and the words are what a person would need.
  const growl = recipeById('house/growl-room');
  const said = interpretWants(growl, v2.style, bias);
  must(said.notes.length > 0, 'the growl row said nothing at all');
  must(said.notes.some((n) => n.state === 'unsupported'), 'no block of the growl row is reported unsupported');
  must(said.interpreter === INTERPRETER, 'the interpreter does not name itself');
  must(said.resolvedFrom === 'v1', `the growl row was captured under v1 and resolved without saying so`);
  return `${same} golden themes plan the same hash with a row that wants nothing as with no row at all; `
    + `one tolerance out is ${Math.exp(-WANT_LEAN).toFixed(4)} and a membership miss ${Math.exp(-WANT_LEAN * MEMBER_COST).toFixed(3)}, `
    + `both inside the pool's own ${WEIGHT_FLOOR}..${WEIGHT_CEILING}; under a hold floor of 0.185 exactly the ${under.length} leads of ${names.length} whose declared hold is under it are leaned, the pluck at ${w[pluck].toFixed(3)} against its own identity of ${bias.weights.leadTimbres[pluck].toFixed(3)}; `
    + `a row forbidding the drums plans ${quiet.events.length} events and 0 of them percussion where the same box asking for a kick plans ${perc(loud)}; `
    + `house/growl-room resolves v1 by ${INTERPRETER} as — ${sayWanted(said)}`;
});

// --- the theme: the object, the grammar, and where it is allowed to be ------
check('a theme is a shape, and the grammar keeps it one', () => {
  // 1. The calibration set. Twelve authored motifs, in scale degrees and
  // nothing else, and every one of them is a valid motif that falls inside the
  // family it is written for. A family that stopped containing its own
  // calibration would be a family somebody widened by accident, and this is
  // where that shows.
  for (const c of CALIBRATION) {
    const f = familyById(c.family);
    must(f, `${c.name} names ${c.family}, which is not a family`);
    must(motifFaults(c.motif).length === 0, `${c.name}: ${motifFaults(c.motif).join('; ')}`);
    const out = insideBox(c.motif, f.box);
    must(out.length === 0, `${c.name} is outside ${c.family}: ${out.join('; ')}`);
    must(c.motif.register === f.register, `${c.name} is in the wrong register for ${c.family}`);
  }
  // ...and a motif that is not one is refused by name.
  const bad = [
    [{ degrees: [0, 1], cell: [4], register: 'lead', accent: [1, 1] }, 'a length for every note'],
    [{ degrees: [0, 0.5], cell: [4, 4], register: 'lead', accent: [1, 1] }, 'a whole scale degree'],
    [{ degrees: [0, 1], cell: [4, 0], register: 'lead', accent: [1, 1] }, 'a length of nought'],
    [{ degrees: [0, 1], cell: [4, 4], register: 'organ', accent: [1, 1] }, 'a register that is not one'],
    [{ degrees: [0, 1], cell: [4, 4], register: 'lead', accent: [1, 2] }, 'an accent over one'],
  ];
  for (const [m, why] of bad) must(motifFaults(m).length > 0, `${why} passed`);

  // 2. The grammar, one claim per move, on a motif written for the purpose.
  const m = { degrees: [0, 1, 3, 2], cell: [4, 4, 4, 4], register: 'lead', accent: [1, 0.6, 0.85, 0.6] };
  must(develop(m, 'repeat') === m, 'a repeat is not the same object');
  // A sequence lands on the next chord's degree: every note moves by exactly
  // the step between the two chords, so the note that was the chord's own is
  // the next chord's own.
  const seq = develop(m, 'sequence', { shift: 3 });
  must(seq.degrees.every((d, i) => d === m.degrees[i] + 3), 'a sequence did not move by the shift');
  must(seq.degrees[0] === 3, 'a sequence did not land on the next chord\'s degree');
  // An inversion mirrors about the first note: every interval keeps its size
  // and changes its sign.
  const inv = develop(m, 'invert');
  must(inv.degrees[0] === m.degrees[0], 'an inversion moved the note it turns about');
  must(inv.degrees.every((d, i) => d - inv.degrees[0] === -(m.degrees[i] - m.degrees[0])), 'an inversion did not mirror');
  must(contourOf(inv.degrees) !== contourOf(m.degrees) || contourOf(m.degrees) === 'pedal',
    'an inversion of a shape that is not a pedal came back the same shape');
  // Augment and diminish are the cell and never the notes.
  const aug = develop(m, 'augment');
  const dim = develop(m, 'diminish');
  must(aug.degrees === m.degrees && dim.degrees === m.degrees, 'augment or diminish moved a note');
  must(cellBeats(aug.cell) === 2 * cellBeats(m.cell), 'augment did not double the cell');
  must(cellBeats(dim.cell) === cellBeats(m.cell) / 2, 'diminish did not halve the cell');
  // A fragment is the head, an answer is the tail brought home, and a rest is
  // nothing at all.
  const frag = develop(m, 'fragment');
  must(frag.degrees.length < m.degrees.length && frag.degrees.every((d, i) => d === m.degrees[i]), 'a fragment is not the head');
  must(frag.cell.length === frag.degrees.length, 'a fragment kept a length it has no note for');
  const ans = develop(m, 'answer');
  must(ans.degrees[ans.degrees.length - 1] === 0, 'an answer does not come home');
  must(ans.degrees.length === ans.cell.length && ans.cell.length === ans.accent.length, 'an answer is not one shape');
  must(develop(m, 'rest') === null, 'a rest is not silence');

  // 3. The placement, which is the round's own gate: **no theme in a
  // breakdown, and never a cut one in a drop.**
  must(!placementOf('breakdown').plays, 'a breakdown states the theme');
  must(!placementOf('intro').plays, 'an intro states a theme nobody has heard yet');
  must(!placementOf('a kind nobody wrote a row for').plays, 'an unknown section states the theme');
  must(placementOf('drop').plays && placementOf('drop').whole, 'a drop does not state the whole theme');
  must(placementOf('main').plays && placementOf('main').whole, 'a groove does not state the whole theme');
  must(!placementOf('build').whole, 'a build does not take the theme apart');
  const CUTS = new Set(['fragment', 'answer']);
  for (const [kind, place] of Object.entries(PLACEMENT)) {
    if (!place.whole) continue;
    for (const row of place.moves) must(!CUTS.has(row.v), `${kind} may ${row.v} a theme it is supposed to state whole`);
  }
  for (const [kind, place] of Object.entries(PLACEMENT)) {
    for (const row of place.moves) must(MOVES.includes(row.v), `${kind} names ${row.v}, which is not a move`);
  }

  // 4. The roll: inside the box, every time, off the seed's own stream, and
  // how many draws that really takes.
  let attempts = 0;
  let rolls = 0;
  let fell = 0;
  const shapes = new Set();
  for (const f of HOUSE_FAMILIES) {
    for (let i = 0; i < 300; i++) {
      const got = rollMotif(f, new Rng(`check::${f.id}:${i}`));
      const out = [...motifFaults(got), ...insideBox(got, f.box)];
      must(out.length === 0, `${f.id} roll ${i}: ${out.join('; ')}`);
      must(got.register === f.register, `${f.id} rolled into the wrong register`);
      shapes.add(got.degrees.join(',') + '|' + got.cell.join(','));
      const n = rollAttempts(f, new Rng(`check::${f.id}:${i}`));
      if (n > ATTEMPTS) fell++;
      attempts += Math.min(n, ATTEMPTS);
      rolls++;
    }
    // Two rolls of one family are cousins and never twins, which is the same
    // claim a recipe's box makes about a whole record.
    const a = rollMotif(f, new Rng(`check::${f.id}:cousins:a`));
    const b = rollMotif(f, new Rng(`check::${f.id}:cousins:b`));
    must(JSON.stringify(a) !== JSON.stringify(b), `two rolls of ${f.id} are twins`);
  }
  must(fell === 0, `${fell} of ${rolls} rolls fell back on the calibration`);

  // 5. And the rows on disk are the families in `src/motif.ts`, the way
  // `recipes/house.json` is `houseRecipe()`.
  const vocab = vocabularyOf(strategyById('house-v2').style, VOICE_REGISTRY);
  for (const f of HOUSE_FAMILIES) {
    const built = motifRecipe(f);
    const shipped = recipeById(f.id);
    must(shipped, `${f.id} is not in the library`);
    must(validate(shipped, vocab).length === 0, `${f.id}: ${validate(shipped, vocab).join('; ')}`);
    // **Everything but the two fields nobody derives.** A row is what
    // `src/motif.ts` builds, field for field — except `score` and `verdicts`,
    // which are Eugene's and land on the row when he answers a card, and which
    // a gate that demanded they stay at nought would quietly forbid.
    const bare = (r) => { const { score, verdicts, picked, namedBy, ...rest } = r; return canonical(rest); };
    must(bare(shipped) === bare(built), `recipes/motif-*.json and src/motif.ts disagree about ${f.id}`);
    must(shipped.scope === 'motif' && REGISTERS.includes(shipped.applies), `${f.id} does not apply to a register`);
  }
  // A malformed family box is refused, field by field, which is the review's
  // §5 about a known field.
  const box = HOUSE_FAMILIES[0].box;
  const faults = [
    [{ ...box, contour: 'squiggle' }, 'a contour that is not one'],
    [{ ...box, onGrid: [0.9, 0.1] }, 'a share that runs backwards'],
    [{ ...box, onGrid: [0, 2] }, 'a share over one'],
    [{ ...box, density: 4 }, 'a range that is a number'],
    [{ ...box, intervals: { steps: [0, 1] } }, 'half an intervals block'],
    [{ ...box, returns: { bars: [0, 4] } }, 'a return of nought bars'],
  ];
  for (const [b, why] of faults) {
    const row = { ...motifRecipe(HOUSE_FAMILIES[0]), wants: { motif: b } };
    must(validate(row, vocab).length > 0, `${why} passed the gate`);
  }
  must(validate({ ...motifRecipe(HOUSE_FAMILIES[0]), applies: 'keys' }, vocab).length > 0, 'a register that is not one passed');
  must(validate({ ...motifRecipe(HOUSE_FAMILIES[0]), wants: {} }, vocab).length > 0, 'a family with no box passed');

  const reads = CALIBRATION.map((c) => readMotif(c.motif));
  return `${CALIBRATION.length} authored motifs over ${HOUSE_FAMILIES.length} families, every one valid and inside its own box `
    + `(${[...new Set(reads.map((r) => r.contour))].sort().join(', ')}; ${Math.min(...reads.map((r) => r.density))}-${Math.max(...reads.map((r) => r.density))} notes a bar, `
    + `${Math.min(...reads.map((r) => r.semitones))}-${Math.max(...reads.map((r) => r.semitones))} semitones); `
    + `eight moves, each one claim — a sequence lands on the next chord's degree, an inversion mirrors, augment doubles the cell and moves no note, a fragment is the head, an answer comes home, a rest is silence; `
    + `no theme in a breakdown or an intro and never a cut one in a drop or a groove; `
    + `${rolls} rolls all inside their box in ${(attempts / rolls).toFixed(2)} draws each and ${shapes.size} different shapes between them, 0 falling back; `
    + `the ${MOTIF_RECIPES.length} rows on disk are the ${HOUSE_FAMILIES.length} families to the byte, and 8 malformed boxes are refused`;
});

check('house-v2 draws a theme, and it is on a lane of the register that states it', () => {
  const v2 = strategyById('house-v2');
  const v1 = strategyById('house-v1');
  must(switchOn(v2.style, 'motif'), 'house-v2 does not carry the motif switch');
  must(!switchOn(v1.style, 'motif'), 'house-v1 carries a switch');
  // The record asks nothing: no lane of house-v1 names the source and the
  // style has no list to draw from.
  must(v1.style.lanes.every((l) => l.figure !== 'motif'), 'a lane of the record names the motif source');
  must(v2.style.lanes.every((l) => l.figure !== 'motif'), 'a lane of the table names the motif source; it is the theme that rewrites one');

  let has = 0;
  let lead = 0;
  let bass = 0;
  let silent = 0;
  const families = new Map();
  const seeds = 200;
  for (let i = 0; i < seeds; i++) {
    const t = planTheme(String(1000 + i), 1, { strategy: 'house-v2' });
    if (!t.dice.motif) continue;
    has++;
    if (t.dice.motifRegister === 'lead') lead++; else bass++;
    families.set(t.dice.motif, (families.get(t.dice.motif) || 0) + 1);
    // The lane of the register that states it is the one the events come out
    // of, and the theme's own degrees are what it plays.
    const layer = t.dice.motifRegister === 'bass' ? 'bass' : 'keys';
    // **A theme drawn is not always a theme heard**, and the reason is the one
    // `notes/archive/2026-09-plans/cited/PLAN-DEVELOP.md` §1 names: the harmonic roles are drawn once per section,
    // so a theme whose every section rolled pad-alone has a lead lane that
    // never opens and a theme nobody hears. It is counted rather than refused,
    // because refusing it here would be this round asserting the next one.
    if (!t.events.some((e) => e.layer === layer)) silent++;
  }
  must(has > 0 && has < seeds, `${has} of ${seeds} themes have a theme`);
  must(silent < has / 2, `${silent} of ${has} themes drew a theme no lane ever plays`);
  // The register die is the plan's own open question answered: the lead is
  // weighted over the bass, and both really happen.
  must(lead > 0 && bass > 0, 'one register is never drawn');

  // **And the placement, on the plan itself**: the breakdown of a theme with a
  // theme has none of it, and the drop has the whole of it.
  let breakdowns = 0;
  let drops = 0;
  let cut = 0;
  for (let i = 0; i < seeds; i++) {
    const t = planTheme(String(1000 + i), 1, { strategy: 'house-v2' });
    if (!t.dice.motif) continue;
    const layer = t.dice.motifRegister === 'bass' ? 'bass' : 'keys';
    const notes = Math.max(1, String(t.dice.motifDegrees).split(' ').length);
    for (const s of t.arrangement.sections) {
      const from = s.startBar * t.barSeconds;
      const to = (s.startBar + s.bars) * t.barSeconds;
      const here = t.events.filter((e) => e.layer === layer && e.t >= from && e.t < to);
      if (s.kind === 'breakdown' && t.dice.motifRegister === 'lead') {
        // The lead lane is the theme's lane for the whole theme, so a
        // breakdown that states nothing is a breakdown with no keys event in
        // it at all — which is what `placementOf` says and what this counts.
        must(here.length === 0, `${t.seed} states the theme in a breakdown (${here.length} events)`);
        breakdowns++;
      }
      if (s.kind === 'drop' && t.dice.motifRegister === 'lead' && here.length) {
        drops++;
        // Whole means whole, and it is the **grammar** that is checked rather
        // than a count of events: a drop's own weights carry no cutting move at
        // all (asserted above over the whole table), so a drop that states the
        // theme states every note of it. What is counted here is that drops
        // really do state it.
        if (here.length < notes) cut++;
      }
    }
  }
  const share = (n) => `${((100 * n) / seeds).toFixed(0)} %`;
  return `${has} of ${seeds} themes have a theme (${share(has)}), ${lead} on the lead and ${bass} on the bass — the style asks for 3 to 2 and gets ${(lead / Math.max(1, bass)).toFixed(2)} to 1; `
    + `the families draw ${[...families.entries()].sort().map(([k, n]) => `${k} ${n}`).join(', ')}; `
    + `${breakdowns} breakdowns of a lead theme hold 0 of it, and ${drops} drops state it whole with ${cut} cut; `
    + `${silent} of the ${has} are drawn and never heard, because the harmonic role their lane needs was rolled off for the whole theme`;
});

check('a groove is never pad-alone for long, and the pad never goes away', () => {
  // `notes/archive/2026-09-plans/cited/PLAN-DEVELOP.md` §1, and the generator-side answer to the mids hole: the
  // harmonic roles are drawn once per section, so a long groove that rolls
  // pad-alone is a hundred seconds of one chord loop with nothing over it.
  const v2 = strategyById('house-v2');
  const v1 = strategyById('house-v1');
  must(switchOn(v2.style, 'leadEntry'), 'house-v2 does not carry the lead-entry switch');
  must(!switchOn(v1.style, 'leadEntry'), 'house-v1 carries the switch, and the record reads none');
  const floor = v2.style.catalogue.leadEntryBars;
  must(Number.isInteger(floor) && floor > 0, `the floor is ${floor}`);
  // The same style with the switch off is the *before*, so the two numbers
  // below are one change and not one build against another.
  const off = { ...v2.style, switches: { ...v2.style.switches, leadEntry: false } };
  // A groove or a drop is where the section grammar has the figure lane on at
  // all; everywhere else a pad without a figure is the grammar's own answer and
  // not this rule's business, which is why it is counted separately.
  const GROOVE = new Set([v2.style.sections.kinds.main.label, v2.style.sections.kinds.drop.label]);
  const runs = (t) => {
    let run = 0;
    let worst = 0;
    let groove = 0;
    let worstGroove = 0;
    let padGone = 0;
    for (const r of t.timeline) {
      const pad = r.layers.includes('pad');
      const keys = r.layers.includes('keys');
      if (pad && !keys) { run++; worst = Math.max(worst, run); } else run = 0;
      if (GROOVE.has(r.section) && pad && !keys) { groove++; worstGroove = Math.max(worstGroove, groove); } else groove = 0;
      if (!pad && keys && GROOVE.has(r.section)) padGone++;
    }
    return { worst, worstGroove, padGone };
  };
  const seeds = 200;
  let beforeOver = 0;
  let afterOver = 0;
  let beforeWorst = 0;
  let afterWorst = 0;
  let anyOver = 0;
  let moved = 0;
  for (let i = 0; i < seeds; i++) {
    const seed = String(1000 + i);
    const a = runs(planTheme(seed, 1, { style: off, strategy: 'house-v2' }));
    const b = runs(planTheme(seed, 1, { strategy: 'house-v2' }));
    if (a.worstGroove > floor) beforeOver++;
    if (b.worstGroove > floor) afterOver++;
    if (b.worst > floor) anyOver++;
    beforeWorst = Math.max(beforeWorst, a.worstGroove);
    afterWorst = Math.max(afterWorst, b.worstGroove);
    if (a.worstGroove !== b.worstGroove) moved++;
  }
  must(afterOver === 0, `${afterOver} of ${seeds} themes still run pad-alone past ${floor} bars in a groove or a drop`);
  must(afterWorst <= floor, `the longest pad-alone groove is ${afterWorst} bars against a floor of ${floor}`);
  must(beforeOver > 0, 'the rule answers nothing: nothing was pad-alone past the floor before it');
  // **The pad never goes away.** The rule opens the figure role in a pad-alone
  // section; a reading that turned the pad off instead would fill the mids and
  // empty the bottom of the chord, and it is the one way to get this wrong.
  for (let i = 0; i < 40; i++) {
    const seed = String(1000 + i);
    const a = planTheme(seed, 1, { style: off, strategy: 'house-v2' });
    const b = planTheme(seed, 1, { strategy: 'house-v2' });
    const padBars = (t) => t.timeline.filter((r) => r.layers.includes('pad')).length;
    must(padBars(b) >= padBars(a), `${seed} lost ${padBars(a) - padBars(b)} bars of pad to the rule`);
  }
  return `the floor is ${floor} bars, counted from the figure's own last bar and not from a section boundary; `
    + `over ${seeds} themes a pad-alone run past it in a groove or a drop falls from **${beforeOver} themes, the longest ${beforeWorst} bars**, to **${afterOver}, the longest ${afterWorst}**, `
    + `with ${moved} themes moved and no theme losing a bar of pad; ${anyOver} themes still hold a longer run somewhere the section grammar has the figure lane off altogether, which is the grammar's answer and not this rule's`;
});

check('a draw is partitioned by scope, and a row the chef put down is not drawn', () => {
  // The review's trap: `?recipe=auto` filtered on `weightOf(r) > 0` alone, so a
  // layer row or a row he had put down could be drawn as the whole night's
  // spell. A partition, not a filter.
  const rows = [
    { ...HOUSE_RECIPE, id: 'probe/track', scope: 'track', applies: null },
    { ...HOUSE_RECIPE, id: 'probe/layer', scope: 'layer', applies: 'bassline' },
    { ...HOUSE_RECIPE, id: 'probe/put-down', scope: 'track', applies: null, picked: false },
    { ...HOUSE_RECIPE, id: 'probe/nought', scope: 'track', applies: null, weight: 0 },
  ];
  must(rows.filter(drawable).length === 1, 'the partition let something through');
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const cast = recipesFor({ masterSeed: String(i), search: '?recipe=auto' }, rows);
    must(cast.track && cast.track.id === 'probe/track', `draw ${i} reached ${cast.track && cast.track.id}`);
    seen.add(cast.track.id);
  }
  // A stored scope without a local player cannot be applied as a track.
  let refused = false;
  try { recipesFor({ masterSeed: '1', search: '?recipe=probe/layer' }, rows); } catch { refused = true; }
  must(refused, 'a layer recipe was silently interpreted as a whole track');
  // And the library that ships: what `auto` may reach, and what it parks.
  const may = LIBRARY.filter(drawable).map((r) => r.id);
  const parked = LIBRARY.filter((r) => !drawable(r)).map((r) => `${r.id} (${r.scope})`);
  return `200 draws of ?recipe=auto over a library of ${rows.length} all landed on the one track row that is not put down and not at nought; `
    + `the shipped library offers ${may.length} to a draw (${may.join(', ')}) and parks ${parked.length}${parked.length ? ` (${parked.join(', ')})` : ''}`;
});

check('a review session validates, and a decision round-trips to disk', () => {
  // The bench tool's own contract (`tools/review/README.md`): a manifest is the
  // whole of a review scenario, and a decision is two writes — the manifest's
  // state, and the chef's score and verdict on the row it names. Both are
  // arithmetic over files, so both are checked here and neither needs a browser.
  const here = path.join(REPO, 'tmp', 'check', 'review');
  fs.rmSync(here, { recursive: true, force: true });
  fs.mkdirSync(here, { recursive: true });

  must(validateSession(sampleSession()).length === 0, 'the sample manifest does not validate');
  // And the gate is a gate: every one of these is a way to lose a decision.
  const faults = [
    [{ schema: 2 }, 'schema'],
    [{ items: [] }, 'an empty list of items'],
    [{ state: { nobody: { action: 'pick', score: 2, at: 'now' } } }, 'a decision about an item that is not there'],
    [{ state: { one: { action: 'nonsense', score: 2, at: 'now' } } }, 'a decision by an action that is not there'],
    [{ items: [{ id: 'one', title: 'x', wav: '../outside.wav' }] }, 'a wav outside the repository'],
    [{ actions: [{ id: 'a', label: 'a', key: '1', score: 1 }, { id: 'b', label: 'b', key: '1', score: 2 }] }, 'one key for two actions'],
  ];
  for (const [over, why] of faults) {
    must(validateSession(sampleSession(over)).length > 0, `the gate let ${why} through`);
  }

  // A row of the kind the cookbook extraction writes, with everything on it a
  // decision must not touch.
  const rowFile = path.join(here, 'row.json');
  const row = {
    schema: 1, kind: 'recipe', id: 'cookbook/sample', interpreter: 'v1', scope: 'track', applies: null,
    name: 'a sample archetype', origin: 'golden', birds: { ember: [0.3, 0.4] }, wants: { roles: ['kick'] },
    forbids: [], weight: 0.3, score: { chef: 0, likes: 7 }, verdicts: [], provenance: { medoidSeed: '7' },
  };
  fs.writeFileSync(rowFile, `${JSON.stringify(row, null, 2)}\n`);
  const file = path.join(here, 'session.json');
  const session = sampleSession();
  session.items[0].row = path.relative(REPO, rowFile);
  writeSession(file, session);

  // One decision: into the manifest at once, and onto the row it scores.
  decide(file, { item: 'one', action: 'pick', note: 'J just want to save this recipe!!!' });
  let back = JSON.parse(fs.readFileSync(file, 'utf8'));
  must(back.state.one.action === 'pick' && back.state.one.score === 2, 'the decision did not reach the manifest');
  must(back.state.one.note.startsWith('J just want'), 'the note did not reach the manifest');
  let after = JSON.parse(fs.readFileSync(rowFile, 'utf8'));
  must(after.score.chef === 2, `the row's chef is ${after.score.chef}, not the action's score`);
  must(after.score.likes === 7, 'the listeners\' likes were overwritten');
  must(after.verdicts.length === 1 && after.verdicts[0].verdict === 'hit' && after.verdicts[0].seed === '7',
    'the verdict is not one hit about the medoid');
  must(after.verdicts[0].bar === 88, `the verdict points at bar ${after.verdicts[0].bar} and the window is 88+16`);
  // One rule for an item's id in every builder, read off the music and not off
  // a rank: `tools/imprint/cookbook.ts` names its reference wavs by it and
  // carries a decision across a re-clustering by it.
  must(keyOfItem(session.items[0]) === provenanceKey('one', '7', 2, 88, 16, 48000),
    `the provenance key of an item is ${keyOfItem(session.items[0])}`);
  // **Nothing else in the row**: every other field byte for byte as it was.
  const { score: _s, verdicts: _v, ...restAfter } = after;
  const { score: _s2, verdicts: _v2, ...restBefore } = row;
  must(JSON.stringify(restAfter) === JSON.stringify(restBefore), 'a decision moved something else in the row');

  // Deciding again replaces this session's verdict rather than stacking one on
  // top of it, and moves the score to the new hand.
  decide(file, { item: 'one', action: 'drop', note: 'not after all' });
  after = JSON.parse(fs.readFileSync(rowFile, 'utf8'));
  must(after.verdicts.length === 1 && after.verdicts[0].verdict === 'miss', 'a second decision stacked a verdict');
  must(after.score.chef === -1, 'a second decision did not move the score');

  // The skip is a real answer: it takes the decision back and leaves the item
  // pending, which is how a reopened card is left undecided.
  const out = decide(file, { item: 'one', action: 'skip' });
  back = JSON.parse(fs.readFileSync(file, 'utf8'));
  must(!back.state.one && out.progress.reviewed === 0, 'a skip did not leave the item pending');
  must(JSON.parse(fs.readFileSync(rowFile, 'utf8')).score.chef === -1, 'a skip quietly unwrote the chef\'s hand');

  // --- a form, which is the other way a session asks (the kitchen's) ---
  //
  // Four questions instead of one decision, and the rule that goes with them:
  // an item is reviewed when the **required** fields are answered and not at
  // the first click, because a card put away mid-thought is a card he has to
  // find again. One key per answer over the whole card, so a keystroke can
  // never record the wrong opinion.
  const form = { ...sampleSession(), id: 'kitchen', kind: 'kitchen', rowWrite: 'none', fields: AUDITION_FIELDS };
  delete form.actions;
  must(validateSession(form).length === 0, `a form session does not validate: ${validateSession(form).join('; ')}`);
  const keys = [...AUDITION_FIELDS.flatMap((f) => (f.options || []).map((o) => o.key.toLowerCase()))];
  must(new Set(keys).size === keys.length, `two answers share a key: ${keys.join('')}`);
  for (const over of [
    { fields: [{ id: 'identity', label: 'x', kind: 'choice', options: [{ id: 'yes', label: 'y', key: 'y' }, { id: 'no', label: 'n', key: 'y' }] }] },
    { fields: [{ id: 'identity', label: 'x', kind: 'nod', options: [{ id: 'yes', label: 'y', key: 'y' }] }] },
  ]) must(validateSession({ ...form, ...over }).length > 0, 'the gate let a broken form through');
  must(validateSession({ ...form, state: { one: { fields: { identity: 'maybe' }, at: 'now' } } }).length > 0,
    'the gate let an answer nothing offers through');

  const formFile = path.join(here, 'kitchen.json');
  writeSession(formFile, form);
  let said = decide(formFile, { item: 'one', fields: { identity: 'yes' } });
  must(said.progress.reviewed === 0, 'an item was reviewed before its required fields were answered');
  said = decide(formFile, { item: 'one', fields: { artefacts: 'clean', amount: 'right' }, note: 'a hiss on the tail' });
  must(said.progress.reviewed === 0, 'the fields that are not required decided it');
  said = decide(formFile, { item: 'one', fields: { fit: ['pads', 'keys'] } });
  must(said.progress.reviewed === 1, 'identity and fit are answered and the item is still pending');
  const asked = JSON.parse(fs.readFileSync(formFile, 'utf8'));
  must(JSON.stringify(asked.state.one.fields) === JSON.stringify({ identity: 'yes', artefacts: 'clean', amount: 'right', fit: ['pads', 'keys'] }),
    `the form recorded ${JSON.stringify(asked.state.one.fields)}`);
  must(asked.state.one.note === 'a hiss on the tail', 'the note is not on the answer');
  must(isReviewed(asked, 'one') && !isReviewed(asked, 'two'), 'isReviewed disagrees with the manifest');
  // The same key takes an answer back, and the item goes back in the queue.
  must(decide(formFile, { item: 'one', fields: { fit: [] } }).progress.reviewed === 0, 'taking the fit back left it reviewed');

  fs.rmSync(here, { recursive: true, force: true });
  return `${faults.length + 1} manifests through the gate, a decision into the manifest and onto the row (chef 2, one verdict), a second replacing it, a skip taking it back, and a form of ${AUDITION_FIELDS.length} questions on ${keys.length} keys that is reviewed only once identity and fit are answered`;
});

// The mining review of 09-19 (M1–M3): a regeneration erased six verdicts and three chef
// scores, a decision migrated onto other audio under the same seed and bars,
// and a variant's number could be reassigned. The three rules that answer them
// are arithmetic over files and are held here, on scratch rows.
check('a regeneration carries every human field by the music, and refuses to orphan one', () => {
  const mined = (id, medoid, human = {}) => ({
    schema: 1, kind: 'recipe', id, interpreter: 'v1', scope: 'section', applies: 'drop', name: 'a tool\'s description',
    origin: 'mined', birds: { ember: [0.3, 0.4] }, wants: {}, forbids: [], weight: 0.5,
    score: { chef: 0, likes: 0 }, verdicts: [],
    provenance: { medoidSet: medoid.set, medoidStart: medoid.start, medoidDuration: medoid.dur, date: '2026-09-19' },
    ...human,
  });
  // The previous run: two rows, one with an opinion on it, one without.
  const before = [
    mined('mined/drop-01-old-slug', { set: 2, start: 5500, dur: 540 },
      { score: { chef: 2, likes: 3 }, picked: true, namedBy: 'Eugene', name: 'the warm one',
        verdicts: [{ seed: '22', theme: 1, bar: 104, verdict: 'hit', note: 'keep', by: 'review:mined', at: 'now' }] }),
    mined('mined/drop-02-old-slug', { set: 1, start: 2845, dur: 315 }),
  ];
  // The regeneration: the same two medoids under new ranks and slugs, and a
  // third row. Every human field arrives empty, as `rowFrom` writes it.
  const after = [
    mined('mined/drop-01-new-slug', { set: 1, start: 2845, dur: 315 }),
    mined('mined/drop-02-new-slug', { set: 2, start: 5500, dur: 540 }),
    mined('mined/drop-03-new-slug', { set: 3, start: 100, dur: 200 }),
  ];
  must(identityOf(before[0]) === identityOf(after[1]) && identityOf(before[0]) !== identityOf(after[0]),
    'the identity of a mined row is not its medoid');
  must(hasOpinion(before[0]) && !hasOpinion(before[1]) && !hasOpinion(after[0]), 'an opinion is not what hasOpinion says it is');
  const c = carryAcross(after, before);
  must(c.orphans.length === 0, `a regeneration that kept every medoid orphaned ${c.orphans.map((o) => o.id).join(', ')}`);
  must(c.carried.length === 1 && c.carried[0].verdicts === 1 && c.carried[0].chef === 2, 'the one opinion was not carried');
  const got = c.rows[1];
  must(got.score.chef === 2 && got.score.likes === 3 && got.picked === true && got.verdicts.length === 1 && got.verdicts[0].note === 'keep',
    'the human fields did not land on the row that is the same music');
  must(got.name === 'the warm one' && got.namedBy === 'Eugene', 'a name somebody gave was regenerated');
  must(got.id === 'mined/drop-02-new-slug', 'the carry moved the derived id, which is the tool\'s');
  must(c.rows[0].score.chef === 0 && c.rows[0].verdicts.length === 0 && c.rows[0].name === 'a tool\'s description',
    'an opinion was transplanted onto other music');
  // And a regeneration where the opinion's medoid is gone: the row is an orphan,
  // named and not carried anywhere.
  const moved = carryAcross([after[0], after[2]], before);
  must(moved.orphans.length === 1 && moved.orphans[0].id === 'mined/drop-01-old-slug', 'the lost opinion was not named as an orphan');
  must(moved.rows.every((r) => r.score.chef === 0 && !r.verdicts.length), 'an orphan\'s opinion was transplanted');
  // Two previous rows that are one music is a fault, not a choice.
  let threw = false;
  try { carryAcross(after, [before[0], { ...before[0], id: 'mined/twin' }]); } catch { threw = true; }
  must(threw, 'two previous rows of one identity were carried without a word');
  // The cookbook's and the listener's identities, by the same function.
  must(identityOf({ origin: 'golden', scope: 'track', applies: null, provenance: { medoidSeed: '7', medoidTheme: 2, medoidFromBar: 88, medoidBars: 16 } })
    === 'golden:track@7#2@88+16', 'a golden row\'s identity is not its medoid');
  must(identityOf({ origin: 'listener', scope: 'section', applies: 'main', provenance: { markId: 'mu6xix1h-0' } })
    === 'listener:section/main@mark:mu6xix1h-0', 'a listener row\'s identity is not its mark');
  must(identityOf({ origin: 'mined', scope: 'track', applies: null, provenance: {} }) === null, 'a row with no medoid has an identity');

  // M2: a decision follows the audio and not the file name. The same seed and
  // bars rendered by another build, or by another strategy, or to other bytes,
  // is other audio, and the earlier answer is kept beside the state, never in it.
  const id = provenanceKey('mined', '22', 1, 104, 8, 48000);
  const item = (identity) => ({ id, title: 'x', wav: `tmp/ear/mined/${id}.wav`, meta: { seed: '22', theme: 1, bars: '104+8', rate: 48000, ...identity } });
  const said = { action: 'keep', score: 2, note: 'the old audio', at: '2026-09-19' };
  const was = { strategy: 'house-v2', build: 'aaa', audioHash: '111' };
  const rebuilt = (identity) => migrateState({ items: [item(was)], state: { [id]: said } }, [item(identity)]);
  let m = rebuilt({ strategy: 'house-v2', build: 'bbb', audioHash: '222' });
  must(!m.state[id] && m.superseded[id] && m.superseded[id].entry.note === 'the old audio' && m.superseded[id].was.build === 'aaa',
    'a decision migrated onto another build\'s audio');
  m = rebuilt({ strategy: 'house-v1', build: 'aaa', audioHash: '111' });
  must(!m.state[id] && m.superseded[id], 'a decision migrated onto another strategy\'s audio');
  m = rebuilt(was);
  must(m.state[id] && m.state[id].note === 'the old audio' && !m.superseded[id] && !m.blind.length, 'the same audio did not keep its decision');
  // ...and the same audio standing in for another row is another question.
  m = migrateState({ items: [{ ...item(was), row: 'notes/recipes/mined/a.json' }], state: { [id]: said } },
    [{ ...item(was), row: 'notes/recipes/mined/b.json' }]);
  must(!m.state[id] && m.superseded[id], 'a decision about one dish migrated onto a card asking about another');
  m = migrateState({ items: [item({})], state: { [id]: said } }, [item(was)]);
  must(m.state[id] && m.blind.length === 1, 'a decision with no identity on it was not carried by provenance and said so');
  const other = provenanceKey('mined', '22', 1, 40, 8, 48000);
  m = migrateState({ items: [item(was)], state: { [id]: said } }, [{ ...item(was), id: other, meta: { ...item(was).meta, bars: '40+8' } }]);
  must(m.lost.length === 1 && !m.state[id] && !m.state[other], 'a decision about bars the list no longer has was not reported lost');
  // ...and the manifest gate accepts what a rebuild writes, and refuses a
  // superseded block that is not one.
  const withSup = sampleSession({ superseded: { one: { entry: said, was, now: { ...was, build: 'bbb' } } } });
  must(validateSession(withSup).length === 0, `a manifest with a superseded block does not validate: ${validateSession(withSup).join('; ')}`);
  must(validateSession(sampleSession({ superseded: { one: 'yes' } })).length > 0, 'the gate let a superseded block through that is not one');

  // M3: a variant keeps its number for life. A number is by the recipe and the
  // music; a key keeps its number, a new key takes the next number above every
  // number ever given, and nothing is ever renumbered or reused.
  const ledger = emptyLedger();
  const k = (seed, from) => musicKey(seed, 1, from, 8);
  let n = assignNumbers(ledger, 'r/a', [k('5', 60), k('9', 20)]);
  must(n.get(k('5', 60)) === 1 && n.get(k('9', 20)) === 2, 'the first numbers are not 1 and 2');
  n = assignNumbers(ledger, 'r/a', [k('9', 20), k('7', 8)]);
  must(n.get(k('9', 20)) === 2 && n.get(k('7', 8)) === 3, 'a re-rank renumbered a variant');
  n = assignNumbers(ledger, 'r/a', [k('5', 60), k('5', 64)]);
  must(n.get(k('5', 60)) === 1 && n.get(k('5', 64)) === 4, 'the same seed at a moved window did not take a new number, or an old one was reused');
  must(assignNumbers(ledger, 'r/b', [k('5', 60)]).get(k('5', 60)) === 1, 'a second recipe does not number from one');
  return 'the human fields of a row (score, verdicts, picked, a name somebody gave) are carried across a regeneration by the row\'s medoid and never by its id or file, an opinion whose medoid is gone is an orphan by name and is transplanted nowhere, two previous rows of one music throw; a decision migrates onto a rebuilt card only when the strategy, the build and the audio\'s own hash are the same, is kept as superseded when they are not, and is carried blind — and said so — when no identity was written; and a variant\'s number is by the recipe and the music, never renumbered, never reused';
});


// --- the machine view places nothing by hand --------------------------------
//
// Two checks over the layout module: **what is drawn** (the columns are the
// stages a box says it is in; the sources are framed by family; a bus is a
// strip and the master one rack unit) and **where it lands** (no wire over a
// box, no empty rectangle bigger than one family group, the canvas filling the
// room it was given, and the crossings counted).
//
// The geometry under the second one is here and not in the view because it is
// the gate's arithmetic and not the product's: a path is flattened to a
// polyline, a crossing is a proper intersection of two segments, and the
// largest empty rectangle is the largest rectangle of a grid of what is drawn —
// boxes, frames, titles, the legend and **the wires**, because a gutter twenty
// wires run down is not empty.

/**
 * How empty the emptiest rectangle may be, as a multiple of a family group.
 *
 * The first layout's was **6.95** — 1116 by 450 units, the whole bottom of the
 * canvas, which is the *"giant empty space in the middle"* the round was
 * called for. What is left at the widest size is one sparse column: the lane
 * inserts, which on house-v1 is a single chip with a bus row beside it. A
 * column with one box in it is air, and no arrangement of the others removes
 * it; what a gate can hold is that nothing emptier than that is ever drawn.
 *
 * **1.6 since M4**: Eugene asked for the sources compact — no family spread to
 * the wires' spacing — and for the effects area to keep one height through a
 * set, so on a desktop the sources column ends a little above the stage and the
 * master chain, and the room under its last family is 1.3 of a family group at
 * 1440×900 and 1.53 at 2560×1440. That room is the compactness he asked for, not a hole.
 */
const EMPTY_RATIO = 1.6;

/**
 * An SVG arc (circular, unrotated) from (x0, y0) to (x1, y1), as its centre,
 * its start angle and its sweep — the spec's endpoint-to-centre conversion.
 */
function arcOf(x0, y0, rr, large, sweep, x1, y1) {
  const hx = (x0 - x1) / 2; const hy = (y0 - y1) / 2;
  const r2 = rr * rr; const den = r2 * hy * hy + r2 * hx * hx;
  const co = Math.sqrt(Math.max(0, (r2 * r2 - den) / (den || 1))) * (large === sweep ? -1 : 1);
  const cxp = co * hy; const cyp = -co * hx;
  const cx = cxp + (x0 + x1) / 2; const cy = cyp + (y0 + y1) / 2;
  const a0 = Math.atan2((hy - cyp) / rr, (hx - cxp) / rr);
  let da = Math.atan2((-hy - cyp) / rr, (-hx - cxp) / rr) - a0;
  if (sweep === 0 && da > 0) da -= 2 * Math.PI;
  if (sweep === 1 && da < 0) da += 2 * Math.PI;
  return { cx, cy, rr, a0, da };
}
function arcPoints(x0, y0, rr, large, sweep, x1, y1, n) {
  const a = arcOf(x0, y0, rr, large, sweep, x1, y1);
  const out = [];
  for (let k = 1; k <= n; k++) { const t = a.a0 + (a.da * k) / n; out.push([a.cx + rr * Math.cos(t), a.cy + rr * Math.sin(t)]); }
  return out;
}

/**
 * **Every corner as drawn** (M6): each arc of a path with the straight run
 * into it and out of it, where the path has one — its points, its radius, and
 * the angle between each run and the arc's tangent where they meet, which is
 * nought for a true corner and was not for the quadratics M5 drew.
 */
function cornersOfPath(d) {
  const toks = d.match(/[MLA]|-?[\d.]+(?:e-?\d+)?/g) || [];
  const seq = []; let i = 0; const num = () => +toks[i++];
  while (i < toks.length) {
    const c = toks[i++];
    if (c === 'M' || c === 'L') seq.push({ c, x: num(), y: num() });
    else if (c === 'A') { const rr = num(); num(); num(); const large = num(); const sweep = num(); seq.push({ c, rr, large, sweep, x: num(), y: num() }); }
  }
  const out = [];
  for (let j = 1; j < seq.length; j++) {
    if (seq[j].c !== 'A') continue;
    const p0 = seq[j - 1]; const p1 = seq[j];
    const a = arcOf(p0.x, p0.y, p1.rr, p1.large, p1.sweep, p1.x, p1.y);
    const s = arcPoints(p0.x, p0.y, p1.rr, p1.large, p1.sweep, p1.x, p1.y, 8).map(([x, y]) => ({ x, y }));
    s.unshift({ x: p0.x, y: p0.y });
    // the tangent at each end of the arc, in the direction of travel
    const dir = Math.sign(a.da);
    const tan = (t) => ({ x: -Math.sin(t) * dir, y: Math.cos(t) * dir });
    const ang = (u, v) => { const l1 = Math.hypot(u.x, u.y) || 1; const l2 = Math.hypot(v.x, v.y) || 1; return Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / (l1 * l2)))) * 180 / Math.PI; };
    const before = j >= 2 && seq[j - 1].c === 'L' ? { x: seq[j - 1].x - seq[j - 2].x, y: seq[j - 1].y - seq[j - 2].y } : null;
    const after = j + 1 < seq.length && seq[j + 1].c === 'L' ? { x: seq[j + 1].x - p1.x, y: seq[j + 1].y - p1.y } : null;
    out.push({
      c: { x: a.cx, y: a.cy }, rr: p1.rr, pts: s,
      inAngle: before && Math.hypot(before.x, before.y) > 0.3 ? ang(before, tan(a.a0)) : 0,
      outAngle: after && Math.hypot(after.x, after.y) > 0.3 ? ang(after, tan(a.a0 + a.da)) : 0,
    });
  }
  return out;
}

/** A path, flattened to the points a measurement can be taken over. */
function polyline(d, step = 4) {
  const pts = [];
  let x = 0; let y = 0; let sx = 0; let sy = 0;
  const toks = d.match(/[MLHVCQAZmlhvcqaz]|-?[\d.]+(?:e-?\d+)?/g) || [];
  let i = 0;
  const num = () => +toks[i++];
  while (i < toks.length) {
    const c = toks[i++];
    if (c === 'M') { x = num(); y = num(); sx = x; sy = y; pts.push([x, y]); }
    else if (c === 'L') { x = num(); y = num(); pts.push([x, y]); }
    else if (c === 'H') { x = num(); pts.push([x, y]); }
    else if (c === 'V') { y = num(); pts.push([x, y]); }
    else if (c === 'C' || c === 'Q') {
      const q = c === 'Q';
      const x1 = num(); const y1 = num(); const x2 = num(); const y2 = num();
      const x3 = q ? x2 : num(); const y3 = q ? y2 : num();
      const n = Math.max(6, Math.ceil((Math.abs(x3 - x) + Math.abs(y3 - y)) / step));
      for (let k = 1; k <= n; k++) {
        const t = k / n; const u = 1 - t;
        pts.push(q
          ? [u * u * x + 2 * u * t * x1 + t * t * x2, u * u * y + 2 * u * t * y1 + t * t * y2]
          : [u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
            u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3]);
      }
      x = x3; y = y3;
    } else if (c === 'A') {
      const rr = num(); num(); num(); const large = num(); const sweep = num(); const x1 = num(); const y1 = num();
      for (const q of arcPoints(x, y, rr, large, sweep, x1, y1, 8)) pts.push(q);
      x = x1; y = y1;
    } else if (c === 'Z' || c === 'z') { x = sx; y = sy; pts.push([x, y]); }
    else throw new Error(`a path command this check cannot read: ${c} in ${d}`);
  }
  return pts;
}

const side = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const segsCross = (p1, p2, p3, p4) => {
  const d1 = side(p3, p4, p1); const d2 = side(p3, p4, p2);
  const d3 = side(p1, p2, p3); const d4 = side(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
};

/** How many times the wires cross each other. Two that share an end do not. */
function crossings(wires) {
  let n = 0;
  for (let a = 0; a < wires.length; a++) for (let b = a + 1; b < wires.length; b++) {
    if (wires[a].from === wires[b].from || wires[a].to === wires[b].to) continue;
    const A = wires[a].pts; const B = wires[b].pts;
    for (let i = 1; i < A.length; i++) for (let j = 1; j < B.length; j++) {
      if (segsCross(A[i - 1], A[i], B[j - 1], B[j])) n++;
    }
  }
  return n;
}

/** Every wire that passes through a box that is neither its source nor its target. */
function overBoxes(wires, boxes, margin = 2) {
  const bad = [];
  for (const w of wires) for (const b of boxes) {
    if (b.id === w.from || b.id === w.to) continue;
    const inside = w.pts.some(([px, py]) =>
      px > b.x + margin && px < b.x + b.w - margin && py > b.y + margin && py < b.y + b.h - margin);
    if (inside) { bad.push(`${w.from} → ${w.to} passes through ${b.id}`); break; }
  }
  return bad;
}

/** The largest rectangle of the canvas with nothing drawn in it. */
function largestEmpty(width, height, drawn, wires, cell = 6, thick = 3) {
  const W = Math.ceil(width / cell); const H = Math.ceil(height / cell);
  const full = new Uint8Array(W * H);
  const mark = (px, py) => {
    const cx = Math.floor(px / cell); const cy = Math.floor(py / cell);
    if (cx >= 0 && cy >= 0 && cx < W && cy < H) full[cy * W + cx] = 1;
  };
  for (const b of drawn) {
    for (let y = b.y; y <= b.y + b.h; y += cell / 2) for (let x = b.x; x <= b.x + b.w; x += cell / 2) mark(x, y);
  }
  for (const w of wires) for (let i = 1; i < w.pts.length; i++) {
    const [ax, ay] = w.pts[i - 1]; const [bx, by] = w.pts[i];
    const n = Math.max(1, Math.ceil((Math.abs(bx - ax) + Math.abs(by - ay)) / (cell / 2)));
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n; const y = ay + ((by - ay) * k) / n;
      for (let dy = -thick; dy <= thick; dy += cell / 2) for (let dx = -thick; dx <= thick; dx += cell / 2) mark(x + dx, y + dy);
    }
  }
  const up = new Int32Array(W);
  let best = 0; let at = null;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) up[x] = full[y * W + x] ? 0 : up[x] + 1;
    const stack = [];
    for (let x = 0; x <= W; x++) {
      const h = x === W ? 0 : up[x];
      let start = x;
      while (stack.length && stack[stack.length - 1][1] >= h) {
        const [s, hh] = stack.pop();
        if (hh * (x - s) > best) {
          best = hh * (x - s);
          at = { x: s * cell, y: (y + 1 - hh) * cell, w: (x - s) * cell, h: hh * cell };
        }
        start = s;
      }
      stack.push([start, h]);
    }
  }
  return { area: best * cell * cell, at };
}

/** Everything the canvas draws, and everything it runs, ready to be measured. */
function measurable(canvas) {
  const wires = canvas.wires.filter((w) => !w.implied)
    .map((w) => ({ from: w.edge.from, to: w.edge.to, kind: w.edge.kind, pts: polyline(w.d) }));
  const boxes = canvas.order.map((p) => ({ id: p.node.id, x: p.x, y: p.y, w: p.w, h: p.h }));
  // A frame is an outline and not a fill, so only its four edges are drawn —
  // which is also what keeps an empty rectangle from spilling out of one.
  const frames = canvas.frames.flatMap((f) => [
    { id: f.id, x: f.x, y: f.y, w: f.w, h: 2 },
    { id: f.id, x: f.x, y: f.y + f.h - 2, w: f.w, h: 2 },
    { id: f.id, x: f.x, y: f.y, w: 2, h: f.h },
    { id: f.id, x: f.x + f.w - 2, y: f.y, w: 2, h: f.h },
  ]);
  const heads = canvas.columns.map((c) => ({ id: `head:${c.stage}`, x: c.x, y: PAD, w: c.w, h: 34 }));
  const bells = bellsAt(canvas);
  const drawn = [
    ...boxes, ...frames, ...heads,
    { id: 'legend', x: PAD, y: canvas.height - LEGEND_H, w: canvas.width - PAD * 2, h: 12 },
    ...(bells ? [{ id: 'bells', ...bells }] : []),
  ];
  return { wires, boxes, drawn };
}


/** The wires of a machine in house-v1's shape, which the two checks below lay out. */
const WHOLE_EDGES = (BUSES, SENDS, RACK) => {
  const wire = (from, to, kind = 'signal') => ({ from, to, kind });
  return [
    wire('lane:kick', 'bus:kick'), wire('lane:backbeat', 'bus:drums'),
    wire('lane:offbeat', 'bus:drums'), wire('lane:offbeatOpen', 'bus:drums'), wire('lane:sixteenth', 'bus:drums'),
    wire('lane:bassline', 'bus:sub'), wire('lane:drone', 'treat:drone'), wire('treat:drone', 'bus:keys'),
    wire('lane:figure', 'bus:keys'),
    ...['glueImpact', 'glueSwell', 'glueSweep', 'glueRiser'].map((id) => wire(`lane:${id}`, 'bus:melodic')),
    wire('bus:keys', 'bus:melodic'), wire('bus:melodic', 'duck'), wire('duck', 'width'), wire('width', 'macro'),
    wire('bus:drums', 'macro'), wire('macro', 'themeOut'), wire('bus:sub', 'bassBody'),
    wire('bassBody', 'bassComp'), wire('bassComp', 'duckLow'), wire('duckLow', 'glue'), wire('bus:kick', 'glue'),
    wire('duckLow', 'push'), wire('bus:kick', 'push'), wire('push', 'glue'), wire('glue', 'themeOut'),
    ...RACK.slice(1).map((m, i) => wire(RACK[i], m)), wire('m:out', 'sink'),
    ...BUSES.flatMap((b) => SENDS.map((x) => wire(`bus:${b}`, `send:${x}`, 'send'))),
    wire('send:delay', 'duck', 'return'), wire('send:reverb', 'duck', 'return'),
    wire('send:room', 'bus:drums', 'return'), wire('send:hall', 'duck', 'return'),
    wire('bus:kick', 'duck', 'sidechain'), wire('bus:kick', 'duckLow', 'sidechain'),
  ];
};

/**
 * **Two wires in one lane** (M1: Eugene's screenshot of wires merging into one
 * bundle, and a dotted corner on a solid one): parallel runs of two wires
 * nearer than half a lane that overlap along their length, and corners of two
 * wires nearer than two radii. Since M3 a group of wires may ride a trunk —
 * one stroke between their own ports — and it is the trunks and the branches,
 * as drawn, that are held to it; and every wire keeps a port of its own.
 */
/** How near two drawn corners may come: a stroke's width and a hair. */
const CORNER_CLEAR = 2;
function sharedLanes(canvas) {
  // what is drawn: a wire on its own, end to end; a wire on a trunk, its two
  // branches; and each trunk once (M3). A branch meets its trunk square, by
  // design, so a stroke is never held against its own trunk.
  const strokes = [];
  for (const w of canvas.wires) {
    if (w.implied) continue;
    const id = `${w.edge.from}>${w.edge.to}`;
    if (w.trunk) w.branches.forEach((b, n) => strokes.push({ id, trunk: w.trunk, pts: b, d: w.branchD[n] }));
    // a wire joining an arrival (M8): its own run and curve onto the stem; the
    // stem is the join's, and the wires of one join meet in it by design
    else if (w.join) strokes.push({ id, trunk: `join ${w.join}`, pts: w.own, d: w.ownD });
    else strokes.push({ id, pts: w.pts, d: w.d });
  }
  for (const t of canvas.trunks) t.segs.forEach((seg, n) => strokes.push({ id: `trunk ${t.id}`, trunk: t.id, pts: seg, own: true, d: n ? '' : t.d }));
  for (const j of canvas.joins) {
    const m = j.d.match(/M (-?[\d.]+) (-?[\d.]+) L (-?[\d.]+) (-?[\d.]+)/).slice(1, 5).map(Number);
    strokes.push({ id: `join ${j.id}`, trunk: `join ${j.id}`, pts: [{ x: m[0], y: m[1] }, { x: m[2], y: m[3] }], d: j.d });
  }
  const bad = [];
  for (let a = 0; a < strokes.length; a++) for (let b = a + 1; b < strokes.length; b++) {
    const A = strokes[a]; const B = strokes[b];
    // a branch runs on along its trunk for two radii as it curves onto it
    // (M5), so nothing on one trunk is held against anything else on it
    if (A.id === B.id || (A.trunk && A.trunk === B.trunk)) continue;
    for (let i = 1; i < A.pts.length; i++) for (let j = 1; j < B.pts.length; j++) {
      const [p, q, u, v] = [A.pts[i - 1], A.pts[i], B.pts[j - 1], B.pts[j]];
      const vert = (m, n) => Math.abs(m.x - n.x) < 0.01;
      if (vert(p, q) !== vert(u, v)) continue;
      const near = vert(p, q) ? Math.abs(p.x - u.x) : Math.abs(p.y - u.y);
      const along = vert(p, q)
        ? Math.min(Math.max(p.y, q.y), Math.max(u.y, v.y)) - Math.max(Math.min(p.y, q.y), Math.min(u.y, v.y))
        : Math.min(Math.max(p.x, q.x), Math.max(u.x, v.x)) - Math.max(Math.min(p.x, q.x), Math.min(u.x, v.x));
      if (near < 3 && along > 0.5) bad.push(`${A.id} and ${B.id}`);
    }
    // **two corners never meet** (M5: the radius grew from 2.5 to 7): each
    // corner as it is drawn — the curve from RADIUS (or half its shorter leg)
    // before the turn to as far after it — sampled, and no point of one within
    // CORNER_CLEAR of a point of the other
    const ca = A.corners || (A.corners = cornersOfPath(A.d)); const cb = B.corners || (B.corners = cornersOfPath(B.d));
    for (const x of ca) for (const y of cb) {
      if (Math.abs(x.c.x - y.c.x) > 4 * RADIUS + 60 || Math.abs(x.c.y - y.c.y) > 4 * RADIUS + 60) continue;
      let near = Infinity;
      for (const p of x.pts) for (const q of y.pts) near = Math.min(near, Math.hypot(p.x - q.x, p.y - q.y));
      if (near < CORNER_CLEAR) bad.push(`corners of ${A.id} and ${B.id} ${near.toFixed(1)} apart`);
    }
  }
  // **every corner is true** (M6): the run into an arc and out of it meet it
  // along its tangent, within a degree
  for (const x of strokes) for (const c of (x.corners || (x.corners = cornersOfPath(x.d)))) {
    if (c.inAngle > 1 || c.outAngle > 1) bad.push(`a corner of ${x.id} meets its runs at ${c.inAngle.toFixed(1)}° and ${c.outAngle.toFixed(1)}°`);
  }
  // **a trunk's free end stops where the branch there curves off it** (M6: it
  // ran on to the branch's corner and stood out past its curve): every end of
  // a run that meets no other run is where some branch's arc joins the trunk
  for (const t of canvas.trunks) {
    const runs = [...t.d.matchAll(/M (-?[\d.]+) (-?[\d.]+) L (-?[\d.]+) (-?[\d.]+)/g)].map((m) => m.slice(1, 5).map(Number));
    const arcEnds = canvas.wires.filter((w) => w.trunk === t.id).flatMap((w) => [[w.branches[0][1], w.branches[0][2]], [w.branches[1][1], w.branches[1][0]]])
      .map(([c, e]) => { const l = Math.hypot(e.x - c.x, e.y - c.y) || 1; const k = Math.min(RADIUS, l / 2); return { x: c.x + ((e.x - c.x) / l) * k, y: c.y + ((e.y - c.y) / l) * k }; });
    // an end a radius off another run, where the two turn into each other on an arc
    const onRun = (x, y, [a0, b0, a1, b1]) => (Math.abs(a0 - a1) < 0.05 ? Math.abs(x - a0) < RADIUS + 0.6 && y >= Math.min(b0, b1) - RADIUS - 0.6 && y <= Math.max(b0, b1) + RADIUS + 0.6
      : Math.abs(y - b0) < RADIUS + 0.6 && x >= Math.min(a0, a1) - RADIUS - 0.6 && x <= Math.max(a0, a1) + RADIUS + 0.6);
    runs.forEach((run, i) => {
      for (const [ex, ey] of [[run[0], run[1]], [run[2], run[3]]]) {
        // an end cut back where two runs of the trunk turn into each other
        if (runs.some((o, j) => j !== i && (onRun(ex, ey, o) || Math.hypot(o[0] - ex, o[1] - ey) < 2 * RADIUS + 1 || Math.hypot(o[2] - ex, o[3] - ey) < 2 * RADIUS + 1))) continue;
        if (!arcEnds.some((q) => Math.hypot(q.x - ex, q.y - ey) < 0.6)) bad.push(`trunk ${t.id} ends at ${ex},${ey} where no branch's curve joins it`);
      }
    });
  }
  // **every wire reaches its own port**: no two leave one point, and no two
  // arrive at one but the wires of one joined arrival (M8), which arrive at
  // the join's port and nowhere else
  const key = (p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  const ends = (f, by) => { const m = new Map(); for (const w of canvas.wires) if (!w.implied) { const k = key(f(w)); if (!m.has(k)) m.set(k, new Set()); m.get(k).add(by(w)); } return [...m.values()].filter((n) => n.size > 1).length; };
  if (ends((w) => w.from, (w) => w)) bad.push(`${ends((w) => w.from, (w) => w)} ports are left by two wires`);
  if (ends((w) => w.at, (w) => w.join || w)) bad.push(`${ends((w) => w.at, (w) => w.join || w)} ports are reached by two wires, or two joins`);
  for (const j of canvas.joins) {
    const mates = canvas.wires.filter((w) => w.join === j.id);
    if (mates.length < 2 || mates.length !== j.count) bad.push(`join ${j.id} has ${mates.length} wires and says ${j.count}`);
    if (mates.some((w) => key(w.at) !== key(j.at))) bad.push(`a wire of join ${j.id} arrives off its port`);
    if (!j.d.endsWith(`${Math.round(j.at.x * 100) / 100} ${Math.round(j.at.y * 100) / 100}`)) bad.push(`join ${j.id}'s stem does not end at its port`);
  }
  return bad;
}

check('the canvas is the machine\'s own stages, and nothing in it is placed by hand', () => {
  // Eugene, 09-19: *"hierarchy is not reading at all"* — the picture is the
  // named stages of the signal as titled columns, and **every one of them comes
  // out of the data**: which column a box is in is a field of the box, which
  // frame a source is in is the instrument playing it, and a stage or a frame
  // nothing lands in is not drawn. Round M1 (09-25) drew three stages inside
  // another's column — the inserts and the sends over the bus meters, the
  // output under the master — so seven stages are four columns.
  const node = (id, stage, extra = {}) => ({
    id, label: id.toUpperCase(), kind: 'stage', stage, made: 'gain', readings: [], state: 'live', ...extra,
  });
  const wire = (from, to, kind = 'signal') => ({ from, to, kind });

  // (1) The columns are the ones something is in, in the signal's own order.
  const two = {
    nodes: [node('lane:a', 'sources', { kind: 'lane', group: 'drums' }), node('bus:x', 'buses', { exit: 'bottom' }), node('sink', 'output', { kind: 'output' })],
    edges: [wire('lane:a', 'bus:x'), wire('bus:x', 'sink')],
  };
  const small = layoutCanvas(two, GROUPS);
  must(small.columns.map((c) => c.stage).join(' ') === 'sources buses output',
    `a three-stage machine drew the columns ${small.columns.map((c) => c.stage).join(', ')}`);
  must(small.frames.length === 1 && small.frames[0].id === 'drums',
    `a machine with one family drew ${small.frames.length} frames`);

  // (2) ...and a whole one, in house-v1's shape: four columns, four frames.
  const FAMILIES = [
    ['drums', ['kick', 'backbeat', 'offbeat', 'offbeatOpen', 'sixteenth']],
    ['bass', ['bassline']],
    ['mid', ['figure', 'drone']],
    ['high', ['glueImpact', 'glueSwell', 'glueSweep', 'glueRiser']],
  ];
  const BUSES = ['kick', 'sub', 'drums', 'melodic', 'keys'];
  const SENDS = ['delay', 'reverb', 'room', 'hall'];
  const RACK = ['themeOut', 'deck:hp', 'deck:lp', 'deck:fader', 'm:dcBlock', 'm:lowShelf', 'm:lowMid',
    'm:mid', 'm:presence', 'm:air', 'm:master', 'm:limiter', 'm:clip', 'm:trim', 'm:out'];
  const whole = {
    nodes: [
      ...FAMILIES.flatMap(([group, ids]) => ids.map((id) => node(`lane:${id}`, 'sources', { kind: 'lane', group }))),
      node('treat:drone', 'inserts'),
      ...BUSES.map((b) => node(`bus:${b}`, 'buses', { kind: 'bus', exit: 'bottom', meter: b })),
      ...SENDS.map((x) => node(`send:${x}`, 'sends', { kind: 'send' })),
      ...['duckLow', 'bassBody', 'bassComp', 'push', 'glue', 'duck', 'width', 'macro'].map((x) => node(x, 'stage')),
      ...RACK.map((m) => node(m, 'master', { kind: 'master' })),
      node('sink', 'output', { kind: 'output' }),
    ],
    edges: WHOLE_EDGES(BUSES, SENDS, RACK),
  };
  const canvas = layoutCanvas(whole, GROUPS);
  must(canvas.columns.map((c) => c.stage).join(' ') === 'sources buses stage master',
    `the columns are ${canvas.columns.map((c) => c.stage).join(', ')}`);
  must(canvas.frames.map((f) => f.id).join(' ') === 'drums bass mid high', `the frames are ${canvas.frames.map((f) => f.id).join(', ')}`);
  must(canvas.places.size === whole.nodes.length, 'a box was not placed');

  // (3) **One column of sources**, drums then bass then mid then high, one
  //     line each, every frame under the one before.
  must(canvas.frames.every((f, i, all) => f.x === all[0].x && (!i || f.y >= all[i - 1].y + all[i - 1].h)),
    'the source families are not one column, top to bottom');
  const rows = whole.nodes.filter((n) => n.stage === 'sources').map((n) => canvas.places.get(n.id));
  // one line where the name and the instrument fit beside the keys, two where they do not (M4)
  must(rows.every((p) => p.h === (oneLine(p.node.label, p.node.made) ? SOURCE_H : SOURCE_H2)), 'a source is not one line where it fits and two where it does not');
  // the families stand compact, one under the next, whatever the room (M4)
  must(canvas.frames.every((f, i, all) => !i || Math.abs(f.y - (all[i - 1].y + all[i - 1].h) - FAMILY_GAP) < 0.01), 'the source families are spread apart');

  // (4) **The bus column is the effects over the meters**: every insert left
  //     of every send, both above every strip, the strips one row.
  const at = (id) => canvas.places.get(id);
  const strips = BUSES.map((b) => at(`bus:${b}`));
  const effects = [at('treat:drone'), ...SENDS.map((x) => at(`send:${x}`))];
  must(strips.every((p) => p.y === strips[0].y), 'the buses are not one row');
  must(effects.every((p) => p.y + p.h < strips[0].y), 'an insert or a send is not above the meters');
  must(SENDS.every((x) => at(`send:${x}`).x > at('treat:drone').x + at('treat:drone').w), 'a send is not right of the inserts');
  must([...strips].sort((a, b) => a.x - b.x).every((p, i, all) => !i || p.x >= all[i - 1].x + all[i - 1].w),
    'two mixer strips overlap');
  // (5) **The output is at the bottom of the master's column**, under the rack.
  const rack = rackOf(canvas);
  must(rack && rack.h === RACK.length * at('m:out').h, `the master is not one rack unit of ${RACK.length} rows`);
  must(at('sink').x === rack.x && at('sink').y > rack.y + rack.h, 'the output is not under the master chain');

  // (6) Each stage is drawn as what it is.
  const shapes = new Set(whole.nodes.map((n) => `${n.stage}:${shapeOf(n)}`));
  for (const want of ['sources:source', 'inserts:chip', 'sends:send', 'buses:strip', 'stage:box', 'master:row', 'output:box'])
    must(shapes.has(want), `${want.split(':')[0]} is not drawn as a ${want.split(':')[1]}`);

  // (7) The main path is the signal's own reachability; the rack's stacking is the wire.
  const main = mainPath(whole);
  must(main.has('macro>themeOut') && main.has('m:trim>m:out'), 'the spine does not reach the master');
  must(!main.has('bus:kick>send:delay') && !main.has('bus:kick>duck'), 'a send or a sidechain was drawn as the main path');
  const implied = canvas.wires.filter((w) => w.implied);
  must(implied.length === RACK.length - 1, `${implied.length} wires were left to the rack's own stacking where it has ${RACK.length - 1} steps`);
  // (8) **A box feeding the box under it is one straight drop** (M1, Eugene:
  //     *"lines may leave and enter from the top and bottom"*).
  const drops = canvas.wires.filter((w) => !w.implied && w.pts.length === 2 && w.pts[0].x === w.pts[1].x && w.pts[1].y > w.pts[0].y);
  must(drops.length >= 5, `only ${drops.length} of the stage's wires are straight drops`);

  // (9) Every kind of box the machine can describe is one this layout places.
  const source = fs.readFileSync(path.join(REPO, 'packages', 'engine', 'src', 'describe.ts'), 'utf8');
  const declared = (source.match(/export type NodeKind =\s*\n?\s*\|?([^;]+);/) || [])[1];
  must(declared, 'the kinds a box may be are not stated where this expected them');
  const kinds = [...declared.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
  const stages = [...(source.match(/export const STAGES = \[([^\]]+)\]/) || [])[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
  must(stages.length === 7, `${stages.length} stages are declared`);
  const everyKind = layoutCanvas({ nodes: kinds.map((k, i) => node(`k:${k}`, stages[i % stages.length], { kind: k })), edges: [] }, GROUPS);
  must(everyKind.places.size === kinds.length, `${kinds.length - everyKind.places.size} kinds of box were not placed`);

  return `seven stages drawn as the four columns something is in — ${canvas.columns.map((c) => c.stage).join(' → ')} — the sources one column `
    + `of one-line rows framed ${canvas.frames.map((f) => f.id).join(', ')}, the inserts and the sends over the bus meters, the output `
    + `under the rack of ${RACK.length} rows whose ${implied.length} steps draw no wire, ${drops.length} of the stage's wires straight drops, `
    + `and all ${kinds.length} kinds of box placed`;
});

check('the canvas fills the room it is given, and no wire crosses a box', () => {
  // Eugene, 09-19: *"the layout is weak; avoid the giant empty space in the
  // middle by stacking tiles more accurately, connectors maybe with curves for
  // easy eye tracking, no overlapping"* — and, on his own screen, *"space out
  // the graph and fill the black canvas to all the space between the left and
  // right column."* Three properties, measured over the same house-v1-shaped
  // description at the two sizes the pictures are taken at.
  const node = (id, stage, extra = {}) => ({
    id, label: id.toUpperCase(), kind: 'stage', stage, made: 'gain', readings: [], state: 'live', ...extra,
  });
  const wire = (from, to, kind = 'signal') => ({ from, to, kind });
  const FAMILIES = [
    ['drums', ['kick', 'backbeat', 'offbeat', 'offbeatOpen', 'sixteenth']],
    ['bass', ['bassline']],
    ['mid', ['figure', 'drone']],
    ['high', ['glueImpact', 'glueSwell', 'glueSweep', 'glueRiser']],
  ];
  const BUSES = ['kick', 'sub', 'drums', 'melodic', 'keys'];
  const SENDS = ['delay', 'reverb', 'room', 'hall'];
  const RACK = ['themeOut', 'deck:hp', 'deck:lp', 'deck:fader', 'm:dcBlock', 'm:lowShelf', 'm:lowMid',
    'm:mid', 'm:presence', 'm:air', 'm:master', 'm:limiter', 'm:clip', 'm:trim', 'm:out'];
  const whole = {
    nodes: [
      ...FAMILIES.flatMap(([group, ids]) => ids.map((id) => node(`lane:${id}`, 'sources', { kind: 'lane', group }))),
      node('treat:drone', 'inserts'),
      ...BUSES.map((b) => node(`bus:${b}`, 'buses', { kind: 'bus', exit: 'bottom', meter: b })),
      ...SENDS.map((x) => node(`send:${x}`, 'sends', { kind: 'send' })),
      ...['duckLow', 'bassBody', 'bassComp', 'push', 'glue', 'duck', 'width', 'macro'].map((x) => node(x, 'stage')),
      ...RACK.map((m) => node(m, 'master', { kind: 'master' })),
      node('sink', 'output', { kind: 'output' }),
    ],
    edges: WHOLE_EDGES(BUSES, SENDS, RACK),
  };

  // The room the graph's own pane has between the two columns of the frame, at
  // the two window sizes the round's pictures are taken at. The numbers are
  // the sheet's: 300 for the readings, 312 for the ledger, a hairline between.
  const SIDE = 336; const LEDGER = 312; const SEAMS = 2;
  const said = [];
  for (const [w, h] of [[1440, 900], [2560, 1440]]) {
    const pane = { width: w - SIDE - LEDGER - SEAMS, height: h };
    const canvas = layoutCanvas(whole, GROUPS, pane);
    const { wires, boxes, drawn } = measurable(canvas);

    // (1) **No wire over a box.** Not a rule about gutters any more: every path
    //     is flattened and held against every box that is neither of its ends.
    const over = overBoxes(wires, boxes);
    must(!over.length, `${over.length} wires pass over a box at ${w}×${h}: ${over.slice(0, 3).join('; ')}`);
    // (1b) **No two wires in one lane, and no two corners on each other** (M1).
    const shared = sharedLanes(canvas);
    must(!shared.length, `${shared.length} pairs of wires share a lane at ${w}×${h}: ${shared.slice(0, 3).join('; ')}`);

    // (2) **No empty rectangle larger than one family group.** The unit is the
    //     picture's own: the biggest framed family is what a reader takes in at
    //     once, so nothing emptier than that may sit inside the canvas.
    // **Within the drawing, and not under it** (M4): since Eugene asked for the
    // sources compact and the meters ending where they end, a tall pane has
    // room under the whole drawing, and that is the page, not a hole in the
    // picture; what is held is that nothing inside the drawing is emptier than
    // a family group.
    const group = Math.max(...canvas.frames.map((f) => f.w * f.h));
    const content = Math.max(...boxes.map((b) => b.y + b.h), ...wires.flatMap((w) => w.pts.map(([, y]) => y))) + 4;
    const empty = largestEmpty(canvas.width, content, drawn.filter((d) => d.id !== 'legend'), wires);
    const ratio = empty.area / group;
    must(ratio <= EMPTY_RATIO,
      `the emptiest rectangle at ${w}×${h} is ${Math.round(empty.at.w)}×${Math.round(empty.at.h)} at ${Math.round(empty.at.x)},${Math.round(empty.at.y)}, `
      + `${ratio.toFixed(2)} times the biggest family group`);

    // (3) **The canvas owns the space between the two columns.** It is computed
    //     from the pane and never from a fixed sheet, so it is at least as big
    //     as the pane in the direction the pane binds.
    const used = (canvas.width * canvas.scale * canvas.height * canvas.scale) / (pane.width * pane.height);
    must(used >= 0.85, `the canvas covers ${(used * 100).toFixed(0)} % of the pane at ${w}×${h}`);
    said.push(`at ${w}×${h} the canvas is ${Math.round(canvas.width)}×${Math.round(canvas.height)} units at ×`
      + `${canvas.scale.toFixed(2)} — ${(used * 100).toFixed(0)} % of the pane — with 0 wire–box overlaps, `
      + `its emptiest rectangle ${Math.round(empty.at.w)}×${Math.round(empty.at.h)} (${ratio.toFixed(2)} of a family group) `
      + `and ${crossings(wires)} crossings among ${wires.length} wires, none in another's lane`);
  }
  return said.join('; ');
});

// **The layout lays out what the machine actually describes** (the reconciled
// review of 09-24, R133). The two checks above hold the layout to a machine
// written by hand in house-v1's shape, so the boxes a real plan brings — the
// lanes house-v2 draws, the inserts its treatments add, every bus and send
// `describeGraph` walks — were never laid out by the gate. Here the part is the
// one `describeMachine` joins at rest (a plan, no graph built), for both
// strategies, laid out at the picture's size and held to the same three
// properties: every box placed, no box on another, no wire over a box.
check('the layout places the machine each strategy describes, with no box on another and no wire over one', () => {
  const said = [];
  for (const id of STRATEGY_IDS) {
    const track = planTheme('1', 0, { preset: 'auto', strategy: id });
    const bar = 40;
    const part = joinParts(lanePart(lanesOfTheme({ track, bar }), false), describeGraph(null, settingsOf(track)), describeDeck(null), describeMaster(null));
    part.nodes.push({ id: 'sink', label: 'OUTPUT', kind: 'output', stage: 'output', made: '—', readings: [], state: 'idle' });
    const canvas = layoutCanvas(part, GROUPS, { width: 1440 - 336 - 312 - 2, height: 900 });
    must(canvas.places.size === part.nodes.length, `${id}: ${part.nodes.length - canvas.places.size} of ${part.nodes.length} boxes were not placed`);
    const { wires, boxes } = measurable(canvas);
    const onTop = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) onTop.push(`${a.id}/${b.id}`);
    }
    must(!onTop.length, `${id}: ${onTop.length} boxes sit on another: ${onTop.slice(0, 3).join(', ')}`);
    const over = overBoxes(wires, boxes);
    must(!over.length, `${id}: ${over.length} wires pass over a box: ${over.slice(0, 3).join('; ')}`);
    const shared = sharedLanes(canvas);
    must(!shared.length, `${id}: ${shared.length} pairs of wires share a lane: ${shared.slice(0, 3).join('; ')}`);
    said.push(`${id} ${part.nodes.length} boxes in ${canvas.columns.length} columns and ${canvas.frames.length} frames, ${wires.length} wires`);
  }
  return `seed 1 theme 1 at bar 41, at rest: ${said.join('; ')} — every box placed, none on another, no wire over one, no two in one lane`;
});

// **One radius, and converging arrivals join** (M8, Eugene: *"the curve is too
// wide — it should be round but consistent on all lines, not relative to
// distances"*, and *"drums are busy with lines — since the main paths are
// spread apart on the run, it's fine to merge them at the box; I can still
// click them to itemise right around the curve"*). For both strategies, on a
// phone, at 1440 and at 2560's spacing: every corner every wire draws is
// `RADIUS` on its own centre, or half its shorter leg on a jog shorter than two
// radii; every face of a box three or more wires would reach has its wires
// drawn alike joined into one arrival, with one stem and one arrowhead; and
// every wire of a join draws its own run from its own port, which is what a
// hand picks it up by.
check('every corner is one radius, and three or more wires into one face of a box join into one arrival, each still its own run', () => {
  const said = [];
  const radii = (d) => [...d.matchAll(/A (-?[\d.]+) /g)].map((m) => +m[1]);
  for (const id of STRATEGY_IDS) {
    const track = planTheme('1', 0, { preset: 'auto', strategy: id });
    const part = joinParts(lanePart(lanesOfTheme({ track, bar: 40 }), false), describeGraph(null, settingsOf(track)), describeDeck(null), describeMaster(null));
    part.nodes.push({ id: 'sink', label: 'OUTPUT', kind: 'output', stage: 'output', made: '—', readings: [], state: 'idle' });
    for (const [name, fit, S] of [['phone', undefined, 1], ['1440', { width: 1440 - 336 - 312 - 2, height: 900, space: 1.5, type: 1 }, 1.5], ['2560', { width: 2560 - 420 - 390 - 2, height: 1440, space: 1.6, type: 1.25 }, 1.6]]) {
      const c = layoutCanvas(part, GROUPS, fit);
      const R = RADIUS * S;
      let corners = 0;
      const off = [];
      const hold = (label, pts, d) => {
        const want = [];
        for (let i = 1; i < pts.length - 1; i++) {
          const la = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); const lb = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
          want.push(Math.min(R, la / 2, lb / 2));
        }
        const got = radii(d);
        corners += got.length;
        if (got.length !== want.length || got.some((g, i) => Math.abs(g - want[i]) > 0.02)) off.push(`${label}: ${got.map((g) => g.toFixed(1)).join('/')} where ${want.map((g) => g.toFixed(1)).join('/')}`);
      };
      for (const w of c.wires) {
        if (w.implied) continue;
        const label = `${w.edge.from}>${w.edge.to}`;
        hold(label, w.pts, w.d);
        if (w.join) hold(`${label} (its own)`, w.own, w.ownD);
        if (w.branches) w.branches.forEach((b, n) => hold(`${label} (branch)`, b, w.branchD[n]));
      }
      must(!off.length, `${id} ${name}: ${off.length} wires turn at another radius than ${R}: ${off.slice(0, 3).join('; ')}`);
      // every face three or more wires reach: those drawn alike, on no trunk, joined
      const main = mainPath(part);
      const look = (w) => (w.edge.kind === 'signal' && main.has(`${w.edge.from}>${w.edge.to}`) ? 'main' : w.edge.kind);
      const faces = new Map();
      for (const w of c.wires) {
        if (w.implied) continue;
        const p = c.places.get(w.edge.to);
        const side = Math.abs(w.at.y - p.y) < 0.01 ? 'top' : Math.abs(w.at.y - p.y - p.h) < 0.01 ? 'bottom' : Math.abs(w.at.x - p.x) < 0.01 ? 'left' : 'right';
        const k = `${w.edge.to}|${side}`;
        if (!faces.has(k)) faces.set(k, []);
        faces.get(k).push(w);
      }
      let arrivals = 0; let heads = 0;
      for (const [k, list] of faces) {
        if (list.length < 3) continue;
        const alike = new Map();
        for (const w of list) if (!w.trunk && w.pts.length > 2) { const l = look(w); if (!alike.has(l)) alike.set(l, []); alike.get(l).push(w); }
        for (const [l, ws] of alike) {
          if (ws.length < 2) continue;
          arrivals += ws.length; heads++;
          const js = new Set(ws.map((w) => w.join));
          must(js.size === 1 && !js.has(undefined), `${id} ${name}: ${ws.length} ${l} wires into ${k} are not one joined arrival (${[...js].join(', ')})`);
          const j = c.joins.find((x) => x.id === ws[0].join);
          must(j && j.count === ws.length && /^M [-\d.]+ [-\d.]+ L [-\d.]+ [-\d.]+$/.test(j.d), `${id} ${name}: the join into ${k} is not one stem`);
          for (const w of ws) {
            must(w.own[0].x === w.pts[0].x && w.own[0].y === w.pts[0].y && w.own.length === w.pts.length, `${id} ${name}: ${w.edge.from}>${w.edge.to} does not draw its own run from its own port`);
          }
        }
      }
      if (name === '1440') {
        const drums = c.joins.find((x) => x.id.startsWith('bus:drums|top'));
        must(drums && drums.count >= 3, `${id}: the wires into DRUMS do not join (${c.joins.map((x) => x.id).join(', ') || 'no joins'})`);
        said.push(`${id}: ${corners} corners at ${R} or half a short jog, ${heads} joined arrivals of ${arrivals} wires, DRUMS ${drums.count} into one`);
      }
    }
  }
  return `${said.join('; ')}; the same on a phone and at 2560's spacing, every joined wire its own run from its own port`;
});

// **Every box has its page in the manual** (M2). The view explains a box by an
// entry of `manual.json`, keyed as `manualKey` keys it; a box with no entry
// would show nothing, and a `{name}` naming nothing the description carries
// would show its braces. So: every box both strategies describe, at rest and
// with both spatial returns, every family the registry can put on a lane, the
// insert, the response curve and the meter; and every fill is one of the four
// fields a box carries or one of the readings named here — stated here, as
// what `describe.ts`, `model.ts` and the desk put on a box, and not read off
// them.
const MANUAL_READINGS = ['freq', 'gain', 'Q', 'gr', 'thr', 'ratio', 'curve', 'os', 'time', 'ceiling', 'return', 'plate', 'echo',
  'ch', 'events', 'of', 'voices', 'mute', 'solo', 'dry', 'lean', 'rate', 'buffer', 'out'];
const MANUAL_FIELDS = ['label', 'made', 'note', 'instrument'];
/** Words the manual may not say: the project's own jargon for the ring's controls. */
const MANUAL_BANNED = ['bird'];
// **One spacing scale, and nothing touches** (M5, Eugene: *"some boxes touch
// borders, it looks cheap"*). The scale is `SPACE` in look.ts — 4, 8, 12, 16,
// 24 — and every inset the layout uses is one of its steps; then, on the
// machine each strategy describes at 1440×900 and on a phone: a source row
// stands a frame's gutter inside its family's frame, an insert and a return a
// gutter inside the effects area, no two boxes nearer than a gutter but the
// rows of one list (a hair) and the rows of the rack (one unit), and a source's
// keys a hair in from its frame on the right, above and below alike.
// **The genre table** (M7): two tiers, as data. Every family has a spell and
// up to eight sub-genres; a tuned sub carries a spell of its own and an untuned
// one none, and says in its tooltip that it plays its family's; every spell
// names only the ring's eight controls, with values in 0..1; and no word of a
// genre is anything the link can carry, since a key is a spell and nothing else.
check('the genre table is two tiers of spells, a family and its sub-genres', () => {
  const t = JSON.parse(fs.readFileSync(path.join(REPO, 'packages', 'deep-house', 'src', 'machine', 'genres.json'), 'utf8'));
  must(t.schema === 2 && Array.isArray(t.families) && t.families.length >= 2, 'genres.json is not the two-tier table');
  must(t.families.some((f) => f.label === t.home), `the home family ${t.home} is not in the table`);
  // (M8) the families tier is eight round Deep House, and no key's word is twice on one tier
  must(t.families.length <= 8, `${t.families.length} families, more than the eight cells round Deep House`);
  for (const f of t.families) must(new Set([f.label, ...f.subs.map((s) => s.label)]).size === f.subs.length + 1, `${f.label}: a word twice on its tier`);
  // (M10) a family says whether its own spell is tuned, and a spell the ring cannot reach is not;
  // an untuned key is disabled, so what presses on each tier is the table's to say
  for (const f of t.families) must(typeof f.tuned === 'boolean' && (!f.tuned || f.reachable), `${f.label}: a family says whether it is tuned, and an unreachable one is not`);
  // (M18) the recipe library's rows named by their own ids (`dir/name`), and
  // every row the library on this branch holds claimed by one family or style
  const claimed = t.families.flatMap((f) => [...(f.recipes || []), ...f.subs.flatMap((x) => x.recipes || [])]);
  for (const id of claimed) must(/^[a-z0-9-]+\/[a-z0-9-]+$/.test(id), `a recipe id "${id}" is not the library's dir/name`);
  must(new Set(claimed).size === claimed.length, 'a recipe row is claimed twice');
  const libDir = path.join(REPO, 'packages', 'deep-house', 'recipes', 'genres');
  const library = fs.existsSync(libDir) ? fs.readdirSync(libDir).flatMap((d) => fs.readdirSync(path.join(libDir, d)).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(libDir, d, f), 'utf8')).id)) : [];
  const unclaimed = library.filter((id) => !claimed.includes(id));
  must(!unclaimed.length, `library rows no family or style claims: ${unclaimed.join(', ')}`);
  // (M11) a family with no measured spell (Trance) is not tuned: an empty spell is the house, and would play it
  for (const f of t.families) must(Object.keys(f.spell).length || !f.tuned, `${f.label}: no spell, and tuned`);
  const pressing = t.families.map((f) => `${f.label} ${(f.tuned ? 1 : 0) + f.subs.filter((s) => s.tuned).length}`);
  const birds = ['ember', 'tide', 'zephyr', 'root', 'gleam', 'veil', 'spark', 'loom'];
  const spellOk = (sp) => sp && Object.entries(sp).every(([k, v]) => birds.includes(k) && typeof v === 'number' && v >= 0 && v <= 1);
  let subs = 0, tuned = 0;
  for (const f of t.families) {
    must(spellOk(f.spell) && typeof f.about === 'string' && f.about, `${f.label}: a family is a spell and a tooltip`);
    must(f.subs.length <= 8, `${f.label} has ${f.subs.length} sub-genres, more than eight round a centre`);
    for (const s of f.subs) {
      subs++;
      if (s.tuned) { tuned++; must(spellOk(s.spell), `${f.label} / ${s.label}: tuned, and no spell`); }
      else must(!s.spell && /not tuned yet/.test(s.about), `${f.label} / ${s.label}: untuned, and it does not say it plays its family's spell`);
    }
  }
  return `${t.families.length} families round the centre, every one pressable on the first tier with the centre (${t.families.length + 1} keys); on its own tier the keys that press: ${pressing.join(', ')}; ${claimed.length} recipe rows claimed, all ${library.length} of this branch's library among them; ${subs} sub-genres of which ${tuned} tuned and the rest playing their family's spell and saying so; every spell only the eight controls, 0 to 1`;
});

check('one spacing scale, and no box nearer a frame or another box than it says', () => {
  const steps = Object.values(SPACE);
  must(steps.join() === '4,8,12,16,24', `the scale is ${steps.join(', ')}`);
  for (const [name, v] of Object.entries({ FRAME_PAD, FRAME_LABEL, INSET, SOURCE_GAP, FAMILY_GAP, KEY_GAP, KEY_INSET }))
    must(steps.includes(v), `${name} is ${v}, which is not a step of the scale`);
  must(KEY_INSET * 2 + KEY_H === SOURCE_H && SOURCE_KEYS_W === KEY_INSET + KEY_W * 2 + LEVEL_W + KEY_GAP * 2,
    `a source's keys stand ${(SOURCE_H - KEY_H) / 2} above and below and ${SOURCE_KEYS_W - KEY_W * 2 - LEVEL_W - KEY_GAP * 2} on the right`);
  const said = [];
  for (const [id, fit] of [...STRATEGY_IDS.map((x) => [x, { width: 1440 - 336 - 312 - 2, height: 900 }]), [STRATEGY_IDS[STRATEGY_IDS.length - 1], { width: 390, height: 0 }]]) {
    const track = planTheme('1', 0, { preset: 'auto', strategy: id });
    const part = joinParts(lanePart(lanesOfTheme({ track, bar: 40 }), false), describeGraph(null, settingsOf(track), ['background', 'immersed']), describeDeck(null), describeMaster(null));
    part.nodes.push({ id: 'sink', label: 'OUTPUT', kind: 'output', stage: 'output', made: '—', readings: [], state: 'idle' });
    const c = layoutCanvas(part, GROUPS, fit);
    const at = `${id} at ${fit.width || 'its own'} wide`;
    const places = [...c.places.values()];
    const frameOf = (p) => c.frames.find((f) => p.node.stage === 'sources' && p.x >= f.x && p.x + p.w <= f.x + f.w && p.y >= f.y && p.y + p.h <= f.y + f.h);
    let tight = Infinity;
    for (const p of places.filter((q) => q.node.stage === 'sources')) {
      const f = frameOf(p);
      must(f, `${at}: ${p.node.id} is outside its family's frame`);
      const off = Math.min(p.x - f.x, f.x + f.w - (p.x + p.w), f.y + f.h - (p.y + p.h), p.y - (f.y + FRAME_LABEL));
      tight = Math.min(tight, off);
      must(off >= FRAME_PAD - 0.01, `${at}: ${p.node.id} stands ${off.toFixed(1)} inside its frame`);
    }
    const fx = c.areas.find((a) => a.id === 'effects');
    for (const p of places.filter((q) => q.node.stage === 'inserts' || q.node.stage === 'sends')) {
      const off = Math.min(p.x - fx.x, fx.x + fx.w - (p.x + p.w), fx.y + fx.h - (p.y + p.h), p.y - (fx.y + FRAME_LABEL));
      tight = Math.min(tight, off);
      must(off >= INSET - 0.01, `${at}: ${p.node.id} stands ${off.toFixed(1)} inside the effects area`);
    }
    let nearest = Infinity;
    for (let i = 0; i < places.length; i++) for (let j = i + 1; j < places.length; j++) {
      const a = places[i]; const b = places[j];
      if (a.row >= 0 && b.row >= 0) continue;
      const list = a.node.stage === 'sources' && b.node.stage === 'sources' && frameOf(a) === frameOf(b);
      const gap = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
      const want = list ? SOURCE_GAP : INSET;
      if (!list) nearest = Math.min(nearest, gap);
      must(gap >= want - 0.01, `${at}: ${a.node.id} and ${b.node.id} stand ${gap.toFixed(1)} apart where ${want} is the least`);
    }
    said.push(`${at}: the tightest inset ${tight.toFixed(0)}, the nearest two boxes ${nearest.toFixed(0)}`);
  }
  return `the scale is ${steps.join(', ')} and every inset the layout uses is a step of it; a source's keys stand ${KEY_INSET} in on the right, above and below, `
    + `${KEY_GAP} apart; ${said.join('; ')}`;
});

check('every box the machine can draw has an entry in the manual, and every fill names something a box carries', () => {
  const want = new Set(['insert', 'bells', 'meter']);
  for (const id of STRATEGY_IDS) {
    const track = planTheme('1', 0, { preset: 'auto', strategy: id });
    const lanes = lanesOfTheme({ track, bar: 40 });
    const part = joinParts(lanePart(lanes, false), describeGraph(null, settingsOf(track), ['background', 'immersed']), describeDeck(null), describeMaster(null));
    part.nodes.push({ id: 'sink', label: 'OUTPUT', kind: 'output', stage: 'output', made: '—', readings: [], state: 'idle' });
    for (const n of part.nodes) {
      const lane = lanes.find((l) => `lane:${l.id}` === n.id);
      want.add(manualKey(n, lane ? lane.family : null));
    }
  }
  for (const d of Object.values(BY_NAME)) want.add(manualKey({ id: 'x', label: 'X', kind: 'lane', stage: 'sources', made: '', readings: [], state: 'live' }, d.family));
  // (M8) and every key of the desk's popovers: the ones listed, and every one the controls name
  const controls = fs.readFileSync(path.join(REPO, 'packages', 'deep-house', 'src', 'machine', 'source-controls.tsx'), 'utf8');
  const named = [...controls.matchAll(/['"`](key:[a-z]+)['"`]/g)].map((m) => m[1]);
  if (/keyHelp\(`key:\$\{k\}`\)/.test(controls)) named.push('key:mute', 'key:solo', 'key:dry');
  const unlisted = named.filter((k) => !KEY_PAGES.includes(k));
  must(!unlisted.length, `keys the controls name and KEY_PAGES does not list: ${unlisted.join(', ')}`);
  for (const k of KEY_PAGES) want.add(k);
  const missing = [...want].filter((k) => !MANUAL[k]);
  must(!missing.length, `${missing.length} kinds of box have no entry in the manual: ${missing.join(', ')}`);
  const bad = [];
  let fills = 0;
  for (const [k, e] of Object.entries(MANUAL)) {
    must(e.title && Array.isArray(e.text) && e.text.length >= 1 && e.text.length <= 2, `${k}: an entry is a title and one or two paragraphs`);
    for (const t of [...e.text, e.v1, e.v2, e.ring, e.aside].filter(Boolean)) {
      // **plain words** (M4, Eugene: *"drop 'bird' — it's our jargon, not a
      // general-audience term"*): a control is named, the set is the ring's
      for (const word of MANUAL_BANNED) if (new RegExp(`\\b${word}`, 'i').test(t)) bad.push(`${k}: says "${word}"`);
      for (const [, f] of t.matchAll(/\{([^}]*)\}/g)) {
        fills++;
        if (!(MANUAL_FIELDS.includes(f) || (f.startsWith('r:') && MANUAL_READINGS.includes(f.slice(2))))) bad.push(`${k}: {${f}}`);
      }
    }
  }
  must(!bad.length, `fills naming nothing a box carries, or a word the manual may not say: ${bad.join(', ')}`);
  // **a box's readings, said** (M4, Eugene's screenshot of "events 4 of 1
  // brightnessHz 1100 hz hold 0.712 ratio attack 16 ms"): his line, as the page says it now
  const line = said({ id: 'lane:x', label: 'X', kind: 'lane', stage: 'sources', made: 'sub', state: 'live', readings: [
    { name: 'events', value: 4, unit: '' }, { name: 'of', value: 1, unit: '' }, { name: 'brightnessHz', value: 1100, unit: 'hz' },
    { name: 'hold', value: 0.712, unit: 'ratio' }, { name: 'attack', value: 16, unit: 'ms' }] });
  must(line === '4 events this bar; brightness 1100 Hz; hold 0.71; attack 16 ms', `his line reads "${line}"`);
  const extra = Object.keys(MANUAL).filter((k) => !want.has(k));
  return `${want.size} kinds of box and key — every one both strategies describe, every family the registry can put on a lane, the insert, the response, the meter and the ${KEY_PAGES.length} keys of the desk's popovers — `
    + `each with its entry, "bird" in none; his readings line said as "${line}"; ${fills} fills, each a box's own field or one of ${MANUAL_READINGS.length} readings${extra.length ? `; ${extra.length} entries for kinds not drawn today (${extra.join(', ')})` : ''}`;
});

// **The view's small type reads** (M14, the review of 09-26: `INK.dim`, the ink
// of the view's 6–10 px words, was 3.74:1 on its panel). Every ink the view sets
// type in holds 4.5:1 on the panel, the ground and the sunken rows; the wires'
// greys are lines and not held to it.
check('every ink the view sets type in holds 4.5:1 on its grounds', () => {
  const lum = (hex) => { const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const said = [];
  for (const ink of ['dim', 'type', 'note', 'value', 'label']) for (const ground of ['panel', 'ground', 'sunken']) {
    const r = ratio(VIEW_INK[ink], VIEW_INK[ground]);
    must(r >= 4.5, `${ink} ${VIEW_INK[ink]} on ${ground} ${VIEW_INK[ground]} is ${r.toFixed(2)}:1`);
    if (ground === 'panel') said.push(`${ink} ${r.toFixed(2)}:1`);
  }
  return `on the panel: ${said.join(', ')}; the same inks hold 4.5:1 on the ground and on the sunken rows`;
});

check('a meter reads where the decibel is, and a clip is this project\'s own number', () => {
  // The scale the LEDs and the bars are read on. Two of its numbers are
  // **this project's own and are stated here rather than taken off the meter
  // they check**: -1 dBFS is the ceiling every scene in `tools/test.ts` is
  // metered against, and 0 dBFS is full scale. The limiter's own ceiling is
  // neither — it is 0.75, which is about -2.5 dBFS, and it applies after the
  // master gain, so a first pass that used it as the clip threshold lit every
  // LED in the rack on music that was doing exactly what it should.
  must(HOT_DB === -1, `a meter reads hot at ${HOT_DB} dBFS and the scene gate's ceiling is -1`);
  must(CLIP_DB === 0, `a meter reads clipping at ${CLIP_DB} dBFS and full scale is 0`);
  must(HOT_DB < CLIP_DB, 'a meter clips before it is hot');
  must(meterAt(0) === 1, 'full scale is not the right-hand end of the bar');
  must(meterAt(METER_FLOOR) === 0, 'the floor is not the left-hand end of the bar');
  must(meterAt(METER_FLOOR - 40) === 0 && meterAt(12) === 1, 'a reading off the ends of the scale is not clamped to them');
  let was = -1;
  for (let db = METER_FLOOR; db <= 0; db += 0.5) {
    const at = meterAt(db);
    must(at >= was, `the bar goes backwards at ${db} dBFS`);
    was = at;
  }
  for (const db of SCALE) must(db <= 0 && db >= METER_FLOOR, `a scale mark at ${db} dBFS is off the bar`);
  must(SCALE.every((db, i) => i === 0 || db < SCALE[i - 1]), 'the scale marks are not in order');
  // Halfway along the bar is halfway down the scale, which is what makes the
  // marks readable without a legend.
  must(Math.abs(meterAt(METER_FLOOR / 2) - 0.5) < 1e-9, 'the middle of the bar is not the middle of the scale');
  return `the bar runs ${METER_FLOOR} to 0 dBFS, is monotone over 121 readings and clamps at both ends, `
    + `its ${SCALE.length} marks (${SCALE.join(', ')} dB) are all on it and in order; a meter reads hot at ${HOT_DB} — `
    + `the ceiling every scene is metered against — and clipping at ${CLIP_DB}, and neither is the limiter's own`;
});

// **A peak cannot fall between two readings** (R55): the window a tap reads is
// longer than the gap between two readings at both of the view's rates, with
// room for a timer running late. The rates are stated here — twelve a second,
// six on a coarse pointer — and the store's own are held to them.
check('a meter\'s window covers the gap between two readings', () => {
  must(Math.abs(FRAME_MS - 1000 / 12) < 1e-9 && Math.abs(COARSE_FRAME_MS - 1000 / 6) < 1e-9,
    `the view reads its meters every ${FRAME_MS.toFixed(1)} and ${COARSE_FRAME_MS.toFixed(1)} ms, not twelve and six a second`);
  const said = [];
  for (const rate of [44100, 48000, 96000]) {
    for (const period of [FRAME_MS, COARSE_FRAME_MS]) {
      const n = windowFor(period, rate);
      const ms = (n / rate) * 1000;
      must((n & (n - 1)) === 0 && n <= 32768, `a window of ${n} samples is not one an analyser takes`);
      must(ms >= period * 1.25, `at ${rate} Hz a ${period.toFixed(1)} ms gap is read through a ${ms.toFixed(1)} ms window`);
      if (rate === 48000) said.push(`${n} (${ms.toFixed(0)} ms) for a ${period.toFixed(0)} ms gap`);
    }
  }
  return `at 48 kHz a tap reads ${said.join(' and ')}, at least a quarter longer than the gap at 44.1, 48 and 96 kHz`;
});

check('a ledger line is a value somebody can paste into a report', () => {
  // Eugene's sentence for what one is worth (`PLAN-MACHINE-VIEW` §2c): *"bar 33:
  // tapeDelay on keys, mix 0.32, bus peaked -0.1 dBTP"*. So a line carries where
  // the set was, what happened and the fields that make it a measurement, and a
  // tap on it copies exactly that.
  forget();
  must(lines().length === 0, 'the ledger did not forget');
  // With nobody keeping the place — a stopped set — a line still writes and
  // says so by carrying no bar.
  keepPlace(null);
  const bare = note('transport', 'the set stopped');
  must(bare.theme === 0 && bare.bar === 0 && bare.clock === null, 'a line written with no set carries a place anyway');
  must(sentence(bare) === 'seed : the set stopped', `a bare line reads "${sentence(bare)}"`);

  keepPlace(() => ({ seed: '15576', theme: 2, bar: 33, clock: 91.25 }));
  const line = note('treatment', 'tapeDelay engaged on keys', { mix: 0.3241, bus: 'melodic', peak: -0.1 });
  must(line.seed === '15576' && line.theme === 2 && line.bar === 33 && line.clock === 91.25, 'a line did not take the place');
  must(sentence(line) === 'seed 15576 theme 2 bar 33: tapeDelay engaged on keys — mix 0.324, bus melodic, peak -0.1',
    `a line reads "${sentence(line)}"`);
  // A field with nothing in it is not a field: a report is not padded with
  // empties, and a nought is a reading and stays.
  const some = note('clip', 'melodic reached full scale', { peak: 0, why: null, how: '' });
  must(sentence(some) === 'seed 15576 theme 2 bar 33: melodic reached full scale — peak 0', `an empty field was written: "${sentence(some)}"`);
  // Every line has a serial of its own, and the window is by age.
  must(some.n > line.n && line.n > bare.n, 'two lines share a serial');
  must(lines().length === 3 && lines(0).length === 0, `the window kept ${lines().length} of 3 and ${lines(0).length} of none`);
  const n = lines().length;
  forget();
  keepPlace(null);
  return `a line carries the seed, the theme, the bar and the context's own clock off whoever is keeping the place, `
    + `reads as one sentence a report can hold — "${sentence(line)}" — drops a field with nothing in it and keeps a nought, `
    + `takes a serial of its own, and answers ${n} lines inside its window and none outside it`;
});

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
