// The transport, driven: the review's probes as named scenarios, and then the
// set played live for a minute, each engine asked afterwards whether any note
// was reached late, whether anything threw while it played, and where its
// clock's ticks came from.
//
//   npm run test:browsers                 scenarios in three engines, a minute in two
//   node tools/test-browsers.mjs --seconds 20 --browsers webkit
//   node tools/test-browsers.mjs --minute-in webkit   the scenarios only, elsewhere
//   node tools/test-browsers.mjs --scenario <name>    one of them, by a word in its name
//   node tools/test-browsers.mjs --allow-skip   accept a browser that is not here
//   node tools/test-browsers.mjs --site <dir>   play a build other than docs/
//
// The scenarios are in tools/scenarios.mjs, one per rule the transport has to
// keep: a stop landing inside a start, a theme planned while another plays, a
// seek inside a hand-over, a play inside a blend, how long a cut takes to be
// answered, whether a stopped set stops being processed, whether a flick and a
// cancelled drag end the scrub, and whether a drag along the band turns the
// star. They were scripts under tmp/check/, run once by hand against a server
// over src/ and then remembered; a rule nobody runs is not a rule. They run in
// every engine here, because the minute is what costs, not they.
//
// A browser that is not installed is skipped — and a skip is not a pass. The
// run ends non-zero with the reason named unless --allow-skip says the gap is
// wanted, so nothing downstream can read "all passed" off a suite that never
// opened a browser.
//
// It plays the built site: `npm run test:browsers` builds first, and this
// serves docs/ on port 6977, or borrows a server already there — after asking
// that server to prove it is serving this build and not something stale.
//
// It is played silently. The page is opened with `?out=silent`, which ends the
// set in a gain of zero into the destination, and the page is asked to say so
// before the first note; Chromium and Firefox are launched muted besides. So a
// minute of a set runs here without reaching whoever is sitting in front of the
// machine, and the clock, the scheduling and the capture tap are untouched.
//
// What fails a browser: an output route that is not silent, a context that is
// not running, a late note, a clock that is not the worker, less than nine
// tenths of the minute played, anything thrown onto the page, and any error the
// page logged. The mix counts the
// events it could not fire (`deck.failed`) and the ticks that threw
// (`ticksFailed`) and announces each on the console, so those are failures
// here whether or not the mix publishes the counters; where it does publish
// them they are read as well.

import path from 'node:path';
import { ROOT, PORT, siteDir, serve, servedIsUnderTest, playwright, finish, pageUrl, launchOptions, silentOutput } from './harness.mjs';
import { SCENARIOS, EDGE_TRACKER } from './scenarios.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const SECONDS = Number(arg('seconds', 60));
// The scenarios are cheap and run everywhere; the minute is what costs, so it
// stays in the two engines it has always been played in.
const BROWSERS = arg('browsers', 'chromium,webkit,firefox').split(',').filter(Boolean);
const MINUTE_IN = arg('minute-in', 'webkit,firefox').split(',').filter(Boolean);
const ONE = arg('scene', arg('scenario', null));
const RUN = SCENARIOS.filter((s) => !ONE || s.name.includes(ONE));

let failed = 0;
const skipped = [];
const skip = (why) => { skipped.push(why); console.log(`skip  ${why}`); };

const site = siteDir();
const server = await serve(site);
const served = await servedIsUnderTest(site);
if (!served.ok) {
  failed++;
  console.log(`FAIL  what is on ${PORT} is not the build under test: ${served.why}`);
} else {
  console.log(`ok    ${server.borrowed ? `borrowed the server on ${PORT}, which serves` : `serving ${path.relative(ROOT, site)} on ${PORT}:`} ${served.what}`);
}

let pw = null;
if (served.ok) {
  try {
    const found = await playwright();
    pw = found.pw;
    console.log(`ok    ${found.label}`);
  } catch (e) {
    skip(`no browser was driven: ${e.message.split('\n').join(' ').replace(/\s+/g, ' ')}`);
  }
}

for (const name of pw ? BROWSERS : []) {
  const engine = pw[name];
  if (!engine) { skip(`${name} is not a browser playwright knows`); continue; }
  let browser;
  try {
    browser = await engine.launch(launchOptions(name));
  } catch (e) {
    skip(`${name} is not installed (${e.message.split('\n')[0].slice(0, 80)})`);
    continue;
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // Before the page's own script, so it sees every edge the graph makes and
  // every message the limiter's worklet sends.
  await context.addInitScript(EDGE_TRACKER);
  const page = await context.newPage();
  // Errors are the run's business; warnings are reported beside a failure and
  // do not cause one.
  const errors = [];
  const warnings = [];
  page.on('console', (m) => {
    const type = m.type();
    if (type === 'error') errors.push(m.text());
    else if (type === 'warning') warnings.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  try {
    await page.goto(pageUrl(), { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.ring && window.deepHouse, { timeout: 20000 });
    await page.waitForTimeout(1200);

    // --- the scenarios ----------------------------------------------------
    for (const s of RUN) {
      const at = Date.now();
      let r;
      try {
        const setup = s.setup ? s.setup() : null;
        if (setup) await page.evaluate((v) => { window.__setup = v; }, setup);
        const raw = await page.evaluate(s.page);
        r = s.judge(raw, setup);
        // Whatever it was doing, it is not doing it any more.
        await page.evaluate(async () => {
          try { window.ring.control.stop(); } catch (e) { /* nothing to stop */ }
          await new Promise((res) => setTimeout(res, 300));
        });
      } catch (e) {
        r = { ok: false, why: e.message.split('\n')[0].slice(0, 160) };
      }
      const ms = Date.now() - at;
      if (r.ok) console.log(`ok    ${name} · ${s.name}: ${r.note || r.why} (${(ms / 1000).toFixed(1)} s)`);
      else { failed++; console.log(`FAIL  ${name} · ${s.name}: ${r.why} (${(ms / 1000).toFixed(1)} s)`); }
    }
    if (!MINUTE_IN.includes(name)) { await browser.close(); continue; }

    // --- and then the minute ----------------------------------------------
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.ring && window.deepHouse, { timeout: 20000 });
    await page.waitForTimeout(1200);
    errors.length = 0;
    warnings.length = 0;
    const vp = page.viewportSize();
    await page.mouse.click(vp.width / 2, vp.height / 2);
    await page.waitForFunction(() => window.ring.control.playing, { timeout: 10000 });
    // The set is up: now the page can be asked, itself, where it is going.
    const quiet = await silentOutput(page);
    if (!quiet.ok) {
      await page.evaluate(() => window.ring.control.stop());
      failed++;
      console.log(`FAIL  ${name}: the minute would have been heard — ${quiet.why}`);
      await browser.close();
      continue;
    }
    await page.waitForTimeout(SECONDS * 1000);
    const r = await page.evaluate(() => {
      const c = window.ring.control.state.ctx;
      const s = window.deepHouse.mix && window.deepHouse.mix.state;
      return {
        late: window.deepHouse.late,
        clock: window.deepHouse.clock,
        state: c && c.state,
        rate: c && c.sampleRate,
        position: +window.ring.control.state.position.toFixed(1),
        // Read where the mix publishes them; the console lines below are what
        // catches them when it does not.
        deckFailed: (s && (s.deckFailed ?? s.failed)) ?? null,
        ticksFailed: (s && s.ticksFailed) ?? null,
      };
    });
    await page.evaluate(() => window.ring.control.stop());
    const problems = [];
    if (r.state !== 'running') problems.push(`context ${r.state}`);
    if (r.late.count !== 0) problems.push(`${r.late.count} late notes, last moved ${r.late.last} s`);
    if (r.clock !== 'worker') problems.push(`clock ticks from ${r.clock}`);
    if (r.position < SECONDS * 0.9) problems.push(`only ${r.position} s played of ${SECONDS}`);
    if (r.deckFailed) problems.push(`${r.deckFailed} deck events failed`);
    if (r.ticksFailed) problems.push(`${r.ticksFailed} mix ticks threw`);
    const fired = errors.filter((e) => /deck event failed|mix tick failed|event failed/.test(e));
    if (fired.length) problems.push(`${fired.length} scheduling errors: ${fired[0].slice(0, 90)}`);
    const rest = errors.filter((e) => !fired.includes(e));
    if (rest.length) problems.push(`${rest.length} page errors: ${rest[0].slice(0, 90)}`);
    if (problems.length) { failed++; console.log(`FAIL  ${name}: ${problems.join('; ')} ${warnings.length ? JSON.stringify(warnings.slice(0, 3)) : ''}`); }
    else console.log(`ok    ${name}: ${SECONDS} s at ${r.rate} Hz, 0 late notes, nothing thrown, clock from the worker, ${quiet.why}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}: ${e.message.split('\n')[0].slice(0, 120)}`);
  }
  await browser.close();
}
server.close();
finish({ failed, skipped });
