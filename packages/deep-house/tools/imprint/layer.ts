// The per-layer imprint: one instrument, alone, read as eight birds.
//
//   node packages/deep-house/tools/imprint/layer.ts --render     every instrument, both registers
//   node packages/deep-house/tools/imprint/layer.ts --render --only sawLead
//   node packages/deep-house/tools/imprint/layer.ts --render --table K3   the drums alone
//   node packages/deep-house/tools/imprint/layer.ts --calibrate  re-centre anchors-layer.json on what existed before K2
//   node packages/deep-house/tools/imprint/layer.ts --measure    read the same renders again, on the moved scale
//   node packages/deep-house/tools/imprint/layer.ts --write      packages/engine/src/voices/signatures.json
//   node packages/deep-house/tools/imprint/layer.ts --report     the distance table and the separation answer
//
// This is the instrument `notes/archive/2026-09-kitchen/rounds/phase-1.md` §12 asks for, in its own
// words: *a bird measured over a whole mix is measuring the drums. A reading of
// the harmonic layers alone would give the timbre lists a signature that is not
// swamped. It needs anchors of its own — the scale here was calibrated on full
// mixes and a drumless render is not on it.*
//
// So there are two differences from `imprint.py`'s ordinary use and no others:
//
//   what is read   one voice, alone, playing its role's own fixed figure
//                  through the real graph (`tools/audition-voices.ts` in the
//                  engine) — eight bars at 120 BPM with two bars of pre-roll
//                  thrown away, which is the same audio the loudness gate
//                  meters, so the two measurements are of literally the same
//                  render.
//   what it is     `anchors-layer.json`, re-centred on what the record's own
//   read against   instruments measure **alone**. A hat on its own reads
//                  Root 0 and Zephyr 1 on the full-mix scale, which is not a
//                  reading, it is a clamp; the walls that a single layer stands
//                  outside of are moved, and every move is written down in
//                  `notes/archive/2026-09-kitchen/rounds/k2.md` the way the calibration note does it.
//
// Two registers each, and that is what makes the answer to "do the lists
// separate" mean anything. Phase 1's rule was **a bird carries weight for a
// list only where its spread across that list's candidates is at least its
// spread within them**, and a single reading per candidate has no within-spread
// at all. So every instrument is read twice — its own figure, and the same
// figure a fifth up at three quarters of the velocity — and the spread between
// those two readings is the within-spread of that candidate: how much the
// reading moves when the *same instrument* is played differently. It is a
// floor and not the whole of it, and it is a great deal more honest than
// nothing.
//
// ## The drums (round K5b)
//
// Round K3 built sixteen percussion instruments and none of them was ever read
// alone, so `signatures.json` had a hole in it exactly where house-v2's four
// drum lanes are: fourteen of the entries the lanes and the texture list name
// had no reading at all and the bias could not lean a drum lane. This tool
// gains the drum table for that, and two things about it are decisions:
//
//   the figure    its **role's own fixed pattern** out of `audition-drums.ts`,
//                 which is the table the loudness gate already meters, so a
//                 conga and a bongo differ by the instrument and by nothing
//                 else — the same rule the harmonic table is built on.
//   the register  a drum has no fifth, so the second reading is the same figure
//                 at three quarters of the **velocity**. K3 wired velocity to
//                 the playback rate and the envelope and to no filter, so a
//                 quieter hit is a darker, shorter one: it is the same
//                 instrument played differently in the only way a drum can be.
//
// The scale is **not re-calibrated** for them. `anchors-layer.json` was centred
// on the record's own harmonic instruments read alone, and re-centring it on a
// population that now holds sixteen drums would move every harmonic row that
// house-v2's timbre lists are already weighted off — a re-calibration is its own
// round with its own re-bless. So a drum is read against the scale as it
// stands, and `--report` prints how many of its readings sit on a wall, because
// a clamp is a lean and is not a measurement and the two must not be confused.
//
// Nothing here plays anything: an OfflineAudioContext has no output device.
// One headless browser at a time, reniced to the bottom of the queue, on a port
// that is never 6975.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { playwright, launchOptions, renice } from '@deep-house/engine/harness';
import { BY_NAME, TIMBRES } from '@deep-house/engine/voices';
import { wav, ROOT, VENV, IMPRINT_PY } from './render.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.join(ROOT, 'packages', 'engine');
const ROOTS = { '/src/': path.join(ENGINE, 'src'), '/tools/': path.join(ENGINE, 'tools') };
// Above the suites' 6977, beside the engine suite's 7023 and this round's 7045
// and 7046, and never 6975.
const PORT = 7047;
const OUT = path.join(ROOT, 'tmp', 'imprint', 'layer');
const ANCHORS = path.join(HERE, 'anchors-layer.json');
const SIGNATURES = path.join(ENGINE, 'src', 'voices', 'signatures.json');

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const has = (k) => process.argv.includes(`--${k}`);
const ONLY = arg('only');
const RATE = +arg('rate', 48000);
const BIRDS = ['ember', 'tide', 'zephyr', 'root', 'gleam', 'veil', 'spark', 'loom'];

// The two registers every instrument is read in. The second is a fifth up and
// three quarters as hard, which is the same instrument played differently and
// not a different instrument.
const VARIANTS = [
  { tag: 'base', transpose: 0, velScale: 1 },
  { tag: 'up5', transpose: 7, velScale: 0.75 },
];

// A drum's two, which are the same two with the transpose taken out: it is the
// velocity that is a drum's register, and `up5` would be a name for a move
// nothing here makes.
const DRUM_VARIANTS = [
  { tag: 'base', transpose: 0, velScale: 1 },
  { tag: 'soft', transpose: 0, velScale: 0.75 },
];

/** Which pair of registers a row is read in: its table decides. */
const variantsOf = (scene) => (scene.table === 'K3' ? DRUM_VARIANTS : VARIANTS);

// The instruments that existed before round K2: the scale is calibrated on
// these and the six new ones are then read against it, so where they land is a
// measurement and not a definition.
const K2_VOICES = ['sawLead', 'fmBell', 'karplusPluck', 'formantPad', 'clavKey', 'supersawPad'];

// **Both fixture tables**, and each row says which one it came from. Round K4
// added sixteen instruments with a table of their own (`audition-voices-2.ts`)
// and a layer signature is a reading of *every* playable instrument in the
// registry — a table with a hole in it is worse than none, which is what
// `missingScenes` has said since round K2 and what `tools/tables.ts` says for
// all of them since round K4. The two builders are the same arithmetic over the
// same figures, so a row from one is comparable with a row from the other;
// which builder to call is the only thing `table` decides.
//
// Three tables since round K5b: the drum table joins them, and the rows it
// contributes are the **playable instruments** and not the articulations — a
// conga's low tuning and its slap are the same instrument and a candidate list
// names `conga`, which is what `!s.also` says in the table's own words.
const SCENES = JSON.parse(execFileSync(process.execPath, ['-e', `
  Promise.all([
    import(${JSON.stringify(path.join(ENGINE, 'tools', 'audition-voices.ts'))}),
    import(${JSON.stringify(path.join(ENGINE, 'tools', 'audition-voices-2.ts'))}),
    import(${JSON.stringify(path.join(ENGINE, 'tools', 'audition-drums.ts'))}),
  ]).then(([a, b, c]) => {
    console.log(JSON.stringify([
      ...a.SCENES.map((s) => ({ ...s, table: 'K2' })),
      ...b.SCENES_2.map((s) => ({ ...s, table: 'K4' })),
      ...c.DRUM_SCENES.filter((s) => !s.also).map((s) => ({ ...s, table: 'K3' })),
    ]));
  });
`], { encoding: 'utf8' }));

// `--table K3` renders one fixture table's rows and leaves the rest alone,
// which is what a round that adds a table needs: the other fifty-four renders
// are on disk and re-rendering them would be an hour and the same bytes.
const TABLE = arg('table');
const wanted = SCENES.filter((s) => (!ONLY || s.id === ONLY) && (!TABLE || s.table === TABLE));
const rowId = (id, tag) => `${id}#${tag}`;
const fileOf = (id, tag, ext) => path.join(OUT, `${rowId(id, tag).replace(/[:#]/g, '-')}.${ext}`);

// --- rendering ---------------------------------------------------------------

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ts': 'text/javascript', '.json': 'application/json' };
function serveEngine() {
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${PORT}`).pathname);
    if (name === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>layer</title>'); return; }
    const root = Object.keys(ROOTS).find((r) => name.startsWith(r));
    const file = root ? path.join(ROOTS[root], name.slice(root.length)) : null;
    if (!file || !file.startsWith(ROOTS[root]) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    let body = fs.readFileSync(file);
    if (file.endsWith('.ts')) body = Buffer.from(stripTypeScriptTypes(body.toString('utf8'), { mode: 'strip' }));
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  });
  return new Promise((done) => server.listen(PORT, '127.0.0.1', () => done({ close: () => server.close() })));
}

// One instrument, alone, through the real graph, handed back as 16-bit PCM —
// the window only, the pre-roll thrown away.
const RENDER = async (job) => {
  const S = job.base;
  const [G, MA, VO, SC, PL, AU, AU2, AD] = await Promise.all([
    import(`${S}src/graph.ts`),
    import(`${S}src/master.ts`),
    import(`${S}src/voices/index.ts`),
    import(`${S}src/schedule.ts`),
    import(`${S}src/scheduler.ts`),
    import(`${S}tools/audition-voices.ts`),
    import(`${S}tools/audition-voices-2.ts`),
    import(`${S}tools/audition-drums.ts`),
  ]);
  const aud = job.table === 'K3'
    ? AD.drumAudition(job.id, { velScale: job.velScale })
    : job.table === 'K4'
      ? AU2.voiceAudition2(job.id, { transpose: job.transpose, velScale: job.velScale })
      : AU.voiceAudition(job.id, { transpose: job.transpose, velScale: job.velScale });
  const program = aud.program;
  const settings = program.settings;
  const rate = job.rate;
  const ctx = new OfflineAudioContext(2, Math.ceil(program.duration * rate), rate);
  await MA.prepareLimiter(ctx, settings);
  const graph = G.makeV1Graph(ctx, settings, { bpm: program.bpm, trimDb: program.trimDb });
  graph.out.connect(ctx.destination);
  await VO.prepareVoices(ctx, settings, program.events, { all: true });
  PL.scheduleAutomation(graph, program, 0);
  for (const s of SC.schedule(program, SC.offsetGrid(0)).events) PL.fireEvent(ctx, graph, program, s.pe, s.at);
  const buf = await ctx.startRendering();
  graph.dispose();

  const a = Math.round(aud.window.from * rate);
  const b = Math.min(buf.length, Math.round(aud.window.to * rate));
  const L = buf.getChannelData(0).slice(a, b);
  const R = buf.getChannelData(1).slice(a, b);
  const pcm = new Int16Array(L.length * 2);
  let peak = 0;
  for (let i = 0; i < L.length; i++) {
    const l = Math.max(-1, Math.min(1, L[i]));
    const r = Math.max(-1, Math.min(1, R[i]));
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    pcm[i * 2] = Math.round(l * 32767);
    pcm[i * 2 + 1] = Math.round(r * 32767);
  }
  const bytes = new Uint8Array(pcm.buffer);
  const chunks = [];
  const size = 1 << 20;
  for (let o = 0; o < bytes.length; o += size) {
    let s2 = '';
    const end = Math.min(bytes.length, o + size);
    for (let i = o; i < end; i += 4096) s2 += String.fromCharCode(...bytes.subarray(i, Math.min(end, i + 4096)));
    chunks.push(btoa(s2));
  }
  // The salience fields PLAN-IMPRINT asks for, and from our own render they are
  // exact and free: the plan is right here.
  const bars = (aud.window.to - aud.window.from) / program.barSeconds;
  const onsets = program.events.filter((e) => e.t >= aud.window.from).length;
  return {
    chunks,
    seconds: +((b - a) / rate).toFixed(2),
    peak: +(20 * Math.log10(peak + 1e-30)).toFixed(2),
    onsetsPerBar: +(onsets / bars).toFixed(3),
    bars,
    notes: onsets,
    bpm: program.bpm,
  };
};

async function render() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serveEngine();
  const { pw, label } = await playwright();
  console.log(`  ${label}`);
  const browser = await pw.chromium.launch(launchOptions('chromium'));
  renice(browser);
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  for (const scene of wanted) {
    for (const v of variantsOf(scene)) {
      const began = Date.now();
      const r = await page.evaluate(RENDER, {
        base: `http://127.0.0.1:${PORT}/`, id: scene.id, table: scene.table, rate: RATE,
        transpose: v.transpose, velScale: v.velScale,
      });
      const file = fileOf(scene.id, v.tag, 'wav');
      fs.writeFileSync(file, wav(Buffer.concat(r.chunks.map((c) => Buffer.from(c, 'base64'))), RATE));
      fs.writeFileSync(fileOf(scene.id, v.tag, 'plan.json'), JSON.stringify({
        id: scene.id, variant: v.tag, voice: scene.voice, role: scene.role,
        onsetsPerBar: r.onsetsPerBar, notes: r.notes, bars: r.bars, peak: r.peak, seconds: r.seconds,
      }, null, 1));
      // The imprint, on the layer scale. Its own tool, unchanged: what makes
      // this a per-layer reading is the audio and the anchors, not the code.
      const out = fileOf(scene.id, v.tag, 'json');
      execFileSync(VENV, [IMPRINT_PY, file, '--out', out, '--origin', 'generated',
        '--label', `${scene.id} (${v.tag}) alone`, '--anchors', ANCHORS, '--raw', '--quiet']);
      const row = JSON.parse(fs.readFileSync(out, 'utf8'));
      console.log(`  ${rowId(scene.id, v.tag).padEnd(22)} ${BIRDS.map((b) => `${b.slice(0, 2)} ${row.summary.birds[b].median.toFixed(2)}`).join('  ')}  (${((Date.now() - began) / 1000).toFixed(1)} s)`);
    }
  }
  await browser.close();
  server.close();
}

/**
 * The same wavs, read again on whatever the anchors now say. A re-calibration
 * moves the scale and not the audio, so nothing is re-rendered: this is the
 * whole reason the renders are kept rather than thrown away after the reading.
 */
function measure() {
  for (const scene of wanted) {
    for (const v of variantsOf(scene)) {
      const file = fileOf(scene.id, v.tag, 'wav');
      if (!fs.existsSync(file)) continue;
      const out = fileOf(scene.id, v.tag, 'json');
      execFileSync(VENV, [IMPRINT_PY, file, '--out', out, '--origin', 'generated',
        '--label', `${scene.id} (${v.tag}) alone`, '--anchors', ANCHORS, '--raw', '--quiet']);
      const row = JSON.parse(fs.readFileSync(out, 'utf8'));
      console.log(`  ${rowId(scene.id, v.tag).padEnd(22)} ${BIRDS.map((b) => `${b.slice(0, 2)} ${row.summary.birds[b].median.toFixed(2)}`).join('  ')}`);
    }
  }
}

// --- reading the rows back ---------------------------------------------------

function rows() {
  const out = [];
  for (const scene of SCENES) {
    for (const v of variantsOf(scene)) {
      const f = fileOf(scene.id, v.tag, 'json');
      if (!fs.existsSync(f)) continue;
      const row = JSON.parse(fs.readFileSync(f, 'utf8'));
      const plan = JSON.parse(fs.readFileSync(fileOf(scene.id, v.tag, 'plan.json'), 'utf8'));
      out.push({
        id: scene.id, variant: v.tag, scene, plan, row,
        birds: Object.fromEntries(BIRDS.map((b) => [b, row.summary.birds[b].median])),
        confidence: Object.fromEntries(BIRDS.map((b) => [b, row.summary.confidence[b]])),
      });
    }
  }
  return out;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const sd = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length);
};

/** One instrument's signature: the mean over its registers, and how far they were apart. */
function signatures() {
  const all = rows();
  const out = {};
  for (const scene of SCENES) {
    const mine = all.filter((r) => r.id === scene.id);
    if (!mine.length) continue;
    const d = BY_NAME[scene.voice];
    const timbre = scene.id.includes(':') ? scene.id.split(':')[1] : (TIMBRES[scene.voice] ? scene.voice : null);
    const facts = timbre && TIMBRES[timbre] ? TIMBRES[timbre] : null;
    out[scene.id] = {
      voice: scene.voice,
      timbre,
      role: scene.role,
      // Which fixture table played it. A consumer that wants the drums wants
      // the rows a drum table produced, and asking the row is the only way to
      // know that does not involve a list of drum names kept somewhere else.
      table: scene.table,
      family: d.family,
      layer: d.layer,
      birds: Object.fromEntries(BIRDS.map((b) => [b, +mean(mine.map((r) => r.birds[b])).toFixed(4)])),
      spread: Object.fromEntries(BIRDS.map((b) => [b, +sd(mine.map((r) => r.birds[b])).toFixed(4)])),
      confidence: Object.fromEntries(BIRDS.map((b) => [b, +mean(mine.map((r) => r.confidence[b])).toFixed(3)])),
      salience: {
        onsetsPerBar: mine[0].plan.onsetsPerBar,
        hold: facts ? facts.hold : null,
        brightnessHz: facts ? facts.brightnessHz : null,
        struck: facts ? facts.struck : null,
      },
      registers: mine.length,
    };
  }
  return out;
}

/** Euclidean distance in the eight birds. Nothing is weighted: a bird is a bird. */
const distance = (a, b) => Math.sqrt(BIRDS.reduce((s, k) => s + (a[k] - b[k]) ** 2, 0));

function writeSignatures() {
  const sigs = signatures();
  const anchors = JSON.parse(fs.readFileSync(ANCHORS, 'utf8'));
  const id = execFileSync('shasum', ['-a', '256', ANCHORS], { encoding: 'utf8' }).slice(0, 8);
  const doc = {
    schema: 1,
    kind: 'layerSignatures',
    note: 'MEASURED. What every playable instrument in the registry reads as when it is rendered ALONE through the real graph — the eight birds of notes/plans/PLAN-IMPRINT.md, on the single-layer scale in packages/deep-house/tools/imprint/anchors-layer.json, which is a different scale from the full-mix anchors.json and a row here may never be compared with a row measured on that one. Rebuilt by `node packages/deep-house/tools/imprint/layer.ts --render --write`. house-v2 reads it (src/catalogue-v2.ts joins it to the names a candidate list uses, src/spell.ts leans on it); house-v1 must not, because its own weights are a measurement of the record on the whole-mix scale. The percussion rows are read on the harmonic scale rather than one of their own, and some of them sit on a wall of it: a reading on a wall is a lean and is not a measurement.',
    measured: {
      date: new Date().toISOString().slice(0, 10),
      anchors: `anchors-layer.json@${id}`,
      anchorsVersion: anchors.version,
      calibratedOn: anchors.calibrated && anchors.calibrated.on,
      tool: 'packages/deep-house/tools/imprint/layer.ts',
      fixture: 'packages/engine/tools/audition-voices.ts + audition-voices-2.ts + audition-drums.ts',
      rate: RATE,
      bars: 8,
      prerollBars: 2,
      bpm: 120,
      registers: VARIANTS.map((v) => `${v.tag} (${v.transpose >= 0 ? '+' : ''}${v.transpose} semitones, velocity x${v.velScale})`),
      drumRegisters: DRUM_VARIANTS.map((v) => `${v.tag} (velocity x${v.velScale}; a drum's register is its velocity)`),
      drumFixture: 'packages/engine/tools/audition-drums.ts',
    },
    instruments: sigs,
  };
  fs.writeFileSync(SIGNATURES, `${JSON.stringify(doc, null, 1)}\n`);
  console.log(`  ${path.relative(ROOT, SIGNATURES)}: ${Object.keys(sigs).length} instruments on ${doc.measured.anchors}`);
}

// --- the report --------------------------------------------------------------
//
// Three questions, in the order the round was asked them: how far apart the
// instruments that already existed are, where the six new ones land, and
// whether the timbre lists separate now where the whole-mix sweep said they do
// not.

const LISTS = {
  leadTimbres: ['keys:ep', 'pad:strings', 'piano', 'keys:pluck', 'keys:organ', 'keys:rhodes', 'pad:swell'],
  sustainedLeads: ['pad:strings', 'pad:swell', 'pad:organ', 'pad:rhodes'],
  padPartners: ['pad:strings', 'pad:rhodes'],
  stabPartners: ['keys:ep', 'piano', 'keys:pluck', 'keys:rhodes', 'keys:glass'],
};

// house-v2's four percussion lanes, by the role their voices declare. They are
// the reason the drum table exists: a lane the bias cannot lean is a list with
// a die on it and no measurement under it.
const LANE_ROLES = ['backbeat', 'offbeat', 'sixteenth', 'texture'];

/** The rows the drum table contributed, by id — the table's own answer. */
const DRUM_IDS = new Set(SCENES.filter((s) => s.table === 'K3').map((s) => s.id));

function report() {
  const sigs = signatures();
  const ids = Object.keys(sigs);
  const harmonic = ids.filter((id) => sigs[id].family === 'keyboard' || sigs[id].family === 'ensemble');
  const old = harmonic.filter((id) => !K2_VOICES.includes(sigs[id].voice));

  console.log('\n## Where every instrument lands, alone\n');
  console.log(`| instrument | role | ${BIRDS.map((b) => b.slice(0, 2)).join(' | ')} | within |`);
  console.log(`|---|---|${BIRDS.map(() => '---|').join('')}---|`);
  for (const id of ids) {
    const s = sigs[id];
    console.log(`| \`${id}\` | ${s.role} | ${BIRDS.map((b) => s.birds[b].toFixed(2)).join(' | ')} | ${mean(BIRDS.map((b) => s.spread[b])).toFixed(3)} |`);
  }

  console.log('\n## How far apart the harmonic instruments are\n');
  console.log(`| | ${harmonic.map((i) => `\`${i}\``).join(' | ')} |`);
  console.log(`|---|${harmonic.map(() => '---|').join('')}`);
  for (const a of harmonic) {
    console.log(`| \`${a}\` | ${harmonic.map((b) => (a === b ? '—' : distance(sigs[a].birds, sigs[b].birds).toFixed(3))).join(' | ')} |`);
  }

  console.log('\n## Nearest neighbour, and the within-instrument floor\n');
  console.log('| instrument | nearest | distance | its own two registers apart |');
  console.log('|---|---|---|---|');
  for (const a of harmonic) {
    const others = harmonic.filter((b) => b !== a);
    const near = others.reduce((best, b) => (distance(sigs[a].birds, sigs[b].birds) < distance(sigs[a].birds, sigs[best].birds) ? b : best), others[0]);
    const within = Math.sqrt(BIRDS.reduce((s, k) => s + (2 * sigs[a].spread[k]) ** 2, 0));
    console.log(`| \`${a}\` | \`${near}\` | ${distance(sigs[a].birds, sigs[near].birds).toFixed(3)} | ${within.toFixed(3)} |`);
  }

  console.log('\n## Do the lists separate?\n');
  console.log('Phase 1\'s rule, on the layer scale: a bird carries weight for a list only where');
  console.log('its spread **across** that list\'s candidates is at least its spread **within**');
  console.log('them — and within, here, is how far one instrument\'s two registers are apart.\n');
  console.log('| list | candidates | bird | between | within | drives |');
  console.log('|---|---|---|---|---|---|');
  const verdicts = {};
  for (const [list, members] of Object.entries(LISTS)) {
    const have = members.filter((m) => sigs[m]);
    const drives = [];
    for (const b of BIRDS) {
      const between = sd(have.map((m) => sigs[m].birds[b]));
      const within = mean(have.map((m) => sigs[m].spread[b]));
      const wins = between >= within && between > 0.02;
      if (wins) drives.push(b);
      console.log(`| ${list === Object.keys(LISTS).find((k) => k === list) && b === BIRDS[0] ? `\`${list}\`` : ''} | ${b === BIRDS[0] ? have.length : ''} | ${b} | ${between.toFixed(3)} | ${within.toFixed(3)} | ${wins ? '**yes**' : 'no'} |`);
    }
    verdicts[list] = drives;
  }
  console.log('');
  for (const [list, drives] of Object.entries(verdicts)) {
    console.log(`- \`${list}\`: ${drives.length ? `**${drives.join(', ')}**` : 'nothing'}`);
  }

  // ...and the same question asked of the whole-mix sweep, which is the
  // measurement this one exists to answer. Phase 1 read a hundred and
  // thirty-one *mixes* and asked what the themes that rolled each candidate
  // measured as; this reads each candidate alone. The two "within" spreads are
  // not the same quantity and the table says so: phase 1's is the spread over
  // the themes that rolled a candidate, and this one is the spread over the two
  // registers one instrument was played in. What is comparable is the ratio.
  const sweep = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages', 'deep-house', 'src', 'styles', 'deep-house-signatures.json'), 'utf8'));
  console.log('\n## The same lists, on the whole-mix scale and on the layer scale\n');
  console.log('| list | bird | whole mix: between | within | layer: between | within |');
  console.log('|---|---|---|---|---|---|');
  for (const [list, members] of Object.entries(LISTS)) {
    const cands = sweep.lists[list] && sweep.lists[list].candidates;
    if (!cands) continue;
    const names = Object.keys(cands);
    const have = members.filter((m) => sigs[m]);
    for (const b of BIRDS) {
      const wb = sd(names.map((n) => cands[n].mean[b]));
      const ww = mean(names.map((n) => cands[n].sd[b]));
      const lb = sd(have.map((m) => sigs[m].birds[b]));
      const lw = mean(have.map((m) => sigs[m].spread[b]));
      console.log(`| ${b === BIRDS[0] ? `\`${list}\`` : ''} | ${b} | ${wb.toFixed(3)} | ${ww.toFixed(3)} | ${lb.toFixed(3)} | ${lw.toFixed(3)} |`);
    }
  }

  // --- the drums ------------------------------------------------------------
  //
  // Two questions and they are the two that decide whether the lanes can be
  // leant at all: how many of a drum's readings are sitting on a wall of a
  // scale that was not calibrated for it, and whether the four lanes separate.
  const drums = ids.filter((id) => sigs[id].table === 'K3' || DRUM_IDS.has(id));
  if (drums.length) {
    console.log('\n## The drums, read alone on the harmonic scale\n');
    console.log(`| instrument | role | ${BIRDS.map((b) => b.slice(0, 2)).join(' | ')} | within | on a wall |`);
    console.log(`|---|---|${BIRDS.map(() => '---|').join('')}---|---|`);
    let walls = 0;
    for (const id of drums) {
      const s = sigs[id];
      const w = BIRDS.filter((b) => s.birds[b] <= 0.001 || s.birds[b] >= 0.999);
      walls += w.length;
      console.log(`| \`${id}\` | ${s.role} | ${BIRDS.map((b) => s.birds[b].toFixed(2)).join(' | ')} | ${mean(BIRDS.map((b) => s.spread[b])).toFixed(3)} | ${w.length ? w.map((b) => b.slice(0, 2)).join(' ') : '—'} |`);
    }
    console.log(`\n${walls} of ${drums.length * BIRDS.length} drum readings sit on a wall of a scale that was calibrated on the harmonic instruments. A reading on a wall is a lean and is not a measurement.`);

    console.log('\n## Do the four lanes separate?\n');
    console.log('| lane | candidates | drives |');
    console.log('|---|---|---|');
    for (const role of LANE_ROLES) {
      // The **whole lane** and not the kitchen half of it: house-v2's list is
      // the incumbent the record plays plus the kitchen behind it, and whether
      // a lane separates is a question about the list a die reads.
      const members = ids.filter((id) => sigs[id].role === role);
      if (members.length < 2) { console.log(`| \`${role}\` | ${members.length} | *(one candidate: nothing to separate)* |`); continue; }
      const drives = [];
      for (const b of BIRDS) {
        const between = sd(members.map((m) => sigs[m].birds[b]));
        const within = mean(members.map((m) => sigs[m].spread[b]));
        if (between >= within && between > 0.02) drives.push(b);
      }
      console.log(`| \`${role}\` | ${members.length} | ${drives.length ? `**${drives.join(', ')}**` : 'nothing'} |`);
    }
  }

  console.log('\n## Where the six land\n');
  console.log('| instrument | nearest instrument that already existed | distance | farthest |');
  console.log('|---|---|---|---|');
  for (const id of ids.filter((i) => K2_VOICES.includes(sigs[i].voice))) {
    const near = old.reduce((best, b) => (distance(sigs[id].birds, sigs[b].birds) < distance(sigs[id].birds, sigs[best].birds) ? b : best), old[0]);
    const far = old.reduce((best, b) => (distance(sigs[id].birds, sigs[b].birds) > distance(sigs[id].birds, sigs[best].birds) ? b : best), old[0]);
    console.log(`| \`${id}\` | \`${near}\` | ${distance(sigs[id].birds, sigs[near].birds).toFixed(3)} | \`${far}\` (${distance(sigs[id].birds, sigs[far].birds).toFixed(3)}) |`);
  }
}

// --- calibration -------------------------------------------------------------
//
// The scale is re-centred on the instruments that existed before this round, so
// that where the six new ones land is a measurement and not a definition. It is
// `calibrate.py --recentre`, unchanged, pointed at the rows of the old
// instruments only.

function calibrate() {
  const files = [];
  for (const scene of SCENES) {
    if (K2_VOICES.includes(scene.voice)) continue;
    // ...and the drums are outside the population too, which is round K5b's own
    // decision and not an oversight: the scale was centred on the record's own
    // harmonic instruments read alone, house-v2's timbre lists are already
    // weighted off rows measured against it, and re-centring on a population
    // that has grown sixteen drums would move every one of them. A drum is read
    // against the scale as it stands; moving the scale is its own round.
    if (scene.table === 'K3') continue;
    for (const v of variantsOf(scene)) {
      const f = fileOf(scene.id, v.tag, 'json');
      if (fs.existsSync(f)) files.push(f);
    }
  }
  if (!files.length) throw new Error('nothing to calibrate on: render first');
  const out = execFileSync(VENV, [path.join(HERE, 'calibrate.py'), ...files,
    '--label', 'the instruments of the record, each alone',
    '--anchors', ANCHORS, '--out', ANCHORS, '--recentre', '--markdown'], { encoding: 'utf8' });
  console.log(out);
}

if (has('render')) await render();
if (has('measure')) measure();
if (has('calibrate')) calibrate();
if (has('write')) writeSignatures();
if (has('report')) report();
if (!has('render') && !has('measure') && !has('calibrate') && !has('write') && !has('report')) {
  console.log('nothing asked for: --render, --measure, --calibrate, --write, --report');
}
