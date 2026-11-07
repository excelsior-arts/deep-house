// The transport, driven: the review's probes as named scenarios, and then the
// set played live for a minute, each engine asked afterwards whether any note
// was reached late, whether anything threw while it played, and where its
// clock's ticks came from.
//
//   npm run test:browsers                 scenarios in three engines, a minute in two
//   node tools/test-browsers.ts --browsers chromium --minute-in none
//                                         the whole Chromium set, four at a time
//   node tools/test-browsers.ts --area ring    the scenarios of one area (or a,b)
//   node tools/test-browsers.ts --areas        the areas, and how many rows each has
//   node tools/test-browsers.ts --jobs 1       one at a time; 4 is the default
//                                              (Firefox's is 1: it wedges under load)
//   node tools/test-browsers.ts --scenario <name> --repeat 8   one row, eight times
//   node tools/test-browsers.ts --seconds 20 --browsers webkit
//   node tools/test-browsers.ts --minute-in webkit   the scenarios only, elsewhere
//   node tools/test-browsers.ts --scenario <name>    one of them, by a word in its name
//   node tools/test-browsers.ts --port <n>     serve there, or borrow what is there
//   node tools/test-browsers.ts --allow-skip   accept a browser that is not here
//   node tools/test-browsers.ts --site <dir>   play a build other than docs/
//   node tools/test-browsers.ts --deadline 300000   the deadline a scenario that
//                                              names none of its own is given
//   node tools/test-browsers.ts --relaunch 0   never make a fresh browser
//   node tools/test-browsers.ts --console      print every line the page logs,
//                                              with the time it was logged
//   node tools/test-browsers.ts --tier gate    the merge gate's rows (Chromium, about
//                                              five minutes); `night` is the gate's and
//                                              the night's, `weekly` every row
//   node tools/test-browsers.ts --no-rerun     a red row is FAIL at once, not rerun alone
//
// **Tiers, the rerun, the measurements and Firefox's list** (round test-sane, 11-05;
// his word: "5.5 hours is a laughing joke for the app of my size"). Every row names a
// `tier`: `gate` (the merge gate: short rows that need no serial tail), `night` (the
// default when a row names none) or `weekly` (the private tier's recordings, run on
// Sunday's pass and at a release cut). `--tier gate` runs the gate's rows, `--tier
// night` the gate's and the night's, `--tier weekly` (or no `--tier`) every row; the
// gate's deadline is 60 s a row and the night's 180 s, unless `--deadline` says.
// A row red in the queue is **rerun alone** in a fresh browser after it: `FAIL` is a
// row red twice, `flaky` one green alone, and only a `FAIL` ends the run non-zero (the
// morning triage, done by the runner). A row marked `measure` (a frame budget, a long
// task, the beat flash: this Mac's timing) prints `meas` with its reading and is never
// red. Firefox runs only the rows marked `firefox: true` and the minute, one at a time
// with 90 s a row: it wedges `control.start()` under load, found no regression in three
// nights, and costs hours; it runs on the weekly pass and at a release cut. A browser
// found stuck is retired at once, whatever the relaunch budget says (the budget bounds a
// row's second go only), and three stuck rows in a row end that engine's leg: every row
// left is a `skip` with the reason, and a skip is not a pass.
//
// `--deadline` given on the command line is also a ceiling on the scenarios
// that name their own: a run asked for a short deadline to find a hang is not
// then held five minutes by a row that knows it can be slow.
//
// The scenarios are in tools/scenarios.ts, one per rule the transport has to
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
// serves docs/ on a free port of its own, so `npm test` and a second worktree
// can run beside it. `--port <n>` names one instead, and a server already there
// is borrowed — after it is asked to prove it is serving this build and not
// something stale.
//
// **Four at a time, each in a page of its own** (09-24). The scenarios run in
// `--jobs` browsers at once, four unless told otherwise (Firefox one, below),
// pulled off one queue
// and printed in the list's order however they finish, so a log reads the same
// from one run to the next. Every scenario opens a fresh context — its own
// storage, its own audio context, its own journal — on its own `query` or the
// plain page, so no row can lean on what the row before it left behind: five
// did, and failed the moment the order changed (notes/reviews/scenarios-2026-09-24.md).
// A row marked `serial` is one whose rule is about the machine keeping time
// under its own load and not under three other browsers', and it runs after the
// rest, alone. Every row names its `area`, and `--area` runs one area's rows:
// the fast gate for a change is its area, and the whole set is the batch's.
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
import { ROOT, PORT, siteDir, serve, servedIsUnderTest, playwright, finish, pageUrl, launchOptions, silentOutput } from '@deep-house/engine/harness';
import { SCENARIOS, EDGE_TRACKER, AREAS } from './scenarios.ts';
import { staleTierNames } from './scenario-tiers.ts';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const SECONDS = Number(arg('seconds', 60));
// The scenarios are cheap and run everywhere; the minute is what costs, so it
// stays in the two engines it has always been played in.
const BROWSERS = arg('browsers', 'chromium,webkit,firefox').split(',').filter(Boolean);
const MINUTE_IN = arg('minute-in', 'webkit,firefox').split(',').filter(Boolean);
const ONE = arg('scene', arg('scenario', null));
const TIERS = ['gate', 'night', 'weekly'];
const TIER = arg('tier', null);
// what each tier runs: the gate's own rows, the night's and the gate's, or every row
const TIER_RUNS = { gate: ['gate'], night: ['gate', 'night'], weekly: TIERS };
const tierOf = (s) => s.tier ?? 'night';
const RERUN = !process.argv.includes('--no-rerun');
const AREA = arg('area', null);
const WANT_AREAS = AREA ? AREA.split(',').filter(Boolean) : null;
// How many browsers run scenarios at once. Four is what this Mac was measured
// to carry with every counter at nought in Chromium and WebKit, with the rows
// marked `serial` run alone after the rest (notes/reviews/scenarios-2026-09-24.md);
// `--jobs 1` is the serial run it always was. **Firefox is one unless told**:
// it wedges `control.start()` under load (NOTES.md), and four of it at once
// did, three relaunches spent inside the first long rows and every row after
// them past its deadline. `--jobs N` given is N in every engine.
const JOBS_ASKED = process.argv.includes('--jobs') ? Math.max(1, Math.floor(Number(arg('jobs', 4))) || 1) : null;
const JOBS_OF = { chromium: 4, webkit: 4, firefox: 1 };
const jobsFor = (name) => JOBS_ASKED ?? JOBS_OF[name] ?? 1;

let failed = 0;
const skipped = [];
const skip = (why) => { skipped.push(why); console.log(`skip  ${why}`); };

// A row is refused before anything is served if its body is not where the
// runner reads it. The icon round of 09-20 wrote a scenario with its body
// under `src` instead of `page`, and the runner evaluated `undefined` for it —
// which is a pass-shaped nothing until a judge throws. The row is in hand
// here, so it can be refused by name and by the fields it has instead. A body
// is what `page.evaluate` takes: the string `body()` builds, or a function.
// And since 09-24 a row names the area it belongs to, out of `AREAS` — or the
// areas, a list, when it asks the rules of two — so the filter below can never
// leave a row out of every area.
const areasOf = (s) => [].concat(s.area ?? []);
{
  // (or a `drive`: a row that needs the browser's own input — a real mouse, a
  // native text selection — is handed the page itself instead of a body)
  const hasBody = (s) => (typeof s.page === 'string' && s.page.length > 0) || typeof s.page === 'function' || typeof s.drive === 'function';
  const bad = SCENARIOS.map((s) => [s, !s.name ? 'no name' : !hasBody(s) ? 'no page body' : typeof s.judge !== 'function' ? 'no judge'
    : !areasOf(s).length || areasOf(s).some((a) => !(a in AREAS)) ? `the area ${JSON.stringify(s.area)}, which is not one of ${Object.keys(AREAS).join(', ')}`
    : !TIERS.includes(tierOf(s)) ? `the tier ${JSON.stringify(s.tier)}, which is not one of ${TIERS.join(', ')}` : null]).filter(([, why]) => why);
  const names = new Map();
  for (const s of SCENARIOS) names.set(s.name, (names.get(s.name) || 0) + 1);
  for (const [n, k] of names) if (k > 1) bad.push([{ name: n }, `a name ${k} rows share, so a filter or a log line cannot tell them apart`]);
  if (WANT_AREAS) for (const a of WANT_AREAS) if (!(a in AREAS)) bad.push([{ name: `--area ${a}` }, `no such area; there are ${Object.keys(AREAS).join(', ')}`]);
  for (const n of staleTierNames(SCENARIOS)) bad.push([{ name: n }, 'a tier or a mark in tools/scenario-tiers.ts, and no row of that name']);
  if (TIER && !TIERS.includes(TIER)) bad.push([{ name: `--tier ${TIER}` }, `no such tier; there are ${TIERS.join(', ')}`]);
  if (bad.length) {
    for (const [s, why] of bad) console.log(`FAIL  the scenario ${JSON.stringify(s.name || '(no name)')} has ${why} — its fields are ${Object.keys(s).join(', ')}`);
    finish({ failed: bad.length, skipped: [] });
  }
}
if (process.argv.includes('--areas')) {
  for (const [a, what] of Object.entries(AREAS))
    console.log(`${a.padEnd(10)} ${String(SCENARIOS.filter((s) => areasOf(s).includes(a)).length).padStart(3)}  ${what}`);
  console.log(`tiers      ${TIERS.map((t) => `${t} ${SCENARIOS.filter((s) => tierOf(s) === t).length}`).join(', ')}; ${SCENARIOS.length} rows; `
    + `firefox ${SCENARIOS.filter((s) => s.firefox).length}, measure ${SCENARIOS.filter((s) => s.measure).length}, serial ${SCENARIOS.filter((s) => s.serial).length}`);
  process.exit(0);
}
// `--repeat <n>` runs each chosen row n times over, as rows of their own in the
// same queue: how a row suspected of leaning on the machine's load is measured
// under the load four browsers make.
const REPEAT = Math.max(1, Math.floor(Number(arg('repeat', 1))) || 1);
const RUN = SCENARIOS.filter((s) => (!ONE || s.name.includes(ONE)) && (!WANT_AREAS || areasOf(s).some((a) => WANT_AREAS.includes(a)))
  && (!TIER || TIER_RUNS[TIER].includes(tierOf(s))))
  .flatMap((s) => (REPEAT === 1 ? [s] : Array.from({ length: REPEAT }, (_, k) => ({ ...s, name: `${s.name} (${k + 1} of ${REPEAT})` }))));
// A filter that matches nothing has run nothing, and nothing is not a pass.
if (!RUN.length) {
  console.log(`FAIL  no scenario matches${ONE ? ` --scenario ${JSON.stringify(ONE)}` : ''}${WANT_AREAS ? ` in --area ${WANT_AREAS.join(',')}` : ''}${TIER ? ` in --tier ${TIER}` : ''}`);
  finish({ failed: 1, skipped: [] });
}

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

// How long a navigation is given before the browser it is in is called stuck.
// It is not a scenario's deadline: a page that has stopped answering answers a
// `goto` no better than it answers an `evaluate`, and the navigation is where
// it always shows first, so this is the shorter of the two on purpose.
const NAV_TIMEOUT = +arg('nav-deadline', 45000);
// The deadline a scenario gets when it names none of its own, and how many
// times one browser may be thrown away and made again inside one engine's turn.
// (a tier names its own: the gate 60 s a row, the night 180 s, a cap on the rows that name a longer one; Firefox 90 s)
const TIER_DEADLINE = { gate: 60000, night: 180000 };
const DEFAULT_DEADLINE = +arg('deadline', TIER_DEADLINE[TIER] ?? 120000);
const DEADLINE_CAP = process.argv.includes('--deadline') || TIER_DEADLINE[TIER] ? DEFAULT_DEADLINE : Infinity;
const FIREFOX_DEADLINE = 90000;
const deadlineOf = (s, name) => Math.min(s.deadline || DEFAULT_DEADLINE, DEADLINE_CAP, name === 'firefox' && !process.argv.includes('--deadline') ? FIREFOX_DEADLINE : Infinity);
const CONSOLE = process.argv.includes('--console');
const T0 = Date.now();
const MAX_RELAUNCH = +arg('relaunch', 3);
// **What a stuck browser looks like from out here** (`TODO.md`, 09-19): Firefox
// on this machine intermittently never returns from `control.start()`, and
// while it does not the page stops answering at all — so a scenario dies on its
// deadline and then every navigation after it dies on its own, which reads like
// a browser that has been through too many scenarios and is not. Nothing inside
// the page can save it, because there is no turn of the event loop left to run
// a timer in. A fresh process is the only thing that helps, so that is what
// happens: the browser is retired and the scenario is given one more go in a
// new one, which is the first of the two fixes `TODO.md` asked for.
// A promise, or a failure that names the deadline it passed. The timer is
// cleared either way, so a scenario that answers leaves nothing behind.
const inTime = (p, what, ms) => {
  let timer;
  return Promise.race([p, new Promise((_, no) => { timer = setTimeout(
    () => no(new Error(`${what} did not answer inside ${Math.round(ms / 1000)} s`)), ms); })]).finally(() => clearTimeout(timer));
};

// **And the run as a whole has a deadline** (09-23). The coordinator's first
// three-engine run on the integrated tree failed its three long Firefox
// scenarios on their 300 s deadlines, twice each, and then sat idle for hours
// holding the port with a headless Firefox until it was killed: the minute
// after the scenarios asked a wedged page `evaluate`, `mouse.click` and
// `silentOutput` with no bound on any of them. Every await of the minute is
// bounded now, and under all of it is this: a run that outlives what its own
// deadlines add up to fails, names where it was, and exits non-zero. A suite
// that cannot finish is a failure, never an idle process. (What it adds up to
// is the serial sum even when four run at once: a ceiling that is loose by
// the parallelism is still a ceiling, and a tight one would be a new flake.)
const WHERE = new Set(['starting']);
const RUN_CEILING = +arg('run-deadline', 0) || null;
const stuck = (e) => /Timeout|timed out|did not answer|has been closed|Target (page|closed)|crashed/i.test(e.message || '');

{
  // What the run's own deadlines add up to, per engine: every scenario at its
  // deadline three times (a go, a relaunched go and the rerun alone), every relaunch, and the minute.
  const perEngine = RUN.reduce((a, s) => a + 3 * Math.min(s.deadline || DEFAULT_DEADLINE, DEADLINE_CAP), 0)
    + MAX_RELAUNCH * (NAV_TIMEOUT + 20000) + SECONDS * 1000 + 6 * NAV_TIMEOUT;
  const ceiling = RUN_CEILING || perEngine * BROWSERS.length;
  setTimeout(() => {
    console.log(`FAIL  the run did not finish inside ${Math.round(ceiling / 1000)} s, what its own deadlines add up to; it was at ${[...WHERE].join(' and ')}`);
    process.exit(1);
  }, ceiling);
}

// **And closing is bounded too.** MEASURED, 09-19: a Firefox that has stopped
// answering does not answer `browser.close()` either — the first run of this
// fix retired one, waited on the close and never came back, with the retired
// process still alive twenty minutes later. A browser that will not shut is
// abandoned rather than waited on; playwright kills what it spawned when node
// exits, so the cost is one idle process for the rest of the run, and the
// alternative is a suite that hangs on the way out of the fault it is
// recovering from. A context is closed under the same bound.
const CLOSE_DEADLINE = 15000;
const shut = async (thing, what) => {
  if (!thing) return;
  let done = false;
  try {
    await Promise.race([thing.close().then(() => { done = true; }), new Promise((r) => setTimeout(r, CLOSE_DEADLINE))]);
  } catch (e) { done = true; /* already gone */ }
  if (!done) console.log(`note  ${what} did not shut inside ${CLOSE_DEADLINE / 1000} s; abandoned`);
};

// A page on the built site, up and drawn: every navigation is bounded, because
// a navigation is where a stuck browser shows itself first, and one that passes
// its bound retires the browser rather than only the scenario.
const openAt = async (page, extra, settle = 600) => {
  await page.goto(pageUrl(extra), { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });
  await page.waitForFunction(() => window.ring && window.deepHouse, { timeout: 20000 });
  // the opening draws the ring in for a second and a bit from a steady page (smooth-motion); a row starts on the ring
  // as it stands after it
  await page.waitForFunction(() => !(window.ring.opening && window.ring.opening()), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(settle);
};

for (const name of pw ? BROWSERS : []) {
  const engine = pw[name];
  if (!engine) { skip(`${name} is not a browser playwright knows`); continue; }
  let relaunches = 0;
  // **Firefox runs its own short list** (round test-sane): the rows marked `firefox: true`, and the minute.
  const ROWS = name === 'firefox' ? RUN.filter((s) => s.firefox) : RUN;
  // **The cliff** (round test-sane; the 11-05 night: three wedged rows spent the relaunch budget inside the first hour,
  // the dead browser was kept, and 272 rows then failed in 0.0 s on "browser has been closed"). A stuck browser is
  // retired every time; three rows in a row that end stuck end the engine's leg, and what is left is skipped by name.
  let stuckRun = 0;
  let abandoned = null;
  const STUCK_ROWS = 3;

  // **A worker is a browser, and a scenario is a context in it.** The browser
  // is disposable — a stuck one is retired and made again between two rows —
  // and a context is made for every row and closed after it, so what a row
  // finds is the page as a listener first opens it: its own storage (a
  // context's localStorage is its own), its own audio context and its own
  // journal. The launch is checked once before the queue starts, so an engine
  // that is not installed is one skip and not a failure per row.
  const makeWorker = (w) => {
    let browser = null;
    const tag = jobsFor(name) > 1 ? `${name}#${w + 1}` : name;
    const launch = async () => { browser = await engine.launch(launchOptions(name)); };
    const retire = async () => { const b = browser; browser = null; await shut(b, tag); };
    // One go of one row in a fresh context: what the judge said, or a throw.
    const go = async (s) => {
      if (!browser) await launch();
      // a row may name the browser's language (`locale`, round japanese): the page hears it as `navigator.languages`
      const context = await inTime(browser.newContext({ viewport: { width: 390, height: 844 }, ...(s.locale ? { locale: s.locale } : {}) }), `${s.name} (a fresh context)`, NAV_TIMEOUT);
      const errors = [];
      try {
        // Before the page's own script, so it sees every edge the graph makes
        // and every message the limiter's worklet sends.
        await context.addInitScript(EDGE_TRACKER);
        const page = await context.newPage();
        page.on('console', (m) => {
          const type = m.type();
          if (CONSOLE) console.log(`  [${tag} ${((Date.now() - T0) / 1000).toFixed(1)} s ${type}] ${m.text().slice(0, 300)}`);
          if (type === 'error') errors.push(m.text());
        });
        page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
        // A scenario that needs the page opened differently says so in its
        // `query`: the latency hint is read once, when the context is made,
        // so a deep buffer cannot be asked for from inside a page already
        // running on a shallow one. Every other row opens the plain page.
        await openAt(page, s.query || '');
        const deadline = deadlineOf(s, name);
        const setup = s.setup ? s.setup() : null;
        if (setup) await inTime(page.evaluate((v) => { window.__setup = v; }, setup), `${s.name} (setup)`, NAV_TIMEOUT);
        // **A scenario has a deadline on this side too.** Every await inside a
        // scenario is bounded since round K6, and this is the second net under
        // that: Playwright's `evaluate` has no timeout of its own, so a page
        // that stops answering for a reason no scenario can see would hold the
        // suite for as long as somebody let it — K5a watched exactly that for
        // 737 seconds. And the deadline is the scenario's own (`TODO.md`,
        // 09-19): a row that knows it is long says so (`deadline`), and
        // `--deadline` is what the rest get.
        const raw = await inTime(s.drive ? s.drive(page, setup) : page.evaluate(s.page), s.name, deadline);
        let r = s.judge(raw, setup);
        // A scenario marked `quiet` is held to a console with no error in it
        // from its own load on: a bad link's page has to come up refusing out
        // loud and not as an exception somebody decided was correct.
        if (s.quiet && errors.length) r = { ok: false, why: `${errors.length} console errors, the first: ${errors[0].slice(0, 120)}` };
        return r;
      } finally {
        // Whatever it was doing, it is not doing it any more: the context goes,
        // and its page, its audio and its storage with it.
        await shut(context, `${tag} · ${s.name} (its context)`);
      }
    };
    return {
      tag,
      launch,
      close: retire,
      // `again`: the rerun of a row red in the queue, alone and in a browser made for it
      async run(s, again = false) {
        const at = Date.now();
        const where = `${tag} · ${s.name}`;
        WHERE.add(where);
        if (again) await retire();
        let r = null;
        let retried = '';
        let wasStuck = false;
        // Two goes at the most, and the second only in a browser that has
        // just been made: a fault the page can see is a failure, and a browser
        // that has stopped answering is not the page's fault and is not
        // evidence. A stuck browser is retired whether or not a second go is
        // left, so the row after it never meets a closed one.
        for (let n = 0; n < 2 && !r; n++) {
          try {
            r = await go(s);
            wasStuck = false;
          } catch (e) {
            const why = e.message.split('\n')[0].slice(0, 160);
            wasStuck = stuck(e);
            if (wasStuck) await retire();
            if (n === 0 && wasStuck && relaunches < MAX_RELAUNCH) {
              relaunches += 1;
              retried = why;
              console.log(`retry ${tag} · ${s.name}: ${why} — a fresh browser (${relaunches} of ${MAX_RELAUNCH})`);
              continue;
            }
            r = { ok: false, why };
          }
        }
        WHERE.delete(where);
        if (!again) {
          stuckRun = wasStuck ? stuckRun + 1 : 0;
          if (stuckRun >= STUCK_ROWS && !abandoned) abandoned = `${STUCK_ROWS} rows in a row found the browser stuck, the last ${s.name}`;
        }
        const ms = Date.now() - at;
        const relaunched = retried ? ` [after a relaunch: ${retried}]` : '';
        const said = r.ok ? (r.note || r.why) : r.why;
        // a measurement is read, never tripped: its line says what it read, green or not
        const tagOf = s.measure ? 'meas ' : r.ok ? (again ? 'flaky' : 'ok   ') : again || !RERUN ? 'FAIL ' : 'red  ';
        return { ok: r.ok, ms, measure: !!s.measure, line: `${tagOf} ${name} · ${s.name}: ${s.measure && !r.ok ? `(over its budget) ${said}` : said} (${(ms / 1000).toFixed(1)} s)${relaunched}` };
      },
    };
  };

  // The queue: every row that may share the machine first, then the `serial`
  // ones alone, each list in the file's order. Lines are printed in that order
  // as soon as every row before them has answered, so a log is the same log
  // whatever finished first.
  const order = [...ROWS.filter((s) => !s.serial), ...ROWS.filter((s) => s.serial)];
  const shared = order.length - ROWS.filter((s) => s.serial).length;
  const workers = Array.from({ length: Math.max(1, Math.min(jobsFor(name), shared || 1)) }, (_, w) => makeWorker(w));
  if (!order.length) { console.log(`note  ${name}: no row of this run is ${name}'s`); }
  try {
    await workers[0].launch();
  } catch (e) {
    skip(`${name} is not installed (${e.message.split('\n')[0].slice(0, 80)})`);
    continue;
  }
  // **The long rows are handed out first** (09-24). A queue taken in the
  // file's order put the beat's minute and a half at row sixty-five, so the
  // other three browsers had run dry long before it finished; taken longest
  // first, the short rows fill in round the long ones. A row's own deadline is
  // what says it is long — the rows that wait out seams name five minutes —
  // and the file's order breaks the ties, so the hand-out is the same every
  // run. It changes only who runs what when: the lines are still printed in
  // the file's order.
  const rank = order.slice(0, shared).map((s, i) => i)
    .sort((a, b) => (order[b].deadline || DEFAULT_DEADLINE) - (order[a].deadline || DEFAULT_DEADLINE) || a - b);
  const results = new Array(order.length);
  let printed = 0;
  const reds = [];
  const flush = () => {
    while (printed < order.length && results[printed]) {
      const i = printed++;
      const x = results[i];
      console.log(x.line);
      if (x.skipped) continue;
      if (!x.ok && !x.measure) { if (RERUN) reds.push(i); else failed++; }
    }
  };
  const skipRow = (s) => ({ ok: false, ms: 0, skipped: true, line: `skip  ${name} · ${s.name}: not run, the leg ended (${abandoned})` });
  const began = Date.now();
  let next = 0;
  await Promise.all(workers.map(async (wk) => {
    while (next < shared) {
      const i = rank[next++];
      results[i] = abandoned ? skipRow(order[i]) : await wk.run(order[i]);
      flush();
    }
  }));
  for (const wk of workers.slice(1)) await wk.close();
  for (let i = shared; i < order.length; i++) { results[i] = abandoned ? skipRow(order[i]) : await workers[0].run(order[i]); flush(); }
  // **The reds again, alone** (round test-sane: the morning triage, done here). Each in a browser of its own, one at a
  // time, after the rest: red twice is `FAIL`, green alone is `flaky`.
  let flaky = 0, unrun = 0;
  const rerunAt = Date.now();
  for (const i of reds) {
    // (a row red in a leg that ended is not evidence twice over: a skip, which still ends the run non-zero)
    if (abandoned) { console.log(`skip  ${name} · ${order[i].name}: red in the queue, and not rerun (the leg ended: ${abandoned})`); unrun++; continue; }
    const x = await workers[0].run(order[i], true);
    console.log(x.line);
    if (x.ok) flaky++; else failed++;
  }
  await workers[0].close();
  const skippedRows = results.filter((x) => x && x.skipped).length + unrun;
  if (skippedRows) skip(`${name}: ${skippedRows} rows not run or not rerun (${abandoned})`);
  if (order.length) {
    // What each area cost, summed over its rows (a row of two areas counted in
    // its first), and what the whole took on the wall: the second is what four
    // at a time buys.
    const byArea = {};
    order.forEach((s, i) => { const a = areasOf(s)[0]; byArea[a] = (byArea[a] || 0) + results[i].ms; });
    console.log(`time  ${name}: ${order.length} scenarios in ${((Date.now() - began) / 1000).toFixed(0)} s on the wall, ${workers.length} at a time`
      + `${order.length > shared ? ` and ${order.length - shared} alone` : ''}${reds.length ? `, ${reds.length} rerun alone in ${((Date.now() - rerunAt) / 1000).toFixed(0)} s (${flaky} flaky)` : ''}`
      + `${TIER ? `; tier ${TIER}` : ''}; by area, summed: `
      + Object.entries(byArea).map(([a, ms]) => `${a} ${(ms / 1000).toFixed(0)} s`).join(', '));
  }

  if (!MINUTE_IN.includes(name)) continue;

  // --- and then the minute ------------------------------------------------
  // In a browser of its own, after every scenario has finished, so nothing
  // else is asking the machine for anything while it is timed. Every await in
  // it is bounded: a page that has stopped answering is a failure of the
  // minute and not a run that never ends (see `inTime`).
  WHERE.add(`${name} · the minute`);
  let browser = null;
  try {
    browser = await engine.launch(launchOptions(name));
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(EDGE_TRACKER);
    const page = await context.newPage();
    const errors = [];
    const warnings = [];
    page.on('console', (m) => {
      const type = m.type();
      if (CONSOLE) console.log(`  [${name} ${((Date.now() - T0) / 1000).toFixed(1)} s ${type}] ${m.text().slice(0, 300)}`);
      if (type === 'error') errors.push(m.text());
      else if (type === 'warning') warnings.push(m.text());
    });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const MINUTE_BOUND = NAV_TIMEOUT;
    await openAt(page, '', 1200);
    errors.length = 0;
    warnings.length = 0;
    const vp = page.viewportSize();
    await inTime(page.mouse.click(vp.width / 2, vp.height / 2), 'the minute (the press that starts it)', MINUTE_BOUND);
    await page.waitForFunction(() => window.ring.control.playing, { timeout: 10000 });
    // The set is up: now the page can be asked, itself, where it is going.
    const quiet = await inTime(silentOutput(page), 'the minute (is it silent)', MINUTE_BOUND);
    if (!quiet.ok) {
      await inTime(page.evaluate(() => window.ring.control.stop()), 'the minute (stop)', MINUTE_BOUND);
      failed++;
      console.log(`FAIL  ${name}: the minute would have been heard — ${quiet.why}`);
    } else {
      await page.waitForTimeout(SECONDS * 1000);
      const r = await inTime(page.evaluate(() => {
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
      }), 'the minute (its readings)', MINUTE_BOUND);
      await inTime(page.evaluate(() => window.ring.control.stop()), 'the minute (stop)', MINUTE_BOUND);
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
    }
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}: ${e.message.split('\n')[0].slice(0, 120)}`);
  }
  await shut(browser, `${name} (the minute)`);
  WHERE.delete(`${name} · the minute`);
}
server.close();
finish({ failed, skipped });
