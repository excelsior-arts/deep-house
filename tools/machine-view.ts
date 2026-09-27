// The README's diagram, photographed rather than drawn.
//
//   node tools/machine-view.ts                 write tmp/check/machine*.{svg,png}
//   node tools/machine-view.ts --sizes one     the README's picture alone
//   node tools/machine-view.ts --out public    write it where a release wants it
//   node tools/machine-view.ts --bar 18        a bar with a treatment on a lane
//   node tools/machine-view.ts --port 7034     a port of its own
//   node tools/machine-view.ts --site <dir>    photograph a build other than docs/
//
// **The sizes, because the canvas is computed from the room it has.** The
// README's own picture is taken wide enough that nothing is cut — since the
// families went two abreast the packed drawing is about 1500 units and the
// three-column frame takes 614 px of the window, so 2200 is the first width
// where the graph's pane holds the whole machine. `--sizes all` takes three
// more beside it: a laptop, a large desktop and a phone, which are three
// different drawings of one description — the same boxes, with the gutters and
// the gaps taking up the difference and the whole thing scaled only once the
// pane is wider than the drawing wants to be. The release takes the first
// alone, which is what `public/` carries.
//
// The two hand-drawn pictures the README carries — `machine.svg` and
// `mastering.svg` — were already stale and could not be kept in step by hand,
// which is the sentence `notes/archive/2026-09-v2-day-chain/plans/PLAN-MACHINE-VIEW.md` opens with. This is the
// answer: the page is opened headless at a stated place in a stated record,
// flipped to the machine view, and the view's own diagram is written out. There
// is no second document, so there is nothing to keep in step: **the diagram is
// the code**, and the picture is a photograph of it.
//
// It is a photograph and not a drawing in one way that matters and is said out
// loud: the meters in it are the meters at the instant the shutter went. Two
// runs agree about every box, every wire and every setting, and differ by a
// decibel or two in the bars — because the bars are a reading of music that was
// playing. That is the point of them.
//
// The set is opened on the silent route (`?out=silent`), so nothing is heard:
// the context is real, the clock is real and the graph is the graph, and the
// last node before the card multiplies by nothing.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
// Which build is photographed: `docs/` by default, and whatever a caller names
// otherwise — the release's dry run photographs the scratch build it just made,
// because that is what would ship and `docs/` is what is committed.
const SITE = path.resolve(ROOT, arg('site', 'docs'));
// Never 6975 (Eugene's), never 6977 (the suites'), and never the four the
// round notes name: a picture taken on a port somebody is listening on is a
// picture that interrupted them.
const PORT = Number(arg('port', 7034));
const OUT = path.resolve(ROOT, arg('out', path.join('tmp', 'check')));
// The first is the one the README carries and is the file called `machine.png`;
// the rest are named by their width, the phone is the long page, and they are
// taken only when they are asked for.
const ALL = arg('sizes', 'all') === 'all';
const SIZES = [
  { name: 'machine', width: Number(arg('width', 2200)), height: Number(arg('height', 1200)), full: false },
  ...(ALL ? [
    { name: 'machine-1440', width: 1440, height: 900, full: false },
    { name: 'machine-2560', width: 2560, height: 1440, full: false },
    { name: 'machine-phone', width: 400, height: 844, full: true },
  ] : []),
];

// The stated place: seed 1, its first theme, bar 8, the house spell — the
// record with nothing asked of it, eight bars in, which is where the first
// section has everything it is going to have.
const SEED = arg('seed', '1');
const BAR = Number(arg('bar', 8));

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

if (!fs.existsSync(path.join(SITE, 'index.html')))
  { console.error('there is no build to photograph: run `npm run build` first.'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const file = path.join(SITE, url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, ''));
  if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

// Playwright is borrowed from the two documented places, exactly as the suites
// borrow it, and is not a dependency of anything.
const { playwright } = await import('@deep-house/engine/harness');
let pw;
try {
  ({ pw } = await playwright());
} catch (e) {
  console.error(`no browser to photograph with: ${e.message.split('\n')[0]}`);
  server.close();
  process.exit(1);
}

const browser = await pw.chromium.launch({
  headless: true,
  args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'],
});

const problems = [];

async function shoot(name, { width, height, scale = 2 }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const mine = [];
  page.on('pageerror', (e) => mine.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') mine.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html?out=silent&seed=${SEED}&view=machine`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.ring && window.ring.machine && window.ring.machine.on, { timeout: 20000 });
  // A real graph to photograph: the set is started on the silent route and put
  // where the picture says it is. `seekTo` is a fraction of the theme, and the
  // theme's own bar count is what turns a bar into one.
  const where = await page.evaluate(async (bar) => {
    const ctl = window.ring.control;
    await Promise.race([ctl.start(), new Promise((r) => setTimeout(r, 15000))]);
    const r = ctl.readout();
    ctl.seekTo(bar / r.bars, true);
    await new Promise((res) => setTimeout(res, 2500));
    const now = ctl.readout();
    return { seed: now.seed, theme: now.mix.themeIndex, bar: now.bar + 1, bars: now.bars, bpm: now.bpm, key: now.key, room: now.presetName };
  }, BAR);
  return { page, ctx, problems: mine, where };
}

const written = [];
let facts = null;
let where = null;
for (const size of SIZES) {
  const shot = await shoot(size.name, { width: size.width, height: size.height });
  const canvas = await shot.page.evaluate(() => {
    const svg = document.getElementById('machineDiagram');
    const pane = document.querySelector('#machine .pane.graph');
    return {
      w: Math.round(+svg.getAttribute('width')), h: Math.round(+svg.getAttribute('height')),
      view: svg.getAttribute('viewBox'),
      pane: `${pane.clientWidth}x${pane.clientHeight}`,
      across: pane.scrollWidth - pane.clientWidth,
      down: pane.scrollHeight - pane.clientHeight,
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  if (!facts) {
    where = shot.where;
    facts = await shot.page.evaluate(() => {
      const s = window.ring.machine.snapshot();
      return {
        nodes: s.part.nodes.length,
        edges: s.part.edges.length,
        lanes: s.lanes.length,
        ledger: s.ledger.length,
        store: window.ring.machine.facts(),
      };
    });
    // The diagram on its own, as a file: a standalone SVG wants its own
    // namespace and a background, and the one the page renders carries both.
    const svg = await shot.page.evaluate(() => window.ring.machine.svg());
    fs.writeFileSync(path.join(OUT, 'machine.svg'), `${svg}\n`);
    written.push('machine.svg');
  }
  await shot.page.screenshot({ path: path.join(OUT, `${size.name}.png`), fullPage: size.full });
  written.push(`${size.name}.png`);
  problems.push(...shot.problems);
  console.log(`  ${size.width}×${size.height}: the canvas is ${canvas.w}×${canvas.h} in a ${canvas.pane} pane `
    + `(${canvas.view}), scrolling ${canvas.across} across and ${canvas.down} down, the page ${canvas.page} across`);
  await shot.ctx.close();
}

await browser.close();
server.close();

const kb = (f) => `${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(1)} kB`;
const w = where;
console.log(`the machine view, at seed ${w.seed} theme ${w.theme} bar ${w.bar} of ${w.bars} — ${w.bpm.toFixed(1)} BPM, ${w.key}, ${w.room}`);
console.log(`  ${facts.nodes} boxes, ${facts.edges} wires, ${facts.lanes} lanes, ${facts.ledger} lines in the ledger`);
console.log(`  the store draws at ${facts.store.fps} a second with ${facts.store.taps} taps attached`);
for (const f of written) console.log(`  ${path.relative(ROOT, path.join(OUT, f))}  ${kb(f)}`);
if (problems.length) {
  console.error(`\n${problems.length} errors on the page:`);
  for (const p of problems.slice(0, 5)) console.error('  ' + p);
  process.exit(1);
}
