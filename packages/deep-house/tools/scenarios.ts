// The transport, driven. One named scenario per rule the review's probes were
// written to reproduce, each run against the built page in a real engine, each
// a line that says ok or says what it found.
//
// These were scripts under tmp/check/ — transport.mjs, resume-blend.mjs,
// cut-latency.mjs, worklet.mjs, star.mjs — run once by hand against a server
// over src/, and then remembered. A rule nobody runs is not a rule, so they
// live here now and run with the suite.
//
// They drive the *built* page, which is one bundle: there is no `import
// '/src/mix.ts'` to reach for, so everything is asked of `window.ring.control`
// and `window.deepHouse`. Two things change because of that and are said out
// loud rather than glossed:
//
//   the worklet is not instrumented. `tmp/check/worklet.mjs` put a counter in
//   the processor's first line through a flag file the dev server read. What
//   the built page offers instead is better in one way and weaker in another:
//   the limiter already posts its gain reduction every eighth of a second
//   *while it is processing*, so a stopped set that goes on being processed
//   goes on posting, and a stopped set that has finished falls silent. That is
//   the fault (finding 04) read off the processor's own traffic.
//
//   there is no live parameter table to reach for any more.
//   `tmp/check/transport.mjs` read `PARAMS.kick.startHz` inside a patched
//   voice; round C removed the table, so what a scenario asks for instead is
//   the value itself — `deepHouse.settingsOf(track)` for the room a plan is
//   played in and `mix.masterSettings` for the room a set's master is in —
//   with the live evidence beside it that nothing was disturbed: no late note,
//   no deck event failed, no tick threw.
//
// Every scenario returns `{ ok, why }` and, when it passes, a short `note`
// worth printing. Nothing here opens a browser or decides what to do about a
// failure: that is tools/test-browsers.ts.

import { setLayout } from './setplan.ts';
// The composer's own planner, for a scenario that has to know what a theme is
// drawn as before the page is asked what it drew.
import { planTheme } from '../src/mix.ts';
// The colour the ring derives, worked out here as well as in the page: a
// scenario that asserted only what the page told it would pass whatever the
// page decided the colour was.
import { ringColour, mixHex, typeInk } from '../src/ring-colour.ts';
import { HOUSE, BIRD_CODE } from '../src/spell.ts';
// The glyphs as the page draws them, for a scenario that must tell two levels of
// one bird apart by their drawing and not only by their count of marks.
import fs from 'node:fs';
// (M10) the ledger is hidden for a viewer who has not chosen; the rows that
// read it, or the width it takes, open the view as a viewer who chose it shown
const LEDGER_SHOWN = `try { localStorage.setItem('deep-house.machine.ledger', 'shown'); } catch (e) { /* nothing kept */ }`;
const GLYPH_ROWS = JSON.parse(fs.readFileSync(new URL('../src/bird-glyphs.json', import.meta.url), 'utf8')).birds;
// **At the node's radius the page drew it at.** Since round K3 a bird's node
// is a control whose radius follows the ring's square (`ctrlR`: 35 ring units,
// a third bigger on a small square), and a glyph is scaled by that radius — so
// a page reports the radius its cell was drawn at and the judge scales the
// data by the same one, as bird-glyph.ts does (`R · 1.7 / 13`).
const drawnAt = (bird, level, R) => {
  const S = (R * 1.7) / 13;
  const row = GLYPH_ROWS.find((b) => b.bird === bird);
  return (level == null ? row.marks : row.variants.find((v) => v.level === level).marks)
    .filter((m) => m.fill !== 'ink')
    .map((m) => m.d.replace(/-?\d*\.?\d+(?:e-?\d+)?/g, (n) => String(+(+n * S).toFixed(2)))).join(';');
};

// What a page-side scenario is handed, and what it is allowed to use. Written
// as one string injected into the page rather than as functions per scenario,
// because Playwright serialises a function without its closure.
const HELPERS = `
  const ctl = window.ring.control;
  // **A line a second, so the page stays awake.** Headless Firefox parks a page
  // nothing is asking anything of: \`requestAnimationFrame\` stops firing, and
  // when it does \`setTimeout\` has stopped with it — so the three ring
  // scenarios that wait on a frame never return, and the deadlines below cannot
  // save them either, because a deadline is a timer. Measured on *the star
  // never leaves twenty degrees of north*: without this it does not answer in
  // ninety seconds and with it, it answers in nine. What wakes the page is a
  // console line going out over the protocol — a silent interval of the same
  // period does not, nor does an \`evaluate\` poked in from node — so this is a
  // \`console.log\` on purpose and not a leftover. It is cleared in the
  // \`finally\` of every scenario body, so nothing is left running for the next.
  const __awake = setInterval(() => console.log('scenario awake'), 1000);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, ms) => {
    const until = performance.now() + ms;
    while (performance.now() < until) { if (fn()) return true; await sleep(30); }
    return false;
  };
  const el = (id) => document.getElementById(id);
  const box = (id) => el(id).getBoundingClientRect();
  const pev = (type, x, y, id) => new PointerEvent(type, { bubbles: true, pointerId: id, clientX: x, clientY: y });
  const onRing = (frac, angle) => {
    const r = box('tilt');
    return { x: r.x + r.width / 2 + Math.sin(angle) * r.width * frac, y: r.y + r.height / 2 - Math.cos(angle) * r.height * frac };
  };
  const starAngle = () => {
    const s = el('star');
    const m = s && /rotate\\(([-\\d.]+)deg\\)/.exec(s.style.transform || '');
    return m ? +m[1] : null;
  };
  // **Every await of the transport, and of the browser's own frame clock, has a
  // deadline.** Round K5a found an unbounded \`await ctl.start()\` hang Firefox
  // for twenty minutes and bounded that one call; round K6 found the same hole
  // in \`frame()\` — headless Firefox stops servicing \`requestAnimationFrame\` on
  // a page it has decided nobody is looking at, so a scenario that awaits forty
  // frames waits for ever — and bounded the rest.
  //
  // A scenario that does not settle is a suite that does not end, and a suite
  // that does not end is worse than a failing one: it has to be found and
  // killed by a hand, and it says nothing at all. So the deadline is stated,
  // and a call that passes it hands control back rather than holding it: the
  // scenario goes on to read what it can see and its own judge says what was
  // wrong with it.
  const DEADLINE = 15000;
  const bounded = (p, ms = DEADLINE) => Promise.race([Promise.resolve(p).catch(() => {}), sleep(ms)]);
  const started = (ms = DEADLINE) => bounded(ctl.start(), ms);
  const frame = (ms = 500) => Promise.race([new Promise((r) => requestAnimationFrame(() => r())), sleep(ms)]);
`;

// The decks are the nodes that connect to the mix's sum, so the faders are the
// decks. Installed before the page's own script so it sees every edge.
export const EDGE_TRACKER = `
window.__edges = [];
(() => {
  const connect = AudioNode.prototype.connect;
  const disconnect = AudioNode.prototype.disconnect;
  AudioNode.prototype.connect = function (d, ...r) {
    if (d && d.context) window.__edges.push([this, d]);
    return connect.call(this, d, ...r);
  };
  AudioNode.prototype.disconnect = function (...a) {
    window.__edges = window.__edges.filter((e) => e[0] !== this);
    return disconnect.apply(this, a);
  };
  window.__faders = (sum) => window.__edges.filter((e) => e[1] === sum).map((e) => e[0]);
  // Every post the master limiter makes, with the time it arrived: the
  // processor sends one about every eighth of a second for as long as it is
  // being processed, and stops when it has written out its tail and finished.
  window.__limiterPosts = [];
  window.__worklets = 0;
  const Orig = window.AudioWorkletNode;
  window.AudioWorkletNode = class extends Orig {
    constructor(...a) {
      super(...a);
      const me = window.__worklets++;
      this.port.addEventListener('message', (e) => {
        if (e.data && typeof e.data.reduction === 'number') window.__limiterPosts.push({ node: me, at: performance.now() });
      });
      this.port.start();
    }
  };
})();
`;

// Playwright evaluates a string as an *expression*, so a scenario is an
// immediately-invoked async function and not a function it would have to call.
// Playwright evaluates a string as an *expression*, so a scenario is an
// immediately-invoked async function and not a function it would have to call —
// and its body is wrapped so the keep-alive above is cleared however it ends.
const body = (src) => `(async () => { ${HELPERS} try { ${src} } finally { clearInterval(__awake); } })()`;

// **A second page on this browser's storage**, opened on a search string of
// its own: what a home-screen app is when it launches from the manifest's
// `start_url` (`.`, a bare address) — the page does not read `display-mode`,
// so the bare address is the whole of the difference. Kept silent.
const SECOND_PAGE = `
  const secondPage = async (search) => {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-9999px;width:400px;height:800px;border:0';
    f.src = location.pathname + search;
    document.body.appendChild(f);
    const up = await waitFor(() => { try { return !!(f.contentWindow && f.contentWindow.ring); } catch (e) { return false; } }, 25000);
    if (!up) { f.remove(); return null; }
    await sleep(400);
    const w = f.contentWindow, c = w.ring.control, q = c.readout();
    const out = {
      seed: q.seed, theme: c.state.themeIndex, strategy: q.strategy, spell: q.spell ? JSON.stringify(q.spell) : null,
      recipe: q.recipe, accompaniment: c.link.read().accompaniment, development: c.link.read().development,
      held: w.ring.cells().filter((x) => x.held).map((x) => x.bird).sort().join(','),
      url: w.location.search, problems: c.linkProblems.map((p) => p.param), position: c.state.position, preset: c.state.preset,
    };
    f.remove();
    return out;
  };
  const STORE = 'deep-house.player', JOURNAL = 'deep-house.journal';
`;


// What a hand on a cell does, as events: the helpers the step 5 scenarios
// share. See the note beside them, at the foot of this file.
const PULL = `
  const cellBox = (i) => document.querySelectorAll('#starCells g.cell')[i].getBoundingClientRect();
  const tilt = () => box('tilt');
  // a point on a cell's own spoke, at a radius in the ring's thousand units
  const spoke = (i, rad) => {
    const b = tilt();
    const a = (i / 8) * Math.PI * 2;
    return { x: b.x + b.width / 2 + Math.sin(a) * b.width * (rad / 1000),
             y: b.y + b.height / 2 - Math.cos(a) * b.height * (rad / 1000) };
  };
  const hand = (type, p, target, opt = {}) => target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, pointerId: 9, clientX: p.x, clientY: p.y, pointerType: 'mouse', ...opt,
  }));
  const cells = () => window.ring.cells();
  // **A hand asks for a value, and the bird stands under the hand** (round
  // K8): the node moves one unit for one with the hand along its spoke, so a
  // scenario says which value it wants and this asks the page which radius
  // that value is drawn at. (\`travelUnits\` is a long walk for a scenario that
  // wants to reach an end: past it the node stops at the end.)
  const travelUnits = () => 316 / 3;
  const travelOf = (i, v) => window.ring.radiusAt(i, Math.min(1, Math.max(0, v)));
  // press on the node where it stands, walk out (or in) along the spoke, let go
  const pullTo = async (i, want, watch, steps = 6, pause = 25) => {
    const from = cells()[i].radius * 316;
    const d = travelOf(i, want) - travelOf(i, cells()[i].value);
    const way = Math.sign(d) || 1;
    hand('pointerdown', spoke(i, from), el('tilt'));
    await sleep(30);
    // The first move is the four screen pixels that tell a pull from a press,
    // and the travel is measured from where it lands rather than from the
    // press — so this arms the pull and everything after it is the distance.
    // (eight units or six screen pixels, whichever is more: past the slop on any square)
    const w = document.getElementById('star').getBoundingClientRect().width || 1000;
    const base = from + way * Math.max(8, 6 / (w / 1000));
    hand('pointermove', spoke(i, base), window);
    await sleep(25);
    const seen = [];
    for (let k = 1; k <= steps; k++) {
      hand('pointermove', spoke(i, base + (d * k) / steps), window);
      await sleep(pause);
      if (watch) seen.push(watch());
    }
    hand('pointerup', spoke(i, base + d), window);
    await sleep(140);
    return seen;
  };
  const heldNow = () => cells().filter((c) => c.held).map((c) => ({ bird: c.bird, value: c.value }));
`;

// **The areas** (09-24): every row names one, so a change runs the rows of the
// part of the page it touched (`--area ring`) in a minute or two, and the whole
// set is the batch's gate — Eugene's fast gates per change and the full
// battery per batch, as a flag. The runner refuses a row whose area is not one
// of these, so a new row cannot fall outside every filter.
export const AREAS = {
  transport: 'the machine keeps time: start, stop, pause, seek, skip, cut, a blend, the late counter, the element path, the rooms',
  seam: 'a hand-over a hand asked for: a cast, a spell or a pull landing on the phrase line, the engine switch, the fill, a reset',
  journal: 'the walk back and forward, and what an arrival writes',
  link: 'the address and the store: link rows, a reload, a stored place, a bad link',
  ring: 'the face: colour, type, the name, the star and its sway, the pulse, the beat, a throw, the cursor, the keys, reduced motion, the frame budget',
  birds: 'a hand on a bird: pull, drag, drop, hold, release, click, long press, its size',
  words: "a bird's words and its explanation: where they stand, and that they hold",
  glyphs: "a bird's drawing, at each level and through a seam",
  panel: "the phone panel: a finger's Less and More, and the keys' percents",
  view: 'the machine view: its lanes, the ledger, the mixer, the flip, the export, the focus',
  recipe: 'a recipe: what it rolls, and what a held bird and the die plan under it',
};

// Each scenario: a name, the area it belongs to, the source of an async
// function evaluated in the page, and a judge that turns what comes back into
// a pass or a failure. `setup` is what the node side works out first and hands
// over. Every row runs in a page of its own, opened fresh on its `query` (or
// the plain page), with storage nobody else has written: it may assume
// nothing of any other row, and nothing it leaves reaches one.
// **The seam's tempo, measured from the page** (the fault pass of 09-24,
// `seamTempo` in src/performance.ts): a move is asked, and the page reads the
// hand-over it armed, the tempo the grid counts at when the arriving theme's
// first note sounds, how many of its beats the grid carries, when the readout's
// tempo is the arriving theme's own, and what `settleIn` promised at the ask.
// With `kicks`, every kick the set fires is timed, off the voice registry both
// engines look a voice up in at fire time.
const SEAM_TEMPO = `
  const measureSeam = async (go, { kicks = false, most = 240000 } = {}) => {
    const c = ctl.state.ctx;
    const dh = window.deepHouse;
    const fired = [];
    const realKick = dh.voices.kick;
    if (kicks) dh.voices.kick = (a, b, time, p, st) => { fired.push(time); return realKick(a, b, time, p, st); };
    const first = ctl.mix.record;
    const clock = first.clock;
    const heard = (t, per) => (60 / clock.spbAt(clock.beatAt(t))) * per;
    const t0 = c.currentTime;
    const from = heard(t0, first.perBeat ?? 1);
    const bpm0 = ctl.readout().bpm;
    go();
    const armed = await waitFor(() => ctl.state.cut && ctl.state.cut.at > t0, 20000);
    if (!armed) { if (kicks) dh.voices.kick = realKick; return { noSeam: true }; }
    const cut = { ...ctl.state.cut };
    await sleep(150);
    const said = c.currentTime + ctl.readout().mix.settleIn;
    let reached = -1, ridden = null;
    const until = performance.now() + most;
    while (performance.now() < until) {
      const r = ctl.readout();
      if (ridden == null && c.currentTime >= cut.at - 0.05 && c.currentTime < cut.at + 0.3) ridden = r.gridBpm;
      if (ctl.mix.record !== first && r.bpm !== bpm0 && Math.abs(r.gridBpm - r.bpm) < 0.1) { reached = c.currentTime; break; }
      await sleep(100);
    }
    const record = ctl.mix.record;
    const per = record.perBeat ?? 1;
    const out = {
      // the arriving theme's beats to one of the outgoing theme's, on the grid
      from, own: 60 / record.program.beat, per: per / (first.perBeat ?? 1), firstNote: heard(cut.at + 1e-3, per), ridden,
      askToSeam: cut.at - t0, crossover: cut.end - cut.at, swap: cut.swapAt - t0, end: cut.end - t0,
      said: said - t0, reached: reached < 0 ? null : reached - t0, bar: 240 / (60 / record.program.beat),
      kicks: fired.map((t) => +(t - t0).toFixed(3)).sort((a, b) => a - b),
    };
    if (kicks) dh.voices.kick = realKick;
    return out;
  };
`;

export const SCENARIOS = [
  {
    name: 'a stop inside a start leaves nothing playing',
    area: 'transport',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // Finding 01. Every startup takes a generation token and every
    // continuation after an await asks whether it is still the one that was
    // asked for; a superseded mix is stopped rather than left playing with
    // nobody holding it.
    page: body(`
      const starting = ctl.start();
      await sleep(30);
      ctl.stop();
      const atStop = { playing: ctl.playing, mix: !!ctl.mix };
      await bounded(starting);
      await sleep(600);
      const after = { playing: ctl.playing, mix: !!ctl.mix, starting: ctl.state.starting };
      ctl.stop();
      await sleep(300);
      return { atStop, after };
    `),
    judge: (r) => ({
      ok: !r.after.playing && !r.after.mix && !r.after.starting,
      why: `after the start settled: playing ${r.after.playing}, a mix ${r.after.mix}, still starting ${r.after.starting}`,
      note: 'the start that was cancelled mid-flight left no mix behind it',
    }),
  },

  {
    name: 'planning a theme while one plays leaves the playing one alone',
    area: 'transport',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // Finding 02. `generate()` applies a preset's params and then puts the
    // table back exactly as it found it, and every deck re-applies its own
    // before it builds, starts or schedules. What a built page can see is the
    // playing theme's own overrides — which carry both numbers the fault
    // moved, the kick's start pitch and the hat's lid — and the live evidence
    // that nothing was dropped while twelve other rooms were planned.
    page: body(`
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 0.5, 8000);
      const of = (t) => {
        const o = (t && t.paramOverrides) || {};
        return { startHz: o.kick && o.kick.startHz, lidHz: o.hats && o.hats.lidHz,
          trimDb: o.hats && o.hats.trimDb, preset: t && t.preset, bpm: t && t.bpm };
      };
      const read = () => ({
        held: of(ctl.track),
        fresh: of(window.deepHouse.planTheme(String(ctl.state.seed), ctl.state.themeIndex, {})),
        index: ctl.mix.state.theme.index, bpm: ctl.mix.state.theme.bpm,
      });
      const before = read();
      const lateBefore = window.deepHouse.late.count;
      const planned = [];
      for (let i = 0; i < 12; i++) {
        const t = window.deepHouse.planTheme(String(7000 + i), i % 3, { preset: i % 2 ? 'growl' : 'sub' });
        planned.push(t.preset);
        window.deepHouse.generate({ seed: 7000 + i, minutes: 1, preset: i % 2 ? 'growl' : 'sub' });
      }
      await sleep(2500);
      const after = read();
      const s = ctl.mix.state;
      const out = { before, after, planned: planned.length,
        rooms: [...new Set(planned)].join('+'),
        late: window.deepHouse.late.count - lateBefore,
        deckFailed: (s.deckFailed ?? s.failed) ?? 0, ticksFailed: s.ticksFailed ?? 0 };
      ctl.stop();
      await sleep(400);
      return out;
    `),
    judge: (r) => {
      const key = (x) => JSON.stringify([x.startHz, x.lidHz, x.trimDb, x.preset, x.bpm]);
      const named = key(r.before.held) !== 'null' && r.before.held.startHz != null && r.before.held.lidHz != null;
      const same = key(r.before.held) === key(r.after.held)
        && key(r.after.held) === key(r.after.fresh)
        && r.before.index === r.after.index && r.before.bpm === r.after.bpm;
      return {
        ok: named && same && !r.late && !r.deckFailed && !r.ticksFailed,
        why: !named ? `the playing theme names no kick pitch or hat lid to watch: ${JSON.stringify(r.before.held)}`
          : !same ? `the playing theme was ${key(r.before.held)} and is now ${key(r.after.held)}, against ${key(r.after.fresh)} planned fresh`
          : `${r.late} late notes, ${r.deckFailed} deck events failed and ${r.ticksFailed} ticks threw while ${r.planned} themes were planned`,
        note: `${r.planned} themes planned and generated in ${r.rooms} rooms: the playing theme held its kick at ${r.after.held.startHz} Hz, its hat lid at ${r.after.held.lidHz} Hz and its hat trim at ${r.after.held.trimDb} dB, a fresh plan of it agrees, and nothing was reached late`,
      };
    },
  },

  {
    name: 'an offline render while a set plays is its own room',
    area: 'transport',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // Finding 02's other half, and round C's. `renderTrack()` used to apply a
    // preset to the shared table, await the worklet's module and the voices'
    // preparation, and apply it twice more — because across either await the
    // live set or another render owned that table. Each now resolves its own
    // frozen settings before the first await and hands that value down, so a
    // render started in the other room while a set plays is that room all the
    // way through and the set is still in its own.
    page: body(`
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 0.5, 8000);
      const room = (t) => {
        const s = window.deepHouse.settingsOf(t);
        return { startHz: s.kick.startHz, lidHz: +s.hats.lidHz.toFixed(4),
          duckDb: s.sidechain.depthDb, subDb: s.levels.sub, trimDb: +(s.hats.trimDb ?? 0).toFixed(4) };
      };
      const before = room(ctl.track);
      const lateBefore = window.deepHouse.late.count;
      // Four bars of the *other* room, rendered offline while the set plays.
      const other = ctl.track.preset === 'growl' ? 'sub' : 'growl';
      const track = window.deepHouse.generate({ seed: 4242, minutes: 1, preset: other });
      const t1 = 4 * track.barSeconds;
      const slice = { ...track, duration: t1 + 1, events: track.events.filter((e) => e.t < t1) };
      const rendered = room(slice);
      const buf = await window.deepHouse.renderTrack(slice, { sampleRate: 22050 });
      const after = room(ctl.track);
      const s = ctl.mix.state;
      const out = { before, after, rendered, other, playing: ctl.track.preset,
        seconds: +buf.duration.toFixed(2), rms: (() => {
          const d = buf.getChannelData(0); let a = 0;
          for (let i = 0; i < d.length; i++) a += d[i] * d[i];
          return +Math.sqrt(a / d.length).toFixed(5);
        })(),
        late: window.deepHouse.late.count - lateBefore,
        running: !!ctl.playing, index: s.themeIndex, elapsed: s.elapsed,
        deckFailed: (s.deckFailed ?? s.failed) ?? 0, ticksFailed: s.ticksFailed ?? 0 };
      ctl.stop();
      await sleep(400);
      return out;
    `),
    judge: (r) => {
      const key = (x) => JSON.stringify([x.startHz, x.lidHz, x.duckDb, x.subDb, x.trimDb]);
      const held = key(r.before) === key(r.after);
      // The render has to be in a *different* room, or the check proves nothing.
      const apart = key(r.rendered) !== key(r.before);
      // Deliberately **not** a deadline test, unlike its neighbours. Building
      // and scheduling ten seconds of offline audio is main-thread work and the
      // live scheduler's reach is 120 ms, so a handful of notes are reached
      // late and always were; that is the cost of rendering in the page and it
      // is finding 08's territory, not this one's. What must hold here is that
      // the set went on playing its own room and nothing threw — the late count
      // is printed so a change in it is visible.
      return {
        ok: held && apart && r.rms > 0 && r.running && !r.deckFailed && !r.ticksFailed,
        why: !apart ? `the render and the set were in the same room, so nothing was interleaved: ${key(r.before)}`
          : !held ? `the playing set was ${key(r.before)} and is now ${key(r.after)}`
          : `${r.rms} RMS over ${r.seconds} s, still playing ${r.running} at ${r.elapsed.toFixed(1)} s, ${r.deckFailed} deck events failed, ${r.ticksFailed} ticks threw`,
        note: `${r.seconds} s of ${r.other} rendered offline (kick ${r.rendered.startHz} Hz, lid ${r.rendered.lidHz}, RMS ${r.rms}) while a ${r.playing} set played on at kick ${r.after.startHz} Hz and lid ${r.after.lidHz}; ${r.late} notes reached late to the render's main-thread work, nothing thrown`,
      };
    },
  },

  {
    name: 'two sets in one context each keep their own master',
    area: 'transport',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // The review's initialisation half of finding 02: `createMix()` built its
    // shared master before selecting the first track, so its EQ depended on
    // whichever preset a previous planning operation had left behind. The set's
    // room is now resolved and held — `mix.masterSettings` — so two sets in one
    // audio context are two rooms and neither is the other's leftovers.
    page: body(`
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 0.5, 8000);
      const live = ctl.mix;
      const ctx = live.out.context;
      const silent = ctx.createGain();
      silent.gain.value = 0;
      silent.connect(ctx.destination);
      const of = (m) => ({ subDb: m.masterSettings.levels.sub, airDb: m.masterSettings.master.airDb,
        clap: m.masterSettings.clap.on, hatLid: m.masterSettings.hats.lidHz });
      const liveBefore = of(live);
      const held = () => { const s = window.deepHouse.settingsOf(ctl.track); return [s.kick.startHz, s.hats.lidHz]; };
      const deckBefore = held();
      const a = window.deepHouse.createMix(ctx, { masterSeed: 31, preset: 'sub', destination: silent, themeBars: 32 });
      const b = window.deepHouse.createMix(ctx, { masterSeed: 31, preset: 'growl', destination: silent, themeBars: 32 });
      const rooms = { a: of(a), b: of(b) };
      await bounded(a.start(0, 0));
      await bounded(b.start(0, 0));
      await sleep(1200);
      const out = {
        rooms, after: { a: of(a), b: of(b) },
        running: [a.state.running, b.state.running, ctl.mix === live && ctl.playing],
        presets: [a.state.theme.preset, b.state.theme.preset],
        liveBefore, liveAfter: of(live), deckBefore, deckAfter: held(),
        late: window.deepHouse.late.count,
      };
      a.stop();
      b.stop();
      ctl.stop();
      await sleep(600);
      return out;
    `),
    judge: (r) => {
      const k = (x) => JSON.stringify([x.subDb, x.airDb, x.clap, x.hatLid]);
      const apart = k(r.rooms.a) !== k(r.rooms.b);
      const steady = k(r.rooms.a) === k(r.after.a) && k(r.rooms.b) === k(r.after.b)
        && k(r.liveBefore) === k(r.liveAfter)
        && JSON.stringify(r.deckBefore) === JSON.stringify(r.deckAfter);
      return {
        ok: apart && steady && r.presets[0] === 'sub' && r.presets[1] === 'growl'
          && r.running[0] && r.running[1] && r.running[2],
        why: !apart ? `both masters resolved to the same room: ${k(r.rooms.a)}`
          : !steady ? `a master moved: ${k(r.rooms.a)}/${k(r.rooms.b)} became ${k(r.after.a)}/${k(r.after.b)}, the live set ${k(r.liveBefore)} became ${k(r.liveAfter)}`
          : `presets ${r.presets.join(' and ')}, running ${r.running.join('/')}`,
        note: `three sets in one context: two built after the live one, on ${r.rooms.a.airDb} dB of air with clap ${r.rooms.a.clap} and on ${r.rooms.b.airDb} dB with clap ${r.rooms.b.clap} — each master its own, none of them the last one planned. All three sit at ${r.rooms.a.subDb} dB of sub, which is the ceiling doing its job: both rooms ask for more than the base table plus 1.5 dB and both are held there`,
      };
    },
  },

  {
    name: 'a seek inside a hand-over keeps the theme and the clock running',
    area: 'transport',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // Finding 03. A seek cancels the hand-over in flight, lets the arriving
    // and retiring decks go, brings the sum out of its dip and lands one fresh
    // deck. What must not happen is the theme index turning over on its own or
    // the clock stopping.
    page: body(`
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 8000);
      ctl.skip();
      const inBlend = await waitFor(() => ctl.mix.state.transition > 0.02, 12000);
      const before = { index: ctl.mix.state.theme.index, elapsed: ctl.mix.state.elapsed, transition: ctl.mix.state.transition };
      const to = ctl.mix.state.elapsed + 20;
      ctl.seekTo(to / (ctl.track.bars * ctl.track.barSeconds), true);
      await sleep(1500);
      const after = { index: ctl.mix.state.theme.index, elapsed: ctl.mix.state.elapsed, transition: ctl.mix.state.transition, cut: !!ctl.state.cut };
      await sleep(900);
      const later = ctl.mix.state.elapsed;
      ctl.stop();
      await sleep(400);
      return { inBlend, before, after, later, sought: to };
    `),
    judge: (r) => ({
      ok: r.inBlend && r.after.index === r.before.index && !r.after.cut
        && Math.abs(r.after.elapsed - r.sought) < 2.5 && r.later > r.after.elapsed + 0.5,
      why: !r.inBlend ? 'the cut never opened a blend to seek inside'
        : `theme ${r.before.index} to ${r.after.index}, sought ${r.sought.toFixed(2)} s and landed at ${r.after.elapsed.toFixed(2)}, then ${r.later.toFixed(2)} a second later, cut still armed ${r.after.cut}`,
      note: `seeking ${(r.sought - r.before.elapsed).toFixed(1)} s on from inside a blend ${(r.before.transition * 100).toFixed(0)}% through it: the theme stayed ${r.after.index}, the cut was dropped, and the clock ran on`,
    }),
  },

  {
    name: 'a play inside a blend picks the blend up where it was',
    area: 'transport',
    // seed 1 by name, which the layout below is of: since K16 a bare page rolls its seed
    query: 'seed=1',
    // The rule the "the track cleared up to a simpler sound" report turned
    // into: a pause, a play or a reload inside a hand-over rebuilds that
    // hand-over at the stage it had reached, rather than dropping it and
    // re-arming it a dozen bars later. Two decks, the arriving one at its own
    // offset, and every curve joined at the value it had got to.
    setup: () => {
      // One minute of set is 32-bar themes, which puts the first hand-over
      // just under a minute in; the scenario seeks to the bar before it rather
      // than waiting for it.
      // The page plays house-v2 (a bare link does), and since round S4 its
      // seam is its own — a floor of 0.82 and a finer line — so the layout is
      // asked of house-v2 by name rather than of the default strategy.
      const L = setLayout(1, 2, { themeBars: 32, strategy: 'house-v2' });
      const s = L.seams[0];
      return { seamAt: s.at, blend: s.bars * s.barSeconds, swapIn: (s.swapAt - s.at), bars: L.plans[0].bars, barSeconds: s.barSeconds };
    },
    page: body(`
      const S = window.__setup;
      ctl.setMinutes(1);
      await sleep(200);
      const themeSeconds = ctl.track.bars * ctl.track.barSeconds;
      if (Math.abs(themeSeconds - S.bars * S.barSeconds) > 0.5)
        return { wrongPlan: { theme: themeSeconds, want: S.bars * S.barSeconds } };
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 0.5, 8000);
      ctl.seekTo((S.seamAt - 3) / themeSeconds, true);
      const reached = await waitFor(() => ctl.mix.state.transition > 0.02, 20000);
      await sleep(1200);
      const stage = ctl.mix.state.elapsed - S.seamAt;
      ctl.stop();
      await sleep(700);
      const saved = JSON.parse(localStorage.getItem('deep-house.player') || 'null');
      await started();
      await sleep(400);
      const faders = window.__faders(ctl.mix.mixOut);
      const s = ctl.mix.state;
      const out = {
        reached, stage, saved: saved && { themeIndex: saved.themeIndex, seconds: saved.seconds },
        decks: faders.length,
        transition: s.transition,
        elapsed: s.elapsed,
        sum: ctl.mix.mixOut.gain.value,
        fader: faders.map((n) => n.gain.value),
      };
      ctl.stop();
      await sleep(400);
      return out;
    `),
    judge: (r, setup) => {
      if (r.wrongPlan) return { ok: false, why: `the page planned a ${r.wrongPlan.theme.toFixed(1)} s theme where the layout says ${r.wrongPlan.want.toFixed(1)}` };
      if (!r.reached) return { ok: false, why: 'the set never reached its hand-over' };
      // Where the arriving deck should be, in its own seconds: the blend's
      // progress and the position past the seam are the same number, because
      // the two decks are on one grid.
      const at = r.transition * setup.blend;
      const want = r.elapsed - (r.elapsed > setup.blend ? setup.seamAt : 0);
      const off = Math.abs(at - want);
      const swapped = r.stage >= setup.swapIn;
      return {
        ok: r.decks === 2 && off < 0.05 && r.fader.length === 2 && r.fader[1] > 0.0001 && r.sum <= 1.0001,
        why: `${r.decks} deck(s), the arriving one ${(at).toFixed(3)} s in where the position says ${(want).toFixed(3)} (${(off * 1000).toFixed(1)} ms out), faders ${r.fader.map((f) => f.toFixed(4)).join(' ')}, sum ${r.sum.toFixed(4)}`,
        note: `stopped ${r.stage.toFixed(1)} s into a ${setup.blend.toFixed(1)} s blend${swapped ? ', past the swap' : ', before the swap'} and started again: two decks, the arriving one ${(off * 1000).toFixed(1)} ms from where the position puts it, faders ${r.fader.map((f) => f.toFixed(3)).join(' and ')}, sum in its dip at ${r.sum.toFixed(3)}`,
      };
    },
  },

  {
    name: 'ten pause/play cycles leave the late counter at zero',
    area: 'transport',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // What Eugene saw on the bench, at his own seed and bar: every press of
    // pause and play wrote a stumble into the log — "seed 99895 · theme IV ·
    // bar 40 · late · 2 notes", then bar 48 and bar 49, one note each. Nothing
    // was late. The resume mapped the position it was picking up onto
    // `ctx.currentTime + 0.15`, and `currentTime` is not the render head: the
    // renderer is already filled `outputLatency + baseLatency` past it, so on
    // any device whose buffer is deeper than 147 ms the first events of the
    // resumed record were *behind* the head, and `resolveStart` moved them
    // forward and counted them. MEASURED with `?latency=0.3` in headless
    // Chromium (a 280 ms buffer over a 171 ms block): two notes on every
    // press, and two to eight inside a blend; with the fix, none.
    //
    // So this asks two things of each press: that nothing was reached late,
    // and that the record was put on ahead of the *head* rather than ahead of
    // the clock — `from - elapsed` is exactly how far ahead of now the deck
    // was anchored, and it has to clear `outputLatency + baseLatency`. The
    // second is what fails on a shallow buffer, where the old 150 ms happened
    // to be enough and no note is late to prove otherwise.
    page: body(`
      const late = () => window.deepHouse.late;
      const was = ctl.state.seed;
      // His own set, his own theme and his own bar — and a theme long enough
      // to have a bar 40, asked for outright: four-minute themes.
      ctl.setSeed('99895');
      ctl.setMinutes(4);
      await sleep(250);
      for (let i = 0; i < 3; i++) ctl.skip();
      const before = late().count;
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 0.4, 8000);
      const cold = late().count - before;
      const themeSeconds = ctl.track.bars * ctl.track.barSeconds;
      const bar40 = 40 * ctl.track.barSeconds;
      if (themeSeconds < bar40 + 20) return { shortTheme: { themeSeconds, bar40 } };
      ctl.seekTo(bar40 / themeSeconds, true);
      await sleep(700);
      const cycles = [];
      for (let i = 0; i < 10; i++) {
        const had = late().count;
        ctl.stop();
        await sleep(420);
        const from = ctl.state.position;
        await started();
        const ctx = ctl.state.ctx || ctl.mix.mixOut.context;
        const head = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
        const ahead = from - ctl.mix.state.elapsed;
        await waitFor(() => ctl.mix && ctl.mix.state.elapsed > from, 8000);
        await sleep(420);
        const now = late();
        cycles.push({ added: now.count - had, from: +from.toFixed(2), ahead: +ahead.toFixed(4),
          head: +head.toFixed(4), cause: now.cause, ms: Math.round(now.last * 1000) });
      }
      const ran = ctl.mix ? ctl.mix.state.elapsed : 0;
      ctl.stop();
      await sleep(300);
      ctl.setSeed(was);
      return { cold, cycles, ran, total: late().count - before, bar: bar40 };
    `),
    judge: (r) => {
      if (r.shortTheme) return { ok: false, why: `a ${r.shortTheme.themeSeconds.toFixed(0)} s theme has no bar 40 to pause at (${r.shortTheme.bar40.toFixed(0)} s)` };
      const bad = r.cycles.filter((c) => c.added > 0);
      const clear = r.cycles.map((c) => c.ahead - c.head);
      const min = Math.min(...clear);
      const max = Math.max(...clear);
      const head = Math.max(...r.cycles.map((c) => c.head));
      return {
        ok: r.cold === 0 && r.total === 0 && min > 0,
        why: `the cold start added ${r.cold} and ten presses added ${r.total}` +
          (bad.length ? `: ${bad.map((c) => `${c.added} at ${c.from} s (${c.cause || 'a stumble'}, ${c.ms} ms)`).join(', ')}` : '') +
          `; the record went on ${(min * 1000).toFixed(0)} to ${(max * 1000).toFixed(0)} ms clear of a head ${(head * 1000).toFixed(0)} ms out`,
        note: `seed 99895's fourth theme, a cold start and ten pause/play cycles round bar 40, the last leaving the record at ${r.ran.toFixed(1)} s: not one note reached late, and every press put the record ${(min * 1000).toFixed(0)}-${(max * 1000).toFixed(0)} ms clear of a render head ${(head * 1000).toFixed(0)} ms past the clock`,
      };
    },
  },

  {
    name: 'ten pause/play cycles inside a blend leave the late counter at zero',
    area: 'transport',
    // seed 1 by name, which the layout below is of: since K16 a bare page rolls its seed
    query: 'seed=1',
    // The same rule where two decks are up. A resume inside a hand-over lays
    // the arriving deck out from the same instant as the record it is
    // arriving over — `beginTransition(seam.bars, at - stage, false, stage)` —
    // so both of them are aimed at the head plus the lead, or neither is.
    setup: () => {
      // The page plays house-v2 (a bare link does), and since round S4 its
      // seam is its own — a floor of 0.82 and a finer line — so the layout is
      // asked of house-v2 by name rather than of the default strategy.
      const L = setLayout(1, 2, { themeBars: 32, strategy: 'house-v2' });
      const s = L.seams[0];
      return { seamAt: s.at, blend: s.bars * s.barSeconds, bars: L.plans[0].bars, barSeconds: s.barSeconds };
    },
    page: body(`
      const S = window.__setup;
      const late = () => window.deepHouse.late;
      ctl.setMinutes(1);
      await sleep(200);
      const themeSeconds = ctl.track.bars * ctl.track.barSeconds;
      if (Math.abs(themeSeconds - S.bars * S.barSeconds) > 0.5)
        return { wrongPlan: { theme: themeSeconds, want: S.bars * S.barSeconds } };
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 0.5, 8000);
      ctl.seekTo((S.seamAt - 3) / themeSeconds, true);
      const reached = await waitFor(() => ctl.mix.state.transition > 0.02, 20000);
      await sleep(900);
      const before = late().count;
      const cycles = [];
      for (let i = 0; i < 10; i++) {
        const had = late().count;
        const stage = ctl.mix.state.transition;
        const theme = ctl.mix.state.theme.index;
        ctl.stop();
        await sleep(420);
        const from = ctl.state.position;
        await started();
        const ctx = ctl.state.ctx || ctl.mix.mixOut.context;
        const head = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
        // How far ahead of now the decks were anchored — the same measurement
        // as the scenario above, and only read when the pause did not fall on
        // the swap, since either side of that the readout is a different
        // deck's seconds.
        const same = ctl.mix.state.theme.index === theme;
        const ahead = same ? from - ctl.mix.state.elapsed : null;
        await waitFor(() => ctl.mix && ctl.mix.state.elapsed > from, 8000);
        await sleep(520);
        const now = late();
        cycles.push({ added: now.count - had, stage: +stage.toFixed(3), ahead, head: +head.toFixed(4),
          decks: window.__faders(ctl.mix.mixOut).length, transition: +ctl.mix.state.transition.toFixed(3),
          cause: now.cause, ms: Math.round(now.last * 1000) });
      }
      const out = { reached, cycles, total: late().count - before };
      ctl.stop();
      await sleep(300);
      return out;
    `),
    judge: (r) => {
      if (r.wrongPlan) return { ok: false, why: `the page planned a ${r.wrongPlan.theme.toFixed(1)} s theme where the layout says ${r.wrongPlan.want.toFixed(1)}` };
      if (!r.reached) return { ok: false, why: 'the set never reached its hand-over' };
      const bad = r.cycles.filter((c) => c.added > 0);
      const inBlend = r.cycles.filter((c) => c.decks === 2).length;
      const clear = r.cycles.filter((c) => c.ahead != null).map((c) => c.ahead - c.head);
      const min = clear.length ? Math.min(...clear) : null;
      return {
        ok: r.total === 0 && inBlend > 0 && min != null && min > 0,
        why: `ten presses inside a hand-over added ${r.total} late note(s)` +
          (bad.length ? `: ${bad.map((c) => `${c.added} at stage ${(c.stage * 100).toFixed(0)}% (${c.cause || 'a stumble'}, ${c.ms} ms)`).join(', ')}` : '') +
          `; two decks came back up on ${inBlend} of the ten, and the pair went on ${min == null ? 'nowhere measurable' : `${(min * 1000).toFixed(0)} ms`} clear of the head`,
        note: `ten pause/play cycles from ${(r.cycles[0].stage * 100).toFixed(0)}% to ${(r.cycles[r.cycles.length - 1].transition * 100).toFixed(0)}% through a blend, two decks on ${inBlend} of them: not one note reached late, and both decks went on ${(min * 1000).toFixed(0)} ms or more clear of the render head`,
      };
    },
  },

  {
    name: 'a cold start under a deep buffer leaves the late counter at zero',
    area: 'transport',
    // **Its own deadline** (`test-browsers.ts`): a whole context is made and thrown away, on the deepest buffer the page will ask for.
    deadline: 300000,
    // The first start of a context is the one moment the machine has not yet
    // said how deep its output buffer is: Chromium leaves `outputLatency` at
    // nought until audio flows, and a start that read the head there aimed 256
    // ms behind where the head would be — six to nine late notes, every time,
    // on ?latency=0.3, and none at all once the context was warm. So a start
    // waits for a real head (up to 150 ms) and floors what it reads for an
    // engine that never reports one.
    //
    // Ten cold starts on the deepest buffer the page can be asked for, each
    // from a context that has been stopped: not one note may be reached late.
    query: 'latency=0.3',
    page: body(`
      const late = () => window.deepHouse.late;
      const before = late().count;
      const rows = [];
      for (let i = 0; i < 10; i++) {
        const had = late().count;
        const t0 = performance.now();
        await started();
        const c = ctl.state.ctx;
        const waited = Math.round(performance.now() - t0);
        await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 0.3, 8000);
        await sleep(400);
        const seen = late();
        rows.push({ i, added: seen.count - had, cause: seen.cause, ms: Math.round((seen.last || 0) * 1000), waited,
          out: +(c.outputLatency || 0).toFixed(4), base: +(c.baseLatency || 0).toFixed(4) });
        ctl.stop();
        await sleep(350);
      }
      const c = ctl.state.ctx;
      return { total: late().count - before, rows, out: +(c.outputLatency || 0).toFixed(4), base: +(c.baseLatency || 0).toFixed(4) };
    `),
    judge: (r) => {
      const bad = r.rows.filter((x) => x.added > 0);
      return {
        ok: r.total === 0,
        why: `ten cold starts on a ${(r.base * 1000).toFixed(0)} ms buffer reporting ${(r.out * 1000).toFixed(0)} ms of output latency: `
          + `${r.total} late${bad.length ? ` — ${bad.map((x) => `#${x.i} ${x.added} by ${x.ms} ms${x.cause ? ' · ' + x.cause : ''}`).join(', ')}` : ''}`,
        note: `ten cold starts on a ${(r.base * 1000).toFixed(0)} ms buffer with ${(r.out * 1000).toFixed(0)} ms of output latency: `
          + `not one note reached late, the first waiting ${r.rows[0].waited} ms for a head to read`,
      };
    },
  },

  {
    name: 'ten skips leave the late counter at zero',
    area: 'transport',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // **Its own deadline** (`test-browsers.ts`): ten cuts and ten waits for a landing: 22 s on a quiet machine and past two minutes on a busy one (`TODO.md`).
    deadline: 300000,
    // The pause/play pair of this, for the other way a record is put on. A cut
    // lands on the next beat of the record playing, and a beat can be a few
    // milliseconds away — so the beat it picks has to clear the render head by
    // the transport's own lead, not merely be later than the clock, or the
    // arriving deck's first events are written behind the head and counted
    // late. `cutAt()` floors the line it takes at `startAt(ctx)` and at
    // whatever the outgoing deck has already been filled to; this measures
    // that floor from outside, ten times, from a random place inside the bar
    // so that the next beat is sometimes very close indeed.
    //
    // What it asks of each press: that nothing was reached late, and that the
    // beat the cut took stood clear of the render head by the lead a start
    // takes (0.12 s) rather than by whatever was left of the beat.
    page: body(`
      const late = () => window.deepHouse.late;
      ctl.setSeed('15576');
      await sleep(250);
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 10000);
      const c = ctl.state.ctx;
      const head = () => (c.outputLatency || 0) + (c.baseLatency || 0);
      const before = late().count;
      const cuts = [];
      for (let i = 0; i < 10; i++) {
        // anywhere inside the bar, so the next beat is near as often as far
        await sleep(90 + Math.floor(Math.random() * 620));
        const had = late().count;
        const theme = ctl.readout().mix.themeNumber;
        const now = c.currentTime;
        const h = head();
        // The press is answered on the beat; the *mark* that draws the wait is
        // armed when the transport has built the theme it is going to, which
        // is a turn of the event loop for a theme already warmed and a moment
        // longer for one that is not.
        const lastCut = ctl.state.cut;
        ctl.skip();
        await waitFor(() => ctl.state.cut && ctl.state.cut !== lastCut, 3000);
        const cut = ctl.state.cut === lastCut ? null : ctl.state.cut;
        if (!cut) { cuts.push({ i, none: true }); continue; }
        const wait = Math.max(0, (cut.swapAt || cut.end) - c.currentTime) * 1000 + 600;
        await waitFor(() => ctl.readout().mix.themeNumber > theme, Math.min(12000, wait + 4000));
        await sleep(300);
        const seen = late();
        cuts.push({ i, added: seen.count - had, cause: seen.cause,
          ms: Math.round((seen.last || 0) * 1000),
          beatIn: +((cut.at - now) * 1000).toFixed(0),
          clear: +((cut.at - (now + h)) * 1000).toFixed(0) });
      }
      const total = late().count - before;
      ctl.stop();
      await sleep(300);
      return { total, cuts, head: +head().toFixed(4), rate: c.sampleRate };
    `),
    judge: (r) => {
      const none = r.cuts.filter((c) => c.none);
      const clears = r.cuts.filter((c) => !c.none).map((c) => c.clear);
      const beats = r.cuts.filter((c) => !c.none).map((c) => c.beatIn);
      const min = Math.min(...clears);
      const bad = r.cuts.filter((c) => c.added > 0);
      return {
        ok: r.total === 0 && !none.length && min >= 100,
        why: `${r.cuts.length} skips on a ${(r.head * 1000).toFixed(0)} ms head: `
          + `${r.total} late${bad.length ? ` (${bad.map((c) => `#${c.i} ${c.added} by ${c.ms} ms${c.cause ? ' · ' + c.cause : ''}`).join(', ')})` : ''}; `
          + `the beat taken stood ${min}-${Math.max(...clears)} ms clear of the head, `
          + `and was ${Math.min(...beats)}-${Math.max(...beats)} ms away when the press was made`
          + `${none.length ? `; ${none.length} press(es) made no cut` : ''}`,
        note: `ten skips from random places inside the bar: not one note reached late, and every cut took a beat `
          + `${min} ms or more clear of the render head — the next beat was as little as ${Math.min(...beats)} ms off`,
      };
    },
  },

  {
    name: 'a cut is answered inside a beat and a bit',
    area: 'transport',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // **Its own deadline** (`test-browsers.ts`): the same, and for the same reason.
    deadline: 300000,
    // A skip begins on the *next beat* of the record that is playing, not the
    // next bar: a press used to be answered three seconds later, which is long
    // enough that pressing NEXT read as pressing nothing and the hand pressed
    // again. What is measured is press to the instant the arriving theme is
    // first scheduled to sound.
    //
    // The bound is a beat plus the scheduler's own reach, and not a beat plus
    // a flat 150 ms. `cutAt()` takes the first beat line at or after
    // `max(now + 0.15, pumpedTo)`, and `pumpedTo` is how far the deck has
    // already been written: `liveLookahead` in clock.ts, which clears the
    // device's own block twice over — twice the output latency plus the base
    // block plus a tick and 50 ms — and never reaches less far than the
    // player asked for. A headless engine is handed a large output buffer, so
    // that is comfortably more than 150 ms and the flat number would be a
    // gate on the machine rather than on the transport. The page is asked
    // what its own latencies are and the floor is worked out from them.
    page: body(`
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2, 10000);
      const beat = ctl.track.barSeconds / 4;
      // Looked up again before every press: the ring redraws its wheel when
      // the theme turns over, and a node held from before that is detached,
      // so the event goes nowhere and the press reads as no press at all.
      const skipNode = () => document.querySelector('#actions g[data-action="skip"]');
      if (!skipNode()) return { noNode: true };
      const runs = [];
      const first = ctl.state.themeIndex;
      for (let i = 0; i < 2; i++) {
        // A press inside a cut lands the cut in flight at once and starts
        // another, which is its own rule; this one is about how long one press
        // takes to be answered, so the second waits for the first to be over —
        // its theme arrived and no cut in flight — and a beat more. (It was a
        // flat twelve seconds, the longest a cut was ever seen to take; a cut
        // that has landed is over whenever it landed. 09-24)
        if (i) {
          await waitFor(() => ctl.state.themeIndex === first + 1 && !ctl.state.cut && !ctl.readout().mix.cutting, 12000);
          await sleep(Math.round(beat * 1000));
        }
        const node = skipNode();
        const b = node.getBoundingClientRect();
        const x = b.x + b.width / 2, y = b.y + b.height / 2;
        const at0 = ctl.state.ctx.currentTime;
        node.dispatchEvent(pev('pointerdown', x, y, 40 + i));
        window.dispatchEvent(pev('pointerup', x, y, 40 + i));
        const took = await waitFor(() => ctl.state.cut != null, 4000);
        runs.push({ entry: took ? (ctl.state.cut.at - at0) * 1000 : null, cut: took });
      }
      const stepped = await waitFor(() => ctl.state.themeIndex === first + 2, 20000);
      const last = ctl.state.themeIndex;
      const t = ctl.timing();
      const reach = Math.max((t.lookahead ?? 120) / 1000, 2 * ((t.output || 0) / 1000) + (t.base || 0) / 1000 + 0.025 + 0.05);
      const lookahead = Math.round(reach * 1000);
      ctl.stop();
      await sleep(400);
      return { beat, runs, first, last, stepped, lookahead };
    `),
    judge: (r) => {
      if (r.noNode) return { ok: false, why: 'the ring has no skip node to press' };
      // The floor the cut lands on, and forty milliseconds for the tick that
      // wrote `pumpedTo` and the hop out to this side of the browser.
      const floor = Math.max(150, r.lookahead) + 40;
      const limit = r.beat * 1000 + floor;
      const worst = Math.max(...r.runs.map((x) => (x.entry == null ? Infinity : x.entry)));
      const stepped = r.stepped && r.last === r.first + r.runs.length;
      return {
        ok: worst <= limit && stepped,
        why: !stepped ? `two presses took the set from theme ${r.first} to ${r.last}, cuts armed ${r.runs.map((x) => x.cut).join(' and ')}`
          : `the arriving theme was first scheduled ${worst.toFixed(0)} ms after the press, over a beat and the ${Math.round(floor)} ms already written (${limit.toFixed(0)} ms)`,
        note: `${r.runs.length} presses: the arriving theme first sounds ${r.runs.map((x) => Math.round(x.entry)).join(' and ')} ms after the pointer went down, inside a beat (${Math.round(r.beat * 1000)} ms) and the ${Math.round(floor)} ms the scheduler has already written`,
      };
    },
  },

  // --- the machine never stops ---------------------------------------------
  //
  // Eugene, 09-19: *"once the machine is started it never stops, so all
  // magic-ring manipulations are a smooth transition in the music universe."*
  // A cast is a hand-over from where the record is into the first theme of the
  // new set, and a spell set mid-set is the same hand-over from the next phrase
  // line. These three drive the transport through both and measure what a
  // listener would hear: whether the output ever stops, where the hand-over
  // falls, and when the readout stops naming the set that was playing.
  //
  // **The meter is a tap of the set's own output, sample by sample.** An
  // analyser polled once a frame cannot see a gap of a render quantum — it
  // hands back the last 2048 samples whenever it is asked, and the peak of a
  // window says nothing about three milliseconds inside it — and a gap is what
  // this is about. A `ScriptProcessorNode` is deprecated and is the only thing
  // in any of these three engines that hands a page every sample it makes; it
  // is fed from `mix.out`, the set's last node, and into a gain of nought, so
  // the measurement is of the music and adds nothing to it. If a block is ever
  // dropped the scenario says how much of the stretch it actually saw.
  {
    name: 'a cast never stops the output, and the seam lands on the bar',
    area: 'seam',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    setup: () => ({ from: '15576', to: '92970' }),
    page: body(`
      const S = window.__setup;
      const SILENT = 1e-6;   // -120 dB: below any tail this master puts out
      ctl.setSeed(S.from);
      await sleep(250);
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2, 12000);
      const c = ctl.state.ctx;
      if (!c.createScriptProcessor) return { noTap: true };
      const quantum = 128 / c.sampleRate;
      let run = 0, worst = 0, blocks = 0, frames = 0, loudest = 0;
      const tap = c.createScriptProcessor(4096, 2, 2);
      tap.onaudioprocess = (e) => {
        const L = e.inputBuffer.getChannelData(0);
        const R = e.inputBuffer.getChannelData(1);
        blocks += 1; frames += L.length;
        for (let i = 0; i < L.length; i++) {
          const a = Math.abs(L[i]) + Math.abs(R[i]);
          if (a > loudest) loudest = a;
          if (a < SILENT) { run += 1; if (run > worst) worst = run; } else run = 0;
        }
      };
      const sink = c.createGain();
      sink.gain.value = 0;
      ctl.mix.out.connect(tap);
      tap.connect(sink);
      sink.connect(c.destination);
      // what an untouched set looks like on this meter
      const t0 = c.currentTime;
      await sleep(2200);
      const quiet = { samples: worst, seconds: c.currentTime - t0, frames };
      worst = 0; run = 0; frames = 0;

      // the cast: the seed the dice rolled, through the one door the ring uses
      const before = ctl.readout();
      const cast0 = c.currentTime;
      const lateBefore = window.deepHouse.late.count;
      const liveBefore = window.deepHouse.piano.live;
      ctl.setSeed(S.to);
      const armed = await waitFor(() => ctl.state.cut && ctl.state.cut.kind === 'cast', 6000);
      const cut = armed ? { ...ctl.state.cut } : null;
      if (!cut) { ctl.stop(); return { noCast: true, seed: ctl.readout().seed }; }
      const atThrow = {
        seed: ctl.readout().seed,
        casting: !!ctl.mix.state.casting,
        next: String((ctl.mix.state.next && ctl.mix.state.next.seed) || ''),
        coming: String((ctl.readout().mix.next && ctl.readout().mix.next.seed) || ''),
        took: c.currentTime - cast0,
      };
      // where the seam falls in the outgoing theme's own seconds: the readout
      // is that theme's position, and the clock is read in the same breath
      const held = ctl.readout();
      const now = c.currentTime;
      const seamIn = held.seconds + (cut.at - now);
      const swapIn = held.seconds + (cut.swapAt - now);
      const bs = held.barSeconds;
      const offBar = (x) => Math.min(x % bs, bs - (x % bs));

      // and the boundary: the seed turns over when the low end does
      // Bounded by the wall clock as well as by the set's own: a context that
      // stops advancing is exactly the fault this scenario is here to catch,
      // and a scenario that waits on the thing it is measuring has to have a
      // second clock under it or it hangs instead of failing (K5a's rule).
      let turnedAt = 0;
      const stop = cut.end + 2;
      const until = performance.now() + (stop - c.currentTime) * 1000 + 8000;
      while (c.currentTime < stop && !turnedAt && performance.now() < until) {
        if (ctl.readout().seed === S.to) turnedAt = c.currentTime;
        await sleep(50);
      }
      const after = { seed: ctl.readout().seed, theme: ctl.readout().mix.themeNumber,
        turned: turnedAt ? turnedAt - cut.swapAt : null, elapsed: ctl.readout().seconds };
      const cast = { samples: worst, seconds: c.currentTime - cast0, frames };
      // **The tap is taken all the way out.** A script processor left
      // connected to the destination goes on being called for the life of the
      // context, on the main thread, whether or not it still has a handler —
      // and when every row shared one page, two of them left behind was how a
      // later row found a browser that had stopped answering. Every row has a
      // page of its own since 09-24; the tap is still taken out, because a
      // row's own last readings are made with it gone.
      ctl.mix.out.disconnect(tap);
      tap.onaudioprocess = null;
      tap.disconnect();
      sink.disconnect();
      ctl.stop();
      await sleep(300);
      return {
        rate: c.sampleRate, quantum, quiet, cast, loudest, blocks,
        atThrow, after,
        seam: { at: seamIn, swapAt: swapIn, bars: (cut.end - cut.at) / bs, bar: seamIn / bs,
          offBar: offBar(seamIn), offSwap: offBar(swapIn), barSeconds: bs },
        late: window.deepHouse.late.count - lateBefore,
        live: window.deepHouse.piano.live - liveBefore,
      };
    `),
    judge: (r, setup) => {
      if (r.noTap) return { ok: false, why: 'this engine has no per-sample tap to measure silence with' };
      if (r.noCast) return { ok: false, why: `the cast armed no hand-over; the set is on seed ${r.seed}` };
      const ms = (n) => (n / r.rate) * 1000;
      const held = r.atThrow.seed === setup.from && r.atThrow.casting
        && r.atThrow.coming.startsWith(`${setup.to}#`);
      // A bar is two and a bit seconds; the readout and the clock are read a
      // line apart, so the tolerance is the scheduler's and not a bar's.
      const onBar = r.seam.offBar <= 0.025 && r.seam.offSwap <= 0.025;
      const gap = r.cast.samples;
      const floor = Math.max(r.quiet.samples, 128);
      const quiet = gap <= floor;
      const turned = r.after.seed === setup.to && r.after.turned != null && Math.abs(r.after.turned) <= 0.5;
      return {
        ok: held && onBar && quiet && turned && !r.late,
        why: !held ? `at the throw the readout said seed ${r.atThrow.seed} (casting ${r.atThrow.casting}), coming ${r.atThrow.coming}`
          : !onBar ? `the seam begins ${r.seam.offBar.toFixed(3)} s off a bar line and swaps ${r.seam.offSwap.toFixed(3)} s off one (bar ${r.seam.barSeconds.toFixed(3)} s)`
          : !quiet ? `the meter saw ${ms(gap).toFixed(1)} ms of silence across the cast against ${ms(r.quiet.samples).toFixed(1)} ms in the ${r.quiet.seconds.toFixed(1)} s before it`
          : !turned ? `the seed turned ${r.after.turned == null ? 'never' : `${r.after.turned.toFixed(2)} s`} from the swap; the readout says ${r.after.seed}`
          : `${r.late} notes reached late across the cast`,
        note: `the cast handed over at bar ${r.seam.bar.toFixed(2)} of the theme playing — ${r.seam.offBar.toFixed(3)} s off the line, `
          + `swapping ${r.seam.offSwap.toFixed(3)} s off one ${(r.seam.swapAt - r.seam.at).toFixed(1)} s later over ${r.seam.bars.toFixed(0)} bars — `
          + `the readout still said ${setup.from} at the throw and said ${setup.to} ${Math.abs(r.after.turned).toFixed(2)} s from the swap, `
          + `and over ${r.cast.seconds.toFixed(1)} s of it the meter saw ${ms(r.cast.samples).toFixed(1)} ms of silence `
          + `(${ms(r.quantum * r.rate).toFixed(1)} ms is one render quantum, ${ms(r.quiet.samples).toFixed(1)} the untouched set) `
          + `over ${(r.cast.frames / r.rate).toFixed(1)} s of samples in ${r.blocks} blocks, `
          + `with ${r.live} strings built under the scheduler`,
      };
    },
  },

  // --- the reconciled review of 09-24, round (a): the transport's time and its
  // supersede paths, where only a browser can say it. The rest of the round is
  // held in node, on the engine's live stand-in (tools/check-transport.ts).
  {
    name: 'a swell is struck ahead of its onset on a live deck, and not at its arrival',
    area: 'transport',
    // R1. The program is visited in onset order (`visitOrder`), so the one
    // anticipatory voice is reached when its onset comes into the look-ahead
    // and not 1.8 s later, when its arrival does. The deck is sought a few
    // seconds before a swell's onset, the swell voice is watched, and the
    // instant it is handed has to be ahead of the clock at the call. Before
    // the fix it was handed 1.6 s behind the clock, and the late counter took it.
    // The theme is 21323's second under a driving spell (Ember .75, Spark .3),
    // whose swell at 67.3 s the glue gates admit (round S14): seed 1's first
    // theme, the row's fixture before, is a house cast the gates refuse, and
    // has no anticipatory event left to watch. The program is the deck's own.
    deadline: 120000,
    query: 'v=2&seed=21323&theme=2&spell=em:0.75,sp:0.30',
    page: body(`
      const dh = window.deepHouse;
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 0.5, 12000);
      const program = dh.programOf(ctl.track);
      const swells = program.events.filter((e) => e.lead > 0);
      if (!swells.length) { ctl.stop(); return { none: true, theme: ctl.state.themeIndex }; }
      const target = swells[0];
      const real = dh.voices[target.voice];
      const struck = [];
      dh.voices[target.voice] = (ctx, out, time, p, settings) => {
        struck.push({ time, now: ctx.currentTime });
        return real(ctx, out, time, p, settings);
      };
      try {
        const lateBefore = dh.late.count;
        ctl.mix.seek(Math.max(0, target.onset - 4));
        await waitFor(() => struck.length > 0, 12000);
        await sleep(300);
        const late = dh.late.count - lateBefore;
        ctl.stop();
        await sleep(300);
        return { struck, late, onset: target.onset, lead: target.lead, voice: target.voice };
      } finally {
        dh.voices[target.voice] = real;
      }
    `),
    judge: (r) => {
      if (r.none) return { ok: false, why: `21323's second theme under the driving spell has no anticipatory event to watch (the deck is on theme ${r.theme + 1})` };
      if (!r.struck.length) return { ok: false, why: `the ${r.voice} at ${r.onset.toFixed(2)} s was never struck` };
      const ahead = r.struck[0].time - r.struck[0].now;
      return {
        ok: ahead > 0 && !r.late,
        why: `the ${r.voice} was handed ${ahead >= 0 ? `${(ahead * 1000).toFixed(0)} ms ahead of` : `${(-ahead * 1000).toFixed(0)} ms behind`} the clock, with ${r.late} notes late`,
        note: `21323's ${r.voice} under the driving spell, ${r.lead.toFixed(2)} s long, onset at ${r.onset.toFixed(2)} s: handed to the audio clock ${(ahead * 1000).toFixed(0)} ms ahead of its onset, nothing late`,
      };
    },
  },

  {
    name: 'a next pressed while a cast is being built goes on into the cast, and the output never stops',
    area: 'seam',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // R7. The cast awaits its cold landing, a next overtakes it, and the cast
    // answers null — which the face read as a refusal, and stopped and started
    // the set, the next lost. A null is never a refusal while the set plays:
    // the next counts from the cast's aim and lands on the new set's second
    // theme, through one mix, with the meter never seeing more silence than
    // the untouched set does. The next is asked of the transport, so the
    // journal this page has written cannot turn it into a walk.
    deadline: 180000,
    setup: () => ({ from: '15576', to: '92970' }),
    page: body(`
      const S = window.__setup;
      const SILENT = 1e-6;
      ctl.setSeed(S.from);
      await sleep(250);
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2, 12000);
      const c = ctl.state.ctx;
      if (!c.createScriptProcessor) return { noTap: true };
      let run = 0, worst = 0;
      const tap = c.createScriptProcessor(4096, 2, 2);
      tap.onaudioprocess = (e) => {
        const L = e.inputBuffer.getChannelData(0), R = e.inputBuffer.getChannelData(1);
        for (let i = 0; i < L.length; i++) {
          const a = Math.abs(L[i]) + Math.abs(R[i]);
          if (a < SILENT) { run += 1; if (run > worst) worst = run; } else run = 0;
        }
      };
      const sink = c.createGain();
      sink.gain.value = 0;
      const out = ctl.mix.out;
      out.connect(tap); tap.connect(sink); sink.connect(c.destination);
      await sleep(1500);
      const quiet = worst;
      worst = 0; run = 0;
      const mixes = new Set([ctl.mix]);
      ctl.setSeed(S.to);
      const next = ctl.mix.skip();
      const until = performance.now() + 60000;
      let landed = false;
      while (performance.now() < until) {
        mixes.add(ctl.mix);
        if (ctl.readout().seed === S.to && ctl.mix && ctl.mix.record && ctl.mix.record.track.seed === S.to + '#1') { landed = true; break; }
        await sleep(50);
      }
      await bounded(next, 2000);
      const after = { seed: ctl.readout().seed, record: ctl.mix && ctl.mix.record ? String(ctl.mix.record.track.seed) : null,
        mixes: mixes.size, playing: ctl.playing };
      // (a set that was stopped and started has another output, which the tap
      // was never on)
      try { out.disconnect(tap); } catch (e) { /* gone with its set */ }
      tap.onaudioprocess = null; tap.disconnect(); sink.disconnect();
      ctl.stop();
      await sleep(300);
      return { quiet, gap: worst, rate: c.sampleRate, landed, after };
    `),
    judge: (r, setup) => {
      if (r.noTap) return { ok: false, why: 'this engine has no per-sample tap to measure silence with' };
      const ms = (n) => (n / r.rate) * 1000;
      const floor = Math.max(r.quiet, 128);
      const ok = r.landed && r.after.mixes === 1 && r.gap <= floor;
      return {
        ok,
        why: !r.landed ? `the next did not land on ${setup.to}#1: the readout says ${r.after.seed}, the record is ${r.after.record}`
          : r.after.mixes !== 1 ? `the set was stopped and started: ${r.after.mixes} mixes played it`
          : `the meter saw ${ms(r.gap).toFixed(1)} ms of silence against ${ms(r.quiet).toFixed(1)} untouched`,
        note: `a cast to ${setup.to} and a next in the same turn: one mix throughout, the next landed on ${r.after.record}, and the meter saw ${ms(r.gap).toFixed(1)} ms of silence (${ms(r.quiet).toFixed(1)} the untouched set)`,
      };
    },
  },

  {
    name: 'a play pressed twice on the element path leaves the element playing',
    area: 'transport',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // R8. On the element path (an iPhone's) a start that a second start
    // overtook paused the element in its `finally` while the newer start was
    // still building its mix, and a stop's 400 ms timer did the same to a play
    // pressed inside it; nothing played the element again, so the set ran
    // into a stream nobody heard under a ring that said it played. Played on
    // `?out=element` in this page itself — WebKit lets no subframe start audio
    // without a gesture — with the element muted before it is ever played, so
    // nothing is heard on any engine, and the page put back after.
    deadline: 120000,
    drive: async (page) => {
      const back = page.url();
      const at = new URL(back);
      await page.goto(`${at.origin}${at.pathname}?out=element&v=2&seed=5`);
      try {
        const up = await page.waitForFunction(() => !!(window.ring && window.ring.control), null, { timeout: 25000 }).then(() => true, () => false);
        if (!up) return { noPage: true };
        return await page.evaluate(async () => {
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const bounded = (p, ms) => Promise.race([Promise.resolve(p).catch(() => {}), sleep(ms)]);
          const play = HTMLMediaElement.prototype.play;
          HTMLMediaElement.prototype.play = function () { this.muted = true; this.volume = 0; return play.call(this); };
          const c2 = window.ring.control;
          const el = document.getElementById('sound');
          const look = () => ({ paused: el.paused, playing: c2.state.playing, mix: !!c2.mix, out: c2.out });
          // a double tap: the second start overtakes the first
          await bounded(Promise.all([c2.start(), c2.start()]), 20000);
          await sleep(900);
          const doubled = look();
          // and a play pressed inside a stop's 400 ms
          c2.stop();
          await sleep(80);
          await bounded(c2.start(), 20000);
          await sleep(900);
          const inside = look();
          c2.stop();
          await sleep(500);
          const stopped = look();
          return { doubled, inside, stopped };
        });
      } finally {
        await page.goto(back);
        await page.waitForFunction(() => !!(window.ring && window.ring.control), null, { timeout: 25000 }).catch(() => {});
      }
    },
    judge: (r) => {
      if (r.noPage) return { ok: false, why: 'the page on ?out=element never came up' };
      const good = (x) => x.out === 'element' && x.playing && x.mix && !x.paused;
      return {
        ok: good(r.doubled) && good(r.inside) && r.stopped.paused,
        why: !good(r.doubled) ? `after a double tap: ${JSON.stringify(r.doubled)}`
          : !good(r.inside) ? `after a play inside a stop's fade: ${JSON.stringify(r.inside)}`
          : `the element went on playing after a stop: ${JSON.stringify(r.stopped)}`,
        note: 'on ?out=element a double tap of play, and a play pressed inside a stop\'s 400 ms, both leave the element playing the set; a stop pauses it',
      };
    },
  },

  {
    name: 'a hidden page keeps the face current: a theme that arrives while no frame is drawn is read, journalled and stored',
    area: 'transport',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // R14. The frame loop was the only reader of the transport, and a hidden
    // page draws no frames: on a locked phone the lock-screen card froze, no
    // theme was journalled and the stored second was the second of the hide.
    // Here the page is made hidden — the document says so and no frame is
    // drawn — and a next is asked of the transport, so the face is told
    // nothing; the mix's own tick has to bring the arrival to it.
    deadline: 120000,
    page: body(`
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
      const theme0 = ctl.mix.state.themeIndex;
      const had = ctl.journal.entries.length;
      const raf = window.requestAnimationFrame;
      window.requestAnimationFrame = () => 0;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      let got;
      try {
        await sleep(300);
        ctl.mix.skip();
        await waitFor(() => ctl.mix && ctl.mix.state.themeIndex !== theme0, 20000);
        const mixTheme = ctl.mix.state.themeIndex;
        const stored = () => { try { return JSON.parse(localStorage.getItem('deep-house.player')).themeIndex; } catch (e) { return null; } };
        await waitFor(() => ctl.state.themeIndex === mixTheme && stored() === mixTheme, 8000);
        got = { theme: ctl.state.themeIndex, mixTheme, entries: ctl.journal.entries.length - had,
          stored: stored(), at: ctl.journal.here ? ctl.journal.here.theme : null };
      } finally {
        delete document.hidden;
        delete document.visibilityState;
        window.requestAnimationFrame = raf;
        document.dispatchEvent(new Event('visibilitychange'));
      }
      ctl.stop();
      await sleep(300);
      return got;
    `),
    judge: (r) => ({
      ok: r.theme === r.mixTheme && r.entries >= 1 && r.at === r.mixTheme && r.stored === r.mixTheme,
      why: `hidden, the transport reached theme ${r.mixTheme + 1}; the face says ${r.theme + 1}, the journal is on ${r.at == null ? 'nothing' : r.at + 1} with ${r.entries} new, and the store says ${r.stored == null ? 'nothing' : r.stored + 1}`,
      note: `with the document hidden and no frame drawn, the theme a next brought (${r.mixTheme + 1}) reached the face, the journal and the store off the mix's own tick`,
    }),
  },

  {
    name: 'a mixer control moved inside a blend leaves the blend running',
    area: 'transport',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // R18. The first move off clean installed a mixer and then *sought* the
    // transport so the look-ahead already scheduled would pass through it — a
    // blend in flight was dropped in 80 ms. The control is not a move.
    deadline: 120000,
    page: body(`
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
      ctl.mix.skip();
      const inside = await waitFor(() => ctl.mix.state.transition > 0.05, 15000);
      const before = { t: ctl.mix.state.transition, incoming: !!ctl.mix.state.incoming, theme: ctl.mix.state.themeIndex };
      ctl.setSourceMix({ mute: ['kick'], solo: [], dry: [] });
      await sleep(400);
      const after = { t: ctl.mix.state.transition, incoming: !!ctl.mix.state.incoming, elapsed: ctl.mix.state.elapsed };
      ctl.resetSources();
      ctl.stop();
      await sleep(300);
      return { inside, before, after };
    `),
    judge: (r) => ({
      ok: r.inside && r.after.t > r.before.t,
      why: !r.inside ? 'the skip never began a blend' : `the blend stood at ${r.before.t.toFixed(3)} and was at ${r.after.t.toFixed(3)} after the mute`,
      note: `a mute set ${(r.before.t * 100).toFixed(0)} % into a cut's blend: the blend ran on to ${(r.after.t * 100).toFixed(0)} %, nothing sought`,
    }),
  },

  // --- step 1c: never a guard, the fills, and the journal --------------------
  // `notes/archive/2026-09-v2-day-chain/plans/PLAN-DAY-2026-09-19.md` step 1c. The first of these is the one gate
  // only a browser can answer — whether the output ever stops while a hand is
  // pressing as fast as it can — so it carries the same per-sample meter the
  // cast scenario above does, for the same reason.
  {
    name: 'five nexts inside a second land five ahead, and nothing stops',
    area: 'transport',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // Eugene, 09-19 17:20: *"no cut guard on next/previous/dice or the lock
    // screen; a press during a blend retargets it."* Five presses with nothing
    // at all between them — faster than a landing takes to build, which is the
    // case the old arithmetic could not answer: every one of them asked for
    // n + 1, and n had not moved.
    deadline: 300000,
    setup: () => ({ seed: '15576', presses: 5 }),
    page: body(`
      const S = window.__setup;
      const SILENT = 1e-6;
      ctl.setSeed(S.seed);
      await sleep(250);
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2, 15000);
      const c = ctl.state.ctx;
      if (!c.createScriptProcessor) return { noTap: true };
      let run = 0, worst = 0, blocks = 0, frames = 0;
      const tap = c.createScriptProcessor(4096, 2, 2);
      tap.onaudioprocess = (e) => {
        const L = e.inputBuffer.getChannelData(0);
        const R = e.inputBuffer.getChannelData(1);
        blocks += 1; frames += L.length;
        for (let i = 0; i < L.length; i++) {
          const a = Math.abs(L[i]) + Math.abs(R[i]);
          if (a < SILENT) { run += 1; if (run > worst) worst = run; } else run = 0;
        }
      };
      const sink = c.createGain();
      sink.gain.value = 0;
      ctl.mix.out.connect(tap);
      tap.connect(sink);
      sink.connect(c.destination);
      const t0 = c.currentTime;
      await sleep(2200);
      const quiet = { samples: worst, seconds: c.currentTime - t0, frames };
      worst = 0; run = 0; frames = 0;

      const from = ctl.readout().mix.themeNumber;
      const lateBefore = window.deepHouse.late.count;
      const liveBefore = window.deepHouse.piano.live;
      const pressedAt = performance.now();
      const at0 = c.currentTime;
      // Through the ring's own node, which is where the guard used to be.
      for (let i = 0; i < S.presses; i++) window.ring.skip();
      const pressedFor = performance.now() - pressedAt;
      const aim = ctl.mix.aim + 1;
      // the readout still names the theme that is playing, and turns at the swap
      const atPress = { theme: ctl.readout().mix.themeNumber, coming: ctl.readout().mix.next && ctl.readout().mix.next.index };
      const want = from + S.presses;
      const ok = await waitFor(() => ctl.readout().mix.themeNumber >= want, 90000);
      const landedAt = c.currentTime;
      await sleep(400);
      const after = { theme: ctl.readout().mix.themeNumber, seed: ctl.readout().seed, playing: ctl.playing };
      const cut = { samples: worst, seconds: c.currentTime - at0, frames };
      ctl.mix.out.disconnect(tap);
      tap.onaudioprocess = null;
      tap.disconnect();
      sink.disconnect();
      ctl.stop();
      await sleep(300);
      return { rate: c.sampleRate, from, want, aim, ok, atPress, after, quiet, cut, blocks,
        pressedFor: +pressedFor.toFixed(0), took: +(landedAt - at0).toFixed(2),
        late: window.deepHouse.late.count - lateBefore,
        live: window.deepHouse.piano.live - liveBefore };
    `),
    judge: (r, setup) => {
      if (r.noTap) return { ok: false, why: 'this engine has no per-sample tap to measure silence with' };
      const ms = (n) => (n / r.rate) * 1000;
      const aimed = r.aim === r.want;
      const landed = r.ok && r.after.theme === r.want && r.after.playing;
      const held = r.atPress.theme === r.from;
      const floor = Math.max(r.quiet.samples, 128);
      const quiet = r.cut.samples <= floor;
      return {
        ok: aimed && landed && held && quiet && !r.late && !r.live,
        why: !aimed ? `${setup.presses} presses aimed at theme ${r.aim} and not ${r.want}`
          : !held ? `the readout said theme ${r.atPress.theme} at the press, not ${r.from}`
          : !landed ? `the set is on theme ${r.after.theme} of ${r.after.seed}, wanted ${r.want}`
          : !quiet ? `the meter saw ${ms(r.cut.samples).toFixed(1)} ms of silence across the five against ${ms(r.quiet.samples).toFixed(1)} ms in the ${r.quiet.seconds.toFixed(1)} s before them`
          : r.late ? `${r.late} notes reached late` : `${r.live} strings were built under the scheduler`,
        note: `${setup.presses} presses in ${r.pressedFor} ms aimed at theme ${r.aim} from ${r.from} and the set reached it in ${r.took} s, `
          + `with the readout still saying ${r.from} at the press — and over ${r.cut.seconds.toFixed(1)} s the meter saw `
          + `${ms(r.cut.samples).toFixed(1)} ms of silence (${ms(r.quiet.samples).toFixed(1)} the untouched set, 2.7 ms one render quantum) `
          + `in ${r.blocks} blocks, nothing late and ${r.live} strings built under the scheduler`,
      };
    },
  },

  {
    name: 'the fill is the seam\'s own length, and a press restarts it',
    area: 'seam',
    // Eugene, 09-19 17:20: *"next/previous fill in the direction of travel for
    // the seam's real length, the dice a clockwise spiral fill; purely
    // visual."* So three things are asked: that the fill's clock is the seam's
    // and not a frame's, that a second press restarts it rather than being
    // swallowed, and that the dice draw a sector and not a bar.
    deadline: 300000,
    // **Its own page**, because one of the things it asks is what the ring
    // carries before anything has been pressed, and the fill's group is made
    // the first time a hand-over a hand asked for is in flight. Every row has
    // a page of its own since 09-24; the parameter, which is nothing the page
    // reads, is kept as this row's statement that it needs one.
    query: 'fresh=fill',
    page: body(`
      const fill = () => document.querySelector('#cutFill .fill');
      const wedge = () => document.querySelector('#cutFill rect.fill');
      const spiral = () => document.querySelector('#cutFill path.fill');
      const width = () => { const w = wedge(); return w ? +w.getAttribute('width') : null; };
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2, 15000);
      const c = ctl.state.ctx;
      const out = {};
      out.beforeAnyPress = !document.getElementById('cutFill');

      // --- forward: the fill's length is the seam's -------------------------
      window.ring.skip();
      await waitFor(() => ctl.state.cut, 8000);
      const cut = { ...ctl.state.cut };
      out.span = +(cut.swapAt - cut.askedAt).toFixed(3);
      out.kind = cut.kind;
      // sampled while it runs: the drawing and the two numbers it is made of
      const marks = [];
      while (ctl.readout().mix.cutting && c.currentTime < cut.swapAt + 1) {
        const r = ctl.readout();
        marks.push({ t: c.currentTime, w: width(), x: wedge() ? +wedge().getAttribute('x') : null,
          span: r.mix.cutSpan, left: r.mix.cutIn });
        await frame(120);
      }
      const full = marks.length ? Math.max(...marks.map((m) => m.w || 0)) : 0;
      // the fill against the numbers it claims to be a reading of
      let offBy = 0;
      for (const m of marks) {
        if (m.w == null || !m.span) continue;
        const want = Math.max(0, Math.min(1, 1 - m.left / m.span)) * full;
        offBy = Math.max(offBy, Math.abs(m.w - want));
      }
      out.forward = { samples: marks.length, full, offBy: +offBy.toFixed(3),
        rose: marks.length > 2 && marks[marks.length - 1].w > marks[0].w,
        x: marks.length ? marks[0].x : null,
        spanSeen: marks.length ? marks[0].span : null };
      await sleep(600);

      // --- a press mid-fill restarts it ------------------------------------
      window.ring.skip();
      await waitFor(() => ctl.state.cut, 8000);
      await waitFor(() => (width() || 0) > 12, 8000);
      const before = { w: width(), asked: ctl.state.cut.askedAt };
      window.ring.skip();
      const again = await waitFor(() => ctl.state.cut && ctl.state.cut.askedAt > before.asked, 8000);
      await frame(200);
      out.restart = { was: before.w, now: width(), again, movedAsk: again && ctl.state.cut.askedAt > before.asked };
      await waitFor(() => !ctl.readout().mix.cutting, 90000);
      await sleep(500);

      // --- back goes the other way ------------------------------------------
      window.ring.back();
      await waitFor(() => ctl.state.cut && ctl.state.cut.kind === 'back', 8000);
      await waitFor(() => (width() || 0) > 8, 8000);
      const b = wedge();
      out.back = { x: +b.getAttribute('x'), w: +b.getAttribute('width'), kind: ctl.state.cut.kind };
      await waitFor(() => !ctl.readout().mix.cutting, 90000);
      await sleep(500);

      // --- and the dice sweep a sector --------------------------------------
      window.ring.newMix();
      await waitFor(() => ctl.state.cut && ctl.state.cut.kind === 'cast', 12000);
      await waitFor(() => spiral() && (spiral().getAttribute('d') || '').length > 4, 12000);
      const d0 = spiral() ? spiral().getAttribute('d') : null;
      await sleep(900);
      const d1 = spiral() ? spiral().getAttribute('d') : null;
      // the last point of the arc, read off the path's own words: no regular
      // expression, because this source is a template literal and a backslash
      // in one is not a backslash by the time the page sees it.
      const sweep = (d) => {
        if (!d) return null;
        const w = d.split(' ');
        if (w[w.length - 1] !== 'Z') return null;
        const x = +w[w.length - 3];
        const y = +w[w.length - 2];
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        const a = Math.atan2(x, -y);
        return +(a < 0 ? a + Math.PI * 2 : a).toFixed(4);
      };
      out.dice = { path: !!spiral(), noWedge: !wedge(), from: sweep(d0), to: sweep(d1),
        startsAtTwelve: !!(d0 && /^M 0 0 L 0 -/.test(d0)) };
      ctl.stop();
      await sleep(300);
      return out;
    `),
    judge: (r) => {
      // A frame at sixty is 16.7 ms, and the fill spans the whole wait, so one
      // frame of the drawing is the whole bar divided by the wait in frames.
      const frameOf = (r.forward.full || 67) * (1 / 60) / Math.max(0.001, r.forward.spanSeen || 1);
      const tight = r.forward.offBy <= Math.max(frameOf, 1.5);
      const grew = r.forward.rose && r.forward.full > 40;
      const rightWay = r.forward.x != null && r.forward.x < 0 && r.back.x > 0;
      const restarted = r.restart.again && r.restart.now < r.restart.was;
      const spiral = r.dice.path && r.dice.noWedge && r.dice.startsAtTwelve
        && r.dice.from != null && r.dice.to != null && r.dice.to > r.dice.from;
      return {
        ok: r.beforeAnyPress && tight && grew && rightWay && restarted && spiral,
        why: !r.beforeAnyPress ? 'the untouched ring carries a fill group before anything was pressed'
          : !grew ? `the fill reached ${r.forward.full} over ${r.forward.samples} frames`
          : !tight ? `the drawing is ${r.forward.offBy} units off the seam's own clock, where a frame of it is ${frameOf.toFixed(2)}`
          : !rightWay ? `forward fills from x ${r.forward.x} and back from x ${r.back.x}`
          : !restarted ? `a press mid-fill left the fill at ${r.restart.now} against ${r.restart.was} (the ask moved: ${r.restart.movedAsk})`
          : `the dice drew ${JSON.stringify(r.dice)}`,
        note: `a forward fill runs the ${r.forward.spanSeen ? r.forward.spanSeen.toFixed(2) : '?'} s the seam itself says — `
          + `${r.forward.samples} frames of it never more than ${r.forward.offBy} units off the transport's own two numbers, `
          + `where one frame of the drawing is ${frameOf.toFixed(2)} — it sweeps out from x ${r.forward.x} and back from x ${r.back.x}, `
          + `a press mid-fill puts it back from ${r.restart.was} to ${r.restart.now}, and the dice sweep a sector from twelve o'clock `
          + `through ${((r.dice.to - r.dice.from) * 180 / Math.PI).toFixed(0)}° with no bar drawn at all; `
          + `and nothing of any of it exists on a ring nobody has pressed`,
      };
    },
  },

  {
    name: 'the journal walks back across casts, and a reload keeps it',
    area: 'journal',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // `notes/archive/2026-09-plans/cited/PLAN-BIRDS-UX.md` §3b, Eugene: *"back, back, back should restore the seed
    // you were on three tracks ago, and forward, forward re-advance."* The
    // arithmetic of the walk is swept in `npm run check`; what only a browser
    // can say is that a walk across a cast is a hand-over into the right place
    // and that a second page of this origin reads the same journal back.
    deadline: 300000,
    setup: () => ({ a: '15576', b: '92970', c: '21323' }),
    page: body(`
      const S = window.__setup;
      const seed = () => ctl.readout().seed;
      // zero-based, which is the journal's own count and the transport's; the
      // readout's mix.themeNumber is the one-based one a listener reads.
      const theme = () => ctl.state.themeIndex;
      const walk = () => ctl.journal.entries.map((e) => e.seed + '#' + e.theme);
      // **A long evening, written first** (09-24). This used to walk whatever
      // the rows before it had written into a page they all shared, which was
      // the evening it was meant to walk: everything asked below is relative
      // to where the journal stands — what two backs land on, and that the
      // walk's length does not move — so a long evening is a better subject
      // than a fresh one. A row has a page of its own now, so the evening is
      // written here, the way the transport writes one: forty arrivals of
      // other seeds, themes, engines and spells, before this row's own three.
      for (let i = 0; i < 40; i++) {
        ctl.journal.arrived({ seed: String(500 + i), theme: i % 3, strategy: i % 4 ? 'house-v2' : 'house-v1',
          spell: i % 5 ? null : { veil: 0.8 } }, { bar: 1 });
      }
      ctl.setSeed(S.a);
      await sleep(200);
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2, 15000);
      const out = { first: { seed: seed(), theme: theme() }, walk0: walk() };
      // two casts, each landing
      for (const to of [S.b, S.c]) {
        ctl.setSeed(to);
        await waitFor(() => seed() === to, 90000);
        await sleep(250);
      }
      out.afterCasts = { walk: walk(), at: ctl.journal.at, here: seed() + '#' + theme() };
      // back, back
      const backs = [];
      for (const want of [S.b, S.a]) {
        ctl.back();
        await waitFor(() => seed() === want, 90000);
        await sleep(250);
        backs.push(seed() + '#' + theme());
      }
      out.back = { landed: backs, walk: walk(), at: ctl.journal.at, playing: ctl.playing, url: location.search };
      // forward, forward
      const ons = [];
      for (const want of [S.b, S.c]) {
        ctl.skip();
        await waitFor(() => seed() === want, 90000);
        await sleep(250);
        ons.push(seed() + '#' + theme());
      }
      out.forward = { landed: ons, walk: walk(), at: ctl.journal.at };
      ctl.stop();
      await sleep(300);
      // A second page of this origin, which is what a reload is: the same
      // storage, read by a transport that has never seen this session.
      const here = ctl.journal.here;
      const frame_ = document.createElement('iframe');
      frame_.style.cssText = 'position:fixed;left:-9999px;width:400px;height:800px;border:0';
      // The address for that place, through the page's own writer: the link's
      // table and not a second parse of it here (\`src/link.ts\`).
      const asked = ctl.link.read();
      const search = ctl.link.write({ seed: here.seed, theme: here.theme, strategy: here.strategy,
        spell: asked.spell, recipe: asked.recipe, accompaniment: asked.accompaniment, development: asked.development });
      frame_.src = location.pathname + '?' + search + (ctl.link.raw('out', '?' + search) ? '' : '&out=silent');
      document.body.appendChild(frame_);
      const up = await waitFor(() => { try { return !!(frame_.contentWindow && frame_.contentWindow.ring); } catch (e) { return false; } }, 25000);
      out.reload = up ? {
        walk: frame_.contentWindow.ring.control.journal.entries.map((e) => e.seed + '#' + e.theme),
        at: frame_.contentWindow.ring.control.journal.at,
        seed: frame_.contentWindow.ring.control.readout().seed,
        theme: frame_.contentWindow.ring.control.state.themeIndex,
      } : { up: false };
      frame_.remove();
      out.late = window.deepHouse.late.count;
      return out;
    `),
    judge: (r, setup) => {
      const three = r.afterCasts.walk.length;
      // the forty written first, and this row's own three
      const long = three >= 43;
      const backed = r.back.landed.length === 2
        && r.back.landed[0] === `${setup.b}#0`
        && r.back.landed[1].startsWith(`${setup.a}#`);
      const kept = r.back.walk.length === three && r.forward.walk.length === three;
      const returned = r.forward.landed.join(' ') === `${setup.b}#0 ${setup.c}#0`;
      const url = r.back.url.includes(`seed=${setup.a}`);
      const reloaded = r.reload && r.reload.walk && r.reload.walk.join(' ') === r.forward.walk.join(' ')
        && r.reload.at === r.forward.at;
      return {
        ok: long && backed && kept && returned && url && reloaded && r.back.playing && !r.late,
        why: !long ? `the evening was ${three} entries long where forty were written before this row's three`
          : !backed ? `back, back landed on ${r.back.landed.join(' ')}`
          : !kept ? `the walk was ${three} entries and is ${r.back.walk.length} after backing and ${r.forward.walk.length} after going on`
          : !returned ? `forward, forward landed on ${r.forward.landed.join(' ')}`
          : !url ? `the address bar says ${r.back.url}`
          : !reloaded ? `a second page of this origin read ${JSON.stringify(r.reload)} against ${r.forward.walk.join(' ')} at ${r.forward.at}`
          : !r.back.playing ? 'the set stopped somewhere in the walk'
          : `${r.late} notes reached late`,
        note: `an evening of ${three} entries, the last three cast by hand (… ${r.afterCasts.walk.slice(-3).join(' ')}); back, back landed on ${r.back.landed.join(' ')} — the first of those seeds' own theme, `
          + `as a hand-over with the set still playing — with the journal still ${r.back.walk.length} entries long and nothing removed, `
          + `forward, forward returned along ${r.forward.landed.join(' ')}, the address bar carried the entry, and a second page of `
          + `this origin read the same ${r.reload.walk.length} entries back at the same pointer`,
      };
    },
  },

  {
    name: 'the journal walks back under the recipe it wrote down',
    area: 'journal',
    // The page review of 09-22, finding 8: an entry names the recipe it was
    // heard under, and a walk back hands the transport that row. Under
    // `?recipe=auto` every seed draws its own, so two casts and a back is a
    // walk across two recipes.
    query: 'v=2&seed=15576&recipe=auto',
    deadline: 300000,
    page: body(`
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 15000);
      const first = { seed: ctl.readout().seed, recipe: ctl.readout().recipe };
      ctl.setSeed('92970');
      await waitFor(() => ctl.readout().seed === '92970', 90000);
      await sleep(250);
      const second = { seed: ctl.readout().seed, recipe: ctl.readout().recipe };
      ctl.back();
      await waitFor(() => ctl.readout().seed === first.seed, 90000);
      await sleep(250);
      const here = ctl.journal.here;
      const back = { seed: ctl.readout().seed, recipe: ctl.readout().recipe, playing: ctl.mix && ctl.mix.recipe && ctl.mix.recipe.id, wrote: here && here.recipe };
      ctl.stop();
      await sleep(300);
      return { first, second, back };
    `),
    judge: (r) => ({
      ok: !!r.first.recipe && r.back.seed === r.first.seed && r.back.recipe === r.first.recipe && !!r.back.wrote && r.back.playing === r.back.wrote,
      why: `seed ${r.first.seed} under ${r.first.recipe}, then ${r.second.seed} under ${r.second.recipe}; back landed on ${r.back.seed} under ${r.back.recipe}, the mix playing ${r.back.playing} against the entry's ${r.back.wrote}`,
      note: `seed ${r.first.seed} under "${r.first.recipe}", a cast to ${r.second.seed} under "${r.second.recipe}", and back landed on ${r.back.seed} with the mix playing ${r.back.playing} — the row the entry wrote down`,
    }),
  },

  {
    name: 'the page has one key, the top of it is the name, and the way into the view is a mark in the corner',
    area: 'ring',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // Eugene, 09-19: no keyboard shortcut for any tooling or behaviour; the
    // space bar is the only key, and the machine view is reached by a control.
    // Six shortcuts went — the two arrows, `n`, `m`, `Home` and `Shift+R` — and
    // this is the line that keeps them gone. A key that reaches a control
    // because the control has focus is not a shortcut, so Tab and Enter on the
    // mark itself are part of what passes here.
    deadline: 300000,
    page: body(`
      const fire = (key, extra) => window.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key, bubbles: true, cancelable: true }, extra || {})));
      const mark = document.getElementById('panel');
      const out = {};
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1.5, 15000);
      const was = { seed: ctl.readout().seed, theme: ctl.state.themeIndex, playing: ctl.playing, view: window.ring.machine.on };
      for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'n', 'N', 'm', 'M', 'Home', 'End', 'r', 'Escape', 'Enter']) fire(k);
      fire('R', { shiftKey: true });
      await sleep(900);
      out.keys = { was, now: { seed: ctl.readout().seed, theme: ctl.state.themeIndex, playing: ctl.playing, view: window.ring.machine.on } };
      // the space bar, and only the space bar
      fire(' ');
      out.space = { paused: await waitFor(() => !ctl.playing, 9000) };
      fire(' ');
      out.space.played = await waitFor(() => ctl.playing, 15000);
      // the mark: where it is, what it is made of, and that it is both doors
      const r = mark.getBoundingClientRect();
      out.mark = {
        fromRight: Math.round(innerWidth - r.right), fromBottom: Math.round(innerHeight - r.bottom),
        w: Math.round(r.width), h: Math.round(r.height),
        label: mark.getAttribute('aria-label'), tab: mark.tabIndex, tag: mark.tagName,
        ink: getComputedStyle(mark).color,
        marks: Array.from(mark.querySelectorAll('svg > *')).map((n) => n.tagName),
        filled: Array.from(mark.querySelectorAll('svg > *')).filter((n) => {
          const f = n.getAttribute('fill') || getComputedStyle(n).fill;
          return f && f !== 'none';
        }).length,
      };
      mark.focus();
      out.mark.focusable = document.activeElement === mark;
      // **The top of the page is the app's name, and nothing else** (09-20).
      // The v1 | v2 toggle that stood there under the dev flag is gone — the
      // machine view's selector is the one switch — and the name that replaced
      // it is the page's own h1, drawn rather than hidden, so the heading a
      // search engine reads and the name a listener sees are one element.
      const h1s = [...document.querySelectorAll('h1')];
      const name = document.getElementById('name');
      const nr = name ? name.getBoundingClientRect() : null;
      const ns = name ? getComputedStyle(name) : null;
      out.name = {
        tag: name && name.tagName,
        headings: h1s.length,
        isHeading: !!name && h1s.length === 1 && h1s[0] === name,
        // the name is the wordmark's alt since 09-23: what a reader is told
        text: name && (name.textContent.trim() || [...name.querySelectorAll('img')].map((i) => i.alt).join(' ')),
        wordmark: !!name && name.children.length === 1 && name.children[0].tagName === 'IMG' && (name.children[0].getAttribute('src') || '').endsWith('wordmark.svg'),
        shown: !!nr && nr.width > 0 && nr.height > 0 && ns.visibility !== 'hidden' && +ns.opacity > 0.2,
        fromTop: nr ? Math.round(nr.top) : null,
        fromLeft: nr ? Math.round(nr.left) : null,
        centred: nr ? Math.abs((nr.left + nr.right) / 2 - innerWidth / 2) : null,
        ink: ns && ns.color,
        size: ns && ns.fontSize,
        weight: ns && ns.fontWeight,
        family: ns && ns.fontFamily.split(',')[0].replace(/['"]/g, ''),
        lines: nr && ns ? Math.round(nr.height / parseFloat(ns.fontSize)) : null,
        // no ornament: the wordmark and nothing else
        children: name ? name.children.length : null,
        border: ns && [ns.borderTopWidth, ns.borderBottomWidth, ns.borderLeftWidth, ns.borderRightWidth].join(' '),
        background: ns && ns.backgroundColor,
      };
      // **It is a title, so what it must not do is crowd the sigil.** The ring
      // is min(94vmin, 960px) and the outermost thing it draws is the section
      // ring at 0.862 of that box's radius; the name's own box has to stand
      // clear of that circle, and of the panel mark in the other corner.
      {
        const t = box('tilt');
        const rr = (Math.min(t.width, t.height) / 2) * 0.862;
        const cx = t.x + t.width / 2;
        const cy = t.y + t.height / 2;
        const dx = Math.max(nr.left - cx, 0, cx - nr.right);
        const dy = Math.max(nr.top - cy, 0, cy - nr.bottom);
        out.name.clearsRing = Math.round(Math.hypot(dx, dy) - rr);
        const m = mark.getBoundingClientRect();
        out.name.clearsMark = !(nr.right > m.left && nr.left < m.right && nr.bottom > m.top && nr.top < m.bottom);
        out.name.ofScreen = +(nr.width / innerWidth).toFixed(3);
      }
      out.toggle = !!document.getElementById('engines');
      mark.click();
      out.opened = await waitFor(() => window.ring.machine.on, 25000);
      await sleep(400);
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const nv = document.getElementById('name');
      // (M8) the mark is the way in and is not seen in the view; the way out is the RING key
      out.inView = { onTop: !!(hit && hit.closest && hit.closest('#panel')), hidden: mark.getBoundingClientRect().width === 0, expanded: mark.getAttribute('aria-expanded'),
        ink: getComputedStyle(mark).color, playing: ctl.playing,
        // the name follows the credit's own rule and stands aside for the
        // engineer's face, which lays out its own stack from the very top
        name: !!nv && nv.getBoundingClientRect().height > 0 };
      document.querySelector('#machine [data-exit="view"]').click();
      out.closed = await waitFor(() => !window.ring.machine.on, 15000);
      await sleep(300);
      out.after = { expanded: mark.getAttribute('aria-expanded'), playing: ctl.playing, late: window.deepHouse.late.count };
      out.nameBack = (() => { const n = document.getElementById('name'); const b = n && n.getBoundingClientRect(); return !!b && b.height > 0; })();
      ctl.stop();
      await sleep(300);
      return out;
    `),
    judge: (r) => {
      const k = r.keys;
      const deaf = k.now.seed === k.was.seed && k.now.theme === k.was.theme
        && k.now.playing === k.was.playing && k.now.view === k.was.view;
      const space = r.space.paused && r.space.played;
      // (since K28 the mark is a 44 px touch target round a 21.6 px gear)
      const corner = r.mark.fromRight <= 24 && r.mark.fromBottom <= 60 && r.mark.w <= 48 && r.mark.h <= 48;
      const drawn = r.mark.marks.length === 2 && r.mark.filled === 0;
      const reachable = r.mark.tag === 'BUTTON' && r.mark.tab === 0 && !!r.mark.label && r.mark.focusable;
      const both = r.opened && !r.inView.onTop && r.inView.hidden && r.inView.expanded === 'true' && r.closed && r.after.expanded === 'false';
      const n = r.name;
      // the one heading, drawn, small, no ornament and out of the top corner
      // A title and not a label: white, heavier than the page's own text, one
      // line, big enough to be read first, and clear of the ring and the corner
      // mark. The weight and the size are Eugene's own numbers, tuned on the
      // built page — a title that is too bold is a banner — so what is held
      // here is that it is *above* the body's 400 and not that it is the
      // heaviest the family has.
      const named = n.isHeading && n.text === 'Deep House' && n.shown && n.children === 1 && n.wordmark
        && n.background === 'rgba(0, 0, 0, 0)' && /^0px 0px 0px 0px$/.test(n.border)
        && n.ink === 'rgb(255, 255, 255)' && +n.weight >= 500 && n.lines === 1
        && parseFloat(n.size) >= 20 && n.ofScreen >= 0.2
        && n.clearsRing > 0 && n.clearsMark
        && n.fromTop <= 40 && (n.fromLeft <= 40 || n.centred <= 2)
        && !r.toggle && !r.inView.name && r.nameBack;
      return {
        ok: deaf && space && named && corner && drawn && reachable && both && r.inView.playing && r.after.playing && !r.after.late,
        why: !deaf ? `fourteen keys moved the set from ${JSON.stringify(k.was)} to ${JSON.stringify(k.now)}`
          : !space ? `the space bar paused ${r.space.paused} and played ${r.space.played}`
          : !named ? `the name reads ${JSON.stringify(n)}${r.toggle ? ', and the v1 | v2 toggle is still on the page' : ''}${r.inView.name ? ', and it stands over the machine view' : ''}${r.nameBack ? '' : ', and it did not come back with the ring'}`
          : !corner ? `the mark sits ${r.mark.fromRight} from the right and ${r.mark.fromBottom} from the bottom at ${r.mark.w}x${r.mark.h}`
          : !drawn ? `the mark is ${r.mark.marks.join('+')} with ${r.mark.filled} filled`
          : !reachable ? `the mark is a ${r.mark.tag} at tabindex ${r.mark.tab} labelled ${r.mark.label}`
          : !both ? `opened ${r.opened}, seen over the view ${r.inView.onTop} (hidden ${r.inView.hidden}), closed ${r.closed}, expanded ${r.inView.expanded} then ${r.after.expanded}`
          : !r.after.playing ? 'the set stopped across the flip'
          : `${r.after.late} notes reached late`,
        note: `fourteen keys — both arrows, n, m, Home, End, r, Escape, Enter and Shift+R — move nothing at all, and the space bar pauses and plays; `
          + `the top of the page is the app's own name as a title — the page's one <h1>, drawn at ${n.size} in ${n.ink} at weight ${n.weight}, one line `
          + `${(n.ofScreen * 100).toFixed(0)} % of the screen wide, ${n.fromTop} px down, clearing the ring by ${n.clearsRing} px and the corner mark entirely, `
          + `the wordmark its one child with no border and no ground behind it; no engine toggle anywhere on the page, and it stands aside for the engineer's face and comes back with the ring; `
          + `the way in is a ${r.mark.w}x${r.mark.h} button ${r.mark.fromRight} px from the right and ${r.mark.fromBottom} from the bottom, `
          + `drawn as ${r.mark.marks.join(' and a ')} with nothing filled, in ${r.mark.ink} over the page's black, labelled and at tabindex 0; `
          + `it opens the view and is not seen over it (M8: the RING key is the way back, and closed it), with the set playing throughout`,
      };
    },
  },

  {
    name: 'the title is the wordmark, white, named Deep House, where the type stood',
    area: 'ring',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // 09-23: the header's DEEP HOUSE became `wordmark.svg`, drawn from Jost
    // Medium, and the rule it was placed by is that **nothing moved**: its cap
    // line and the D's stem stand where the type's stood. The type's were read
    // off the pixels of the last build with the text (`local` bcf03e2, headless
    // Chromium, the system Futura) and are written here as numbers: at
    // 1280 x 800 the D's stem at x 22.63 and the cap line at y 24.51; at
    // 390 x 844 the cap line at y 22.54, and the ink centred on the page, which
    // puts a narrower mark's stem at 110.64 (the type's was 103.06, and its ink
    // 1.75 px left of centre because the tracking trailed the last E). Each
    // width is a page of its own in a frame of that size, so the clamp and the
    // media query answer as they would on that screen. Held to a pixel. And
    // the mark is white — every fill in the file is `#ffffff`, and nothing on
    // the page tints, fades or blends the picture — and the heading's name is
    // "Deep House" from the picture's alt.
    deadline: 90000,
    setup: () => ({
      sizes: [
        { w: 1280, h: 800, stem: 22.63, cap: 24.51, centred: false },
        { w: 390, h: 844, stem: 110.64, cap: 22.54, centred: true },
      ],
    }),
    page: body(`
      const out = [];
      for (const z of window.__setup.sizes) {
        const f = document.createElement('iframe');
        f.style.cssText = 'position:fixed;left:-9999px;top:0;border:0;width:' + z.w + 'px;height:' + z.h + 'px';
        f.src = location.pathname + '?out=silent';
        document.body.appendChild(f);
        const up = await waitFor(() => { try { const d = f.contentDocument; const i = d && d.querySelector('#name img'); return !!(f.contentWindow.ring && i && i.complete && i.naturalWidth); } catch (e) { return false; } }, 30000);
        if (!up) { out.push({ w: z.w, up: false }); f.remove(); continue; }
        const d = f.contentDocument, w = f.contentWindow;
        const h1 = d.getElementById('name');
        const img = h1.querySelector('img');
        const r = img.getBoundingClientRect();
        const cs = w.getComputedStyle(img), hs = w.getComputedStyle(h1);
        const [, , vw, vh] = (await (await fetch(img.src)).text()).match(/viewBox="([\\d.\\s]+)"/)[1].trim().split(/\\s+/).map(Number);
        const svg = await (await fetch(img.src)).text();
        const fills = [...svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1].toLowerCase());
        // the O's overshoot is the top of the viewBox; the cap line is the D's top
        const over = +(/^M0 (\\d+)/.exec(svg.match(/ d="([^"]+)"/)[1]) || [0, 0])[1];
        out.push({
          w: z.w, up: true,
          stem: +r.left.toFixed(2), cap: +(r.top + r.height * over / vh).toFixed(2),
          centre: +((r.left + r.right) / 2 - w.innerWidth / 2).toFixed(2),
          ratio: +(r.width / r.height).toFixed(4), box: +(vw / vh).toFixed(4),
          fills, opacity: cs.opacity + '/' + hs.opacity, blend: cs.mixBlendMode,
          filter: cs.filter, alt: img.alt, h1Text: h1.textContent.trim(),
          only: h1.children.length === 1 && d.querySelectorAll('h1').length === 1,
        });
        f.remove();
      }
      return out;
    `),
    judge: (r, setup) => {
      const bad = [];
      for (const [i, z] of setup.sizes.entries()) {
        const x = r[i];
        if (!x || !x.up) { bad.push(`${z.w} px: the page in the frame never drew its title`); continue; }
        if (Math.abs(x.stem - z.stem) > 1) bad.push(`${z.w} px: the D's stem at ${x.stem}, not ${z.stem}`);
        if (Math.abs(x.cap - z.cap) > 1) bad.push(`${z.w} px: the cap line at ${x.cap}, not ${z.cap}`);
        if (z.centred && Math.abs(x.centre) > 1) bad.push(`${z.w} px: the mark's centre ${x.centre} px off the page's`);
        if (Math.abs(x.ratio - x.box) > 0.01) bad.push(`${z.w} px: drawn ${x.ratio} wide per tall where the file is ${x.box}`);
        if (!x.fills.length || x.fills.some((c) => c !== '#ffffff' && c !== '#fff')) bad.push(`${z.w} px: the file is filled ${x.fills.join(' ')}`);
        if (x.opacity !== '1/1' || x.blend !== 'normal') bad.push(`${z.w} px: opacity ${x.opacity}, blend ${x.blend}`);
        if ((x.filter.match(/rgb\((\d+), (\d+), (\d+)\)/g) || []).some((c) => c !== 'rgb(5, 4, 10)')) bad.push(`${z.w} px: a filter with a colour in it, ${x.filter}`);
        if (/hue-rotate|sepia|saturate|invert|brightness|contrast/.test(x.filter)) bad.push(`${z.w} px: the filter ${x.filter} would tint it`);
        if (x.alt !== 'Deep House' || x.h1Text !== '' || !x.only) bad.push(`${z.w} px: named ${JSON.stringify(x.alt)} with ${JSON.stringify(x.h1Text)} beside it`);
      }
      return {
        ok: !bad.length,
        why: bad.join('; '),
        note: r.map((x, i) => `at ${setup.sizes[i].w} px the D's stem is at ${x.stem} (${setup.sizes[i].stem}) and the cap line at ${x.cap} (${setup.sizes[i].cap})`
          + `${setup.sizes[i].centred ? `, centred to ${x.centre} px` : ''}`).join('; ')
          + '; the file is filled white and nothing tints it, and the heading is named "Deep House" by the picture\'s alt',
      };
    },
  },

  {
    name: 'a near tempo move blends beat-matched on the outgoing grid and glides a bar a percent after it, and the wait says so',
    area: 'seam',
    // The fault pass of 09-24, the seam's tempo rule, near: a cast from seed 19
    // (96 BPM) to seed 1 (104) is 8.3 %. The arriving theme's first note is on
    // the outgoing grid, the grid glides after the blend over nine bars and not
    // sixteen, and `settleIn` at the ask names when the readout's tempo is the
    // arriving theme's own.
    deadline: 240000,
    query: 'v=2&seed=19',
    page: body(SEAM_TEMPO + `
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2, 12000);
      const r = await measureSeam(() => ctl.setSeed('1'));
      ctl.stop();
      return r;
    `),
    judge: (r) => {
      if (r.noSeam) return { ok: false, why: 'the cast armed no hand-over' };
      const glide = r.reached - r.end;
      const bars = Math.ceil((r.own / r.from - 1) * 100 - 1e-9);
      const ok = Math.abs(r.firstNote - r.from) < 0.1 && r.per === 1 && r.reached != null
        && Math.abs(glide - bars * r.bar) < r.bar && Math.abs(r.said - r.reached) < r.bar;
      return {
        ok,
        why: `${r.from.toFixed(1)} → ${r.own.toFixed(1)}: the arriving theme's first note at ${r.firstNote.toFixed(2)} BPM (${r.per}:1); `
          + `the glide after the blend took ${glide.toFixed(1)} s where ${bars} bars are ${(bars * r.bar).toFixed(1)}; settleIn said ${r.said.toFixed(1)} s, heard at ${r.reached}`,
        note: `${r.from.toFixed(1)} → ${r.own.toFixed(1)} BPM: blended on the outgoing grid from ${r.askToSeam.toFixed(1)} s over ${r.crossover.toFixed(1)} s, `
          + `glided ${bars} bars (${glide.toFixed(1)} s) after it, on its own tempo ${r.reached.toFixed(1)} s after the ask, which settleIn said at ${r.said.toFixed(1)}`,
      };
    },
  },

  {
    name: 'a half and a double tempo move are counted two to one on the shared grid, with no glide in the blend',
    area: 'seam',
    // The fault pass of 09-24, half and double: Ember 104 → 54 on seed 1 is
    // 0.52, a half; 54 → 104 back is 1.92, a double. The arriving theme is
    // counted one of its beats to two of the grid's (and two to one), so its
    // first note is at its own tempo within the 4 % left, which glides after.
    deadline: 400000,
    query: 'v=2&seed=1&spell=ember:0.5',
    page: body(SEAM_TEMPO + `
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2, 12000);
      const half = await measureSeam(() => ctl.setSpell({ ember: 0 }));
      await sleep(1500);
      const double = await measureSeam(() => ctl.setSpell({ ember: 0.5 }));
      ctl.stop();
      return { half, double };
    `),
    judge: (r) => {
      const bad = [];
      for (const [name, x, per] of [['half', r.half, 0.5], ['double', r.double, 2]]) {
        if (x.noSeam) { bad.push(`${name}: no hand-over`); continue; }
        if (x.per !== per) bad.push(`${name}: counted ${x.per}:1`);
        if (Math.abs(x.firstNote - x.from * per) > 0.1) bad.push(`${name}: the first note at ${x.firstNote.toFixed(2)} BPM, not ${per} × ${x.from.toFixed(2)}`);
        if (Math.abs(x.firstNote - x.own) / x.own > 0.08) bad.push(`${name}: the first note ${x.firstNote.toFixed(2)} is more than 8 % off its own ${x.own.toFixed(2)}`);
        if (x.reached == null || Math.abs(x.said - x.reached) > x.bar) bad.push(`${name}: settleIn said ${x.said.toFixed(1)} s and it was heard at ${x.reached}`);
      }
      return {
        ok: !bad.length,
        why: bad[0],
        note: `104 → 54: the arriving theme counted 1:2, first note ${r.half.firstNote.toFixed(1)} BPM (own ${r.half.own.toFixed(1)}), on its own at ${r.half.reached.toFixed(1)} s (settleIn ${r.half.said.toFixed(1)}); `
          + `54 → 104: 2:1, first note ${r.double.firstNote.toFixed(1)} (own ${r.double.own.toFixed(1)}), on its own at ${r.double.reached.toFixed(1)} s (settleIn ${r.double.said.toFixed(1)})`,
      };
    },
  },

  {
    name: 'a theme never opens silent: 26925 theme 4 under Eugene\'s drums-off spell sounds in its first bar',
    area: 'transport',
    // Round S13, his link: 19.6 s of digital silence at the start, the intro's
    // one allowed harmonic layer dropped by a roll that did not ask the
    // section. Rendered offline off the page's own plan: the first bar's peak
    // and the first note's time.
    deadline: 120000,
    query: 'seed=26925&v=2&theme=4&spell=em:0.10,ti:1.00,ze:0.00,ro:1.00,gl:0.00,ve:0.00',
    page: body(`
      const dh = window.deepHouse;
      const t = dh.planTheme('26925', 3, { strategy: 'house-v2', spell: { ember: 0.10, tide: 1, zephyr: 0, root: 1, gleam: 0, veil: 0 } });
      const p = dh.programOf(t);
      const bs = p.barSeconds;
      const first = Math.min(...p.events.map((e) => e.t));
      const slice = dh.sliceProgram(p, { from: 0, to: bs, tail: 0.01 });
      const buf = await dh.renderProgram(slice, { sampleRate: 48000 });
      const L = buf.getChannelData(0), R = buf.getChannelData(1);
      let peak = 0; for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
      return { first, bs, peakDb: 20 * Math.log10(peak + 1e-12), layers: t.timeline[0].layers };
    `),
    judge: (r) => ({
      ok: r.first < r.bs && r.peakDb > -40,
      why: `the first note at ${r.first.toFixed(2)} s of a ${r.bs.toFixed(2)} s bar, the first bar's peak ${r.peakDb.toFixed(1)} dBFS, its layers ${JSON.stringify(r.layers)}`,
      note: `26925 theme 4 opens on ${JSON.stringify(r.layers)}: its first note at ${r.first.toFixed(2)} s and its first bar peaking at ${r.peakDb.toFixed(1)} dBFS`,
    }),
  },

  {
    name: 'a far tempo jump rides the outgoing theme to the new tempo first and blends there: Ember 49 → 126 BPM, the arriving theme never off its own tempo',
    area: 'seam',
    // The fault pass of 09-24, far, Eugene's own: *"Ember 50 → 120 … the start
    // of a new song at ~100, then about a minute to ramp to 120"*. Seed 27191:
    // Ember at nought is a drone at 49 BPM, at 0.7 a drummed theme at 126. The
    // grid is ridden to 126 over the bars before the blend, the blend begins at
    // 126 and the arriving theme's first note is at 126, and the readout says
    // 126 at the swap, which is when settleIn said it would.
    deadline: 300000,
    query: 'v=2&seed=27191&spell=ember:0',
    page: body(SEAM_TEMPO + `
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2, 12000);
      const r = await measureSeam(() => ctl.setSpell({ ember: 0.7 }));
      ctl.stop();
      return r;
    `),
    judge: (r) => {
      if (r.noSeam) return { ok: false, why: 'the pull armed no hand-over' };
      const ok = Math.abs(r.firstNote - r.own) < 0.05 && r.ridden != null && Math.abs(r.ridden - r.from) > 30
        && r.reached != null && Math.abs(r.reached - r.swap) < 0.5 && Math.abs(r.said - r.reached) < 1;
      return {
        ok,
        why: `${r.from.toFixed(1)} → ${r.own.toFixed(1)}: the grid read ${r.ridden} as the blend began, the arriving theme's first note at ${r.firstNote.toFixed(2)} BPM; `
          + `on its tempo at ${r.reached} s with the swap at ${r.swap.toFixed(1)}; settleIn said ${r.said.toFixed(1)}`,
        note: `${r.from.toFixed(1)} → ${r.own.toFixed(1)} BPM: ridden to ${r.ridden} before the blend, which began ${r.askToSeam.toFixed(1)} s after the ask at the arriving theme's own `
          + `${r.firstNote.toFixed(1)}; the readout said ${r.own.toFixed(1)} at the swap, ${r.reached.toFixed(1)} s, as settleIn said at the ask (${r.said.toFixed(1)})`,
      };
    },
  },

  {
    name: 'a drummed theme arriving over a drone brings its kick from its first bar, and a drone arriving under a drummed theme leaves it its kick to the end',
    area: 'seam',
    // The fault pass of 09-24, the entry: the arriving theme's kick was holed
    // from its first bar to the swap and the outgoing one's from a bar before
    // it, so two kicks could never overlap — and with a drone on the other deck
    // there is only one kick, so a drummed theme came in over a drone as eight
    // bars of groove with no kick and then dropped its kick at the swap. Seed 1:
    // Ember at nought is a drone at 54 BPM, at 0.5 a drummed theme at 104.
    deadline: 400000,
    query: 'v=2&seed=1&spell=ember:0',
    page: body(SEAM_TEMPO + `
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2, 12000);
      const into = await measureSeam(() => ctl.setSpell({ ember: 0.5 }), { kicks: true });
      await sleep(1500);
      const out = await measureSeam(() => ctl.setSpell({ ember: 0 }), { kicks: true });
      ctl.stop();
      return { into, out };
    `),
    judge: (r) => {
      if (r.into.noSeam || r.out.noSeam) return { ok: false, why: 'a move armed no hand-over' };
      const a = r.into, b = r.out;
      const seam = a.askToSeam, swap = a.swap;
      // the drummed theme's kicks between its first bar and the swap
      const before = a.kicks.filter((t) => t >= seam - 0.01 && t < swap - 0.01).length;
      const bars = (swap - seam) / (240 / (a.firstNote));
      // the drummed theme going out: its kicks between a bar before the swap and the end
      const tail = b.kicks.filter((t) => t >= b.swap - b.bar - 0.01 && t < b.end).length;
      const ok = before >= Math.floor(bars) * 4 - 1 && tail > 4;
      return {
        ok,
        why: `into the drummed theme: ${before} kicks from its first bar to the swap (${bars.toFixed(1)} of its bars); out of it: ${tail} kicks from a bar before the swap to the end`,
        note: `a drummed theme over a drone struck ${before} kicks between its first bar and the swap — four a bar, none holed — and going out under a drone kept ${tail} to the blend's end`,
      };
    },
  },

  {
    name: 'a far ride down keeps the outgoing theme\'s held notes over the bars they were written for: 126 → 49 on 27191\'s spell never falls silent before the blend',
    area: 'seam',
    // The fault pass of 09-24, the ride's hold: 27191's spell at Ember 0.7 is a
    // drummed theme at 126 BPM, at the benchmark's 0.14 a drone at 49. The ride
    // slows the outgoing theme through its breakdown (bars 20–23: a pad held
    // four bars, keys and a hat), and a held note's length was seconds fixed at
    // 126 — the pad covered two of the stretched bars, and the render read
    // −40 dB for six seconds before the drone entered. Rendered offline through
    // the page's own renderMix, 32-bar themes, one-second levels from the
    // ride's first bar to the blend.
    deadline: 240000,
    query: 'v=2&seed=1',
    page: body(`
      const dh = window.deepHouse;
      const BENCH = { ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 };
      const o = { strategy: 'house-v2', themeBars: 32 };
      const A = dh.planTheme('27191', 1, { ...o, spell: { ...BENCH, ember: 0.7 } });
      const B = dh.planTheme('27191', 2, { ...o, spell: BENCH });
      const probe = await dh.renderMix({ plans: [A, B], opts: { strategy: 'house-v2' }, maxSeconds: 1, sampleRate: 22050 });
      const s = probe.seams[0];
      const out = await dh.renderMix({ plans: [A, B], opts: { strategy: 'house-v2' }, maxSeconds: s.at + 1, sampleRate: 22050 });
      const buf = out.buffer, sr = buf.sampleRate;
      const L = buf.getChannelData(0), R = buf.getChannelData(1);
      const levels = [];
      // from bar 13 of the outgoing theme at its own tempo, where an eleven-bar ride begins
      const from = Math.floor(13 * A.barSeconds);
      for (let t = from; t + 1 <= s.at; t += 1) {
        let e = 0;
        for (let i = Math.floor(t * sr); i < Math.floor((t + 1) * sr); i++) e += (L[i] * L[i] + R[i] * R[i]) / 2;
        levels.push(+(10 * Math.log10(e / sr + 1e-12)).toFixed(1));
      }
      return { bpms: [A.bpm, B.bpm], at: s.at, from, levels };
    `),
    judge: (r) => {
      const worst = Math.min(...r.levels);
      const k = r.levels.indexOf(worst);
      return {
        ok: r.levels.length >= 20 && worst > -25,
        why: `${r.bpms.join(' → ')}: ${r.levels.length} seconds of ride read, the quietest ${worst} dB at ${(r.from + k).toFixed(0)} s (the blend at ${r.at.toFixed(1)} s): ${r.levels.join(' ')}`,
        note: `${r.bpms.join(' → ')} BPM: ${r.levels.length} one-second levels through the ride, the quietest ${worst} dB at ${(r.from + k).toFixed(0)} s, before the blend at ${r.at.toFixed(1)} s`,
      };
    },
  },

  {
    name: 'a bird move keeps the place: the theme playing, under the asked spell, enters at the bar the record is at, and the section goes on with no intro',
    area: 'seam',
    // Eugene, 09-24: *"anywhere I move bass it completely restarts the song,
    // not mixing it"* — seed 51757 at his drone spell (ember 41 %, tide and
    // loom at the rim, root 110 %), Root to 60 % at bar 20: the pull planned
    // the next theme and handed over into its intro. A move keeps the place:
    // the arriving deck is the same theme under the asked spell, entering at
    // the outgoing bar on the phrase line, so at the swap the readout's bar
    // and section are the ones the record was in, and no intro is heard. Then
    // a cast from there still starts its set at bar one.
    deadline: 300000,
    query: 'v=2&seed=51757&spell=ember:0.16,tide:1.00,root:0.81,loom:1.00',
    page: body(`
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
      ctl.seekToBar(20);
      // the seek has landed when the mix itself is past bar 20 (the readout says the bar asked at once)
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed >= 20 * ctl.readout().barSeconds && ctl.mix.state.elapsed < 22 * ctl.readout().barSeconds, 20000);
      await sleep(500);
      const before = { theme: ctl.readout().mix.themeNumber, bar: ctl.readout().bar, section: ctl.readout().section };
      ctl.setSpell({ ...ctl.mix.spell, root: 0.43 });
      const armed = await waitFor(() => ctl.state.cut && ctl.state.cut.kind === 'spell', 8000);
      const cut = armed ? { ...ctl.state.cut } : null;
      if (!cut) { ctl.stop(); return { noSeam: true }; }
      const c = ctl.state.ctx;
      const seen = [];
      const out = ctl.mix.record;
      while (c.currentTime < cut.swapAt + 3) {
        const r = ctl.readout();
        seen.push({ t: c.currentTime, theme: r.mix.themeNumber, bar: r.bar, section: r.section, rec: ctl.mix.record === out ? 'out' : 'in' });
        await sleep(100);
      }
      const r = ctl.readout();
      const outBarAtSwap = (out.clock.beatAt(cut.swapAt) - out.startBeat) / 4;
      const landed = { theme: r.mix.themeNumber, bar: r.bar, section: r.section, root: ctl.mix.spell.root, index: ctl.mix.record.track.index };
      // a cast from here starts at its first bar
      ctl.setSeed('1');
      const castArmed = await waitFor(() => ctl.state.cut && ctl.state.cut.kind !== 'spell', 8000);
      const castCut = castArmed ? { ...ctl.state.cut } : null;
      let castBar = null;
      if (castCut) { await waitFor(() => c.currentTime > castCut.swapAt + 0.3 && ctl.readout().seed === '1', 60000); castBar = { bar: ctl.readout().bar, since: (c.currentTime - castCut.at) / ctl.readout().barSeconds }; }
      ctl.stop();
      return { before, cut: { at: cut.at, swapAt: cut.swapAt }, outBarAtSwap, seen, landed, castBar, late: window.deepHouse.late.count };
    `),
    judge: (r) => {
      if (r.noSeam) return { ok: false, why: 'the move armed no hand-over' };
      const bad = [];
      if (r.landed.theme !== r.before.theme) bad.push(`the move brought theme ${r.landed.theme} where theme ${r.before.theme} was playing`);
      if (Math.abs(r.landed.root - 0.43) > 1e-6) bad.push(`the set plays root ${r.landed.root}`);
      const after = r.seen.filter((x) => x.rec === 'in');
      if (!after.length) bad.push('the arriving plan never became the record');
      else {
        const first = after[0];
        if (Math.abs(first.bar - Math.floor(r.outBarAtSwap)) > 1) bad.push(`at the swap the readout said bar ${first.bar + 1} where the record was at bar ${Math.floor(r.outBarAtSwap) + 1}`);
        if (r.before.bar < 19) bad.push(`the seek to bar 21 never landed (bar ${r.before.bar + 1})`);
        if (after.some((x) => x.section === 'intro' || x.bar < 8)) bad.push(`an intro came back after the swap: ${JSON.stringify(after.find((x) => x.section === 'intro' || x.bar < 8))}`);
        const last = r.seen.filter((x) => x.rec === 'out').pop();
        if (last && first.section !== last.section) bad.push(`the section went from ${last.section} to ${first.section} at the swap`);
      }
      // a cast enters its set at bar one: at the swap it is as many bars in as the blend has run
      if (r.castBar == null || Math.abs(r.castBar.bar - Math.floor(r.castBar.since)) > 1) bad.push(`a cast after it read bar ${r.castBar ? r.castBar.bar + 1 : '-'} ${r.castBar ? r.castBar.since.toFixed(2) : ''} bars after its blend began, so it did not start at its first`);
      if (r.late) bad.push(`${r.late} notes late`);
      const first = after[0] || {};
      return {
        ok: !bad.length,
        why: bad[0],
        note: `Root to 60 % at bar ${r.before.bar + 1} of theme ${r.before.theme} (${r.before.section}): the same theme under the asked root came in on the phrase line and was the record at bar ${first.bar + 1}, `
          + `${first.section}, as the outgoing plan was — no intro — and a cast from there started seed 1 from its first bar (bar ${r.castBar.bar + 1}, ${r.castBar.since.toFixed(1)} bars after its blend began)`,
      };
    },
  },

  {
    name: 'a pull pending at a pause is kept: the play starts from the plan the pull was bringing, and the address and the ring say that plan',
    area: 'transport',
    // Eugene on the preview (09-24): seed 51757 at a drone spell, Zephyr slid
    // to 50 % on the phone, the ring counting the hand-over down and Zephyr
    // reading the keys the move would bring; a pause and a play, and the music
    // came back on the theme the ring had promised away, with the old keys,
    // while the slider and the address still said 50 %. The stop dropped the
    // landing. Here: the same spell (ember 41 %, tide and loom at the rim, root
    // 110 %), Zephyr to 50 % mid-theme, a pause inside the countdown and a
    // play — the theme playing is the one the pull was bringing (since a bird
    // move keeps the place, this theme under the asked spell, at the bar the
    // record was at), planned under the asked spell to the byte, and the
    // address names both; then the same
    // pull asked while stopped plays its plan from the first note.
    deadline: 200000,
    query: 'v=2&seed=51757&spell=ember:0.16,tide:1.00,root:0.81,loom:1.00',
    page: body(`
      const dh = window.deepHouse;
      const Z = 0.19;
      const sig = (t) => JSON.stringify(t.dice) + '|' + t.bars + '|' + t.bpm + '|' + t.events.length;
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 3, 12000);
      const was = { index: ctl.mix.record.track.index, keys: ctl.mix.record.track.dice.keysPreset };
      ctl.setSpell({ ...ctl.mix.spell, zephyr: Z });
      const armed = await waitFor(() => ctl.state.cut && ctl.state.cut.kind === 'spell', 8000);
      const c = ctl.state.ctx;
      const cut = armed ? { ...ctl.state.cut } : null;
      // inside the countdown, a bar before the blend
      if (cut) await waitFor(() => c.currentTime >= cut.at - ctl.readout().barSeconds, 60000);
      // the theme the ring is promising: the one arriving, or the one planned next under the pull
      const coming = ctl.mix.state.incoming || ctl.mix.state.next;
      const promised = coming ? { index: coming.index } : null;
      const pausedAt = ctl.mix.state.elapsed;
      ctl.stop();
      await sleep(400);
      // K34: the first theme is not written, and a link without one is the first,
      // so the theme is read as the page reads it; the raw row is kept to hold the spelling
      const stopped = { theme: String(ctl.link.read().theme + 1), rawTheme: ctl.link.raw('theme'), spell: ctl.link.raw('spell'), readoutIndex: ctl.state.themeIndex, readoutSig: sig(ctl.readout().track), position: ctl.state.position, pausedAt, bar: ctl.readout().barSeconds };
      await started();
      await waitFor(() => ctl.playing && ctl.mix, 8000);
      await sleep(400);
      const t = ctl.mix.record.track;
      const asked = ctl.mix.spell;
      const played = { index: t.index, keys: t.dice.keysPreset, sig: sig(t), want: sig(dh.planTheme('51757', t.index, { strategy: 'house-v2', spell: asked })), zephyr: asked.zephyr, theme: String(ctl.link.read().theme + 1), rawTheme: ctl.link.raw('theme'), spell: ctl.link.raw('spell'), readoutSig: sig(ctl.readout().track) };
      ctl.stop();
      await sleep(400);
      // the same, asked while stopped
      ctl.setSpell({ ...asked, zephyr: 0.6 });
      await sleep(200);
      await started();
      await waitFor(() => ctl.playing && ctl.mix, 8000);
      await sleep(400);
      const u = ctl.mix.record.track;
      const stoppedAsk = { index: u.index, zephyr: ctl.mix.spell.zephyr, sig: sig(u), want: sig(dh.planTheme('51757', u.index, { strategy: 'house-v2', spell: ctl.mix.spell })), spell: ctl.link.raw('spell') };
      ctl.stop();
      return { was, armed, promised, stopped, played, stoppedAsk, late: dh.late.count };
    `),
    judge: (r) => {
      const bad = [];
      if (!r.armed) bad.push('the pull armed no hand-over');
      if (!r.promised) bad.push('the transport named no landing for the pull before the stop');
      else {
        if (r.played.index !== r.promised.index) bad.push(`the play started theme ${r.played.index + 1} where the pull was bringing theme ${r.promised.index + 1}`);
        if (r.played.sig !== r.played.want) bad.push(`the play's plan is not theme ${r.played.index + 1} planned under the asked spell (keys ${r.played.keys})`);
        if (Math.abs(r.played.zephyr - 0.19) > 1e-6 || !/ze:0\.19/.test(r.played.spell || '')) bad.push(`the play is under zephyr ${r.played.zephyr}, the address says "${r.played.spell}"`);
        if (String(r.played.index + 1) !== r.stopped.theme || String(r.played.index + 1) !== r.played.theme) bad.push(`the address named theme ${r.stopped.theme} when stopped and ${r.played.theme} playing, where theme ${r.played.index + 1} plays`);
        // K34: theme one is left out of the address, any other written
        for (const [when, raw] of [['stopped', r.stopped.rawTheme], ['playing', r.played.rawTheme]])
          if ((raw === null) !== (r.played.index === 0)) bad.push(`the address ${raw === null ? 'left out' : `wrote theme=${raw}`} ${when}, where theme ${r.played.index + 1} plays`);
        if (r.stopped.readoutSig !== r.played.sig) bad.push('the stopped ring read another plan than the one the play started');
        // in place: the stop keeps the second the record was at, not the theme's first bar
        if (r.played.index === r.was.index && Math.abs(r.stopped.position - r.stopped.pausedAt) > r.stopped.bar) bad.push(`the stop kept ${r.stopped.position.toFixed(1)} s where the record was at ${r.stopped.pausedAt.toFixed(1)} s`);
      }
      if (r.stoppedAsk.sig !== r.stoppedAsk.want || Math.abs(r.stoppedAsk.zephyr - 0.6) > 1e-6 || !/ze:0\.60/.test(r.stoppedAsk.spell || '')) bad.push(`a pull asked while stopped played zephyr ${r.stoppedAsk.zephyr} (address "${r.stoppedAsk.spell}") on a plan ${r.stoppedAsk.sig === r.stoppedAsk.want ? 'that is' : 'that is not'} the asked one`);
      if (r.late) bad.push(`${r.late} notes late`);
      return {
        ok: !bad.length,
        why: bad[0],
        note: `Zephyr to 50 % on theme ${r.was.index + 1} (keys ${r.was.keys}) and a pause a bar before the blend at ${r.stopped.pausedAt.toFixed(1)} s: the play started theme ${r.played.index + 1} at ${r.stopped.position.toFixed(1)} s, the pull's landing, `
          + `planned under the asked spell to the byte (keys ${r.played.keys}), the address "${r.played.rawTheme === null ? '' : `theme=${r.played.rawTheme}&`}spell=${r.played.spell}" (theme ${r.played.theme}) and the stopped ring on the same plan; `
          + `a pull asked while stopped played its own plan from the first note`,
      };
    },
  },

  {
    name: 'a second ask inside a far ride keeps the ride: the record never falls quiet, the swap is at the target and the plan is both values',
    area: 'seam',
    // Eugene on the landed tip (69fccab): *"on 50 BPM I move Ember to 105 BPM —
    // I know it takes time — then I move Loom, and the music drops quiet for a
    // few seconds and then starts playing at 100 BPM."* Seed 51757 at a drone
    // spell (43 BPM): Ember to 0.55 (101) is a far move, ridden before the
    // blend; Loom to the rim asked once the ride is under way. One-second
    // levels off the mix's own output from the first ask to past the swap, the
    // grid at the swap, the plan playing after it, and what settleIn said at
    // the second ask against when the readout was on the target.
    deadline: 300000,
    query: 'v=2&seed=51757&spell=ember:0.16,tide:1.00,root:0.81',
    page: body(`
      const dh = window.deepHouse;
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 4, 12000);
      const c = ctl.state.ctx;
      if (!c.createScriptProcessor) return { noTap: true };
      let sum = 0, count = 0;
      const levels = [];
      const tap = c.createScriptProcessor(4096, 2, 2);
      tap.onaudioprocess = (e) => {
        const L = e.inputBuffer.getChannelData(0), R = e.inputBuffer.getChannelData(1);
        for (let i = 0; i < L.length; i++) sum += (L[i] * L[i] + R[i] * R[i]) / 2;
        count += L.length;
        if (count >= c.sampleRate) { levels.push({ t: c.currentTime, db: +(10 * Math.log10(sum / count + 1e-12)).toFixed(1) }); sum = 0; count = 0; }
      };
      const sink = c.createGain(); sink.gain.value = 0;
      ctl.mix.out.connect(tap); tap.connect(sink); sink.connect(c.destination);
      const t0 = c.currentTime;
      ctl.setSpell({ ...ctl.mix.spell, ember: 0.55 });
      await waitFor(() => ctl.state.cut, 10000);
      // once the ride is under way: the grid has left 43 (early in it, where
      // the dropped seam's fade came due before the next blend and left −120 dB)
      await waitFor(() => ctl.readout().gridBpm > 44, 90000);
      const asked = { ...ctl.mix.spell, ember: 0.55, loom: 1 };
      ctl.setSpell(asked);
      await sleep(300);
      const secondAt = c.currentTime;
      const said = c.currentTime + ctl.readout().mix.settleIn;
      const out = ctl.mix.record;
      let reached = -1;
      const until = performance.now() + 150000;
      while (performance.now() < until) {
        const r = ctl.readout();
        if (ctl.mix.record !== out && Math.abs(ctl.mix.spell.loom - 1) < 1e-6 && Math.abs(r.gridBpm - r.bpm) < 0.1) { reached = c.currentTime; break; }
        await sleep(100);
      }
      await sleep(3000);
      const t = ctl.mix.record.track;
      const sig = (x) => JSON.stringify(x.dice) + '|' + x.bars + '|' + x.bpm + '|' + x.events.length;
      const want = dh.planTheme('51757', t.index, { strategy: 'house-v2', spell: ctl.mix.spell });
      const res = { t0, secondAt, said, reached, levels: levels.filter((l) => l.t > t0 + 1).map((l) => ({ t: +(l.t - t0).toFixed(1), db: l.db })), bpm: ctl.readout().bpm, grid: ctl.readout().gridBpm,
        plan: sig(t) === sig(want), loom: ctl.mix.spell.loom, ember: ctl.mix.spell.ember, late: dh.late.count };
      ctl.stop();
      return res;
    `),
    judge: (r) => {
      if (r.noTap) return { ok: false, why: 'no tap' };
      const bad = [];
      const through = r.levels.filter((l) => r.reached < 0 || l.t <= r.reached - r.t0 + 1);
      const low = through.filter((l) => l.db < -25);
      if (low.length) bad.push(`the record fell under −25 dB at ${low.slice(0, 6).map((l) => `${l.t} s (${l.db})`).join(', ')}`);
      if (r.reached < 0) bad.push('the second ask never landed');
      if (!r.plan) bad.push('the plan playing after the swap is not the one for both values');
      if (Math.abs(r.grid - r.bpm) > 0.1) bad.push(`after the swap the grid is at ${r.grid} for a theme at ${r.bpm}`);
      if (r.reached > 0 && Math.abs(r.said - r.reached) > 1) bad.push(`settleIn at the second ask said ${(r.said - r.t0).toFixed(1)} s and the target was heard at ${(r.reached - r.t0).toFixed(1)} s`);
      const worst = Math.min(...through.map((l) => l.db));
      return {
        ok: !bad.length,
        why: bad[0],
        note: `Ember to 0.55 on the 43 BPM drone and Loom to the rim ${(r.secondAt - r.t0).toFixed(1)} s later, mid-ride: the record never under ${worst} dB over ${through.length} seconds, `
          + `the target ${r.bpm} BPM heard at ${(r.reached - r.t0).toFixed(1)} s as settleIn said at the second ask (${(r.said - r.t0).toFixed(1)}), on the plan for both values`,
      };
    },
  },

  {
    name: 'the ambient spell\'s mix into theme 12 on 27191 takes no bus past its own theme alone, and the seam adds no limiting the themes do not',
    area: 'seam',
    // Eugene on 96f81df, the benchmark's ambient spell at 52 BPM: "melodic
    // reached full scale — peak 3.1, gr 6.29" at bars 229–231 of theme 11,
    // the mix into 12. Measured: the pad bus of theme 11 read +10 dBFS from
    // bar 221, before the blend — the rota's lfoParam, a modulation source,
    // summed into every pad note of the outro — and the limiter took up to 14.7
    // dB where the blend began. Theme 11 from bar 216 through its seam, both
    // decks' buses tapped the way the machine view taps them, and the master's
    // reduction: no bus of either deck at full scale (the view's clip line),
    // and the worst reduction through the blend within a decibel of the worst
    // either theme takes on its own (theme 11 before the blend, 12 after it).
    deadline: 300000,
    query: 'v=2&seed=27191&theme=11&spell=ember:0.10,tide:0.85,zephyr:0.01,root:0.50,veil:0.30,spark:0.00,loom:0.80',
    page: body(`
      const dh = window.deepHouse;
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
      // Its last twenty-four bars: bar 216 of the 240 it had until round S4
      // made house-v2's themes a fifth shorter (192 bars now, its seam at 176).
      const from = ctl.track.bars - 24;
      ctl.seekToBar(from);
      await waitFor(() => ctl.mix.state.elapsed >= from * ctl.readout().barSeconds - 1, 20000);
      await sleep(500);
      const out = ctl.mix.record;
      const tOut = dh.attachTaps(out.graph, ctl.mix.master, { periodMs: 100 });
      let tIn = null;
      const rows = [];
      const clips = [];
      const until = performance.now() + 150000;
      while (performance.now() < until) {
        await sleep(100);
        const a = ctl.mix.arriving || (ctl.mix.record !== out ? ctl.mix.record : null);
        if (a && !tIn) tIn = dh.attachTaps(a.graph, null, { periodMs: 100 });
        const fo = tOut.read(), fi = tIn ? tIn.read() : null;
        const r = ctl.readout();
        const pk = (f) => f ? Object.fromEntries(Object.entries(f.buses).map(([k, v]) => [k, +v.peak.toFixed(1)])) : null;
        if (ctl.mix.record !== out && !ctl.mix.playingOut && ctl.mix.state.transition === 0) { rows.push({ bar: r.bar + 1, theme: r.mix.themeNumber, melo: -120, meli: fi && fi.buses.melodic ? fi.buses.melodic.peak : -120, gr: fo.reduction.worst, tr: 0, alone: true, pi: pk(fi) }); for (const n of (fi ? fi.clipped : [])) if (n !== 'out') clips.push(\`\${r.mix.themeNumber}·\${r.bar + 1} arriving \${n}\`); if (rows.filter((x) => x.alone).length > 16 * ctl.readout().barSeconds * 10) break; continue; }
        for (const n of fo.clipped) if (n !== 'out') clips.push(\`\${r.mix.themeNumber}·\${r.bar + 1} outgoing \${n} \${fo.buses[n].peak}\`);
        if (fi) for (const n of fi.clipped) if (n !== 'out') clips.push(\`\${r.mix.themeNumber}·\${r.bar + 1} arriving \${n} \${fi.buses[n].peak}\`);
        const fad = (d) => d ? +d.lineOf('fader.gain').at(ctl.state.ctx.currentTime).toFixed(2) : null;
        rows.push({ bar: r.bar + 1, theme: r.mix.themeNumber, melo: fo.buses.melodic ? fo.buses.melodic.peak : -120, meli: fi && fi.buses.melodic ? fi.buses.melodic.peak : -120, gr: fo.reduction.worst, tr: ctl.mix.state.transition,
          fo: fad(out), fi: fad(ctl.mix.arriving || (ctl.mix.record !== out ? ctl.mix.record : null)), po: pk(fo), pi: pk(fi), outp: +fo.out.peak.toFixed(1) });
        // and on, sixteen bars of theme 12 alone: what its own limiting is
        if (ctl.mix.state.transition === 0 && ctl.mix.record !== out && !ctl.mix.playingOut && r.bar >= (rows.find((x) => x.alone) ? rows.find((x) => x.alone).bar - 1 : 1e9) + 16) break;
        if (ctl.mix.state.transition === 0 && ctl.mix.record !== out && !ctl.mix.playingOut) rows[rows.length - 1].alone = true;
      }
      tOut.dispose(); if (tIn) tIn.dispose();
      ctl.stop();
      return { rows, clips, late: dh.late.count };
    `),
    judge: (r) => {
      // what each theme's own limiting is, alone: theme 11 before its blend, and 12 after it
      const before = r.rows.filter((x) => x.theme === 11 && x.tr === 0 && !x.alone);
      const after = r.rows.filter((x) => x.alone);
      const blend = r.rows.filter((x) => x.tr > 0);
      const grBefore = Math.max(0, ...before.map((x) => x.gr), ...after.map((x) => x.gr));
      const grBlend = Math.max(0, ...blend.map((x) => x.gr));
      const melo = Math.max(...r.rows.map((x) => x.melo)), meli = Math.max(...r.rows.map((x) => x.meli));
      const bad = [];
      // **A bus against its own theme alone** (K30, the chain's rule S7–S9: a
      // bus's dry float sum reads over 0 dBFS on several golden themes before
      // the limiter with nothing non-linear before it — 27191 theme 12 at bar
      // 31 at 0.0, 1#5 at +5.6 — so 0 dBFS is not the fault, a blend that takes
      // a bus past what its theme does alone is, as the limiter's row already
      // reads it): each deck's bus through the blend against the most that bus
      // reads with its theme alone — theme 11's before the blend, theme 12's
      // after it — with half a decibel for the taps' tenth-of-a-second windows.
      const most = (rows, side) => { const m = {}; for (const x of rows) for (const [k, v] of Object.entries(x[side] || {})) m[k] = Math.max(m[k] ?? -120, v); return m; };
      const aloneOut = most(before, 'po'), aloneIn = most(after, 'pi');
      const over = [];
      for (const x of blend) {
        for (const [k, v] of Object.entries(x.po || {})) if (k !== 'out' && v > Math.max(0, (aloneOut[k] ?? -120) + 0.5)) over.push(`${x.theme}·${x.bar} outgoing ${k} ${v} (alone ${aloneOut[k] ?? 'silent'})`);
        for (const [k, v] of Object.entries(x.pi || {})) if (k !== 'out' && v > Math.max(0, (aloneIn[k] ?? -120) + 0.5)) over.push(`${x.theme}·${x.bar} arriving ${k} ${v} (alone ${aloneIn[k] ?? 'silent'})`);
      }
      if (over.length) bad.push(`a bus went past its theme alone through the blend: ${over.slice(0, 4).join('; ')}`);
      if (!blend.length) bad.push('the blend was never seen');
      if (!after.length) bad.push('theme 12 was never heard alone after the blend');
      if (grBlend > grBefore + 1) bad.push(`the limiter took ${grBlend} dB through the blend against ${grBefore} at most with either theme alone`);
      return {
        ok: !bad.length,
        why: bad[0],
        note: `theme 11's outro and its mix into 12 on the ambient spell: the pad bus never over ${melo.toFixed(1)} dBFS outgoing and ${meli.toFixed(1)} arriving, no bus past what it reads with its own theme alone (${r.clips.length} readings of a dry sum at or over 0 dBFS, all within that), `
          + `the limiter at most ${grBlend} dB through the ${blend.length} readings of the blend against ${grBefore} with either theme alone (theme 11's last bars, theme 12's next sixteen)`,
      };
    },
  },

  {
    name: 'a spell set mid-set is a seam from the next phrase line',
    area: 'seam',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // `?spell=` and `?recipe=` are read once, when the set is made; this is the
    // same layer moved by a hand (`notes/archive/2026-09-plans/cited/PLAN-BIRDS-UX.md` §3). What follows is
    // re-planned under the new spell and handed over on a phrase line, the
    // theme that is playing keeps the spell it was planned under, and asking
    // for the spell the set is already under plans nothing at all.
    setup: () => {
      // A seed whose *next* theme is drawn differently under the spell this
      // scenario pulls, so that "what follows is re-planned" is a thing the
      // page can see rather than a thing the code promises.
      // The theme playing, since a bird move keeps the place (Eugene, 09-24):
      // the pull plans *it* again under the spell and hands over where it is.
      const spell = { veil: 0.85 };
      for (let seed = 1; seed <= 60; seed++) {
        const house = planTheme(String(seed), 0, {});
        const under = planTheme(String(seed), 0, { spell });
        if (house.preset !== under.preset) return { seed: String(seed), spell, house: house.preset, under: under.preset };
      }
      return { seed: '1', spell, house: null, under: null };
    },
    page: body(`
      const S = window.__setup;
      ctl.setSeed(S.seed);
      await sleep(250);
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2, 12000);
      const c = ctl.state.ctx;
      const before = ctl.readout();
      const bs = before.barSeconds;
      const wasUrl = location.search;
      ctl.setSpell(S.spell);
      const armed = await waitFor(() => ctl.state.cut && ctl.state.cut.kind === 'spell', 6000);
      const cut = armed ? { ...ctl.state.cut } : null;
      if (!cut) { ctl.stop(); return { noSeam: true, url: location.search }; }
      const held = ctl.readout();
      const now = c.currentTime;
      const seamIn = held.seconds + (cut.at - now);
      // the same spell again, twice, by both doors: neither plans anything
      ctl.setSpell({ ...S.spell });
      // Three answers and not two: a hand-over planned, nothing planned, or an
      // ask that never came back — which is a failure and not an identity.
      const again = await bounded(
        ctl.mix.setSpell({ ...S.spell }).then((t) => (t == null ? 'none' : 'planned')), 4000) || 'timeout';
      const sameCut = ctl.state.cut && ctl.state.cut.at === cut.at;
      const url = location.search;
      // the theme coming is the one the new spell plans, and it is this set's
      const next = ctl.mix.state.next;
      const blended = await waitFor(() => ctl.mix.state.transition > 0, (cut.at - c.currentTime) * 1000 + 4000);
      const inBlend = { transition: ctl.mix.state.transition, spell: ctl.readout().spell, seed: ctl.readout().seed };
      ctl.setSpell(null);
      const bare = location.search;
      ctl.stop();
      await sleep(300);
      return {
        wasUrl, url, bare, sameCut, again, blended,
        seam: { at: seamIn, bar: seamIn / bs, phraseOff: Math.min((seamIn / bs) % 4, 4 - ((seamIn / bs) % 4)),
          barSeconds: bs, bars: (cut.end - cut.at) / bs, from: before.seconds, ahead: seamIn - before.seconds },
        next: next && { seed: String(next.seed), preset: next.preset, index: next.index },
        inBlend,
        late: window.deepHouse.late.count,
      };
    `),
    judge: (r, setup) => {
      if (r.noSeam) return { ok: false, why: `setting a spell mid-set armed no hand-over (url ${r.url})` };
      // On a phrase line of the theme playing, and never in the bar the
      // playhead is inside: a line at least one bar ahead of where it was.
      const onPhrase = r.seam.phraseOff <= 0.02 && r.seam.ahead > 0;
      const quiet = r.sameCut && r.again === 'none';
      const urls = r.url.includes('spell=ve%3A0.85') || r.url.includes('spell=ve:0.85');
      const bare = !r.bare.includes('spell=');
      const follows = !!r.next && r.next.seed.startsWith(`${setup.seed}#`)
        && (setup.under == null || r.next.preset === setup.under);
      return {
        ok: onPhrase && quiet && urls && bare && follows && r.blended && !r.late,
        why: !onPhrase ? `the seam begins at bar ${r.seam.bar.toFixed(3)}, ${r.seam.phraseOff.toFixed(3)} bars off a four-bar line`
          : !quiet ? `the same spell asked for again ${!r.sameCut ? 'moved the one in flight' : r.again === 'timeout' ? 'never answered' : 'planned a second hand-over'}`
          : !urls ? `the address bar says ${r.url || '(nothing)'}`
          : !bare ? `releasing left ${r.bare} in the address bar`
          : !follows ? `the theme coming is ${JSON.stringify(r.next)}, not this theme under the spell (${setup.under})`
          : !r.blended ? 'the hand-over never began'
          : `${r.late} notes reached late`,
        note: `a spell set ${r.seam.from.toFixed(1)} s into a theme hands over ${r.seam.ahead.toFixed(1)} s later at bar ${r.seam.bar.toFixed(0)} — `
          + `a four-bar line — over ${r.seam.bars.toFixed(0)} bars into the same theme under the spell, drawn ${r.next.preset} where the house drew ${setup.house}; `
          + `the same spell asked for twice more planned nothing, the address bar carries it and releasing bares it again`,
      };
    },
  },

  {
    name: 'a seek lands without a click and builds nothing on the tick',
    area: 'transport',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // Two parked items of `TODO.md` and a gate for the third. A seek used to
    // find the preparation of wherever the deck had *started* — the memo was
    // keyed by the theme — so a jump to the tenth minute was told its landing
    // was ready and built the piano's strings under the scheduler. The window
    // is part of the memo now and the deck waits for it, and what this measures
    // from outside is the three things a listener would notice: a step in the
    // waveform at the landing, a hole, and a note arriving late.
    //
    // **The landing is measured against the music it lands in**, and not
    // against the music it left. The record's own kick moves half of full scale
    // in one sample and a breakdown moves a fortieth of that, so a jump from an
    // intro into a main groove reads as a click on any absolute bound: the
    // window either side of the landing is compared with the two seconds of the
    // same passage that follow it, which is the comparison the offline gate
    // makes with its neighbours.
    //
    // **What is not resumed, and why.** A note that began before the landing —
    // a pad holding over four bars — is not picked up in the middle: no voice
    // in the registry has a way into the middle of a note, so resuming a held
    // one means striking it again at the landing, which is a new attack where
    // the music has none and the very click this gate is against. The tails go
    // the other way: the deck being left is faded rather than cut, so its
    // reverb and its delay ring under the landing instead of stopping at it.
    page: body(`
      const SILENT = 1e-6;
      ctl.setSeed('1');
      await sleep(250);
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2, 12000);
      const c = ctl.state.ctx;
      if (!c.createScriptProcessor) return { noTap: true };
      let mode = 'base';
      const win = () => ({ step: 0, mean: 0, n: 0, silence: 0 });
      const w = { base: win(), left: win(), seek: win(), after: win() };
      let run = 0;
      const tap = c.createScriptProcessor(4096, 2, 2);
      tap.onaudioprocess = (e) => {
        const m = w[mode];
        if (!m) return;
        const L = e.inputBuffer.getChannelData(0);
        const R = e.inputBuffer.getChannelData(1);
        let sum = 0;
        for (let i = 1; i < L.length; i++) {
          const d = Math.max(Math.abs(L[i] - L[i - 1]), Math.abs(R[i] - R[i - 1]));
          sum += d;
          if (d > m.step) m.step = d;
          const a = Math.abs(L[i]) + Math.abs(R[i]);
          if (a < SILENT) { run += 1; if (run > m.silence) m.silence = run; } else run = 0;
        }
        m.mean += sum / (L.length - 1);
        m.n += 1;
      };
      const sink = c.createGain();
      sink.gain.value = 0;
      ctl.mix.out.connect(tap);
      tap.connect(sink);
      sink.connect(c.destination);
      await sleep(2400);

      // the door a hand uses, first: the position follows the drag
      const span = ctl.readout().duration;
      ctl.seekTo(0.35);
      await sleep(700);
      const dragged = ctl.readout().seconds;
      // ...and the passage the seek leaves, which the landing still hears: the
      // deck being left fades rather than cuts, so its kick rings into the
      // landing's first blocks (round S19: a landing in a quiet breakdown out
      // of a main read its kick as a click; seeking inside the breakdown did not)
      mode = 'left';
      await sleep(1500);

      const liveBefore = window.deepHouse.piano.live;
      const lateBefore = window.deepHouse.late.count;
      const from = ctl.readout().seconds;
      const to = span * 0.55;
      // The tap runs a block behind the page, so the window opens when the
      // deck has started — which is when the transport has finished building
      // the landing — and is held for a few blocks either side of it.
      mode = 'off';
      const asked = await bounded(ctl.mix.seek(to), 6000);
      mode = 'seek';
      await sleep(450);
      mode = 'after';
      await sleep(2000);
      mode = 'off';
      const landed = ctl.readout().seconds;
      // All the way out: see the note in the cast scenario above.
      ctl.mix.out.disconnect(tap);
      tap.onaudioprocess = null;
      tap.disconnect();
      sink.disconnect();
      ctl.stop();
      await sleep(300);
      const read = (m) => ({ step: m.step, mean: m.mean / Math.max(1, m.n), silence: m.silence, blocks: m.n });
      return {
        rate: c.sampleRate, from, to, asked, landed, dragged, span,
        base: read(w.base), left: read(w.left), seek: read(w.seek), after: read(w.after),
        live: window.deepHouse.piano.live - liveBefore,
        late: window.deepHouse.late.count - lateBefore,
        dropped: window.deepHouse.dropped.count,
      };
    `),
    judge: (r) => {
      if (r.noTap) return { ok: false, why: 'this engine has no per-sample tap to measure a click with' };
      const ms = (n) => (n / r.rate) * 1000;
      // A discontinuity is a step the size of the signal in one sample, and the
      // signal here is the passage the seek landed in: half again the largest
      // move that passage makes on its own, with a floor for a landing in a
      // breakdown where the music itself barely moves.
      const bound = Math.max(r.after.step * 1.5, r.left.step, r.base.step, 0.02);
      const clean = r.seek.step <= bound && r.seek.blocks > 0;
      const landed = Math.abs(r.landed - r.to) < 3 && Math.abs(r.dragged - r.span * 0.35) < 3;
      const gap = r.seek.silence <= Math.max(r.after.silence, 128);
      return {
        ok: clean && landed && gap && !r.live && !r.late,
        why: !clean ? `the landing moved ${r.seek.step.toFixed(4)} in one sample over ${r.seek.blocks} blocks, against ${r.after.step.toFixed(4)} in the passage it landed in and ${r.left.step.toFixed(4)} in the one it left (bound ${bound.toFixed(4)})`
          : !landed ? `a drag to ${(r.span * 0.35).toFixed(1)} s left the set at ${r.dragged.toFixed(1)} and a seek to ${r.to.toFixed(1)} left it at ${r.landed.toFixed(1)}`
          : !gap ? `the landing left ${ms(r.seek.silence).toFixed(1)} ms of silence against ${ms(r.after.silence).toFixed(1)} in the passage round it`
          : r.live ? `${r.live} piano strings were built under the scheduler`
          : `${r.late} notes reached late over the landing`,
        note: `a seek from ${r.from.toFixed(1)} s to ${r.to.toFixed(1)} moved ${r.seek.step.toFixed(4)} in one sample `
          + `(${(r.seek.step / (r.seek.mean || 1e-9)).toFixed(0)}x the average move) against ${r.after.step.toFixed(4)} `
          + `(${(r.after.step / (r.after.mean || 1e-9)).toFixed(0)}x) in the two seconds it landed in and ${r.base.step.toFixed(4)} before it, `
          + `left ${ms(r.seek.silence).toFixed(1)} ms of silence, reached nothing late and built ${r.live} strings under the scheduler`,
      };
    },
  },

  {
    name: 'offline and live schedule the same theme',
    area: 'transport',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // Round E's one contract, watched rather than argued. Every engine looks a
    // voice up in `deepHouse.voices` at fire time, so wrapping that object is
    // the only way to see what a *live deck* actually played from outside the
    // machine — and what it played is compared against the schedule an offline
    // render of the same theme is given, event for event, by voice and by the
    // instant relative to the first note.
    //
    // It is the browser half of the node check `live and offline schedule the
    // same window`: that one compares two grids' arithmetic, this one compares
    // a real pump, over a real clock, in a real engine, against the list a
    // render would pour.
    page: body(`
      const dh = window.deepHouse;
      // Wrap every voice before anything starts. Each one still makes its
      // sound; what is added is one row per call, which is what the deck told
      // the machine to play and when.
      const fired = [];
      const real = {};
      for (const name of Object.keys(dh.voices)) {
        real[name] = dh.voices[name];
        dh.voices[name] = (ctx, out, time, p, settings) => {
          fired.push({ voice: name, time });
          return real[name](ctx, out, time, p, settings);
        };
      }
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 0.3, 12000);
      // From the top of whatever theme the transport is on, so the list a deck
      // plays begins where the list a render is handed begins. A set picked up
      // where a stored place left off starts somewhere in the middle.
      const seed = String(ctl.state.seed);
      const index = ctl.mix.state.theme.index;
      // Into the theme rather than at its top: a set picked up where a stored
      // place left off starts somewhere in the middle, and an
      // intro is four voices a bar where a main groove is twenty. A seek is a
      // deck laid out from a stated position, which is a start the offline
      // schedule can be asked for exactly.
      const from = Math.round(ctl.mix.state.themeSeconds * 0.35);
      ctl.mix.seek(from);
      fired.length = 0;
      // The late count is the page's, and the start above is already on it:
      // what matters here is whether a note was moved *while this window was
      // being filled*, because a moved note is a note that did not land where
      // the schedule put it.
      const lateBefore = dh.late.count;
      await sleep(9000);
      const live = fired.slice();
      ctl.stop();
      await sleep(400);
      for (const name of Object.keys(real)) dh.voices[name] = real[name];

      // What a render of the same theme is handed: the whole program through
      // the one contract, at no offset.
      // under the engine the set is playing: a page restored from a set left
      // under either engine plays that engine, and a plan asked under nothing
      // is house-v1
      const program = dh.programOf(dh.planTheme(seed, index, { strategy: ctl.state.strategy }));
      const offline = dh.schedule(program, dh.offsetGrid(0), dh.firstEvent(program, from)).events
        .map((s) => ({ voice: s.pe.voice, at: s.at }));

      // The live deck is somewhere on the context's clock and the render starts
      // at nought, so the two are compared from their own first note.
      const n = live.length;
      const t0 = n ? live[0].time : 0;
      const a0 = offline.length ? offline[0].at : 0;
      let wrong = null;
      let worst = 0;
      for (let i = 0; i < n && i < offline.length; i++) {
        if (live[i].voice !== offline[i].voice) { wrong = { i, live: live[i].voice, offline: offline[i].voice }; break; }
        worst = Math.max(worst, Math.abs((live[i].time - t0) - (offline[i].at - a0)));
      }
      return { n, offline: offline.length, wrong, worst, from,
        late: dh.late.count - lateBefore, seed, index,
        firstVoice: n ? live[0].voice : null, lastVoice: n ? live[n - 1].voice : null };
    `),
    judge: (r) => {
      // A millisecond is three orders of magnitude under a note: what is being
      // compared is two clocks, and the live one is a set clock counting beats
      // through an exponential while the render's is an offset.
      const ms = r.worst * 1000;
      return {
        ok: r.n > 40 && !r.wrong && r.n <= r.offline && ms < 1 && !r.late,
        why: r.wrong
          ? `event ${r.wrong.i} was a ${r.wrong.live} live and a ${r.wrong.offline} offline`
          : r.n <= 40 ? `only ${r.n} events were played in nine seconds`
          : r.n > r.offline ? `the deck played ${r.n} events and the render is given ${r.offline}`
          : r.late ? `${r.late} notes were reached late, so the live times are not the schedule's`
          : `the two put an event ${ms.toFixed(3)} ms apart`,
        note: `${r.n} events a live deck played over nine seconds from ${r.from} s in — ${r.firstVoice} first, ${r.lastVoice} last — are the first ${r.n} of the ${r.offline} an offline render of theme ${r.index} is handed from that same instant, voice for voice, and land within ${ms.toFixed(3)} ms of them`,
      };
    },
  },

  {
    name: 'a stopped set stops being processed',
    area: 'transport',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // Finding 04. A processor that returns true for ever is processed for as
    // long as the context lives, connected to anything or not, so three starts
    // and stops meant three limiters running on the audio thread with nothing
    // to limit. The master now tells its limiter to write out its delay tail
    // and finish. The limiter posts its gain reduction eight times a second
    // while it is being processed, so a stopped one that is still running is a
    // stopped one that is still posting.
    page: body(`
      const rounds = [];
      const before = new Set(window.__limiterPosts.map((p) => p.node)).size;
      for (let i = 0; i < 3; i++) {
        await started();
        await sleep(700);
        ctl.stop();
        await sleep(1500);            // the stop fade, the tail, and then some
        const settled = window.__limiterPosts.length;
        await sleep(1800);
        rounds.push({ settled, after: window.__limiterPosts.length - settled });
      }
      return { rounds, processors: new Set(window.__limiterPosts.map((p) => p.node)).size - before };
    `),
    judge: (r) => ({
      ok: r.rounds.every((x) => x.after === 0) && r.processors === r.rounds.length,
      why: r.processors !== r.rounds.length
        ? `three starts and stops built ${r.processors} limiters, not three`
        : `after each stop settled, further posts: ${r.rounds.map((x) => x.after).join(', ')}`,
      note: `three starts and stops built ${r.processors} limiters, one apiece, and none of them posted again once its set had gone`,
    }),
  },

  {
    name: 'a flick and a cancelled drag both end the scrub',
    area: 'transport',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // Finding 05. A drag ends exactly once, whatever ends it: a lift, a flick,
    // a cancelled gesture, a pointer capture the system took away. Before
    // this, a throw or a cancellation left the cursor, the elapsed time, the
    // remembered position and the rating window frozen while the set played on.
    page: body(`
      const out = {};
      // a cancelled drag along the band, with nothing playing
      const r = box('tilt');
      el('tilt').dispatchEvent(pev('pointerdown', r.x + r.width * 0.89, r.y + r.height * 0.5, 61));
      out.cancel = { during: ctl.state.scrubbing };
      window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 61 }));
      out.cancel.after = ctl.state.scrubbing;
      // a flick across the band
      const a = onRing(0.39, 1.0), b = onRing(0.39, 1.45);
      el('tilt').dispatchEvent(pev('pointerdown', a.x, a.y, 62));
      window.dispatchEvent(pev('pointermove', b.x, b.y, 62));
      window.dispatchEvent(pev('pointerup', b.x, b.y, 62));
      out.flick = { scrubbing: ctl.state.scrubbing };
      // and the same two while a set is playing: the cursor has to go back to
      // where the audio actually is
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1.5, 10000);
      el('tilt').dispatchEvent(pev('pointerdown', r.x + r.width * 0.89, r.y + r.height * 0.5, 63));
      const previewed = ctl.state.position;
      window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 63 }));
      const restored = ctl.state.position;
      const heard = ctl.mix.state.elapsed;
      await sleep(900);
      out.playing = { previewed, restored, heard, later: ctl.state.position, heardLater: ctl.mix.state.elapsed, scrubbing: ctl.state.scrubbing };
      ctl.stop();
      await sleep(400);
      return out;
    `),
    judge: (r) => {
      const back = Math.abs(r.playing.restored - r.playing.heard) < 0.5;
      const follows = r.playing.later > r.playing.restored && Math.abs(r.playing.later - r.playing.heardLater) < 0.5;
      return {
        ok: r.cancel.during && !r.cancel.after && !r.flick.scrubbing && !r.playing.scrubbing && back && follows,
        why: `cancelled: scrubbing ${r.cancel.during} then ${r.cancel.after}; flicked: ${r.flick.scrubbing}; playing: previewed ${r.playing.previewed.toFixed(1)} s, restored ${r.playing.restored.toFixed(1)}, the audio at ${r.playing.heard.toFixed(1)}, a second later ${r.playing.later.toFixed(1)} against ${r.playing.heardLater.toFixed(1)}`,
        note: `a cancel and a flick both leave the scrub closed, and a cancel over a playing set puts the cursor back on the audio at ${r.playing.restored.toFixed(1)} s and lets it follow`,
      };
    },
  },

  {
    name: 'a reset to seed one is the untouched first load',
    area: 'seam',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // Eugene's smoke test: on theme six of a seed, a long press on the die put
    // the seed back to one and left the set playing theme six of it. A stop's
    // first act is to ask the mix which theme was under the needle and at what
    // second, because that is what a pause writes down \u2014 and a cast was
    // setting the theme it wanted *before* the stop, so the stop read the old
    // one back over it. Where a cast's set begins is part of the cast now, and
    // it is applied after the stop. Asked of the three ways a set is cast: the
    // reset while a set is playing, the reset while one is stopped, and a seed
    // asked for by name from somewhere in the middle of another.
    page: body(`
      const store = () => { try { return JSON.parse(localStorage.getItem('deep-house.player') || 'null'); } catch (e) { return null; } };
      const read = () => {
        const r = ctl.readout();
        const w = store();
        return { seed: r.seed, theme: r.mix.themeNumber, index: ctl.state.themeIndex,
          seconds: +r.seconds.toFixed(2), playing: r.playing,
          store: w && { seed: String(w.seed), themeIndex: w.themeIndex, seconds: w.seconds } };
      };
      const out = {};

      // playing, on the sixth theme of a seed that is not one
      ctl.setSeed('15576');
      await sleep(200);
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 0.5, 10000);
      for (let i = 0; i < 5; i++) { ctl.skip(); await sleep(60); }
      await waitFor(() => ctl.readout().mix.themeNumber >= 6, 12000);
      out.before = read();
      window.ring.reset();
      await sleep(600);
      // Playing, a reset is a cast and a cast is a hand-over since 09-19: the
      // record that is playing goes on playing until the low end changes
      // hands, and everything that names the set turns over there.
      out.atThrow = read();
      out.coming = String((ctl.readout().mix.next && ctl.readout().mix.next.seed) || '');
      await waitFor(() => ctl.readout().seed === '1', 40000);
      await sleep(400);
      out.playing = read();
      await sleep(1200);
      out.later = read();
      ctl.stop();
      await sleep(400);

      // and stopped, where the plan steps without a note being played
      ctl.setSeed('15576');
      await sleep(200);
      for (let i = 0; i < 5; i++) ctl.skip();
      out.stoppedAt = read();
      window.ring.reset();
      await sleep(400);
      out.stopped = read();

      // a seed asked for by name, from the middle of another set
      for (let i = 0; i < 3; i++) ctl.skip();
      ctl.setSeed('92970');
      await sleep(400);
      out.typed = read();
      ctl.resetToStart();
      await sleep(300);
      return out;
    `),
    judge: (r) => {
      const home = (x) => x && x.seed === '1' && x.index === 0 && x.theme === 1
        && x.store && x.store.seed === '1' && x.store.themeIndex === 0;
      const reached = r.before.theme >= 6 && r.stoppedAt.theme >= 6;
      // At the throw the record that was playing is still the record, and what
      // is coming is seed one's first theme; at the swap it is seed one.
      const handed = r.atThrow.seed === '15576' && r.atThrow.theme >= 6 && r.coming.startsWith('1#0');
      const playing = handed && home(r.playing) && home(r.later);
      const stopped = home(r.stopped) && r.stopped.seconds === 0 && r.stopped.store.seconds === 0;
      const typed = r.typed.seed === '92970' && r.typed.index === 0 && r.typed.theme === 1;
      return {
        ok: reached && playing && stopped && typed,
        why: `reached theme ${r.before.theme} playing and ${r.stoppedAt.theme} stopped; `
          + `at the throw ${r.atThrow.seed}/${r.atThrow.theme} with ${r.coming || 'nothing'} coming; `
          + `after the hand-over: playing ${r.playing.seed}/${r.playing.theme} at ${r.playing.seconds} s `
          + `(store ${r.playing.store && r.playing.store.seed}/${r.playing.store && r.playing.store.themeIndex}), `
          + `a moment later ${r.later.seed}/${r.later.theme}; stopped ${r.stopped.seed}/${r.stopped.theme} at `
          + `${r.stopped.seconds} s (store ${r.stopped.store && r.stopped.store.seed}/${r.stopped.store && r.stopped.store.themeIndex}); `
          + `a seed typed from theme ${r.stopped.theme + 3} plays ${r.typed.seed}/${r.typed.theme}`,
        note: `a reset from theme ${r.before.theme} plays on into seed 1, theme I — the record it was on was still playing at the throw, `
          + `with ${r.coming} coming — and stopped it lands on bar one; the store follows either way, `
          + `and a seed asked for by name on a stopped ring starts its own set at theme I`,
      };
    },
  },

  {
    name: 'a mouse\'s drag turns nothing: the band scrubs and the star stays',
    area: 'ring',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // The star holds the turn the record had reached instead of following the
    // previewed position: a scrub used to repeat the dice swipe's own
    // feedback, running 1.8 to 184.9 degrees under a band drag. **And since
    // round K3 a mouse's drag across the star itself does nothing at all**
    // (Eugene: *"disable the drag-to-roll on desktop completely"*): only a
    // finger spins the ring.
    page: body(`
      await frame();
      const before = starAngle();
      if (before === null) return { noStar: true };
      const band = [];
      const a0 = onRing(0.39, 1.0);
      el('tilt').dispatchEvent(pev('pointerdown', a0.x, a0.y, 71));
      await frame();
      band.push(starAngle());
      for (const ang of [1.6, 2.4, 3.2]) {
        const p = onRing(0.39, ang);
        window.dispatchEvent(pev('pointermove', p.x, p.y, 71));
        await sleep(120);
        await frame();
        band.push(starAngle());
      }
      const cursor = ctl.state.position;
      window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 71 }));
      await frame();
      const afterBand = starAngle();
      // and a mouse's drag across the star, which turns nothing
      const seedWas = ctl.readout().seed;
      const spin = [];
      const s0 = onRing(0.25, 0.2);
      el('tilt').dispatchEvent(pev('pointerdown', s0.x, s0.y, 72));
      await frame();
      spin.push(starAngle());
      const s1 = onRing(0.25, 0.9);
      window.dispatchEvent(pev('pointermove', s1.x, s1.y, 72));
      await sleep(500);
      await frame();
      spin.push(window.ring.turn().spin);
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 72, bubbles: true, clientX: s1.x, clientY: s1.y }));
      await sleep(1500);
      return { before, band, afterBand, cursor, spin, rolled: ctl.readout().seed !== seedWas };
    `),
    judge: (r) => {
      if (r.noStar) return { ok: false, why: 'the page draws no star to watch' };
      const moved = Math.max(...r.band.map((a) => Math.abs(a - r.before)), Math.abs(r.afterBand - r.before));
      const spun = Math.abs(r.spin[1]);
      return {
        ok: moved < 2 && spun === 0 && !r.rolled,
        why: `the band drag turned the star ${moved.toFixed(1)} degrees, a mouse's drag on the star spun it ${spun.toFixed(1)}, rolled ${r.rolled}`,
        note: `a drag right across the band moved the star ${moved.toFixed(2)} degrees and the cursor to ${r.cursor.toFixed(1)} s; the same drag on the star spun nothing and rolled nothing`,
      };
    },
  },

  {
    name: 'an untouched ring renders byte-identical to v1',
    area: 'ring',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // Interface round one put a derived colour over the whole ring, and the
    // claim the round stands on is that at the house vector it is not there:
    // `ringColour` returns the page's own four gold stops to the byte, so the
    // line work, the halos, the cursor and the beat flash are the colours v1
    // drew them in and nothing is written at all.
    //
    // What this asks the page is the strongest form of it a page can answer:
    // the four stops are v1's own hex, every word of type is v1's flat `--gold`
    // whatever the gradient does, and **driving the derived layer through by
    // hand at the house leaves all four SVG layers byte for byte what they
    // were** — not a single attribute of a single element moves. The pixels are
    // the other half and are proved outside the suite, by two builds
    // photographed and hashed (`notes/archive/2026-09-kitchen/rounds/ring-1.md`).
    page: body(`
      const V1 = ['#fff3c8', '#ffd97a', '#f2c14e', '#b9781f'];
      const ids = ['outer', 'star', 'inner', 'glow'];
      const stops = (g) => [...document.querySelectorAll('#' + g + ' stop')].map((s) => s.getAttribute('stop-color'));
      const layers = () => ids.map((id) => el(id).outerHTML);
      // Held still first, or the star's own turn and its slow flex would move
      // the markup between the two readings and say nothing about the colour.
      window.ring.still(true);
      await frame();
      const before = layers();
      const was = { gold: stops('gold'), colour: window.ring.colour() };
      const type = getComputedStyle(document.querySelector('#starWords text')).fill;
      const node = document.querySelector('#actions .ln');
      const action = getComputedStyle(node).stroke;
      const line = getComputedStyle(document.querySelector('#starCells .ln')).stroke;
      // the derived layer, driven through by hand at the house it already sits on
      window.ring.wear(null);
      await frame();
      const after = layers();
      window.ring.still(false);
      let where = '';
      for (let i = 0; i < before.length; i++) if (!where && before[i] !== after[i]) where = ids[i];
      return {
        was, type, action, line, where,
        spell: ctl.readout().spell,
        gold: stops('gold'),
        bytes: before.reduce((n, h) => n + h.length, 0),
      };
    `),
    judge: (r) => {
      const V1 = ['#fff3c8', '#ffd97a', '#f2c14e', '#b9781f'];
      const list = (a) => (a || []).join(' ');
      const gold = list(r.was.gold) === list(V1) && list(r.gold) === list(V1);
      const derived = r.was.colour && r.was.colour.hex === '#f2c14e' && list(r.was.colour.stops) === list(V1);
      const type = r.type === 'rgb(242, 193, 78)';
      // one gradient since 09-23: the transport strokes the same one the line work does
      const split = r.action === 'url("#gold")' && r.line === 'url("#gold")';
      return {
        ok: gold && derived && type && split && !r.where && r.spell === null,
        why: `spell ${JSON.stringify(r.spell)}; #gold ${list(r.gold)}; derived ${r.was.colour && r.was.colour.hex} `
          + `${list(r.was.colour && r.was.colour.stops)}; type ${r.type}; an action strokes ${r.action} and a line ${r.line}`
          + `${r.where ? `; the ${r.where} layer moved when the colour was driven through` : ''}`,
        note: `nothing was asked of it, the gradient is v1's ${list(V1)} and so is the derived colour to the byte, `
          + `every word of type is flat ${r.type}, the transport and the line work both stroke ${r.line}, `
          + `and driving the derived layer through by hand moved not one byte of ${(r.bytes / 1024).toFixed(0)} kB of markup across four layers`,
      };
    },
  },

  {
    name: 'an engine in the URL plays, and a link without one is v2',
    area: 'link',
    // Round K5a of PLAN-KITCHEN, turned round on 09-23 when v2 became the
    // page's default in every build: the link names the engine that is *not*
    // the default, so what is proved is that the link and not the default
    // chose it. `?v=1` reaches the composer the
    // way `?spell=` does — on the composer's side, with the ring not involved —
    // and what has to be true from a *built page* is two things a node check
    // cannot say: that a set really plays under the strategy that was asked
    // for, and that the strategy reaches the readout, the transport's own
    // state and the mix's, so a bench and a face are told the same thing.
    query: 'v=1&seed=99895',
    page: body(`
      // Before a hand has started anything: the transport knows which record it
      // is on, because the strategy is read where the seed is read and not off
      // a mix that does not exist yet.
      const before = ctl.state.strategy;
      // Bounded, because a start that never settles is a suite that never
      // finishes: the judge below wants the set *playing*, so a start that has
      // not landed in six seconds fails the scenario instead of hanging it.
      await started(6000);
      await waitFor(() => ctl.playing && ctl.mix, 4000);
      await sleep(400);
      const r = ctl.readout();
      const out = {
        beforeStart: before,
        readout: r && r.strategy,
        state: ctl.state.strategy,
        mix: ctl.mix ? ctl.mix.state.strategy : null,
        seed: r && r.seed,
        playing: ctl.playing,
        bars: r && r.bars,
        late: window.deepHouse.late.count,
      };
      ctl.stop();
      await sleep(300);
      return out;
    `),
    judge: (r) => ({
      // The strategy is known before a hand has started anything, because it is
      // read where the seed is read and not off a mix that does not exist yet.
      ok: r.beforeStart === 'house-v1' && r.readout === 'house-v1' && r.state === 'house-v1'
        && r.mix === 'house-v1' && r.playing && r.late === 0,
      why: `before a start ${r.beforeStart}; playing ${r.playing} with the readout saying ${r.readout}, `
        + `the transport ${r.state} and the mix ${r.mix}; ${r.late} notes late`,
      note: `?v=1 plays seed ${r.seed} — ${r.bars} bars — and the readout, the transport and the mix `
        + `all say house-v1, before a start and while it is running, with nothing late`,
    }),
  },

  {
    name: 'a link starts at its named bar, and the first write after a start takes the bar off',
    area: 'link',
    // Eugene, 09-22: *"while the player is working it must NOT put the current
    // time position — the bar — in the URL ... for local work and dev deep
    // links we support `bar` as an input: if a user puts it explicitly, the
    // page positions on that bar."* So the link opens stopped on bar 41, the
    // start plays from there, and the address the start writes has no bar in
    // it; nor does it after a pause far into the track, nor on a new record.
    // (Bar 65 until round S19 cut the theme from 80 bars to 68: its seam moved
    // from bar 68 to 56, so bar 65 is past the hand-over and the set plays
    // theme 2 there, bar 9. Bar 41 is in its second main, before the seam.)
    query: 'v=2&seed=638342086&theme=1&bar=41&spell=ember:0.394',
    page: body(`
      const before = ctl.readout();
      const stopped = !ctl.playing;
      const opened = ctl.link.raw('bar');
      await started(6000);
      await waitFor(() => ctl.playing && ctl.mix, 4000);
      await waitFor(() => ctl.readout().bar === 40, 3000);
      const live = ctl.readout();
      const startedUrl = location.search;
      ctl.stop();
      await sleep(300);
      const pausedUrl = location.search;
      ctl.setSeed('923063142');
      await started(6000);
      await waitFor(() => ctl.playing && ctl.mix, 4000);
      const castUrl = location.search;
      ctl.stop();
      return { stopped, opened, before: before.bar, live: live.bar, startedUrl, pausedUrl, castUrl };
    `),
    judge: r => {
      const bare = [r.startedUrl, r.pausedUrl, r.castUrl].every((u) => !/[?&]bar=/.test(u));
      const named = [r.startedUrl, r.pausedUrl].every((u) => /[?&]v=2\b/.test(u) && /[?&]seed=638342086\b/.test(u) && !/[?&]theme=/.test(u)); // K34: the first theme is left out
      return {
        ok: r.stopped && r.opened === '41' && r.before === 40 && r.live === 40 && bare && named,
        why: `stopped ${r.stopped}; the link opened with bar ${r.opened}, requested zero-based bar 40, restored ${r.before}, playing ${r.live}; `
          + `the address after the start "${r.startedUrl}", after the pause "${r.pausedUrl}", after a new record "${r.castUrl}"`,
        note: `bar=41 opened the set stopped on bar 41 and it played from there; the start wrote "${decodeURIComponent(r.startedUrl)}" — no bar — `
          + `and neither the pause at bar 41 nor a new record put one back`,
      };
    },
  },

  {
    name: 'the address is the save: a paused page reloads to the same track from its link alone',
    area: 'link',
    // Eugene, 09-22, retiring the bench: *"the URL must reflect the ring's and
    // the machine's state, so I can pause, copy the URL and send it with a
    // word"* — and, the same day, **never the bar**: *"users will bookmark or
    // copy the link after they heard the track, so it could well be near the
    // end; whoever gets the link would then hear the machine keep going and mix
    // into the next track instead of the track the sender wanted to share."*
    // So the link is the track from its beginning, named in full: the seed,
    // the engine as `v=2`, the theme, the spell, the recipe and the two
    // modes. Every part of it is set here the way a hand sets it — a start, a
    // seek while playing, a pause, the next theme on a stopped ring, a bird
    // pulled, a seek to a bar — and then a second page is opened on nothing but
    // the address: this browser's saved place and journal are removed first, so
    // what comes back is the link's and not the store's. The plan is compared
    // too, because the recipe, the accompaniment and the development only exist
    // in the notes they make.
    query: 'v=2&seed=638342086&spell=ember:0.6,tide:0.3&recipe=house/hand-rolling&accompaniment=auto&development=shaped&lock=engine',
    deadline: 180000,
    page: body(`
      const out = {};
      await started(8000);
      await waitFor(() => ctl.playing && ctl.mix && ctl.mix.state.elapsed > 0.5, 8000);
      ctl.seekToBar(20);
      await sleep(1500);
      ctl.stop();
      await sleep(300);
      out.paused = { bar: ctl.readout().bar, url: location.search, link: ctl.link.read() };
      // ?lock=engine: the link's engine is held, and a click on another row asks for nothing
      ctl.setStrategy('house-v1');
      await sleep(100);
      out.locked = { engineLocked: ctl.engineLocked, strategy: ctl.state.strategy, url: location.search };
      // stopped: the next theme, a bird, a bar
      ctl.skip();
      await sleep(100);
      ctl.setSpell({ ember: 0.6, tide: 0.3, veil: 0.8 });
      await sleep(100);
      ctl.seekToBar(33);
      await sleep(200);
      const r = ctl.readout();
      const here = {
        seed: r.seed, theme: ctl.state.themeIndex, strategy: r.strategy,
        spell: JSON.stringify(r.spell), recipe: r.recipe,
        dice: JSON.stringify(r.dice), events: ctl.track.events.length, bars: ctl.track.bars,
      };
      out.here = here;
      out.bar = r.bar;
      out.url = location.search;
      try { localStorage.removeItem('deep-house.player'); localStorage.removeItem('deep-house.journal'); } catch (e) {}
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:-9999px;width:400px;height:800px;border:0';
      f.src = location.href;
      document.body.appendChild(f);
      const up = await waitFor(() => { try { return !!(f.contentWindow && f.contentWindow.ring); } catch (e) { return false; } }, 25000);
      if (up) {
        await sleep(400);
        const c = f.contentWindow.ring.control, q = c.readout();
        out.there = {
          seed: q.seed, theme: c.state.themeIndex, strategy: q.strategy,
          spell: JSON.stringify(q.spell), recipe: q.recipe,
          dice: JSON.stringify(q.dice), events: c.track.events.length, bars: c.track.bars,
        };
        out.barThere = q.bar;
        out.held = f.contentWindow.ring.cells().filter((x) => x.held).map((x) => x.bird).sort().join(',');
        out.url2 = f.contentWindow.location.search;
        out.locked2 = c.engineLocked;
      } else out.there = null;
      f.remove();
      return out;
    `),
    judge: (r) => {
      const keys = ['seed', 'theme', 'strategy', 'spell', 'recipe', 'dice', 'events', 'bars'];
      const differ = r.there ? keys.filter((k) => r.here[k] !== r.there[k]) : ['the page never came up'];
      const sound = (u) => /[?&]v=2\b/.test(u) && /[?&]seed=638342086\b/.test(u) && /[?&]recipe=house\/hand-rolling\b/.test(u)
        && /[?&]accompaniment=auto\b/.test(u) && /[?&]development=shaped\b/.test(u) && !/strategy=/.test(u);
      const paused = r.paused.bar >= 19 && !/[?&]bar=/.test(r.paused.url) && sound(r.paused.url) && !/[?&]theme=/.test(r.paused.url) /* K34 */
        && r.paused.link.strategy === 'house-v2' && r.paused.link.named;
      const moved = r.here.theme === 1 && r.bar === 33 && /[?&]theme=2\b/.test(r.url) && !/[?&]bar=/.test(r.url) && sound(r.url);
      const fromTop = r.barThere === 0;
      const held = r.held === 'ember,tide,veil';
      const locked = r.locked.engineLocked && r.locked.strategy === 'house-v2' && r.locked2 === true;
      return {
        ok: paused && moved && !differ.length && fromTop && held && locked,
        why: !paused ? `a pause at bar ${r.paused.bar + 1} left the address at ${r.paused.url}`
          : !moved ? `the stopped moves left theme ${r.here.theme + 1}, bar ${r.bar + 1} and the address at ${r.url}`
          : differ.length ? `a second page on the link alone differs on ${differ.join(', ')}: ${JSON.stringify(differ.map((k) => [r.here[k], r.there && r.there[k]]))}`
          : !fromTop ? `a second page on the link opened at bar ${r.barThere + 1}, not the track's beginning`
          : !held ? `the second page holds ${r.held || 'no bird'}`
          : `the engine lock: ${JSON.stringify(r.locked)}, on the second page ${r.locked2}`,
        note: `a pause at bar ${r.paused.bar + 1} wrote "${decodeURIComponent(r.paused.url)}" — the engine and every sound parameter, no bar; `
          + `theme 2, a third bird and a seek to bar 34 on a stopped ring wrote "${decodeURIComponent(r.url)}", and a page opened on that alone, `
          + `with the store and the journal removed, came back at the track's first bar on the same seed, theme, engine, spell, recipe (${r.here.recipe}) `
          + `and plan (${r.here.events} notes over ${r.here.bars} bars) holding ${r.held}, with the engine still locked after a click on house-v1 was refused`,
      };
    },
  },

  {
    name: 'a link with no engine on it is house-v2',
    area: 'link',
    // The other half: **a bare link is the page's choice**, and the page's
    // choice is house-v2 in every build (Eugene, 09-23: *"we should have the
    // default engine as v2 for now"*; `DEFAULT_VER` in `src/link-table.ts`).
    // A written link names its engine, so this moves nothing anybody wrote.
    query: 'seed=99895',
    page: body(`
      // read before a hand acts, since a hand's write names the engine
      const named = ctl.link.read().named;
      await started(6000);
      await waitFor(() => ctl.playing && ctl.mix, 4000);
      await sleep(400);
      const r = ctl.readout();
      const dice = (strategy) => JSON.stringify(window.deepHouse.planTheme('99895', 0, { strategy }).dice);
      const out = {
        readout: r && r.strategy,
        state: ctl.state.strategy,
        mix: ctl.mix ? ctl.mix.state.strategy : null,
        seed: r && r.seed,
        playing: ctl.playing,
        named,
        // ...and the page's track is the one house-v2 plans, which is not the record's.
        asV2: JSON.stringify(r.dice) === dice('house-v2'),
        v2IsNotV1: dice('house-v2') !== dice('house-v1'),
      };
      ctl.stop();
      await sleep(300);
      return out;
    `),
    judge: (r) => ({
      ok: r.readout === 'house-v2' && r.state === 'house-v2' && r.mix === 'house-v2' && r.playing && !r.named && r.asV2 && r.v2IsNotV1,
      why: `the readout says ${r.readout}, the transport ${r.state}, the mix ${r.mix}, named before the start ${r.named}; the track's dice `
        + `are house-v2's: ${r.asV2}; house-v2's dice differ from house-v1's: ${r.v2IsNotV1}`,
      note: `a plain ?seed= link plays seed ${r.seed} under house-v2 without naming it, and its dice are the dice `
        + 'house-v2 plans for that theme, which are not the record\'s',
    }),
  },

  {
    name: 'a bare address comes back to the stored link: the spell, the recipe and the engine, not only the seed',
    area: 'link',
    // Eugene, 09-23, on his iPhone: *"when I save the page to the home screen,
    // the spell parameters are not stored in local storage — if I restart the
    // app it only restores the seed."* A home-screen app opens on the
    // manifest's `start_url`, a bare address; the store now carries the link
    // (`SavedPlace.link` in control.ts), and a bare address takes it before
    // anything reads the address, so it ends on the address a tab would have.
    query: 'v=2&seed=638342086&recipe=house/hand-rolling&accompaniment=auto&development=shaped',
    deadline: 120000,
    page: body(SECOND_PAGE + `
      await started(8000);
      await waitFor(() => ctl.playing && ctl.mix && ctl.mix.state.elapsed > 0.5, 8000);
      ctl.stop();
      await sleep(300);
      ctl.setSpell({ ember: 0.6, tide: 0.3 });
      await sleep(100);
      ctl.seekToBar(12);   // a stopped seek writes the place down, as a pause does
      await sleep(200);
      const r = ctl.readout();
      const here = { seed: r.seed, theme: ctl.state.themeIndex, strategy: r.strategy, spell: JSON.stringify(r.spell), recipe: r.recipe, url: location.search };
      let stored = null;
      try { stored = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) {}
      try { localStorage.removeItem(JOURNAL); } catch (e) {}
      const there = await secondPage('?out=silent');
      return { here, stored, there };
    `),
    judge: (r) => {
      const t = r.there, h = r.here;
      const stored = !!(r.stored && typeof r.stored.link === 'string' && /[?&]?spell=/.test(r.stored.link) && !/bar=/.test(r.stored.link));
      const back = !!t && t.seed === h.seed && t.theme === h.theme && t.strategy === 'house-v2' && t.spell === h.spell
        && t.recipe === h.recipe && !!h.recipe && t.accompaniment === 'auto' && t.development === 'shaped' && t.held === 'ember,tide';
      const addr = !!t && /[?&]seed=638342086\b/.test(t.url) && /[?&]v=2\b/.test(t.url) && /[?&]spell=em:0.60,ti:0.30\b/.test(t.url)
        && /[?&]recipe=house\/hand-rolling\b/.test(t.url) && /[?&]accompaniment=auto\b/.test(t.url) && /[?&]development=shaped\b/.test(t.url)
        && /[?&]out=silent\b/.test(t.url) && !/[?&]bar=/.test(t.url);
      return {
        ok: stored && back && addr && !t.problems.length,
        why: !stored ? `the store holds ${JSON.stringify(r.stored)}`
          : !t ? 'the second page never came up'
          : !back ? `a bare address came back to ${JSON.stringify(t)}, the first page was ${JSON.stringify(h)}`
          : `the second page's address is "${t.url}"${t.problems.length ? `, refusing ${t.problems.join(',')}` : ''}`,
        note: `the store carries "${r.stored && r.stored.link}", and a bare address on the same storage came back to seed ${t && t.seed}, `
          + `theme ${t && t.theme + 1}, ${t && t.strategy}, the spell ${t && t.spell} held as ${t && t.held}, the recipe ${t && t.recipe} `
          + `with accompaniment ${t && t.accompaniment} and development ${t && t.development}, and wrote "${t && decodeURIComponent(t.url)}"`,
      };
    },
  },

  {
    name: 'a stored place from before the link restores its seed and plays the house',
    area: 'link',
    // Backward compatibility: a store written before 09-23 carries a seed, a
    // theme and a second and no link. A bare address still comes back to that
    // seed and theme, under the page's default engine, at the house.
    query: 'seed=5',
    page: body(SECOND_PAGE + `
      try {
        localStorage.setItem(STORE, JSON.stringify({ seed: '4242', themeIndex: 1, seconds: 3, bar: 1, preset: 'auto', at: new Date().toISOString() }));
        localStorage.removeItem(JOURNAL);
      } catch (e) {}
      return { there: await secondPage('?out=silent') };
    `),
    judge: (r) => {
      const t = r.there;
      const ok = !!t && t.seed === '4242' && t.theme === 1 && t.strategy === 'house-v2' && t.spell === null && t.recipe === null
        && t.held === '' && /[?&]seed=4242\b/.test(t.url) && /[?&]v=2\b/.test(t.url) && /[?&]theme=2\b/.test(t.url) && !/spell=|recipe=/.test(t.url);
      return {
        ok,
        why: t ? `an old stored place came back as ${JSON.stringify(t)}` : 'the second page never came up',
        note: `a seed-only store came back to seed ${t && t.seed}, theme ${t && t.theme + 1} under ${t && t.strategy} at the house, and wrote "${t && decodeURIComponent(t.url)}"`,
      };
    },
  },

  {
    name: 'a stored sub or growl preset comes back as auto, since no link row carries it',
    area: 'link',
    // R27 of the review of 09-24 (O19): a store left on `growl` restored it,
    // and no link row carries a preset, so the link that browser wrote played
    // another program for whoever it was sent to (27191 theme 4: 1816 events
    // under auto, 2059 under growl). Eugene's question 9: always restore
    // `auto`. Both paths of restore: a stored link, and a store from before it.
    query: 'seed=5',
    page: body(SECOND_PAGE + `
      const put = (o) => { try { localStorage.setItem(STORE, JSON.stringify({ ...o, at: new Date().toISOString() })); localStorage.removeItem(JOURNAL); } catch (e) {} };
      put({ seed: '27191', themeIndex: 4, seconds: 3, bar: 1, preset: 'growl', strategy: 'house-v2', link: 'seed=27191&v=2&theme=5' });
      const linked = await secondPage('?out=silent');
      put({ seed: '4242', themeIndex: 1, seconds: 3, bar: 1, preset: 'sub' });
      const old = await secondPage('?out=silent');
      return { linked, old };
    `),
    judge: (r) => {
      const a = r.linked, b = r.old;
      const ok = !!a && !!b && a.seed === '27191' && a.theme === 4 && a.preset === 'auto' && b.seed === '4242' && b.theme === 1 && b.preset === 'auto';
      return {
        ok,
        why: `a stored link on growl came back as ${JSON.stringify(a)}; an old store on sub as ${JSON.stringify(b)}`,
        note: `a stored link left on growl came back to seed ${a && a.seed}, theme ${a && a.theme + 1} on ${a && a.preset}, and an old store left on sub to seed ${b && b.seed} on ${b && b.preset}`,
      };
    },
  },

  {
    name: 'a link with a seed on it beats the stored link',
    area: 'link',
    // A link somebody sent plays what it says: the store's spell, recipe and
    // modes stay in the store, and the page is the link's.
    query: 'seed=5',
    page: body(SECOND_PAGE + `
      try {
        localStorage.setItem(STORE, JSON.stringify({ seed: '638342086', themeIndex: 2, seconds: 3, bar: 1, preset: 'auto', strategy: 'house-v2',
          link: 'seed=638342086&v=2&theme=3&spell=ember:0.60,tide:0.30&recipe=house/hand-rolling&accompaniment=auto&development=shaped', at: new Date().toISOString() }));
        localStorage.removeItem(JOURNAL);
      } catch (e) {}
      return { there: await secondPage('?seed=777&out=silent') };
    `),
    judge: (r) => {
      const t = r.there;
      const ok = !!t && t.seed === '777' && t.theme === 0 && t.strategy === 'house-v2' && t.spell === null && t.recipe === null
        && t.accompaniment === 'base' && t.development === 'base' && t.held === '' && /^\?seed=777&out=silent$/.test(t.url);
      return {
        ok,
        why: t ? `the link ?seed=777 over a stored link came back as ${JSON.stringify(t)}` : 'the second page never came up',
        note: `?seed=777 opened on seed ${t && t.seed}, theme one, at the house with no recipe, the stored link left in the store, and the address as it came: "${t && t.url}"`,
      };
    },
  },

  {
    name: 'a link with sound rows and no seed plays the link and not the store',
    area: 'link',
    // R25 of the review of 09-24 (C7): `?v=2&theme=2` over a store left
    // on seed 33, theme 5 at 42 s opened seed 33, theme 5 at 42 s. A link with
    // a sound row on it wins over the store (ROADMAP 09-23): it is the link
    // table's seed 1 at the link's own theme, from the top.
    query: 'seed=5',
    page: body(SECOND_PAGE + `
      try {
        localStorage.setItem(STORE, JSON.stringify({ seed: '33', themeIndex: 4, seconds: 42, bar: 20, preset: 'auto', strategy: 'house-v2',
          link: 'seed=33&v=2&theme=5', at: new Date().toISOString() }));
        localStorage.removeItem(JOURNAL);
      } catch (e) {}
      return { there: await secondPage('?v=2&theme=2&out=silent') };
    `),
    judge: (r) => {
      const t = r.there;
      const ok = !!t && t.seed === '1' && t.theme === 1 && t.strategy === 'house-v2' && t.position === 0 && !t.problems.length;
      return {
        ok,
        why: t ? `?v=2&theme=2 over a store on seed 33 came back as ${JSON.stringify(t)}` : 'the second page never came up',
        note: `?v=2&theme=2 opened seed ${t && t.seed}, theme ${t && t.theme + 1} at ${t && t.position} s, the store's seed 33 left in the store`,
      };
    },
  },

  {
    name: 'a stored second is resumed only on the same place: another spell on the same seed and theme starts from the top',
    area: 'link',
    // R26 of the review of 09-24: a link resumed at the stored second whenever
    // its seed and theme matched, whatever the engine, spell, recipe or modes.
    query: 'seed=5',
    page: body(SECOND_PAGE + `
      const put = () => {
        try {
          localStorage.setItem(STORE, JSON.stringify({ seed: '638342086', themeIndex: 1, seconds: 30, bar: 12, preset: 'auto', strategy: 'house-v2',
            link: 'seed=638342086&v=2&theme=2&spell=ember:0.60', at: new Date().toISOString() }));
          localStorage.removeItem(JOURNAL);
        } catch (e) {}
      };
      put(); const same = await secondPage('?seed=638342086&v=2&theme=2&spell=ember:0.60&out=silent');
      put(); const other = await secondPage('?seed=638342086&v=2&theme=2&spell=tide:0.30&out=silent');
      put(); const v1 = await secondPage('?seed=638342086&v=1&theme=2&spell=ember:0.60&out=silent');
      return { same, other, v1 };
    `),
    judge: (r) => {
      const ok = !!r.same && !!r.other && !!r.v1 && r.same.position > 29 && r.other.position === 0 && r.v1.position === 0;
      return {
        ok,
        why: `the same place resumed at ${r.same && r.same.position} s, another spell at ${r.other && r.other.position} s, v1 at ${r.v1 && r.v1.position} s`,
        note: `the stored 30 s is the stored place's: the same link resumed at ${r.same && r.same.position} s, another spell and another engine on the same seed and theme started at nought`,
      };
    },
  },

  {
    name: 'a second spell asked inside a seam is what the address carries when the first lands, and after its own',
    area: 'link',
    // The fault pass of 09-24, Agent B's first item: a spell asked while the
    // seam of an earlier one is in flight lands the earlier one at once and
    // hands over again into the second — and the arrival of the first wrote
    // the first back into the address (`arrived` → `writePlaceSpell`), so the
    // ring showed the second while the link carried the first until the second
    // landed too. The link is what is asked as well as what plays: the address
    // carries the newest spell asked from the moment it is asked.
    deadline: 120000,
    query: 'v=2&seed=1',
    page: body(`
      const A = { veil: 0.85 };
      const B = { veil: 0.2, tide: 0.7 };
      const said = () => ctl.link.raw('spell');
      const same = (x, y) => !!x && !!y && Object.keys({ ...x, ...y }).every((k) => Math.abs((x[k] ?? 0.5) - (y[k] ?? 0.5)) < 1e-3);
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2, 12000);
      ctl.setSpell(A);
      const armed = await waitFor(() => ctl.state.cut && ctl.state.cut.kind === 'spell', 8000);
      const blending = armed && await waitFor(() => ctl.mix.state.transition > 0 && ctl.mix.state.incoming, 30000);
      if (!blending) { ctl.stop(); return { noSeam: true, armed }; }
      const inFlight = { url: said(), readout: ctl.readout().spell };
      ctl.setSpell(B);
      const asked = said();
      // the first lands: the readout's spell is A's
      const landedA = await waitFor(() => same(ctl.readout().spell, { ...{ ember: 0.5, gleam: 0.5, veil: 0.5, spark: 0.5, loom: 0.5, tide: 0.5, root: 0.5, zephyr: 0.5 }, ...A }), 30000);
      await sleep(300);
      const afterA = said();
      const readoutAfterA = ctl.readout().spell;
      // and the second lands after it
      const landedB = await waitFor(() => same(ctl.readout().spell, { ...{ ember: 0.5, gleam: 0.5, veil: 0.5, spark: 0.5, loom: 0.5, tide: 0.5, root: 0.5, zephyr: 0.5 }, ...B }), 60000);
      await sleep(300);
      const afterB = said();
      ctl.stop();
      await sleep(300);
      return { inFlight, asked, landedA, afterA, readoutAfterA, landedB, afterB, late: window.deepHouse.late.count };
    `),
    judge: (r) => {
      if (r.noSeam) return { ok: false, why: `the first spell's seam never began (armed ${r.armed})` };
      const isB = (u) => !!u && /ve:0\.2/.test(u) && /ti:0\.7/.test(u);
      const ok = isB(r.asked) && r.landedA && isB(r.afterA) && r.landedB && isB(r.afterB);
      return {
        ok,
        why: !isB(r.asked) ? `asking the second wrote "${r.asked}"`
          : !r.landedA ? 'the first spell never landed'
          : !isB(r.afterA) ? `when the first spell landed the address said "${r.afterA}", not the second asked (readout ${JSON.stringify(r.readoutAfterA)})`
          : !r.landedB ? 'the second spell never landed'
          : `when the second landed the address said "${r.afterB}"`,
        note: `the first spell in flight read "${r.inFlight.url}"; the second asked inside its seam was written at once ("${r.asked}"), `
          + `stayed when the first landed and after its own landing ("${r.afterB}")`,
      };
    },
  },

  {
    name: 'a spell in the URL tints the whole ring, and the type leans light with it',
    area: 'ring',
    // `?spell=` reaches the composer without the ring (v2 phase 0) and the ring
    // as well: control puts the set's spell on the readout and the ring wears
    // the colour derived from it. Since 09-23 (Eugene: *"finish colouring the
    // whole ring"*) that is **all** of it — the four actions, the centre, the
    // die, the beat dots and the big play mark included, which until then were
    // cut in a second gradient that stayed gold — and the words wear the ring's
    // own hue leaning toward white (`typeInk`).
    query: 'spell=ember:0.85',
    setup: () => {
      const c = ringColour({ ...HOUSE, ember: 0.85 });
      return { hex: c.hex, stops: c.stops.map((s) => s.hex), type: typeInk(c) };
    },
    page: body(`
      const stops = (g) => [...document.querySelectorAll('#' + g + ' stop')].map((s) => s.getAttribute('stop-color'));
      await frame();
      return {
        spell: ctl.readout().spell,
        colour: window.ring.colour(),
        gold: stops('gold'),
        fixed: document.querySelectorAll('#goldFixed').length,
        type: getComputedStyle(document.querySelector('#starWords text')).fill,
        action: getComputedStyle(document.querySelector('#actions .ln')).stroke,
        cursor: document.querySelector('#live path[stroke-width="2"]').getAttribute('stroke'),
        dot: document.querySelector('#innerLive circle').getAttribute('fill'),
      };
    `),
    judge: (r, want) => {
      const list = (a) => (a || []).join(' ');
      const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
      const asked = r.spell && Math.abs(r.spell.ember - 0.85) < 1e-9;
      const tinted = r.colour && r.colour.hex === want.hex && list(r.gold) === list(want.stops);
      const whole = r.fixed === 0 && r.action === 'url("#gold")' && r.dot === 'url(#gold)';
      const type = r.type === rgb(want.type);
      const moved = r.cursor !== '#ffeec0';
      return {
        ok: asked && tinted && whole && type && moved,
        why: `spell ${r.spell && r.spell.ember}; the ring wears ${r.colour && r.colour.hex} where node says ${want.hex}; `
          + `#gold ${list(r.gold)} against ${list(want.stops)}; ${r.fixed} fixed gradients; type ${r.type} against ${rgb(want.type)}; `
          + `an action strokes ${r.action}, a beat dot is filled ${r.dot}, the cursor is ${r.cursor}`,
        note: `a pull on Ember to 0.85 turns the line work to ${r.colour.hex} and the one gradient to ${list(r.gold)}, `
          + `the same four bytes node derives; the actions and the beat dots are cut in it, the cursor goes with it (${r.cursor}), `
          + `and the type is ${want.type}, the ring's hue leaning toward white`,
      };
    },
  },

  {
    name: 'the type is light on every hue',
    area: 'ring',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // Eugene, 09-23: *"give the text a bias toward white/light as the hue
    // travels, so type stays readable on every hue"*. The ring is sent toward
    // each of the eight birds' hues in turn — that bird at 1 and the one across
    // the compass at 0, the furthest a hand can pull it that way — and the
    // words are read off the page as the browser paints them. Two numbers each:
    // **the type against the ground** (black, `#000`, what every word sits on
    // inside its knockout), held to **14:1** — the gold at the house is 12.5:1,
    // so a word far from the house is always easier to read than at it; and
    // **the type against the ring's own ink**, held to **1.3:1**, so a word is
    // always visibly lighter than the line work it sits among.
    deadline: 60000,
    setup: () => {
      const order = ['root', 'gleam', 'zephyr', 'spark', 'ember', 'veil', 'tide', 'loom'];
      return order.map((b, i) => ({ ...HOUSE, [b]: 1, [order[(i + 4) % 8]]: 0 }));
    },
    page: body(`
      const out = [];
      const lum = (rgb) => {
        const [r, g, b] = rgb.match(/\\d+/g).slice(0, 3).map((v) => { const c = +v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const hexLum = (hex) => lum('rgb(' + [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',') + ')');
      for (const spell of window.__setup) {
        window.ring.wear(spell);
        await frame();
        const type = getComputedStyle(document.querySelector('#starWords text')).fill;
        const ink = window.ring.colour().hex;
        const t = lum(type);
        out.push({ type, ink, ground: +((t + 0.05) / 0.05).toFixed(2), overInk: +((t + 0.05) / (hexLum(ink) + 0.05)).toFixed(2) });
      }
      window.ring.wear(null);
      return out;
    `),
    judge: (r) => {
      const names = ['root', 'gleam', 'zephyr', 'spark', 'ember', 'veil', 'tide', 'loom'];
      const bad = r.map((x, i) => ({ ...x, bird: names[i] })).filter((x) => x.ground < 14 || x.overInk < 1.3);
      const low = Math.min(...r.map((x) => x.ground));
      const lowInk = Math.min(...r.map((x) => x.overInk));
      return {
        ok: r.length === 8 && !bad.length,
        why: bad.length ? `toward ${bad[0].bird} the type is ${bad[0].type} on the ink ${bad[0].ink}: ${bad[0].ground}:1 on the ground and ${bad[0].overInk}:1 over the ink` : `${r.length} directions read`,
        note: `toward each of the eight birds the type reads at least ${low}:1 on the ground (floor 14) and ${lowInk}:1 over the ring's own ink (floor 1.3): `
          + r.map((x, i) => `${names[i]} ${x.ground}`).join(', '),
      };
    },
  },

  {
    name: 'the ring carries no gold outside the gold hue',
    area: 'ring',
    // The other half of *"finish colouring the whole ring"*: under a spell far
    // from the house, **no pixel the ring paints is gold**. The four layers are
    // rasterised in the page exactly as they are drawn — one SVG of all four,
    // with the page's own stylesheet and its two type tokens as they stand (last, as
    // the page's inline style on the root wins over the sheet) — and
    // every pixel with colour enough to have a hue is read in OKLCh. The gold
    // family is the gold's hue ± 20° at a chroma over 0.05; the spell is the
    // ambient pole, whose ring is a blue, so a gold pixel is a mark left behind.
    deadline: 60000,
    query: 'spell=ember:0.00,tide:0.92,zephyr:0.80,root:0.50,veil:0.85,spark:0.00,loom:0.90',
    page: body(`
      await frame();
      await sleep(300);
      window.ring.still(true);
      await frame();
      const css = [...document.styleSheets].map((sh) => { try { return [...sh.cssRules].map((r) => r.cssText).join('\\n'); } catch (e) { return ''; } }).join('\\n');
      const rootStyle = getComputedStyle(document.documentElement);
      const tokens = ':root{--gold:' + rootStyle.getPropertyValue('--gold') + ';--pale:' + rootStyle.getPropertyValue('--pale') + '}';
      const inner = ['outer', 'star', 'inner', 'glow'].map((id) => {
        const n = document.getElementById(id);
        // the star's own turn is left off: it moves where a pixel is, not its colour
        return '<g>' + n.innerHTML + '</g>';
      }).join('');
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000"><style>' + css + tokens + '</style><rect width="1000" height="1000" fill="#000"/>' + inner + '</svg>';
      window.ring.still(false);
      const img = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const cv = document.createElement('canvas');
      cv.width = cv.height = 1000;
      const cx = cv.getContext('2d');
      cx.drawImage(img, 0, 0);
      const px = cx.getImageData(0, 0, 1000, 1000).data;
      const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      let lit = 0, hued = 0, gold = 0, where = null;
      const cells = {};
      for (let i = 0; i < px.length; i += 4) {
        const r = lin(px[i] / 255), g = lin(px[i + 1] / 255), b = lin(px[i + 2] / 255);
        if (r + g + b < 0.02) continue;
        lit++;
        const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
        const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
        const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
        const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
        const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
        const C = Math.hypot(A, B);
        if (C < 0.05) continue;
        hued++;
        const h = ((Math.atan2(B, A) * 180 / Math.PI) + 360) % 360;
        if (Math.abs(h - 85.4) <= 20) {
          gold++;
          if (!where) where = { x: (i / 4) % 1000, y: Math.floor(i / 4000), rgb: [px[i], px[i + 1], px[i + 2]] };
          const cell = Math.floor(Math.floor(i / 4000) / 100) * 10 + Math.floor(((i / 4) % 1000) / 100);
          cells[cell] = (cells[cell] || 0) + 1;
        }
      }
      return { lit, hued, gold, where, cells, ink: window.ring.colour().hex, bytes: svg.length };
    `),
    judge: (r) => ({
      ok: r.lit > 20000 && r.hued > 5000 && r.gold === 0,
      why: r.gold ? `${r.gold} of ${r.hued} coloured pixels are gold, the first at ${r.where.x},${r.where.y} (${r.where.rgb}); by tenth of the ring (row, column): `
        + Object.entries(r.cells).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${Math.floor(k / 10)},${k % 10}: ${n}`).join(' ')
        : `${r.lit} lit pixels and ${r.hued} with a hue: too few to have drawn the ring`,
      note: `the ring at the ambient pole (${r.ink}) rasterised whole: ${r.lit} lit pixels, ${r.hued} with a hue, and not one of them within 20° of the gold's hue`,
    }),
  },

  {
    name: 'the ring\'s colour steps at a boundary and never on a frame',
    area: 'ring',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // The gradient lives in <defs> and all three bloomed groups reference it, so
    // writing its stops re-runs their gaussian blur. It is therefore stepped
    // once — at a theme boundary or a seam, under cover of the music changing
    // anyway — and never on a frame. Asked of the one path that can move it
    // mid-set, which is the path a held bird will take when a cell becomes a
    // control: the colour is asked for while a set is playing away from a seam,
    // and it must wait for the theme to turn over.
    setup: () => {
      const spell = { ...HOUSE, tide: 0.95, loom: 0.9 };
      const c = ringColour(spell);
      return { spell, hex: c.hex, stops: c.stops.map((s) => s.hex) };
    },
    page: body(`
      const stops = () => [...document.querySelectorAll('#gold stop')].map((s) => s.getAttribute('stop-color'));
      const v1 = stops().join(' ');
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 0.5, 10000);
      // asked for, and not put on: the set is playing and nowhere near a seam
      window.ring.wear(window.__setup.spell, false);
      const seen = [];
      for (let i = 0; i < 40; i++) { await frame(); seen.push(stops().join(' ')); }
      await sleep(600);
      seen.push(stops().join(' '));
      const waited = seen.every((s) => s === v1);
      // and now the theme turns over
      ctl.skip();
      await waitFor(() => stops().join(' ') !== v1, 8000);
      const after = stops();
      ctl.stop();
      return { v1, waited, frames: seen.length, after };
    `),
    judge: (r, want) => {
      const got = (r.after || []).join(' ');
      return {
        ok: r.waited && got === want.stops.join(' '),
        why: `over ${r.frames} frames of play the gradient ${r.waited ? 'held' : 'moved'} at ${r.v1}; `
          + `after the theme turned over it reads ${got} where node says ${want.stops.join(' ')}`,
        note: `a colour asked for mid-set held the gradient still for ${r.frames} frames and every one of the 600 ms after them, `
          + `then stepped once as the theme turned over, onto the four bytes node derives`,
      };
    },
  },

  {
    name: 'a cell\'s explanation stays while the pointer is on it',
    area: 'words',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // Eugene, reading them on the page: the line should be visible for as long
    // as the mouse is on the circle, and go when it leaves. So on a pointer that
    // can rest there is no timer at all — the line is held by the hand — and
    // three tenths of a second after the hand leaves it is gone. A finger gets
    // the timer instead, a second and a half longer than it was, and a second
    // tap on the same cell takes the line away; that half is checked on a
    // coarse-pointer context outside the suite, because a scenario cannot
    // change the media query of a page that is already running.
    page: body(`
      const opacity = () => +(document.querySelector('#innerLive text.tell') || { getAttribute: () => 0 }).getAttribute('opacity');
      const cell = (i) => {
        const g = document.querySelectorAll('#starCells g.cell')[i].getBoundingClientRect();
        return { x: g.x + g.width / 2, y: g.y + g.height / 2 };
      };
      const mouse = (type, p, target) => target.dispatchEvent(new PointerEvent(type, {
        bubbles: true, pointerId: 5, clientX: p.x, clientY: p.y, pointerType: 'mouse',
      }));
      const p = cell(0);
      mouse('pointermove', p, el('stage'));
      mouse('pointerdown', p, el('tilt'));
      await sleep(40);
      mouse('pointerup', p, window);
      await sleep(250);
      const shown = opacity();
      const held = [];
      for (let i = 0; i < 6; i++) { await sleep(600); held.push(opacity()); }
      // and the hand walks off the cell, to the middle of the ring
      const b = box('tilt');
      mouse('pointermove', { x: b.x + b.width / 2, y: b.y + b.height / 2 }, el('stage'));
      const out = [];
      for (let i = 0; i < 4; i++) { await sleep(100); out.push(+opacity().toFixed(3)); }
      return { shown, held, out, ms: 3600 };
    `),
    judge: (r) => {
      const stayed = r.shown > 0.8 && r.held.every((v) => v > 0.8);
      const gone = r.out[r.out.length - 1] === 0 && r.out[0] < r.shown;
      return {
        ok: stayed && gone,
        why: `the line opened at ${r.shown} and read ${r.held.join(', ')} over ${r.ms} ms of hover, `
          + `then ${r.out.join(', ')} over the 400 ms after the pointer left`,
        note: `a pointer resting on a cell held its explanation open for ${(r.ms / 1000).toFixed(1)} s without dimming once `
          + `(${r.shown}), and three tenths of a second after the hand left it was gone`,
      };
    },
  },

  {
    name: 'the star never leaves fifteen degrees of north',
    area: 'ring',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // Eugene's rule once the cells became a compass: earth stays at the top.
    // The star sways rather than turning — one cycle of a sine over the theme's
    // progress, sixteen degrees of it, with the slow drift's two and a bit over
    // the top — so the bound is arithmetic and not a clamp. What a scenario can
    // still ask is whether anything else moves it: a seek to every sixty-fourth
    // of a theme, and a throw hard enough to whirl the star, which must
    // decelerate onto Root-up and not merely onto some whole turn nobody sees.
    page: body(`
      const norm = (a) => ((a % 360) + 540) % 360 - 180;
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 0.4, 10000);
      const swept = [];
      for (let i = 0; i <= 64; i++) {
        ctl.seekTo(i / 64, true);
        await frame();
        await frame();
        const a = starAngle();
        if (a !== null) swept.push(norm(a));
      }
      // and a throw: the star is spun hard, and then left to settle
      const s0 = onRing(0.25, 0.2);
      el('tilt').dispatchEvent(pev('pointerdown', s0.x, s0.y, 81));
      await frame();
      for (const ang of [1.2, 2.4, 3.6, 4.8]) {
        const p = onRing(0.25, ang);
        window.dispatchEvent(pev('pointermove', p.x, p.y, 81));
        await sleep(30);
      }
      const spun = norm(starAngle());
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 81, bubbles: true }));
      // **Settled is read once the ring is at rest, not six seconds on** (09-24).
      // Since round K3 only a finger throws, and this is a pointer with no
      // type, so the star is at rest at once and the six seconds watched the
      // sway; a finger's whirl onto home is asked in *a mouse never throws, and
      // a finger's clear swipe whirls the ring home* and *every bird stays
      // within fifteen degrees of home*. The wait is on the spin, so a change
      // that made this pointer throw again is still waited out and judged.
      await waitFor(() => window.ring.turn().spin === 0, 15000);
      await sleep(300);
      const settled = norm(starAngle());
      ctl.stop();
      return { swept, spun, settled, n: swept.length };
    `),
    judge: (r) => {
      const worst = Math.max(...r.swept.map(Math.abs));
      return {
        ok: r.n > 60 && worst <= 15 && Math.abs(r.settled) <= 15,
        why: `over ${r.n} places in the theme the star reached ${worst.toFixed(1)} degrees off north; `
          + `a throw took it to ${r.spun.toFixed(1)} and it settled at ${r.settled.toFixed(1)}`,
        note: `swept through ${r.n} places in a theme the star never left ${worst.toFixed(1)} degrees of north, `
          + `and a throw that whirled it to ${r.spun.toFixed(1)} settled back to ${r.settled.toFixed(1)} — earth at the top either way`,
      };
    },
  },

  // --- the machine view (step 1b, 2026-09-19) -------------------------------
  //
  // Five rules, and each one is a sentence out of `PLAN-MACHINE-VIEW.md`: the
  // flip does not touch the music, the view lists every lane the strategy
  // declares, a clip lights an LED that is really red, the ledger names a seam
  // and a cast with their bars, and on a phone every box is still there.
  //
  // Every one of them closes the view in its own body. When every row shared
  // one page a view left open was a set of taps left connected, which is the
  // very fault round K6 found in its own gates; a row has a page of its own
  // since 09-24, and the close is still asked, because closing is part of
  // what a row that opens the view is judged on.

  {
    name: 'the flip keeps playing, and the ring is still live in its panel',
    area: 'view',
    // **Alone** (M2): its rule is that the flip makes no note late, which is
    // the machine keeping time under its own load. In the view area's run
    // beside the M2 rows — each of which opens two pages of its own — it read
    // one late note in WebKit twice, and none in six runs three at a time of it
    // alone, on the M1 build and on this one alike.
    serial: true,
    // **Measured where the record has no rests of its own.** Since a bare link
    // plays house-v2 (6dc3302), seed 1's first theme opens on four bars of kick
    // and closed hat alone, both dry: the kick's envelope reaches true zero
    // about 8 ms before the next hat speaks, on every beat, and all that is
    // left in that slot is the master's own ringing at -100 to -120 dB. Over
    // those bars the meter read 366 samples under -120 dB with the view never
    // opened at all — the same 7.6 ms, at the same place, run after run — and
    // whether the 1.6 s it compares against happened to catch one of those
    // rests was the whole of whether this passed. The bass and the pad come in
    // at bar 5 and from bar 6 the floor of the music stands at -20 dB, so the
    // set is opened there: a hole the flip made is the only silence left to see.
    query: 'v=2&seed=1&theme=1&bar=6',
    page: body(`
      const SILENT = 1e-6;   // -120 dB: below any tail this master puts out under a sounding bar
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.running, 12000);
      const from = ctl.mix.state.elapsed;
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > from + 1.5, 12000);
      const c = ctl.state.ctx;
      if (!c.createScriptProcessor) return { noTap: true };
      let run = 0, worst = 0, frames = 0, loudest = 0;
      const tap = c.createScriptProcessor(4096, 2, 2);
      tap.onaudioprocess = (e) => {
        const L = e.inputBuffer.getChannelData(0);
        const R = e.inputBuffer.getChannelData(1);
        frames += L.length;
        for (let i = 0; i < L.length; i++) {
          const a = Math.abs(L[i]) + Math.abs(R[i]);
          if (a > loudest) loudest = a;
          if (a < SILENT) { run += 1; if (run > worst) worst = run; } else run = 0;
        }
      };
      const sink = c.createGain();
      sink.gain.value = 0;
      ctl.mix.out.connect(tap);
      tap.connect(sink);
      sink.connect(c.destination);
      // what an untouched set looks like on this meter
      const t0 = c.currentTime;
      await sleep(1600);
      const quiet = { samples: worst, seconds: c.currentTime - t0 };
      worst = 0; run = 0;

      const lateBefore = window.deepHouse.late.count;
      const droppedBefore = window.deepHouse.dropped.count;
      const wasPlaying = ctl.playing;
      const homeBefore = el('stage').parentNode === document.body;
      const flipAt = c.currentTime;
      const atBar = ctl.readout().bar;
      await bounded(window.ring.machine.open(), 12000);
      const on = !!window.ring.machine.on;
      // The sigil is the *same element*, moved: not a copy, and not redrawn.
      const inPanel = !!document.querySelector('#machine .ringbox #stage');
      const live0 = el('live') ? el('live').innerHTML : '';
      await sleep(1400);
      const live1 = el('live') ? el('live').innerHTML : '';
      const readAt = ctl.readout().seconds;
      const flip = { samples: worst, seconds: c.currentTime - flipAt };
      const facts = window.ring.machine.facts();
      const snapshot = window.ring.machine.snapshot();

      window.ring.machine.close();
      await frame();
      const home = el('stage').parentNode === document.body;
      const gone = !document.getElementById('machine') && !document.getElementById('machineSheet')
        && !document.documentElement.hasAttribute('data-view');
      const stillPlaying = ctl.playing && ctl.mix && ctl.mix.state.running;
      const after = ctl.readout().seconds;

      ctl.mix.out.disconnect(tap);
      tap.onaudioprocess = null;
      tap.disconnect();
      sink.disconnect();
      ctl.stop();
      await sleep(300);
      return {
        rate: c.sampleRate, atBar, quiet, flip, loudest, homeBefore, home, gone,
        on, inPanel, wasPlaying, stillPlaying,
        ringMoved: live0 !== live1,
        advanced: after > readAt - 0.01,
        boxes: snapshot ? snapshot.part.nodes.length : 0,
        taps: facts ? facts.taps : 0,
        fps: facts ? facts.fps : 0,
        late: window.deepHouse.late.count - lateBefore,
        dropped: window.deepHouse.dropped.count - droppedBefore,
      };
    `),
    judge: (r) => {
      if (r.noTap) return { ok: false, why: 'this engine has no per-sample tap to measure silence with' };
      const ms = (n) => (n / r.rate) * 1000;
      const floor = Math.max(r.quiet.samples, 128);
      const quiet = r.flip.samples <= floor;
      return {
        ok: r.atBar >= 5 && r.on && r.inPanel && r.ringMoved && r.home && r.gone && r.stillPlaying && quiet
          && !r.late && !r.dropped && r.taps === 6 && r.boxes > 20,
        why: r.atBar < 5 ? `the flip came at zero-based bar ${r.atBar}, inside the opening's rests, and not after bar 6`
          : !r.on ? 'the view did not open'
          : !r.inPanel ? 'the ring is not inside the view\'s own panel'
          : !r.ringMoved ? 'the ring stopped drawing once it was in the panel'
          : !r.stillPlaying ? 'the set was not playing after the flip'
          : !quiet ? `the meter saw ${ms(r.flip.samples).toFixed(1)} ms of silence across the flip against ${ms(r.quiet.samples).toFixed(1)} ms in the ${r.quiet.seconds.toFixed(1)} s before it`
          : !r.home ? 'the ring did not go back where it came from'
          : !r.gone ? 'closing the view left something of it on the page'
          : r.taps !== 6 ? `${r.taps} meters were attached where there are five buses and an output`
          : r.boxes <= 20 ? `the view drew only ${r.boxes} boxes`
          : `${r.late} notes reached late and ${r.dropped} were dropped across the flip`,
        note: `at zero-based bar ${r.atBar} the flip drew ${r.boxes} boxes off ${r.taps} meters at ${r.fps} frames a second with the ring live in its panel — `
          + `the same element, still drawing — and over ${r.flip.seconds.toFixed(1)} s of it the meter saw `
          + `${ms(r.flip.samples).toFixed(1)} ms of silence (${ms(r.quiet.samples).toFixed(1)} the untouched set), `
          + `nothing late and nothing dropped; closing it put the sigil back in the page and left no mark, no sheet and no attribute behind`,
      };
    },
  },

  {
    name: 'a pause leaves every box where it was',
    area: 'view',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // Eugene, 09-19: *"when I press pause most of the graph's nodes except the
    // instruments disappear — doesn't look right, jarring."* The cause was that
    // a pause on this page is a **stop**: it lets the mix go and takes the
    // whole audio graph down with it, and a description taken off live nodes
    // then had nothing to report for five of its seven stages. **The node set
    // is the machine as built, and a pause changes state and never structure.**
    //
    // So this counts the boxes and reads their positions off the page four
    // times — playing, paused, playing again, stopped — and holds every one of
    // them to the same count in the same places, with the lamps out in between.
    // The treatment chips are left out of the comparison and only counted: the
    // rota can turn one over between two of the shots, which is the music
    // changing the machine and not a pause changing it.
    page: body(`
      ctl.setSeed('1');
      await sleep(200);
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1.2, 12000);
      await bounded(window.ring.machine.open(), 12000);
      await sleep(400);
      const shot = () => {
        const svg = el('machineDiagram');
        const boxes = [...svg.querySelectorAll('[data-box]')].map((g) => ({
          id: g.getAttribute('data-box'),
          state: g.getAttribute('data-state'),
          at: g.getAttribute('transform'),
        }));
        const lamps = [...svg.querySelectorAll('circle.lamp')].map((c) => c.getAttribute('fill'));
        return {
          boxes: boxes.filter((b) => !b.id.startsWith('treat:')),
          chips: boxes.filter((b) => b.id.startsWith('treat:')).length,
          idle: boxes.filter((b) => b.state === 'idle').length,
          lit: lamps.filter((f) => f && f !== '#1d2830').length,
          size: svg.getAttribute('width') + 'x' + svg.getAttribute('height'),
        };
      };
      const playing = shot();
      ctl.stop();
      await sleep(600);
      const paused = shot();
      await bounded(ctl.start(), 15000);
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 0.6, 12000);
      await sleep(400);
      const resumed = shot();
      ctl.stop();
      await sleep(600);
      const stopped = shot();
      window.ring.machine.close();
      await frame();
      const same = (a, b) => a.boxes.length === b.boxes.length
        && a.boxes.every((x, i) => x.id === b.boxes[i].id && x.at === b.boxes[i].at);
      return {
        counts: [playing, paused, resumed, stopped].map((s) => s.boxes.length),
        chips: [playing, paused, resumed, stopped].map((s) => s.chips),
        idle: [playing, paused, resumed, stopped].map((s) => s.idle),
        lit: [playing, paused, resumed, stopped].map((s) => s.lit),
        sizes: [playing, paused, resumed, stopped].map((s) => s.size),
        placed: [same(playing, paused), same(playing, resumed), same(playing, stopped)],
        moved: playing.boxes.filter((x, i) => paused.boxes[i] && x.at !== paused.boxes[i].at).map((x) => x.id).slice(0, 4),
      };
    `),
    judge: (r) => {
      const one = (xs) => xs.every((x) => x === xs[0]);
      const ok = one(r.counts) && one(r.sizes) && r.placed.every(Boolean)
        && r.counts[0] > 20 && r.idle[0] === 0 && r.idle[1] === r.counts[1] + r.chips[1]
        && r.idle[2] === 0 && r.lit[1] === 0 && r.lit[2] > 0;
      return {
        ok,
        why: !one(r.counts) ? `the boxes went ${r.counts.join(' → ')} across a pause, a play and a stop`
          : !one(r.sizes) ? `the canvas went ${r.sizes.join(' → ')}`
            : !r.placed.every(Boolean) ? `boxes moved: ${r.moved.join(', ')}`
              : r.idle[0] ? `${r.idle[0]} boxes were already idle while the set was playing`
                : r.idle[1] !== r.counts[1] + r.chips[1] ? `${r.idle[1]} of ${r.counts[1] + r.chips[1]} boxes went idle on the pause`
                  : r.idle[2] ? `${r.idle[2]} boxes stayed idle after the play`
                    : r.lit[1] ? `${r.lit[1]} lamps were still lit with nothing built`
                      : `only ${r.lit[2]} lamps came back`,
        note: `${r.counts[0]} boxes playing, ${r.counts[1]} paused, ${r.counts[2]} playing again and ${r.counts[3]} stopped — `
          + `the same boxes at the same coordinates every time, on a canvas that stayed ${r.sizes[0]}; on the pause all `
          + `${r.idle[1] + 0} of them went to the unbuilt state with every one of their ${r.lit[0]} lamps out, and the play `
          + `lit ${r.lit[2]} again without a box moving`,
      };
    },
  },

  {
    name: 'the view lists every lane house-v1 declares',
    area: 'view',
    // named, since a bare link is house-v2 (09-23)
    query: 'v=1&seed=99895',
    page: body(`
      // A stopped set has no graph and so no buses: what the view has to list is
      // every lane *with the wire to the bus it lands on*, which is a fact about
      // a machine that is running.
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
      await bounded(window.ring.machine.open(), 12000);
      const declared = ctl.readout().track.style.lanes.map((l) => l.id);
      const s = window.ring.machine.snapshot();
      const drawn = s.lanes.map((l) => l.id);
      const boxes = s.part.nodes.filter((n) => n.kind === 'lane').map((n) => n.id);
      const bus = s.part.nodes.filter((n) => n.kind === 'bus').map((n) => n.id);
      // A lane reaches its bus directly, or through the treatment the rota put
      // on it — which is a box on the lane's own wire and not a detour.
      const reaches = (from, to, seen) => {
        if (from === to) return true;
        if (seen.has(from)) return false;
        seen.add(from);
        return s.part.edges.some((e) => e.kind === 'signal' && e.from === from && reaches(e.to, to, seen));
      };
      const wired = declared.filter((id) => {
        const lane = s.lanes.find((l) => l.id === id);
        return !lane.bus || reaches('lane:' + id, 'bus:' + lane.bus, new Set());
      });
      const treated = s.lanes.filter((l) => l.treatment).map((l) => l.id + '/' + l.treatment.kind);
      const playing = s.lanes.filter((l) => l.playing.length).map((l) => l.id + '/' + l.playing.join('+'));
      window.ring.machine.close();
      ctl.stop();
      await sleep(300);
      return { strategy: s.strategy, declared, drawn, boxes: boxes.length, buses: bus.length, wired: wired.length, playing, treated };
    `),
    judge: (r) => {
      const same = r.declared.join(' ') === r.drawn.join(' ');
      const missing = r.declared.filter((id) => !r.drawn.includes(id));
      return {
        ok: same && r.boxes === r.declared.length && r.wired === r.declared.length && r.buses === 5 && r.playing.length > 0,
        why: !same ? `the style declares ${r.declared.length} lanes (${missing.join(', ') || 'in another order'}) and the view drew ${r.drawn.length}`
          : r.boxes !== r.declared.length ? `${r.boxes} boxes for ${r.declared.length} lanes`
          : r.wired !== r.declared.length ? `${r.declared.length - r.wired} lanes are drawn with no wire to the bus they land on`
          : r.buses !== 5 ? `${r.buses} buses were drawn where the graph has five`
          : 'no lane is playing anything',
        note: `${r.strategy}: all ${r.declared.length} lanes the style declares are boxes, every one wired to the bus it lands on, `
          + `beside ${r.buses} buses — ${r.playing.length} of them with an instrument on it: ${r.playing.slice(0, 5).join(', ')}`
          + `${r.treated.length ? `; the rota has ${r.treated.join(' and ')} on this bar` : '; the rota has nothing on this bar'}`,
      };
    },
  },

  {
    name: 'the view lists every lane house-v2 declares',
    area: 'view',
    query: 'v=2&seed=99895',
    page: body(`
      // A stopped set has no graph and so no buses: what the view has to list is
      // every lane *with the wire to the bus it lands on*, which is a fact about
      // a machine that is running.
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
      await bounded(window.ring.machine.open(), 12000);
      const declared = ctl.readout().track.style.lanes.map((l) => l.id);
      const s = window.ring.machine.snapshot();
      const drawn = s.lanes.map((l) => l.id);
      const boxes = s.part.nodes.filter((n) => n.kind === 'lane').map((n) => n.id);
      const bus = s.part.nodes.filter((n) => n.kind === 'bus').map((n) => n.id);
      // A lane reaches its bus directly, or through the treatment the rota put
      // on it — which is a box on the lane's own wire and not a detour.
      const reaches = (from, to, seen) => {
        if (from === to) return true;
        if (seen.has(from)) return false;
        seen.add(from);
        return s.part.edges.some((e) => e.kind === 'signal' && e.from === from && reaches(e.to, to, seen));
      };
      const wired = declared.filter((id) => {
        const lane = s.lanes.find((l) => l.id === id);
        return !lane.bus || reaches('lane:' + id, 'bus:' + lane.bus, new Set());
      });
      const treated = s.lanes.filter((l) => l.treatment).map((l) => l.id + '/' + l.treatment.kind);
      const playing = s.lanes.filter((l) => l.playing.length).map((l) => l.id + '/' + l.playing.join('+'));
      const choices = s.lanes.map((l) => l.candidates).reduce((a, b) => a + b, 0);
      window.ring.machine.close();
      ctl.stop();
      await sleep(300);
      return { strategy: s.strategy, declared, drawn, boxes: boxes.length, buses: bus.length, wired: wired.length, playing, treated, choices };
    `),
    judge: (r) => {
      const same = r.declared.join(' ') === r.drawn.join(' ');
      return {
        ok: r.strategy === 'house-v2' && same && r.boxes === r.declared.length
          && r.wired === r.declared.length && r.buses === 5 && r.playing.length > 0,
        why: r.strategy !== 'house-v2' ? `the set is playing ${r.strategy}`
          : !same ? `the style declares ${r.declared.length} lanes and the view drew ${r.drawn.length}`
          : r.wired !== r.declared.length ? `${r.declared.length - r.wired} lanes are drawn with no wire to the bus they land on`
          : r.buses !== 5 ? `${r.buses} buses were drawn where the graph has five`
          : 'no lane is playing anything',
        note: `${r.strategy}: all ${r.declared.length} lanes, every one wired to its bus, ${r.choices} candidates behind them `
          + `against house-v1's one apiece — and the view named what each is actually playing: ${r.playing.slice(0, 5).join(', ')}`
          + `${r.treated.length ? `; the rota has ${r.treated.join(' and ')} on this bar` : '; the rota has nothing on this bar'}`,
      };
    },
  },

  {
    name: 'a bus driven over 0 dBFS reads hot, not clipped: its lamp and LEDs amber, the ledger says it ran hot, and the output alone keeps red',
    area: 'view',
    // **Alone** (M2), for the same reason: the LED going out 200 ms after the
    // tone stops is a meter frame arriving on time.
    serial: true,
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // The one scenario that writes into the machine, and it says so. A bus is
    // driven over full scale by a tone connected straight to it — a test-only
    // path that exists for the length of this scenario and is disconnected in
    // it — because the alternative is asserting that a colour *would* be red.
    // The set is on the silent route, so nothing of it is heard.
    page: body(`
      ctl.setSeed('1');
      await sleep(200);
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
      await bounded(window.ring.machine.open(), 12000);
      const c = ctl.state.ctx;
      const before = window.ring.machine.snapshot();
      const calm = before.meters ? before.meters.clipped.slice() : null;
      const linesBefore = before.ledger.length;

      // the test-only path
      const deck = ctl.mix.record;
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 220;
      const hot = c.createGain();
      hot.gain.value = 1.8;      // over full scale, on the bus and nowhere else
      osc.connect(hot);
      hot.connect(deck.graph.buses.melodic.dry);
      osc.start();
      await sleep(900);
      const s = window.ring.machine.snapshot();
      const clipped = s.meters ? s.meters.clipped.slice() : [];
      const peak = s.meters ? s.meters.buses.melodic.peak : null;
      // ...and the mark itself, read off the page rather than off the value it
      // was drawn from: the melodic bus's own box, by the id the description
      // gave it, and the fill of the lamp on it.
      const cell = document.querySelector('#machine [data-box="bus:melodic"]');
      const lamp = cell && cell.querySelector('circle.lamp') ? cell.querySelector('circle.lamp').getAttribute('fill') : null;
      const line = s.ledger.filter((e) => e.kind === 'hot').map((e) => e.what);
      const clipLines = s.ledger.filter((e) => e.kind === 'clip' && /melodic/.test(e.what)).length;
      const leds = cell ? [...cell.querySelectorAll('g.led rect')].map((x) => x.getAttribute('fill')) : [];
      const outPeak = s.meters ? s.meters.out.peak : null;
      const ceiling = s.meters ? s.meters.ceilingDb : null;
      osc.stop();
      osc.disconnect();
      hot.disconnect();
      await sleep(200);
      const cooled = window.ring.machine.snapshot();
      window.ring.machine.close();
      ctl.stop();
      await sleep(300);
      return {
        calm, clipped, peak, lamp, line, linesBefore, clipLines, leds, outPeak, ceiling,
        lampsKnown: !!cell,
        after: cooled.meters ? cooled.meters.clipped.slice() : [],
        late: window.deepHouse.late.count,
      };
    `),
    judge: (r) => {
      const RED = '#ff4d4f';
      const AMBER = '#ffb020';
      const lit = r.clipped.includes('melodic');
      const quietBefore = !r.calm || !r.calm.includes('melodic');
      const noRed = !r.leds.includes(RED) && r.leds.includes(AMBER);
      return {
        ok: quietBefore && lit && r.lamp === AMBER && noRed && !r.clipLines && r.line.some((w) => /melodic ran hot/.test(w)) && !r.after.includes('melodic') && r.outPeak <= r.ceiling + 0.1,
        why: !quietBefore ? `the melodic bus was already clipping before the tone: ${r.calm.join(', ')}`
          : !lit ? `the bus peaked at ${r.peak} dBFS and the frame says ${r.clipped.join(', ') || 'nothing'} is clipping`
          : !r.lampsKnown ? 'there is no box for the melodic bus on the page to read a lamp off'
          : r.lamp !== AMBER ? `the lamp is ${r.lamp} where a hot bus is ${AMBER}`
          : !noRed ? `the LEDs read ${[...new Set(r.leds)].join(', ')}`
          : r.clipLines ? 'the ledger called the bus clipped'
          : !r.line.length ? 'nothing was written in the ledger'
          : r.outPeak > r.ceiling + 0.1 ? `the output read ${r.outPeak} over its ceiling ${r.ceiling}`
          : `the heat did not clear: ${r.after.join(', ')} is still over 0 dBFS after the tone stopped`,
        note: `a tone over full scale on the melodic bus took it to ${r.peak} dBFS: its lamp ${r.lamp}, its LEDs amber and none red, the ledger says "${r.line[0]}" and no clip, `
          + `the output ${r.outPeak} dBFS under its ${r.ceiling} ceiling — and the moment the tone stopped the LED went out again`,
      };
    },
  },

  {
    name: 'the ledger names a seam and a cast with their bars',
    area: 'view',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    setup: () => ({ from: '15576', to: '92970' }),
    page: body(`
      const S = window.__setup;
      ctl.setSeed(S.from);
      await sleep(250);
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2, 12000);
      await bounded(window.ring.machine.open(), 12000);
      const start = window.ring.machine.snapshot().ledger.filter((e) => e.what === 'the set started');
      ctl.setSeed(S.to);
      const armed = await waitFor(() => ctl.state.cut && ctl.state.cut.kind === 'cast', 8000);
      if (!armed) { window.ring.machine.close(); ctl.stop(); return { noCast: true }; }
      const c = ctl.state.ctx;
      const stop = ctl.state.cut.end + 2;
      const until = performance.now() + (stop - c.currentTime) * 1000 + 8000;
      while (c.currentTime < stop && performance.now() < until) {
        if (ctl.readout().seed === S.to) break;
        await sleep(50);
      }
      await sleep(400);
      const s = window.ring.machine.snapshot();
      const lines = s.ledger.map((e) => ({ kind: e.kind, what: e.what, theme: e.theme, bar: e.bar, seed: e.seed, fields: e.fields }));
      window.ring.machine.close();
      ctl.stop();
      await sleep(300);
      return { lines, start: start.length, seed: ctl.readout().seed };
    `),
    judge: (r, setup) => {
      if (r.noCast) return { ok: false, why: 'the cast armed no hand-over, so there was nothing to write down' };
      const of = (what) => r.lines.filter((l) => l.what === what);
      const cast = of('a cast was asked for')[0];
      const began = of('a hand-over began')[0];
      const swap = of('the low end changed hands')[0];
      const changed = of('the set changed hands')[0];
      const barred = (l) => l && l.theme > 0 && l.bar > 0;
      return {
        ok: !!cast && !!began && !!swap && !!changed && barred(cast) && barred(began)
          && cast.fields.to === setup.to && cast.seed === setup.from && r.seed === setup.to,
        why: !cast ? 'the ledger does not name the cast'
          : !began ? 'the ledger does not name the seam it began'
          : !swap ? 'the ledger does not name the low end changing hands'
          : !changed ? 'the ledger does not name the set changing hands'
          : !barred(cast) || !barred(began) ? `a line carries no bar: cast ${cast.theme}/${cast.bar}, seam ${began.theme}/${began.bar}`
          : `the cast was written as ${cast.seed} to ${cast.fields.to} and the set is on ${r.seed}`,
        note: `the ledger has the whole hand-over with a bar on every line: "${cast.what}" at theme ${cast.theme} bar ${cast.bar} `
          + `(${cast.fields.from} to ${cast.fields.to}, ${cast.fields.bpm} BPM, ${cast.fields.key}), `
          + `"${began.what}" at bar ${began.bar} over ${began.fields.bars} bars into ${began.fields.into}, `
          + `then "${swap.what}" at theme ${swap.theme} bar ${swap.bar} and "${changed.what}" from ${changed.fields.from} to ${changed.fields.to}`,
      };
    },
  },

  {
    name: 'the phone is one page, and only the graph scrolls sideways',
    area: 'view',
    // seed 1 by name: since K16 a bare page throws the die
    query: 'seed=1',
    // Eugene's own layout (`PLAN-MACHINE-VIEW` §2d as he re-drew it on 09-19):
    // below the break the three columns stack into one long page — the ring,
    // the readings and the engine, then the graph, then the ledger — and **the
    // graph is the one element that scrolls across**, because a layered graph
    // is wider than a phone and the page itself must never scroll sideways.
    page: body(`
      // With the set playing, so what has to fit is the whole machine and not
      // the handful of boxes a stopped one has.
      ${LEDGER_SHOWN}
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
      await bounded(window.ring.machine.open(), 12000);
      await frame();
      const s = window.ring.machine.snapshot();
      const inner = document.getElementById('machineInner');
      const mode = inner ? inner.className : '';
      // Every box of the description is a box on the page, by its own id.
      const drawn = [...document.querySelectorAll('#machine [data-box]')].map((n) => n.getAttribute('data-box'));
      const missing = s.part.nodes.filter((n) => !drawn.includes(n.id)).map((n) => n.label);
      // Everything every box says is on the page too: a box carries its label,
      // what the machine made there and its readings as text.
      const words = (document.getElementById('machineDiagram') || { textContent: '' }).textContent;
      // a strip is named by its bus's own word, under the column's BUSES
      const unsaid = s.part.nodes.filter((n) => !words.includes(n.kind === 'bus' ? n.label.replace(/^BUS /, '') : n.label)).map((n) => n.label);
      // The order of the long page, top to bottom.
      const at = (sel) => { const e = document.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : null; };
      // (M8: the genres under the ring, then the readings, the engine last)
      const order = { ring: at('#machine .ringbox'), genres: at('#machine .genre-block'), readings: at('#machine .list'), engine: at('#machine .engine'), graph: at('#machine .pane.graph'), ledger: at('#machine .pane.ledger') };
      const stacked = order.ring <= order.genres && order.genres <= order.readings && order.readings <= order.engine
        && order.engine <= order.graph && order.graph <= order.ledger;
      const doc = document.documentElement;
      const across = doc.scrollWidth - doc.clientWidth;
      const pane = document.querySelector('#machine .pane.graph');
      const sideways = pane ? pane.scrollWidth - pane.clientWidth : 0;
      const scrolls = pane ? getComputedStyle(pane).overflowX : '';
      // ...and it really scrolls: drive it and read where it got to.
      let got = 0;
      if (pane) { pane.scrollLeft = 400; got = Math.round(pane.scrollLeft); }
      const ring = document.querySelector('#machine .ringbox');
      // (M13) the ring is pinned with its toolbar, as one block
      const block = document.querySelector('#machine .ring-block');
      const pinned = block ? getComputedStyle(block).position : '';
      const rows = document.querySelectorAll('#machine .engine .row').length;
      const facts = document.querySelectorAll('#machine .fact').length;
      const ledger = document.querySelectorAll('#machine .line').length;
      const viewport = { w: window.innerWidth, h: window.innerHeight };
      window.ring.machine.close();
      ctl.stop();
      await sleep(300);
      return { mode, boxes: s.part.nodes.length, drawn: drawn.length, missing, unsaid, order, stacked,
        across, sideways, scrolls, got, pinned, rows, facts, ledger, viewport };
    `),
    judge: (r) => ({
      ok: r.mode.includes('scrolling') && !r.missing.length && !r.unsaid.length
        && r.drawn === r.boxes && r.stacked && r.across <= 1 && r.pinned === 'sticky'
        && r.sideways > 0 && r.got > 0 && r.rows >= 2 && r.facts >= 15 && r.ledger > 0,
      why: !r.mode.includes('scrolling') ? `at ${r.viewport.w} px the view is in ${r.mode || 'no'} mode`
        : r.missing.length ? `${r.missing.length} boxes are not on the page: ${r.missing.slice(0, 5).join(', ')}`
        : r.drawn !== r.boxes ? `${r.drawn} boxes drawn for ${r.boxes} described`
        : r.unsaid.length ? `${r.unsaid.length} boxes are drawn without their own name on them: ${r.unsaid.join(", ")}`
        : !r.stacked ? `the page is not in the order ring, genres, readings, engine, graph, ledger: ${JSON.stringify(r.order)}`
        : r.across > 1 ? `the page scrolls ${r.across} px across, and it must never`
        : r.pinned !== 'sticky' ? `the ring is ${r.pinned} where it should be pinned at the top`
        : !(r.sideways > 0) ? 'the graph is not wider than the phone, so nothing was proved about its scroller'
        : !(r.got > 0) ? `the graph's own scroller (overflow-x ${r.scrolls}) did not move`
        : r.rows < 2 ? `the engine selector has ${r.rows} rows`
        : r.facts < 15 ? `only ${r.facts} readings are listed`
        : 'the ledger has no lines',
      note: `at ${r.viewport.w}x${r.viewport.h} the page is one stack in the order the sketch asks for — `
        + `the ring pinned at the top, the genre keys under it, ${r.facts} readings under those, the engine's ${r.rows} segments last under a header of their own, `
        + `then the graph and the ledger's ${r.ledger} lines at the end. All ${r.boxes} boxes are drawn with their own `
        + `names and readings on them; the graph is ${r.sideways} px wider than the screen and scrolls across on its own `
        + `(it went to ${r.got}), and the page itself does not scroll across at all`,
    }),
  },

  {
    name: 'the engine switch is a seam, the readout follows at the swap, and the journal takes one arrival under the engine that plays',
    area: ['seam', 'journal'],
    // `notes/archive/2026-09-v2-day-chain/plans/PLAN-MACHINE-VIEW.md` §5b, and the one control the view has.
    // v2 -> v1 -> v2 on the same seed: the record has to go on sounding through
    // both, the readout has to name the engine that is *playing* and not the
    // one that was asked for, and the address bar has to say which is which at
    // the ask — `v=1`, then `v=2`, never `strategy=` or `ver=`: since 09-22 a link a
    // hand has written names its engine whichever it is (`src/link.ts`).
    //
    // And R24, which was a row of its own until 09-24 (*an engine hand-over
    // writes one arrival into the journal, under the engine that plays*): the
    // face took the theme and the engine that the swap turns over together as
    // two branches, and each wrote an arrival — a theme under house-v2 that
    // never played, then the same one under house-v1. That row asked the same
    // switch on the same seed through `setStrategy`, which is what the row
    // clicked here calls, and waited out the same seam; each switch here now
    // asks it, both ways.
    //
    // **Alone, after the rest** (`serial`, 09-24). An engine switch plans and
    // compiles a whole set of the other engine on the page's thread while the
    // record plays, and "nothing late across the two switches" is part of its
    // rule. With three other browsers playing beside it on a machine that was
    // busy besides, one full run of three saw one note reached late — and eight
    // of it at once, on a quieter minute, saw none. The rule is about what the
    // switch costs its own page, so it is asked where the page has the machine.
    serial: true,
    query: 'v=2&seed=99895',
    page: body(`
      const SILENT = 1e-6;   // -120 dB: below any tail this master puts out
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1.5, 12000);
      await bounded(window.ring.machine.open(), 12000);
      const c = ctl.state.ctx;
      if (!c.createScriptProcessor) return { noTap: true };
      let run = 0, worst = 0, frames = 0;
      const tap = c.createScriptProcessor(4096, 2, 2);
      tap.onaudioprocess = (e) => {
        const L = e.inputBuffer.getChannelData(0);
        const R = e.inputBuffer.getChannelData(1);
        frames += L.length;
        for (let i = 0; i < L.length; i++) {
          const a = Math.abs(L[i]) + Math.abs(R[i]);
          if (a < SILENT) { run += 1; if (run > worst) worst = run; } else run = 0;
        }
      };
      const sink = c.createGain();
      sink.gain.value = 0;
      ctl.mix.out.connect(tap);
      tap.connect(sink);
      sink.connect(c.destination);
      const t0 = c.currentTime;
      await sleep(1800);
      const quiet = { samples: worst, seconds: c.currentTime - t0 };
      worst = 0; run = 0;

      const seed = ctl.readout().seed;
      const lateBefore = window.deepHouse.late.count;
      const steps = [];
      // The selector's own rows, read off the page and clicked like a hand:
      // what is asserted is the control and not a method behind it.
      const rows = () => [...document.querySelectorAll('#machine .engine .row')];
      const listed = rows().map((r) => r.querySelector('.id').textContent);
      const flipAt = c.currentTime;
      for (const want of ['house-v1', 'house-v2']) {
        const was = ctl.readout().strategy;
        const row = rows().find((r) => r.querySelector('.id').textContent === want);
        if (!row) { steps.push({ want, missing: true }); continue; }
        const had = ctl.journal.entries.length;
        row.click();
        // The ask is in the address bar at once; the music is not yet.
        const url = location.search;
        const armed = await waitFor(() => ctl.state.cut && ctl.state.cut.kind === 'engine', 8000);
        const atAsk = { strategy: ctl.readout().strategy, arriving: ctl.state.strategyTo, url };
        const cut = armed ? { ...ctl.state.cut } : null;
        let turnedAt = 0;
        if (cut) {
          const stop = cut.end + 2;
          const until = performance.now() + (stop - c.currentTime) * 1000 + 10000;
          while (c.currentTime < stop && !turnedAt && performance.now() < until) {
            if (ctl.readout().strategy === want) turnedAt = c.currentTime;
            await sleep(50);
          }
        }
        // what the swap wrote into the journal, once the face has read it
        await sleep(400);
        const added = ctl.journal.entries.slice(had).map((e) => ({ seed: e.seed, theme: e.theme, strategy: e.strategy }));
        steps.push({
          want, was, armed, atAsk, added, theme: ctl.state.themeIndex,
          swap: cut ? cut.swapAt : null,
          turned: turnedAt ? turnedAt - (cut ? cut.swapAt : 0) : null,
          after: ctl.readout().strategy,
          seed: ctl.readout().seed,
          mix: ctl.mix ? ctl.mix.state.strategy : null,
          playing: !!(ctl.mix && ctl.mix.state.running),
        });
      }
      const flip = { samples: worst, seconds: c.currentTime - flipAt, frames };
      const ledger = window.ring.machine.snapshot().ledger
        .filter((e) => e.kind === 'engine').map((e) => e.what);
      // ...and asking for the engine that is already playing plans nothing.
      const again = rows().find((r) => r.querySelector('.id').textContent === ctl.readout().strategy);
      if (again) again.click();
      await sleep(200);
      const noop = !ctl.state.cut && !ctl.state.strategyTo;

      ctl.mix.out.disconnect(tap);
      tap.onaudioprocess = null;
      tap.disconnect();
      sink.disconnect();
      window.ring.machine.close();
      ctl.stop();
      await sleep(300);
      return {
        rate: c.sampleRate, quiet, flip, listed, steps, ledger, noop, seed,
        url: location.search,
        late: window.deepHouse.late.count - lateBefore,
      };
    `),
    judge: (r) => {
      if (r.noTap) return { ok: false, why: 'this engine has no per-sample tap to measure silence with' };
      const ms = (n) => (n / r.rate) * 1000;
      const floor = Math.max(r.quiet.samples, 128);
      const quiet = r.flip.samples <= floor;
      // R24: the swap turns the theme and the engine over together, and the
      // journal takes one arrival for it, under the engine that plays
      const wrote = (s) => s.added.length === 1 && s.added[0].strategy === s.want && s.added[0].theme === s.theme;
      const bad = r.steps.find((s) => s.missing || !s.armed || s.after !== s.want || s.seed !== r.seed || !wrote(s)
        || s.atAsk.strategy !== s.was || s.atAsk.arriving !== s.want || !s.playing
        || !new RegExp('[?&]v=' + s.want.replace(/^house-v/, '') + '\\b').test(s.atAsk.url) || /strategy=|[?&]ver=/.test(s.atAsk.url)
        || s.turned == null || Math.abs(s.turned) > 0.6);
      const bothListed = ['house-v1', 'house-v2'].every((id) => r.listed.includes(id));
      // Back on house-v2, so the link names it — as its number, bare.
      const url = /[?&]v=2\b/.test(r.url) && !/strategy=|[?&]ver=/.test(r.url);
      return {
        // Two lines and not four: the ledger keeps thirty seconds and two
        // hand-overs take longer than that, so what is still in it is the
        // second switch's ask and its swap — which is the window working.
        ok: bothListed && !bad && quiet && url && r.noop && !r.late && r.ledger.length >= 2,
        why: !bothListed ? `the selector lists ${r.listed.join(', ')}`
          : bad ? (bad.missing ? `there is no ${bad.want} row to click`
            : !bad.armed ? `choosing ${bad.want} armed no hand-over`
            : bad.atAsk.strategy !== bad.was ? `the readout said ${bad.atAsk.strategy} at the ask, before the music had changed`
            : bad.atAsk.arriving !== bad.want ? `the arriving engine was ${bad.atAsk.arriving} and not ${bad.want}`
            : !/[?&]v=/.test(bad.atAsk.url) || /strategy=|[?&]ver=/.test(bad.atAsk.url) ? `asking for ${bad.want} wrote the address "${bad.atAsk.url}"`
            : bad.seed !== r.seed ? `the seed moved from ${r.seed} to ${bad.seed}`
            : !bad.playing ? `the set stopped going to ${bad.want}`
            : bad.turned == null ? `the readout never said ${bad.want}`
            : !wrote(bad) ? `the hand-over to ${bad.want} wrote ${JSON.stringify(bad.added)} into the journal, on theme ${bad.theme}`
            : `the readout turned ${bad.turned.toFixed(2)} s from the swap, not at it`)
          : !quiet ? `the meter saw ${ms(r.flip.samples).toFixed(1)} ms of silence across the two switches against ${ms(r.quiet.samples).toFixed(1)} ms in the ${r.quiet.seconds.toFixed(1)} s before them`
          : !url ? `the address bar says "${r.url}"`
          : !r.noop ? 'asking for the engine that is already playing started a second hand-over'
          : r.late ? `${r.late} notes reached late across the two switches`
          : `the ledger has ${r.ledger.length} engine lines, and the last switch alone should have written two`,
        note: `the selector lists ${r.listed.join(' and ')}; ${r.steps.map((s) => `${s.was} to ${s.want} armed a seam, the readout followed ${Math.abs(s.turned).toFixed(2)} s from the swap and the journal took one arrival under ${s.want}`).join(', ')} — `
          + `seed ${r.seed} throughout, the set never stopped, and over ${r.flip.seconds.toFixed(1)} s of both switches the meter saw `
          + `${ms(r.flip.samples).toFixed(1)} ms of silence (${ms(r.quiet.samples).toFixed(1)} the untouched set) with nothing late; `
          + `the address bar says "${r.url}", asking again for what is playing plans nothing, and the last switch's own two lines are still in the ledger's thirty seconds ("${r.ledger.join('", "')}")`,
      };
    },
  },

  // --- step 5: the eight cells as controls (UX-1) ---------------------------
  // `notes/archive/2026-09-plans/cited/PLAN-BIRDS-UX.md` §7. A cell is a reading until a hand pulls it, and
  // everything below is a rule about where the value goes when it does: into
  // the address bar on release and never before it, into the music at the next
  // phrase line and never on a frame, into the dice's own box across a cast,
  // and nowhere at all on the record's page.
  //
  // The gesture scenarios drive **real pointer events** on the built page,
  // because the gesture is the thing being gated; the two that measure the
  // music go through `window.ring.pull`, which is the same two calls the
  // gesture makes and nothing else, so what they wait on is the transport.

  {
    name: 'a pull writes the URL on release and not before',
    area: 'birds',
    // `notes/archive/2026-09-plans/cited/PLAN-BIRDS-UX.md` §4: the address bar is the save and the share, written
    // when the hand lets go and never on a frame. So the whole of a drag — six
    // moves, every one of them a new value on the ring — leaves the link
    // exactly as it found it, and the release writes it once.
    query: 'v=2&seed=15576',
    setup: () => ({ cell: 0, bird: 'ember', house: HOUSE.ember }),
    page: body(PULL + `
      const S = window.__setup;
      const before = { url: location.search, held: heldNow(), controls: cells()[0].controls };
      const during = await pullTo(S.cell, 0.85, () => ({ url: location.search, v: cells()[S.cell].value }));
      const after = { url: location.search, held: heldNow(), cell: cells()[S.cell], spell: ctl.readout().spell };
      // and a second pull on the same cell moves it again, on the same link
      await pullTo(S.cell, 0.20, null);
      const back = { url: location.search, cell: cells()[S.cell] };
      return { before, during, after, back };
    `),
    judge: (r, setup) => {
      const bare = !r.before.url.includes('spell=');
      const quiet = r.during.every((d) => !d.url.includes('spell='));
      const moved = r.during.length > 1 && r.during[r.during.length - 1].v !== r.during[0].v;
      const rose = r.during.every((d, i) => i === 0 || d.v >= r.during[i - 1].v);
      const wrote = r.after.url.includes(`spell=${BIRD_CODE[setup.bird]}`) || r.after.url.includes(`spell=${BIRD_CODE[setup.bird]}%3A`);
      const held = r.after.held.length === 1 && r.after.held[0].bird === setup.bird && r.after.cell.held;
      const link = decodeURIComponent(r.after.url).includes(`${BIRD_CODE[setup.bird]}:${r.after.cell.value}`);
      const again = r.back.cell.value < setup.house && decodeURIComponent(r.back.url).includes(`${BIRD_CODE[setup.bird]}:${r.back.cell.value}`);
      return {
        ok: r.before.controls && bare && quiet && moved && rose && wrote && held && link && again,
        why: !r.before.controls ? 'the cells are not controls on this engine'
          : !bare ? `the link already said ${r.before.url} before a hand touched it`
          : !quiet ? `the address bar was written mid-drag: ${r.during.map((d) => d.url).join(' | ')}`
          : !moved ? `six moves along the spoke left the value at ${r.during[0] && r.during[0].v}`
          : !rose ? `a pull outward did not raise the value: ${r.during.map((d) => d.v).join(', ')}`
          : !wrote ? `releasing left the address bar at ${r.after.url}`
          : !held ? `the ring holds ${JSON.stringify(r.after.held)}`
          : !link ? `the link says ${r.after.url} where the cell stands at ${r.after.cell.value}`
          : `a second pull put the cell at ${r.back.cell.value} and the link at ${r.back.url}`,
        note: `six moves took ${setup.bird} from ${setup.house} to ${r.after.cell.value} with the address bar untouched at every one of them, `
          + `and the release wrote it once — "${decodeURIComponent(r.after.url)}" — with the cell standing at `
          + `${r.after.cell.radius.toFixed(3)} of its rest radius; a second pull inward to ${r.back.cell.value} rewrote the same link`,
      };
    },
  },

  {
    name: 'a held bird survives a cast and a seam',
    area: 'seam',
    // Eugene, 09-19: *"absolutely; you put the spell, and if you don't like the
    // result you cast the dice again to shake up the randomiser"* — so the dice
    // roll **inside** the held box. The bird is pulled while the set plays, the
    // seam lands it, the dice are thrown, and the bird is still where the hand
    // left it: on the ring, in the link, in the spell the arriving set is
    // planned under, and in the journal's own entry for it.
    deadline: 300000,
    query: 'v=2&seed=15576',
    setup: () => ({ cell: 7, bird: 'veil', value: 0.85 }),
    page: body(PULL + `
      const S = window.__setup;
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2, 12000);
      const c = ctl.state.ctx;
      const lateBefore = window.deepHouse.late.count;
      window.ring.pull(S.cell, S.value);
      const url = location.search;
      const armed = await waitFor(() => ctl.state.cut && ctl.state.cut.kind === 'spell', 8000);
      const cut = armed ? { ...ctl.state.cut } : null;
      if (!cut) { ctl.stop(); return { noSeam: true, url }; }
      // the promise, while it has not landed
      const pending = cells()[S.cell].pending;
      // and after it has: the spell the set is playing is the hand's
      const stop = cut.end + 2;
      const until = performance.now() + (stop - c.currentTime) * 1000 + 12000;
      let landed = false;
      while (c.currentTime < stop && !landed && performance.now() < until) {
        landed = Math.abs((ctl.readout().spell || {})[S.bird] - S.value) < 1e-9;
        await sleep(60);
      }
      const afterSeam = { landed, held: heldNow(), pending: cells()[S.cell].pending, spell: ctl.readout().spell, url: location.search };
      // the dice, thrown inside the held box
      const seedBefore = ctl.readout().seed;
      window.ring.newMix();
      const cast = await waitFor(() => ctl.state.cut && ctl.state.cut.kind === 'cast', 8000);
      const coming = ctl.mix.state.next;
      const castCut = cast ? { ...ctl.state.cut } : null;
      let turned = false;
      if (castCut) {
        const stop2 = castCut.end + 2;
        const until2 = performance.now() + (stop2 - c.currentTime) * 1000 + 12000;
        while (c.currentTime < stop2 && !turned && performance.now() < until2) {
          turned = ctl.readout().seed !== seedBefore;
          await sleep(60);
        }
      }
      const entry = ctl.journal ? ctl.journal.entries[ctl.journal.at] : null;
      const afterCast = {
        cast, turned, held: heldNow(), url: location.search,
        seedBefore, seed: ctl.readout().seed,
        spell: ctl.readout().spell,
        comingSpell: coming && coming.spell ? coming.spell : null,
        entrySpell: entry ? entry.spell : null,
      };
      ctl.stop();
      await sleep(300);
      return { url, pending, afterSeam, afterCast, late: window.deepHouse.late.count - lateBefore };
    `),
    judge: (r, setup) => {
      if (r.noSeam) return { ok: false, why: `pulling a cell mid-set armed no hand-over (url ${r.url})` };
      const seam = r.afterSeam.landed && !r.afterSeam.pending
        && r.afterSeam.held.length === 1 && r.afterSeam.held[0].bird === setup.bird;
      const kept = r.afterCast.turned && r.afterCast.seed !== r.afterCast.seedBefore
        && r.afterCast.held.length === 1 && r.afterCast.held[0].value === setup.value
        && Math.abs(r.afterCast.spell[setup.bird] - setup.value) < 1e-9;
      const link = decodeURIComponent(r.afterCast.url).includes(`${BIRD_CODE[setup.bird]}:${setup.value}`);
      const journal = !!r.afterCast.entrySpell && Math.abs(r.afterCast.entrySpell[setup.bird] - setup.value) < 1e-9;
      return {
        ok: r.pending && seam && kept && link && journal && !r.late,
        why: !r.pending ? 'the held cell showed no promise while the seam was still ahead of it'
          : !seam ? `after the seam the set plays ${JSON.stringify(r.afterSeam.spell && r.afterSeam.spell[setup.bird])} and the ring holds ${JSON.stringify(r.afterSeam.held)}`
          : !kept ? `after the cast the ring holds ${JSON.stringify(r.afterCast.held)} on seed ${r.afterCast.seed} under ${JSON.stringify(r.afterCast.spell && r.afterCast.spell[setup.bird])}`
          : !link ? `the address bar says ${r.afterCast.url}`
          : !journal ? `the journal's own entry carries ${JSON.stringify(r.afterCast.entrySpell)}`
          : `${r.late} notes reached late`,
        note: `${setup.bird} pulled to ${setup.value} while the set played landed at the seam and the promise went out with it; `
          + `the dice then rolled seed ${r.afterCast.seedBefore} to ${r.afterCast.seed} **inside the held box** — the arriving set planned under `
          + `${setup.bird} ${r.afterCast.comingSpell ? (+r.afterCast.comingSpell[setup.bird]).toFixed(3) : 'the same'}, the ring still holding it, `
          + `the link still "${decodeURIComponent(r.afterCast.url)}" and the journal's entry carrying it, with nothing late`,
      };
    },
  },

  {
    name: 'release-all bares the URL',
    area: 'birds',
    // Two presses on the centre disc and not one: letting eight birds go is the
    // one gesture on this ring a hand cannot undo by putting a finger back. The
    // long press says the word in the free band and does **not** also start the
    // set; the press that takes the offer does not either.
    query: 'v=2&seed=15576&spell=ember:0.85,tide:0.2',
    page: body(PULL + `
      const start = { held: heldNow(), url: location.search, playing: ctl.playing };
      const centre = () => { const b = tilt(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
      const word = () => {
        const t = [...document.querySelectorAll('#actionLabels text')].find((n) => n.textContent.toLowerCase().trim() === 'release');
        return t ? +t.getAttribute('opacity') : null;
      };
      const quiet = word();
      // a short press on the centre is the transport, exactly as it always was
      hand('pointerdown', centre(), el('tilt'));
      await sleep(60);
      hand('pointerup', centre(), window);
      await sleep(120);
      const short = { word: word(), held: heldNow().length, playing: ctl.playing };
      ctl.stop();
      await sleep(200);
      // and a long one offers the word without starting anything
      hand('pointerdown', centre(), el('tilt'));
      await sleep(820);
      const armedWord = word();
      hand('pointerup', centre(), window);
      await sleep(120);
      const armed = { word: word(), held: heldNow().length, playing: ctl.playing, url: location.search };
      // the second press takes it
      hand('pointerdown', centre(), el('tilt'));
      await sleep(50);
      hand('pointerup', centre(), window);
      await sleep(250);
      // The eight **slide** home rather than being put there: since UX-1's bugs
      // round a spell does not rebuild the ring, so a released node eases onto
      // its rest radius over the slide ease instead of being snapped by the
      // rebuild that used to follow. This waits for the slide and then asks
      // where they stand, which is the question the scenario has always asked.
      const settled = await waitFor(() => cells().every((c) => Math.abs(c.radius / c.rest - 1) < 1e-6), 4000);
      const after = { settled, word: word(), held: heldNow(), url: location.search, playing: ctl.playing, spell: ctl.readout().spell, cells: cells().map((c) => c.radius / c.rest) };
      ctl.stop();
      await sleep(200);
      return { start, quiet, short, armedWord, armed, after };
    `),
    judge: (r) => {
      const opened = r.start.held.length === 2 && r.start.url.includes('spell=');
      const hidden = r.quiet === 0;
      const transport = r.short.word === 0 && r.short.held === 2;
      const offer = r.armedWord > 0 && r.armed.held === 2 && !r.armed.playing && r.armed.url.includes('spell=');
      const gone = r.after.held.length === 0 && !r.after.url.includes('spell=') && !r.after.playing && r.after.word === 0;
      const home = r.after.cells.every((v) => Math.abs(v - 1) < 1e-6);
      return {
        ok: opened && hidden && transport && offer && gone && home,
        why: !opened ? `the link opened holding ${JSON.stringify(r.start.held)}`
          : !hidden ? `the word was already up at ${r.quiet}`
          : !transport ? `a short press on the centre said the word at ${r.short.word} or let ${2 - r.short.held} birds go`
          : !offer ? `a long press left the word at ${r.armedWord}, ${r.armed.held} birds held and playing ${r.armed.playing}`
          : !gone ? `the second press left ${r.after.held.length} held and the link at ${r.after.url}`
          : `the eight cells stand at ${r.after.cells.map((v) => v.toFixed(3)).join(', ')} of their rest radius`,
        note: `a link holding two birds opened with the word hidden; a short press on the centre was the transport and nothing else; `
          + `a long one said "release" at ${r.armedWord} with both birds still held and nothing started; and the press that took the offer `
          + `let both go, slid all eight cells back onto their rest radius and bared the link to "${decodeURIComponent(r.after.url)}"`,
      };
    },
  },

  {
    name: 'the record\'s page has no control on it',
    area: 'ring',
    // `notes/archive/2026-09-plans/cited/PLAN-BIRDS-UX.md` §5, and `ROADMAP`'s decision of 09-19: v1 is the classic
    // engine and on it the cells are readings only. It is not a name that
    // decides it — the strategy's plan has to read a held bird at all — but
    // what a hand finds is what is checked: a drag on a cell moves nothing,
    // writes nothing and leaves eight readings behind it. The link names v1: a
    // bare link is house-v2 since 09-23.
    query: 'v=1&seed=15576',
    page: body(PULL + `
      const before = { strategy: ctl.readout().strategy, url: location.search, radii: cells().map((c) => c.radius / c.rest),
        roles: [...document.querySelectorAll('#starCells g.cell')].map((g) => g.getAttribute('role')) };
      await pullTo(0, 0.85, null);
      await pullTo(4, 0.30, null);
      // no bird says a percent: a percent is a hand's, and there is no hand here
      const titles = [...document.querySelectorAll('#starWords > g')]
        .map((g) => (g.querySelector('text') || { textContent: '' }).textContent);
      const after = { url: location.search, held: heldNow(), radii: cells().map((c) => c.radius / c.rest),
        controls: cells()[0].controls, spell: ctl.readout().spell,
        roles: [...document.querySelectorAll('#starCells g.cell')].map((g) => g.getAttribute('role')),
        titles };
      // and a key on a focused cell is not a control either
      const g = document.querySelectorAll('#starCells g.cell')[0];
      g.focus();
      g.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
      await sleep(400);
      return { before, after, afterKey: { url: location.search, held: heldNow().length, value: cells()[0].value } };
    `),
    judge: (r) => {
      const v1 = r.before.strategy === 'house-v1' && !r.after.controls;
      const still = r.after.radii.every((v) => Math.abs(v - 1) < 1e-6);
      const bare = !r.after.url.includes('spell=') && !r.afterKey.url.includes('spell=');
      const readings = r.after.roles.every((x) => x === 'img') && r.before.roles.every((x) => x === 'img');
      const dark = r.after.titles.length === 8 && r.after.titles.every((t) => !t.includes('%'));
      const none = r.after.held.length === 0 && r.afterKey.held === 0;
      return {
        ok: v1 && still && bare && readings && dark && none,
        why: !v1 ? `the page is on ${r.before.strategy} and its cells say controls ${r.after.controls}`
          : !still ? `a drag moved the cells to ${r.after.radii.map((v) => v.toFixed(3)).join(', ')} of their rest radius`
          : !bare ? `the address bar says ${r.after.url} / ${r.afterKey.url}`
          : !readings ? `the eight cells read as ${r.after.roles.join(', ')}`
          : !dark ? `a bird says a percent: ${r.after.titles.join(', ')}`
          : `the ring holds ${JSON.stringify(r.after.held)}`,
        note: `on the record two full drags and an arrow key moved nothing: eight cells still at their rest radius, `
          + `eight of them still \`role="img"\`, no percent on any of them, nothing held and the link still "${r.after.url}"`,
      };
    },
  },

  {
    name: 'a pull lands at the next phrase line and never on a frame, and the colour walks on that seam\'s clock',
    area: ['seam', 'ring'],
    // The transport half of a pull, measured the way a cast is: where the seam
    // falls in the theme that is playing, and whether the output ever stops
    // while it is made. A pull is a promise about what follows and not a knob
    // on this one, so the theme playing keeps the spell it was planned under
    // and the line is a four-bar line ahead of the playhead.
    //
    // **And the colour on the same seam** (`TODO.md`, 09-19, closed here): the
    // gradient steps at a boundary and the unfiltered layers walk on
    // `mix.approach`, which is how near the *arrangement's* own seam is — the
    // wrong clock for a seam a hand asked for, in front of which the colour had
    // no walk at all. A pull is what changes the colour, so the walk is the
    // seam's own two numbers, and this measures the ink against both clocks
    // and says which one it is on.
    //
    // (One row since 09-24: these were two, each opening seed 15576, pulling
    // Veil to 0.85 and waiting out the same seam — twenty seconds apiece. The
    // ink is read on every frame of the wait the transport half already makes,
    // and each half is judged as it was; the colour's is asked first, because
    // its questions are the ones a meter on the output cannot disturb.)
    deadline: 300000,
    query: 'v=2&seed=15576',
    setup: () => ({ cell: 7, bird: 'veil', value: 0.85 }),
    page: body(PULL + `
      const S = window.__setup;
      const SILENT = 1e-6;   // -120 dB: below any tail this master puts out
      // one of the marks the derived colour owns: the star's own wide stroke
      const ink = () => document.querySelector('#starLines path').getAttribute('stroke');
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2, 12000);
      const c = ctl.state.ctx;
      if (!c.createScriptProcessor) return { noTap: true };
      let run = 0, worst = 0, frames = 0;
      const tap = c.createScriptProcessor(4096, 2, 2);
      tap.onaudioprocess = (e) => {
        const L = e.inputBuffer.getChannelData(0);
        const R = e.inputBuffer.getChannelData(1);
        frames += L.length;
        for (let i = 0; i < L.length; i++) {
          const a = Math.abs(L[i]) + Math.abs(R[i]);
          if (a < SILENT) { run += 1; if (run > worst) worst = run; } else run = 0;
        }
      };
      const sink = c.createGain();
      sink.gain.value = 0;
      ctl.mix.out.connect(tap);
      tap.connect(sink);
      sink.connect(c.destination);
      const t0 = c.currentTime;
      await sleep(2200);
      const quiet = { samples: worst, seconds: c.currentTime - t0 };
      worst = 0; run = 0;

      const lateBefore = window.deepHouse.late.count;
      const before = ctl.readout();
      const playedUnder = before.spell ? before.spell[S.bird] : null;
      const from = ink();
      const gold = window.ring.colour().hex;
      const pull0 = c.currentTime;
      window.ring.pull(S.cell, S.value);
      const atAsk = { ink: ink(), approach: ctl.readout().mix.approach };
      const armed = await waitFor(() => ctl.state.cut && ctl.state.cut.kind === 'spell', 8000);
      const cut = armed ? { ...ctl.state.cut } : null;
      if (!cut) { ctl.stop(); return { noSeam: true }; }
      const held = ctl.readout();
      const now = c.currentTime;
      const bs = held.barSeconds;
      const seamIn = held.seconds + (cut.at - now);
      const stillUnder = held.spell ? held.spell[S.bird] : null;
      // every frame up to the swap: the ink against both clocks, and whether
      // the readout has turned to the hand's spell
      const samples = [];
      const stop = cut.end + 2;
      const until = performance.now() + (stop - c.currentTime) * 1000 + 12000;
      let turnedAt = 0;
      while (c.currentTime < stop && !turnedAt && performance.now() < until) {
        const r = ctl.readout();
        if (c.currentTime < cut.swapAt) {
          const span = Math.max(0.001, r.mix.cutSpan || 0.001);
          const left = Math.max(0, r.mix.cutIn || 0);
          samples.push({ cut: Math.min(1, Math.max(0, 1 - left / span)), approach: r.mix.approach, ink: ink() });
        }
        if (Math.abs((r.spell || {})[S.bird] - S.value) < 1e-9) turnedAt = c.currentTime;
        await frame(50);
      }
      const pull = { samples: worst, seconds: c.currentTime - pull0 };
      // past the swap, where the gradient has stepped and the walk is over
      await sleep(900);
      const to = ink();
      const after = { hex: window.ring.colour().hex, spell: ctl.readout().spell };
      ctl.mix.out.disconnect(tap);
      tap.onaudioprocess = null;
      tap.disconnect();
      sink.disconnect();
      ctl.stop();
      await sleep(300);
      return {
        rate: c.sampleRate, quiet, pull, playedUnder, stillUnder,
        seam: { at: seamIn, bar: seamIn / bs, barSeconds: bs, ahead: seamIn - before.seconds,
          offPhrase: Math.min((seamIn / bs) % 4, 4 - ((seamIn / bs) % 4)),
          bars: (cut.end - cut.at) / bs },
        turned: turnedAt ? turnedAt - cut.swapAt : null,
        late: window.deepHouse.late.count - lateBefore,
        colour: { from, to, gold, atAsk, after, samples, bars: (cut.end - cut.at) / bs },
      };
    `),
    judge: (r, setup) => {
      if (r.noTap) return { ok: false, why: 'this engine has no per-sample tap to measure silence with' };
      if (r.noSeam) return { ok: false, why: 'pulling a cell mid-set armed no hand-over' };
      // the colour
      const k = r.colour;
      const rgb = (h) => [1, 3, 5].map((i) => parseInt(String(h).slice(i, i + 2), 16));
      const far = (a, b) => Math.max(...rgb(a).map((v, i) => Math.abs(v - rgb(b)[i])));
      if (far(k.from, k.to) < 8) {
        return { ok: false, why: `the pull moved the ring's ink by only ${far(k.from, k.to)} of 255, which is nothing to walk` };
      }
      // The page mixes in Oklab, so the expected ink at a given fraction is
      // worked out here with the same function rather than guessed at in sRGB.
      const used = k.samples.filter((s) => s.cut > 0.02 && s.cut < 0.98);
      if (used.length < 8) return { ok: false, why: `only ${used.length} frames fell inside the seam` };
      let worstCut = 0;
      let worstApproach = 0;
      for (const s of used) {
        worstCut = Math.max(worstCut, far(s.ink, mixHex(k.from, k.to, s.cut)));
        worstApproach = Math.max(worstApproach, far(s.ink, mixHex(k.from, k.to, Math.min(1, Math.max(0, s.approach)))));
      }
      const began = far(k.atAsk.ink, k.from) <= 2;
      const onCut = worstCut <= 6;
      const notApproach = worstApproach > worstCut + 6;
      const landed = far(k.to, mixHex(k.from, k.to, 1)) === 0;
      const rose = used.every((s, i) => i === 0 || s.cut >= used[i - 1].cut - 1e-6);
      const colourWhy = !began ? `the ink jumped ${far(k.atAsk.ink, k.from)} of 255 at the ask, before the seam existed`
        : !onCut ? `the ink is ${worstCut} of 255 off the seam's own clock over ${used.length} frames`
        : !notApproach ? `the ink is ${worstCut} off the seam's clock and ${worstApproach} off the arrangement's, which does not tell them apart`
        : !landed ? 'the ink at the swap is not where the walk was going'
        : !rose ? 'the seam\'s clock ran backwards across the walk' : null;
      // the transport
      const onPhrase = r.seam.offPhrase <= 0.02 && r.seam.ahead > 0;
      const kept = r.stillUnder === r.playedUnder && r.stillUnder !== setup.value;
      const floor = Math.max(r.quiet.samples, 128);
      const silent = r.pull.samples <= floor;
      const turned = r.turned != null && Math.abs(r.turned) <= 0.5;
      const ms = (n) => (n / r.rate) * 1000;
      return {
        ok: !colourWhy && onPhrase && kept && silent && turned && !r.late,
        why: colourWhy ? colourWhy
          : !onPhrase ? `the seam begins at bar ${r.seam.bar.toFixed(3)}, ${r.seam.offPhrase.toFixed(3)} bars off a four-bar line, ${r.seam.ahead.toFixed(2)} s ahead`
          : !kept ? `the theme that was playing was re-planned under the pull (${r.playedUnder} to ${r.stillUnder})`
          : !silent ? `the meter saw ${ms(r.pull.samples).toFixed(1)} ms of silence across the pull against ${ms(r.quiet.samples).toFixed(1)} ms in the ${r.quiet.seconds.toFixed(1)} s before it`
          : r.turned == null ? 'the spell never reached the readout'
          : `${r.late} notes reached late across the pull`,
        note: `a pull ${r.seam.ahead.toFixed(1)} s before the line handed over at bar ${r.seam.bar.toFixed(0)} — a four-bar line, `
          + `${r.seam.offPhrase.toFixed(3)} bars off it — over ${r.seam.bars.toFixed(0)} bars, with the theme that was playing keeping the spell `
          + `it was planned under (${r.playedUnder}); the readout turned ${Math.abs(r.turned).toFixed(2)} s from the swap and over `
          + `${r.pull.seconds.toFixed(1)} s of it the meter saw ${ms(r.pull.samples).toFixed(1)} ms of silence `
          + `(${ms(r.quiet.samples).toFixed(1)} the untouched set) with nothing late; and the ring's ink walked ${far(k.from, k.to)} of 255 from ${k.from} to ${k.to}: `
          + `nothing at the ask, then ${used.length} frames of walk never more than **${worstCut} of 255** off the hand-asked seam's own clock `
          + `— where the arrangement's own \`approach\`, the clock it used to be on, is ${worstApproach} off over the same frames — `
          + `and the gradient stepped onto ${k.after.hex} at the swap`,
      };
    },
  },

  {
    name: 'the tell still opens on a still press and stays up under a pull',
    area: 'words',
    // The one rule a cell that became a control must not break: the tapped
    // explanation stays the tapped explanation. A press that does not move
    // opens the line and holds the bird where it was.
    //
    // **And a press that moves keeps it** (Eugene, 09-20: *"while a hand is on
    // a bird the cell's explanation line must be visible, carrying the pole
    // words and value, so the person never guesses what they are moving"*).
    // UX-1 took the line away the moment a press became a pull, which left a
    // hand configuring something with no words anywhere near it. It says
    // something else while the hand is on it — the value, the end it is heading
    // for, and which half of the change is already sounding — and the tapped
    // explanation is what a cell nobody is holding still answers with.
    query: 'v=2&seed=15576',
    page: body(PULL + `
      const opacity = () => +(document.querySelector('#innerLive text.tell') || { getAttribute: () => 0 }).getAttribute('opacity');
      const line = () => (document.querySelector('#innerLive text.tell textPath') || { textContent: '' }).textContent;
      // a still press: down, nothing, up
      const p = spoke(0, 316);
      hand('pointermove', p, el('stage'));
      hand('pointerdown', p, el('tilt'));
      await sleep(80);
      hand('pointerup', p, window);
      await sleep(260);
      const still = { op: opacity(), said: line(), value: cells()[0].value, held: cells()[0].held, url: location.search };
      // and a press that moves
      await pullTo(0, 0.85, null);
      await sleep(120);
      const moved = { op: opacity(), said: line(), value: cells()[0].value, percent: cells()[0].percent, held: cells()[0].held, url: location.search };
      // and a pull the other way says the other pole
      await pullTo(0, 0.10, null);
      await sleep(120);
      const back = { said: line(), value: cells()[0].value };
      return { still, moved, back, house: cells()[0].house };
    `),
    judge: (r) => {
      const told = r.still.op > 0.8 && r.still.said.length > 10 && !r.still.held
        && r.still.value === r.house && !r.still.url.includes('spell=');
      // the convention, said once where a cell explains itself
      // (since round K13 the line is the reading in one sentence, and never the convention's pole words)
      // (and since the panel round after it, the band's fact in five words at most)
      const convention = r.still.said.trim().split(/\s+/).length <= 5 && !/\b(OUT|MORE|LESS|IN|HOW|SHORTER|LONGER)\b/.test(r.still.said);
      const pulled = r.moved.held && r.moved.value > r.house && r.moved.url.includes('spell=');
      const up = r.moved.op > 0.8;
      // the pole words, the value, and the two poles being different words
      // the percent of the house, which is what a hand reads (09-23)
      // the pole words, and — round K3 — never the name or the percent, which
      // are on the bird's own words beside it
      // (since round K13, the reading at the hand's value in one sentence: the
      // groove at its tempo pulled up, the drums off pulled down)
      const says = /^(STEADY FOUR|DRIVING KICK|FAST BEAT)/.test(r.moved.said) && !r.moved.said.includes('%') && !r.moved.said.includes('EMBER');
      const other = r.back.said.startsWith('NO DRUMS') && !/^(STEADY FOUR|DRIVING KICK|FAST BEAT)/.test(r.back.said);
      return {
        ok: told && convention && pulled && up && says && other,
        why: !told ? `a still press left the line at ${r.still.op} and the bird at ${r.still.value} (url ${r.still.url})`
          : !convention ? `the explanation is not one plain sentence of the reading: "${r.still.said}"`
          : !pulled ? `a moving press left the bird at ${r.moved.value}, held ${r.moved.held} (url ${r.moved.url})`
          : !up ? `the line went out under the hand, at ${r.moved.op}`
          : !says ? `the line under the hand says "${r.moved.said}" and not the reading at the hand's value`
          : `a pull the other way says "${r.back.said}"`,
        note: `a press that did not move opened the explanation — "${r.still.said.slice(0, 56)}…" at ${r.still.op} — and left the bird `
          + `at the house with the link bare; the same cell pressed and moved kept the line up at ${r.moved.op} and said `
          + `"${r.moved.said}", and pulled the other way it said "${r.back.said}"`,
      };
    },
  },

  {
    name: 'a pull is heard at once in the seasoning and at the seam in the plan',
    area: 'seam',
    // Eugene, 09-20: *"should some bird movements be an instant change in sound
    // and some a remix follow-up? Now there is no direct response to any bird,
    // a delay and a follow-up wait."*
    //
    // A held bird asks two things and they land at two different times. What it
    // asks of the **structure** — the kit, the tempo family, the room, which
    // instruments play — is a promise about the next theme, because a plan is a
    // plan and nothing rewrites one that is sounding. What it asks of the
    // **seasoning** — the settings a voice is played inside its own declared
    // range — is a number on a note, and every note the deck has not handed to
    // the audio clock is given the new one at the ask.
    //
    // Tide is the bird to ask with: it moves `hold` on every voice that
    // declares one, and `PLAN-MODULATION` M1 measured a Tide pull as 314 ms of
    // decay against the house's 200 on the same electric piano. What this reads
    // is the number itself, on the notes, before the seam has landed anything.
    deadline: 300000,
    query: 'v=2&seed=1',
    setup: () => ({ cell: 6, bird: 'tide', value: 0.95 }),
    page: body(PULL + `
      const S = window.__setup;
      // the seasoning on the notes this deck has not played yet, by voice, read
      // off the notes themselves
      const seasoning = () => (ctl.mix ? ctl.mix.seasoning : null);
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 3, 15000);
      // Back to the top of the theme, so the whole of what follows happens
      // inside one theme: what this is about is the half of a pull that does
      // **not** wait for a seam, and a seam landing in the middle of it would
      // be the other half answering the question.
      ctl.seekToBar(0);
      await sleep(1500);
      const lateBefore = window.deepHouse.late.count;
      const before = { season: seasoning(), theme: ctl.readout().mix.themeNumber, key: ctl.readout().key };
      window.ring.pull(S.cell, S.value);
      await sleep(400);
      const after = { season: seasoning(), theme: ctl.readout().mix.themeNumber, seasoned: ctl.mix.seasoned };
      // nothing has changed hands yet: the plan's half is still a promise
      const cut = ctl.state.cut;
      const pending = window.ring.cells()[S.cell].pending;
      // and back to the house takes the seasoning off again
      window.ring.release(S.cell);
      await sleep(400);
      const home = { season: seasoning(), seasoned: ctl.mix.seasoned };
      ctl.stop();
      await sleep(200);
      return { before, after, home, cut: !!cut, pending, lateBefore, lateAfter: window.deepHouse.late.count };
    `),
    judge: (r, setup) => {
      if (!r.before.season || !r.after.season) return { ok: false, why: 'the deck did not answer for its own notes' };
      const bare = Object.keys(r.before.season.knobs).length === 0;
      const voices = Object.keys(r.after.season.knobs);
      const seasoned = voices.length > 0 && r.after.seasoned > 0;
      // the notes were still ahead of the clock: the deck had not visited them
      const ahead = r.after.season.index < r.after.season.total;
      // the same theme is playing: this is not the seam doing it
      const live = r.after.theme === r.before.theme;
      const off = Object.keys(r.home.season.knobs).length === 0;
      const late = r.lateAfter === r.lateBefore;
      const holds = voices
        .map((v) => `${v} hold ${(r.after.season.knobs[v].hold ?? 0).toFixed(3)}`)
        .slice(0, 4).join(', ');
      return {
        ok: bare && seasoned && ahead && live && off && late,
        why: !bare ? `the set was already seasoned before the hand: ${JSON.stringify(r.before.season.knobs)}`
          : !seasoned ? `a pull on ${setup.bird} seasoned ${r.after.seasoned} notes on ${voices.length} voices`
          : !ahead ? `the deck had already visited every note: ${r.after.season.index} of ${r.after.season.total}`
          : !live ? `the theme changed hands during the pull: ${r.before.theme} to ${r.after.theme}`
          : !off ? `letting the bird go left the seasoning on: ${JSON.stringify(r.home.season.knobs)}`
          : `${r.lateAfter - r.lateBefore} notes were late`,
        note: `with nothing held not one of the deck's ${r.before.season.total} notes carried a setting; a pull on ${setup.bird} to `
          + `${setup.value} re-seasoned **${r.after.seasoned}** of them — every note past the scheduler's own cursor at `
          + `${r.after.season.index} — on ${voices.length} voices (${holds}) **inside the same theme**, with the seam still only `
          + `promised${r.pending ? ' and the cell still showing the promise' : ''} and 0 notes late; letting the bird go took the `
          + `setting off ${r.home.seasoned} notes again`,
      };
    },
  },

  {
    name: 'the beat flashes on the beat, at both tempos and across a seam',
    area: 'ring',
    // Eugene, 09-20: *"the ring pulse is not in sync with the BPM"*. Two
    // separate questions, and this asks both.
    //
    // **Is the flash on the beat?** The four dots are drawn off `beatInBar`,
    // which is the position in *grid* beats — `deckThemeTime` counts the set's
    // own clock and divides by the theme's beat — so the dot turns over on the
    // grid and not on a wall clock. What is measured is the dot the page
    // actually drew against the beat the transport says at the same instant,
    // sampled on the page's own frames, at the house's 104 and at the 169 a
    // pull on Ember asks for.
    //
    // **And does the number agree with it?** The set keeps one grid: through a
    // seam both decks are on the outgoing theme's tempo and then the grid
    // glides to the incoming theme's over sixteen bars, so a theme's `bpm` is
    // its target and not the rate. The cell printed the target while the dots
    // flashed at the rate — MEASURED, 169.1 on the cell and 112.7 under it —
    // which is the ring disagreeing with itself. It prints the grid now.
    deadline: 300000,
    query: 'v=2&seed=1',
    setup: () => ({ cell: 0, bird: 'ember' }),
    page: body(PULL + `
      const S = window.__setup;
      // The dot the ring drew, and the beat the transport says, on every frame:
      // a turnover is where they are compared, and the first one seen is the
      // state the watch began in rather than a turnover.
      const dots = () => {
        for (const g of document.querySelectorAll('#innerLive g')) {
          const c = [...g.children];
          if (c.length === 4 && c.every((n) => n.tagName === 'circle')
            && c[0].getAttribute('r') === '3' && c[1].getAttribute('r') === '2.2') return c;
        }
        return [];
      };
      const watchBeats = (ms) => new Promise((done) => {
        const out = [];
        const t0 = performance.now();
        let lit = -1;
        const tick = () => {
          const r = ctl.readout();
          const on = dots().findIndex((c) => Number(c.getAttribute('opacity')) > 0.5);
          if (r && r.playing && on >= 0 && on !== lit) {
            const first = lit < 0;
            lit = on;
            if (!first) out.push({ t: +(performance.now() - t0).toFixed(2), drew: on, says: r.beatInBar,
              phase: +r.beatPhase.toFixed(4), beat: +r.beat.toFixed(5), sec: +r.seconds.toFixed(4) });
          }
          if (performance.now() - t0 < ms) requestAnimationFrame(tick); else done(out);
        };
        requestAnimationFrame(tick);
      });
      const said = () => {
        const g = document.querySelectorAll('#starWords > g')[S.cell];
        return g ? [...g.querySelectorAll('text')].map((t) => t.textContent) : [];
      };
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2, 15000);
      const slow = { bpm: ctl.readout().bpm, grid: ctl.readout().gridBpm, said: said(), beats: await watchBeats(6000) };
      // a pull on Ember to the top asks for a broken kit near 169
      window.ring.pull(S.cell, 1);
      await sleep(500);
      // what the ring says is coming, which is the whole of what a promise is
      const asked = (ctl.readout().mix.next || {}).bpm || null;
      // wait for the seam to change hands, and then for the grid to finish
      // leaning: sixteen bars at the new tempo
      // the seam has changed hands when the theme playing is the one at the
      // asked tempo — in place, since a bird move keeps the place (09-24)
      const landed = await waitFor(() => !ctl.readout().mix.cutting && asked != null && Math.abs(ctl.readout().bpm - asked) < 0.05, 200000);
      const atSeam = { bpm: ctl.readout().bpm, grid: ctl.readout().gridBpm, said: said() };
      // **Until the grid has arrived, and not a fixed forty seconds** (09-24).
      // The glide is sixteen bars at the incoming tempo — 22.7 s at 169 — and
      // the fast watch is judged against the plan's tempo, so what it needs is
      // the grid on the plan's number; the forty was that glide and a margin,
      // paid whole on every run. The margin is kept as the bound.
      const glided = await waitFor(() => Math.abs((ctl.readout().gridBpm || 0) - ctl.readout().bpm) < 0.06, 45000);
      // and a bar more, for the cell's own number to be written off the grid
      await sleep(Math.round(ctl.readout().barSeconds * 1000));
      const fast = { bpm: ctl.readout().bpm, grid: ctl.readout().gridBpm, glided, said: said(), beats: await watchBeats(6000) };
      ctl.stop();
      await sleep(200);
      return { slow, asked, landed, atSeam, fast };
    `),
    judge: (r) => {
      // the beat the transport counted over the window, taken off the boundaries
      // the flashes stood just past so the reading carries no sampling at either end
      //
      // **The rate is read on the set's own clock** (09-24). The flashes are
      // timed on the page's frames, and the set's seconds are read beside each
      // one, so the rate the dots ran at is counted in the time the music is
      // counted in: the page's milliseconds scaled by how many of the set's
      // seconds went by in each of them over the same window. MEASURED under
      // four browsers at once: the set's clock ran 0.933 s a second against the
      // page's, because a headless engine's audio device is starved on a busy
      // machine and renders late — so a rate on the page's clock read 157.75
      // for a grid of 169.1 and failed a ring that had drawn every beat right,
      // and the serial suite failed it the same way (161.68, 153.9) whenever
      // the machine was busy. How fast a starved device's clock runs against
      // the wall is the machine's, not the ring's; the dot the ring drew
      // against the beat the set was on, and the flash's lateness behind it,
      // are still asked of every flash, and the page's own rate is printed.
      const read = (b) => {
        if (b.length < 4) return null;
        const late = b.map((x) => x.phase * x.beat * 1000);
        const edge = b.map((x, i) => x.t - late[i]);
        const beats = Math.round((b[b.length - 1].sec - b[0].sec) / b[0].beat);
        const sorted = [...late].sort((x, y) => x - y);
        const clock = (b[b.length - 1].sec - b[0].sec) * 1000 / (b[b.length - 1].t - b[0].t);
        const wall = beats ? 60000 / ((edge[edge.length - 1] - edge[0]) / beats) : 0;
        return {
          n: b.length,
          agree: b.filter((x) => x.drew === x.says).length,
          bpm: +(wall / clock).toFixed(2),
          wall: +wall.toFixed(2),
          clock: +clock.toFixed(3),
          medianLate: +sorted[Math.floor(sorted.length / 2)].toFixed(1),
          worstLate: +sorted[sorted.length - 1].toFixed(1),
        };
      };
      const A = read(r.slow.beats);
      const B = read(r.fast.beats);
      if (!A || !B) return { ok: false, why: `too few flashes to read: ${r.slow.beats.length} at the house, ${r.fast.beats.length} after the pull` };
      // A frame is 16.7 ms and a headless engine under a suite drops some, so
      // the gate on lateness is the median and two frames; what is held exactly
      // is that the dot the ring drew is the dot the transport said, every time.
      const drewRight = A.agree === A.n && B.agree === B.n;
      const onTime = A.medianLate < 34 && B.medianLate < 34;
      const slowRight = Math.abs(A.bpm - r.slow.bpm) < 1.5;
      const fastRight = Math.abs(B.bpm - r.fast.bpm) < 2.5;
      const arrived = r.landed && r.fast.bpm > r.slow.bpm + 20;
      // and the number the cell prints is the number the dots are flashing at
      const printed = Number(r.fast.said[1]);
      const agrees = Math.abs(printed - B.bpm) < 2.5;
      const leaned = Number(r.atSeam.said[1]) < r.atSeam.bpm - 1;
      return {
        ok: drewRight && onTime && slowRight && fastRight && arrived && agrees,
        why: !arrived ? `the pull did not change the tempo: ${r.slow.bpm} then ${r.fast.bpm}, landed ${r.landed}`
          : !drewRight ? `the ring drew a beat the transport was not on: ${A.agree}/${A.n} and ${B.agree}/${B.n}`
          : !onTime ? `the flash is ${A.medianLate} ms and ${B.medianLate} ms behind the beat`
          : !slowRight ? `the dots ran at ${A.bpm} where the plan says ${r.slow.bpm}`
          : !fastRight ? `the dots ran at ${B.bpm} where the plan says ${r.fast.bpm} (the grid said ${r.fast.grid}${r.fast.glided ? '' : ', still gliding'})`
          : `the cell prints ${printed} where the dots are flashing at ${B.bpm}`,
        note: `at the house the dots ran at ${A.bpm} against the plan's ${r.slow.bpm}, ${A.medianLate} ms behind the beat `
          + `(worst ${A.worstLate}) over ${A.n} flashes, every one of them the beat the transport was on (${A.wall} on the page's clock, the set's running ${A.clock} s a second against it); a pull on Ember `
          + `asked for ${r.asked} and the seam landed it, and once the grid had glided onto it the dots ran at ${B.bpm} against the plan's `
          + `${r.fast.bpm}, ${B.medianLate} ms behind over ${B.n} flashes, all of them right (${B.wall} on the page's clock at ${B.clock})${r.fast.glided ? '' : ' (the grid had not quite arrived)'}. The cell printed `
          + `"${r.fast.said[1]}" at the end and "${r.atSeam.said[1]}" the moment the seam landed, where the plan already `
          + `said ${r.atSeam.bpm}${leaned ? ' — the grid leaning, said as the grid leant' : ''}`,
      };
    },
  },

  // ==========================================================================
  // **Smooth as silk** (Eugene, 09-20, and a rule rather than a note: *"the slow
  // bird circle animations must never be interrupted by activities around bird
  // repositions or anything else — things around the magic should be smooth as
  // silk."*)
  //
  // A picture pair cannot say this; only the numbers can. So the page is
  // sampled every frame while a hand pulls a bird, lets it go, throws the star
  // and skips a theme — the four events that tear the eight cells down and
  // stand eight new ones up — and every continuous motion on the ring is asked
  // the same question: did it ever move further between two frames than its own
  // per-frame step allows?
  //
  // The four sampled, and where each of them lives:
  //
  // | motion | the mark | its own step |
  // |---|---|---|
  // | the sway | the star sheet's own `rotate()` | a degree and a half a second of drift, plus one turn a theme |
  // | the glyphs | the sum of every number in each cell's glyph | none: since 09-23 a glyph never moves, so its span over the run is nought |
  // | the light | a cell halo's opacity | 0.14 of what is left, at most 0.07 |
  // | the breath | the centre disc's radius | its beat envelope, which *does* step — once a beat, and only there |
  //
  // The breath is the one that is allowed a jump, because a beat is an attack
  // and not a glide: the gate therefore asks that its jumps happen **only** on
  // the frames the transport turned a beat over, which is the same statement
  // said where it is true.
  {
    name: 'Ember, Gleam, Spark and Root each draw the level of the hand\'s value, from the drop and through the seam',
    area: 'glyphs',
    // Eugene, 09-23, bird by bird: Ember's burning level *"from high flame to
    // little sparkles and smoke"* — one tongue to 0.18, two to 0.66, three to
    // 1, traced from his picture (since K23 the fire sign: one, two and three triangles); Gleam *"at smaller values one sparkle,
    // rendered like a diamond — flatter, a minor kind of connotation; at large
    // values the sparkles more pronounced"* — one flat diamond to 0.25, one
    // four-point star to 0.6, a thin cross-star and two small ones to 1;
    // Spark, *"remove the small lightnings at smaller bird values"* — one bolt
    // to 0.6, the bolt and two small ones thrown off it to 1; Root, *"vary
    // circles based on bass presence — max value, max circles"* — the point
    // and one ring to 0.25, two to 0.75 (the house, 0.717), three to 1. **Since
    // round K3 the glyph follows the hand** (*"icons should change while the
    // user is dragging the bird"*): a pull from the top to 0.10 shows the
    // bottom level from the drop, holds it through the wait and past the seam,
    // and no other bird's glyph is written at all.
    //
    // **One seam for the four** (09-24). These were four rows, each opening
    // seed 1 with its one bird high and waiting out the same seam for it, 31 s
    // apiece. A pull made inside the commit's wait joins the seam already
    // coming (*two birds stepped inside the commit's wait both reach the
    // spell*), so the four pulled together land together, and each is still
    // asked its own three questions: the top level at load, the bottom level
    // through the whole wait, the bottom level past the seam. The drawings are
    // compared to the data, scaled as the page scales them, so the diamond and
    // the star — one mark each — are told apart; Spark is held to its drawing
    // through the wait where it was held to its count of marks. And the four
    // birds nobody pulled are the same drawing before and after, which is the
    // part of *no other bird's glyph is written* that four birds changing at
    // once can still ask; that one bird's change leaves the other seven alone
    // mark for mark is asked on every frame of a drag in *a dragged Ember's
    // glyph follows the hand*.
    query: 'v=2&seed=1&spell=ember:0.90,gleam:0.90,spark:0.90,root:0.95',
    deadline: 120000,
    page: body(`
      const BIRDS = { ember: 'bpm', gleam: 'key', spark: 'figures', root: 'preset' };
      const cells = () => [...document.querySelectorAll('#starCells g.cell')];
      const cellOf = (b) => cells().find((g) => g.getAttribute('data-id') === BIRDS[b]);
      const drawn = (g) => [...g.querySelectorAll('path:not(.fill)')].filter((p) => p.getAttribute('fill') !== 'url(#gold)').map((p) => p.getAttribute('d')).join(';');
      const pulled = new Set(Object.values(BIRDS));
      const others = () => cells().filter((g) => !pulled.has(g.getAttribute('data-id'))).map(drawn).join('|');
      await frame();
      const R = +document.querySelector('#starCells g.cell circle').getAttribute('r');
      const atLoad = {};
      for (const b of Object.keys(BIRDS)) atLoad[b] = drawn(cellOf(b));
      const before = others();
      await started();
      await sleep(1500);
      for (const b of Object.keys(BIRDS)) window.ring.pull(window.ring.cells().findIndex((c) => c.bird === b), 0.10);
      // the glyph follows the hand (round K3): past its 150 ms cross-fade it
      // shows the dropped value's level, and holds it through the wait
      await sleep(400);
      const during = Object.fromEntries(Object.keys(BIRDS).map((b) => [b, new Set()]));
      let landed = false;
      let waited = 0;
      for (let k = 0; k < 900; k++) {
        const sp = ctl.readout().spell;
        if (sp && Object.keys(BIRDS).every((b) => sp[b] != null && Math.abs(sp[b] - 0.10) < 1e-6)) { landed = true; break; }
        for (const b of Object.keys(BIRDS)) during[b].add(drawn(cellOf(b)));
        waited++;
        await sleep(100);
      }
      await sleep(400);
      const after = {};
      for (const b of Object.keys(BIRDS)) after[b] = drawn(cellOf(b));
      const kept = others() === before;
      ctl.stop();
      return { R, atLoad, during: Object.fromEntries(Object.entries(during).map(([b, v]) => [b, [...v]])), landed, after, kept, waited };
    `),
    judge: (r) => {
      // the top level each opened at, and the bottom one a pull to 0.10 draws
      const want = {
        ember: { top: drawnAt('ember', 'three', r.R), bottom: drawnAt('ember', 'one', r.R), names: ['three triangles', 'one triangle'] },
        gleam: { top: drawnAt('gleam', 'lifted', r.R), bottom: drawnAt('gleam', 'minor', r.R), names: ['the cross-star', 'the diamond'] },
        spark: { top: drawnAt('spark', 'storm', r.R), bottom: drawnAt('spark', 'straight', r.R), names: ['the storm', 'the slim bolt'] },
        root: { top: drawnAt('root', 'crush', r.R), bottom: drawnAt('root', 'thin', r.R), names: ['three rings', 'one ring'] },
      };
      const name = (b, d) => (d === want[b].top ? want[b].names[0] : d === want[b].bottom ? want[b].names[1] : 'something else');
      const bad = Object.keys(want).map((b) => {
        const w = want[b];
        if (r.atLoad[b] !== w.top) return `${b} opened as ${name(b, r.atLoad[b])}, not ${w.names[0]}`;
        if (r.during[b].length !== 1 || r.during[b][0] !== w.bottom) return `${b} drew ${r.during[b].map((d) => name(b, d)).join(', ') || 'nothing'} while the pull waited`;
        if (r.after[b] !== w.bottom) return `${b} drew ${name(b, r.after[b])} past the seam`;
        return null;
      }).filter(Boolean);
      return {
        ok: r.landed && r.kept && !bad.length,
        why: !r.landed ? `the set never took the four pulls to 0.10 (${(r.waited / 10).toFixed(1)} s waited)`
          : bad.length ? bad.join('; ') : 'the four birds nobody pulled were drawn differently after the seam',
        note: `at the top Ember is three triangles, Gleam the cross-star, Spark the storm and Root three rings; four pulls to 0.10 show one triangle, the diamond, the slim bolt and one ring from the drop, `
          + `and each holds for the ${(r.waited / 10).toFixed(1)} s the seam takes and past it; the four birds nobody pulled are the same drawing before and after`,
      };
    },
  },

  {
    name: 'at the house Ember is the fire sign, Gleam the four-point star and Root the point and two rings',
    area: 'glyphs',
    // The middle level of each, at its house value: Ember at 0.394 a triangle
    // with one inside it (two tongues of the traced flame until K23), Gleam at
    // 0.359 one four-point star, Root at 0.717
    // the point and two rings (its solid point is ink and left out). One load
    // for the three, where it was three loads of the same page (09-24).
    query: 'v=2&seed=1',
    page: body(`
      await frame();
      const of = (id) => [...document.querySelectorAll('#starCells g.cell')].find((x) => x.getAttribute('data-id') === id);
      const all = (g) => [...g.querySelectorAll('path:not(.fill)')].map((p) => p.getAttribute('d')).join(';');
      const R = +document.querySelector('#starCells g.cell circle').getAttribute('r');
      const root = of('preset');
      return {
        R,
        ember: all(of('bpm')),
        gleam: all(of('key')),
        root: { R: +root.querySelector('circle').getAttribute('r'),
          d: [...root.querySelectorAll('path:not(.fill)')].filter((p) => p.getAttribute('fill') !== 'url(#gold)').map((p) => p.getAttribute('d')).join(';') },
      };
    `),
    judge: (r) => {
      const bad = [
        r.ember !== drawnAt('ember', 'two', r.R) && 'Ember at the house is not the two-triangle drawing of the data',
        r.gleam !== drawnAt('gleam', 'star', r.R) && 'Gleam at the house is not the four-point star of the data',
        r.root.d !== drawnAt('root', 'body', r.root.R) && 'Root at the house is not the two-ring drawing of the data',
      ].filter(Boolean);
      return {
        ok: !bad.length,
        why: bad.join('; '),
        note: 'at its house value Ember (0.394) is the fire sign with one triangle inside it, Gleam (0.359) one four-point star and Root (0.717) the point and two rings — the middle level of each',
      };
    },
  },

  {
    name: 'the glyphs are one drawing each, and never move',
    area: 'glyphs',
    // Eugene, 09-23: *"remove the icon animation and the two states"*. Every
    // cell's glyph is read as markup at rest, then under a pointer, with its
    // bird held by a hand, after the hand lets it go, and after a throw rebuilt
    // every cell: all five readings must be the same bytes. It runs under v2,
    // where the cells are controls and a bird can be held at all. A change of
    // level is not a glyph moving — the level scenarios hold those — so the
    // held value stays inside the level the bird already shows.
    query: 'v=2&seed=1',
    deadline: 60000,
    page: body(`
      const read = () => [...document.querySelectorAll('#starCells g.cell')]
        .map((g) => [...g.querySelectorAll('path:not(.fill)')].map((p) => p.getAttribute('d') + '|' + (p.getAttribute('fill') || '')).join(';'));
      await frame();
      const rest = read();
      window.ring.point(4);
      await sleep(400);
      const pointed = read();
      window.ring.point(null);
      // held inside the level it already shows: since pass 4 every bird has
      // levels and a glyph follows the hand across one, so the hold is Root
      // (cell 4) at 0.62 — out of the house zone, still its two-ring level
      window.ring.pull(4, 0.62);
      await sleep(400);
      const held = read();
      const heldNow = window.ring.cells()[4].held;
      window.ring.release(4);
      await sleep(400);
      const released = read();
      window.ring.cast('full');
      await sleep(2500);
      const cast = read();
      return { rest, pointed, held, heldNow, released, cast, paths: rest.reduce((n, s) => n + s.split(';').length, 0) };
    `),
    judge: (r) => {
      const same = (a) => JSON.stringify(a) === JSON.stringify(r.rest);
      const moved = ['pointed', 'held', 'released', 'cast'].filter((k) => !same(r[k]));
      return {
        ok: r.rest.length === 8 && r.heldNow && !moved.length,
        why: r.rest.length !== 8 ? `${r.rest.length} cells drawn` : !r.heldNow ? 'the pull did not hold the bird'
          : `the glyphs differ from their rest drawing ${moved.join(', ')}`,
        note: `8 glyphs, ${r.paths} marks, the same bytes at rest, under the pointer, held, released and after a throw rebuilt every cell`,
      };
    },
  },

  {
    id: 'ring-silk',
    name: 'nothing slow is ever cut short',
    area: 'ring',
    query: 'v=2&seed=1',
    deadline: 120000,
    setup: () => ({ cell: 0 }),
    page: body(PULL + `
      const S = window.__setup;
      await window.ring.control.start();
      await sleep(2500);
      // every frame: the sway, the eight glyphs, the eight lights, the breath
      const shot = () => {
        const st = document.getElementById('star').style.transform || '';
        const m = /rotate\\((-?[\\d.]+)deg\\)/.exec(st);
        const cells = [...document.querySelectorAll('#starCells g.cell')];
        // **The glyph, read off the drawing itself**: the sum of every number
        // in a cell's glyph, one number a cell. Since 09-23 a glyph is drawn
        // once and never written again, so over the whole run — a pull, a
        // held bird, a release, a cast, a pointer on a cell and a theme
        // change — each of the eight must hold one value.
        // (the glyph's own strokes: since round K a node also holds the die's
        // pending fill, which is a clock and not a glyph, and has its own
        // scenario — *a drop fills the bird from inside*)
        const glyph = cells.map((g) => {
          let sum = 0;
          for (const d of g.querySelectorAll('path.ln')) {
            const a = (d.getAttribute('d') || '').match(/-?[\\d.]+/g);
            if (a) for (const v of a) sum += +v;
          }
          return sum;
        });
        // and the level a glyph is drawn at: Ember's drawing itself, since its
        // three levels (1, 2 and 3 triangles since K23); a change at a seam
        // is the one redraw a glyph is allowed. Every bird has levels since pass 4,
        // but this run moves only Ember, so the rest are held to not moving at all.
        const level = cells.map((g) => (g.getAttribute('data-id') === 'bpm' ? [...g.querySelectorAll('path:not(.fill)')].map((p) => p.getAttribute('d')).join(';') : 'still'));
        const halos = [...document.querySelectorAll('#starLive circle[stroke-width="1.2"]')]
          .map((c) => +c.getAttribute('opacity') || 0);
        // the breathing disc is the one circle on the live sheet that is filled
        // rather than stroked; the two pulse rings beside it carry fill:none
        const disc = [...document.querySelectorAll('#live > circle')]
          .find((c) => (c.getAttribute('fill') || 'none') !== 'none');
        const r = window.ring.control.readout();
        return {
          t: performance.now(),
          sway: m ? +m[1] : 0,
          glyph,
          level,
          halos,
          breath: disc ? +disc.getAttribute('r') || 0 : 0,
          beat: r ? r.beatInBar : -1,
        };
      };
      const samples = [];
      let run = true;
      const tick = () => { if (!run) return; samples.push(shot()); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      const mark = (what) => ({ what, at: samples.length });
      const events = [];
      await sleep(400);
      // 1. a pull, by hand, along the cell's own spoke
      events.push(mark('pull'));
      await pullTo(S.cell, 0.88, null);
      await sleep(500);
      // 2. the release
      events.push(mark('release'));
      window.ring.release(S.cell);
      await sleep(900);
      // 3. the throw, which rebuilds every mark on the ring
      events.push(mark('cast'));
      window.ring.cast('full');
      await sleep(1400);
      // 4. and a theme change with a cell **pointed** across it: until 09-23 the
      // pointer turned a glyph over and a rebuild could cut that short; now
      // the pointer moves no glyph at all, and the swap must not either.
      window.ring.point(2);
      await sleep(700);
      events.push(mark('theme'));
      const was = window.ring.control.readout().mix.themeNumber;
      window.ring.control.skip();
      for (let k = 0; k < 120 && window.ring.control.readout().mix.themeNumber === was; k++) await sleep(100);
      events.push(mark('after'));
      await sleep(900);
      window.ring.point(null);
      await sleep(600);
      run = false;
      await sleep(80);
      window.ring.control.stop();
      const themes = window.ring.control.readout().mix.themeNumber;
      // the worst step each motion took, and where
      const worst = (pick) => {
        let w = 0;
        let at = -1;
        for (let i = 1; i < samples.length; i++) {
          const d = Math.abs(pick(samples[i]) - pick(samples[i - 1]));
          if (d > w) { w = d; at = i; }
        }
        return { d: +w.toFixed(4), at, near: events.filter((e) => e.at <= at).pop() };
      };
      const glyphSpan = [];
      for (let i = 0; i < 8; i++) {
        let lo = Infinity;
        let hi = -Infinity;
        for (const s of samples) { const v = s.glyph[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
        glyphSpan.push(hi - lo);
      }
      const glyphWorst = [];
      for (let i = 0; i < 8; i++) glyphWorst.push(worst((s) => s.glyph[i]));
      // a glyph's drawing may change only on a frame its level changed, and only
      // Ember has levels
      const unexplained = [];
      let levelSteps = 0;
      for (let i = 0; i < 8; i++) {
        let n = 0;
        for (let k = 1; k < samples.length; k++) {
          const moved = samples[k].glyph[i] !== samples[k - 1].glyph[i];
          const stepped = samples[k].level[i] !== samples[k - 1].level[i];
          if (stepped) levelSteps++;
          if (moved && !(stepped && samples[k].level[i] !== 'still')) n++;
        }
        unexplained.push(n);
      }
      const haloWorst = [];
      for (let i = 0; i < 8; i++) haloWorst.push(worst((s) => s.halos[i] || 0));
      // the breath is allowed one step a beat, and only on the frame the beat
      // turned over
      let breathWorst = 0;
      let breathOffBeat = 0;
      let beats = 0;
      for (let i = 1; i < samples.length; i++) {
        const turned = samples[i].beat !== samples[i - 1].beat;
        if (turned) beats++;
        const d = Math.abs(samples[i].breath - samples[i - 1].breath);
        if (turned) continue;
        if (d > breathWorst) breathWorst = d;
        if (d > 1.2) breathOffBeat++;
      }
      return {
        frames: samples.length,
        seconds: +((samples[samples.length - 1].t - samples[0].t) / 1000).toFixed(1),
        events,
        themesMoved: themes !== was,
        sway: worst((s) => s.sway),
        glyph: glyphWorst,
        unexplained,
        levelSteps,
        glyphSpan: glyphSpan.map((v) => +v.toFixed(2)),
        halo: haloWorst,
        breath: { worst: +breathWorst.toFixed(3), offBeat: breathOffBeat, beats },
      };
    `),
    judge: (r) => {
      // **A glyph does not move** (Eugene, 09-23: one glyph per bird, no
      // animation, no held variant): a rebuild writes the same drawing again,
      // which is the same numbers. The one change allowed is Ember's flame
      // stepping to another burn level, on the frame its level changes — the
      // pull on Ember to 0.88 takes it to the blaze at the seam.
      const span = Math.max(...r.glyphSpan);
      const badGlyph = r.glyph
        .map((g, i) => ({ i, ...g, step: 0 }))
        .filter((g, i) => r.unexplained[i] > 0);
      const badHalo = r.halo.map((h, i) => ({ i, ...h })).filter((h) => h.d > 0.09);
      const swayOk = r.sway.d <= 1.5;
      const breathOk = r.breath.offBeat === 0;
      const ran = r.frames > 200 && r.themesMoved;
      return {
        ok: ran && swayOk && !badGlyph.length && !badHalo.length && breathOk,
        why: !ran ? `${r.frames} frames and the theme ${r.themesMoved ? 'moved' : 'never turned over'}`
          : !swayOk ? `the sway jumped ${r.sway.d} degrees between two frames, near the ${r.sway.near && r.sway.near.what}`
          : badGlyph.length ? `${badGlyph.length} glyphs moved — cell ${badGlyph[0].i} spans ${r.glyphSpan[badGlyph[0].i]} over the run and stepped ${badGlyph[0].d} in one frame, near the ${badGlyph[0].near && badGlyph[0].near.what}`
          : badHalo.length ? `a cell's light jumped ${badHalo[0].d} in one frame, near the ${badHalo[0].near && badHalo[0].near.what}`
          : `the breath stepped off the beat ${r.breath.offBeat} times`,
        note: `${r.frames} frames over ${r.seconds} s across a pull, a release, a cast and a theme change: `
          + `the sway's worst step is ${r.sway.d}°, the eight glyphs never moved but for ${r.levelSteps} change${r.levelSteps === 1 ? '' : 's'} of Ember's burn level — a drawing added or let go on a drag-crossing or a seam-crossing frame (round K3), and never otherwise — the lights' worst is `
          + `${Math.max(...r.halo.map((h) => h.d)).toFixed(3)} against a ceiling of 0.09, and the breath stepped `
          + `${r.breath.beats} times on a beat and ${r.breath.offBeat} times off one`,
      };
    },
  },
];

// ==========================================================================
// **A hand on a bird, round K** (Eugene's list of 09-23, `rounds/ring-k.md`).
// Each rule of the list that a browser can answer is one scenario below, driven
// by real pointer events on the built page: a mouse's click, double click,
// still press and drag; a finger's tap and the panel's two buttons; a drag on
// the open ring that is and is not a throw; the pulse at two tempos; and a bird
// change carried across its own seam with the seven other birds watched every
// frame.
const HAND = PULL + `
  // the centre of a bird's node on the screen, wherever it stands and whatever
  // size it is drawn at
  const nodeAt = (i) => {
    const r = document.querySelectorAll('#starCells g.cell')[i].firstChild.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };
  const mouse = (type, p, target) => (target || window).dispatchEvent(new PointerEvent(type, {
    bubbles: true, pointerId: 11, clientX: p.x, clientY: p.y, pointerType: 'mouse', isPrimary: true,
  }));
  const finger = (type, p, target) => (target || window).dispatchEvent(new PointerEvent(type, {
    bubbles: true, pointerId: 12, clientX: p.x, clientY: p.y, pointerType: 'touch', isPrimary: true,
  }));
  const click = async (p) => { mouse('pointermove', p, el('stage')); mouse('pointerdown', p, el('tilt')); await sleep(40); mouse('pointerup', p); };
  const tellOp = () => +(document.querySelector('#innerLive text.tell') || { getAttribute: () => 0 }).getAttribute('opacity');
  const tellSaid = () => (document.querySelector('#innerLive text.tell textPath') || { textContent: '' }).textContent;
  const state = () => ({ url: location.search, held: heldNow(), radii: cells().map((c) => c.radius / c.rest) });
  // a ring unit on the screen: the square as laid out, and not the swaying
  // star's rect, which the sway widens (+17 % at ten degrees, R123)
  const perUnit = () => (el('tilt').offsetWidth || 1000) / 1000;
`;

SCENARIOS.push({
  name: 'a click on a bird changes nothing, and a double click lets that one bird go',
  area: 'birds',
  // Eugene, 09-23: *"a plain click on a bird is information only — today it
  // seems to reset the bird. Double click resets that bird to its default."*
  // It did reset it: a click on the filled centre let the bird go, and the
  // filled centre is gone with it.
  query: 'v=2&seed=15576&spell=ember:0.85,tide:0.2',
  page: body(HAND + `
    const before = state();
    // a click on held Ember: the explanation, and nothing else
    await click(nodeAt(0));
    await sleep(500);
    const clicked = { ...state(), tell: tellOp(), said: tellSaid() };
    // a double click on held Tide: that bird home, and Ember left where it is
    await click(nodeAt(6));
    await sleep(90);
    await click(nodeAt(6));
    // and Tide slides home on the ring's own ease rather than being put there
    await waitFor(() => Math.abs(cells()[6].radius / cells()[6].rest - 1) < 1e-4, 3000);
    const doubled = state();
    return { before, clicked, doubled };
  `),
  judge: (r) => {
    const same = (a, b) => JSON.stringify(a.held) === JSON.stringify(b.held) && a.url === b.url
      && a.radii.every((v, i) => Math.abs(v - b.radii[i]) < 1e-6);
    const opened = r.before.held.length === 2;
    const nothing = same(r.before, r.clicked);
    // the explanation of a held Ember: its pole, and not its name or percent,
    // which its own words carry (round K3)
    // (since round K13: the held Ember's reading in one sentence, the groove at its tempo)
    const told = r.clicked.tell > 0.8 && /^(STEADY FOUR|DRIVING KICK|FAST BEAT|FREE PULSE|NO DRUMS)/.test(r.clicked.said) && !r.clicked.said.includes('%');
    const one = r.doubled.held.length === 1 && r.doubled.held[0].bird === 'ember' && r.doubled.held[0].value === 0.85
      && decodeURIComponent(r.doubled.url).includes('spell=em:0.85') && !/[,=]ti:/.test(decodeURIComponent(r.doubled.url))
      && Math.abs(r.doubled.radii[6] - 1) < 1e-3;
    return {
      ok: opened && nothing && told && one,
      why: !opened ? `the link opened holding ${JSON.stringify(r.before.held)}`
        : !nothing ? `a click moved the ring: ${JSON.stringify(r.before)} became ${JSON.stringify(r.clicked)}`
        : !told ? `a click did not say what the bird is: ${r.clicked.tell} "${r.clicked.said}"`
        : `a double click on Tide left ${JSON.stringify(r.doubled.held)} and the link ${r.doubled.url}`,
      note: `a click on held Ember left both birds, all eight radii and the link exactly as they were and opened `
        + `"${r.clicked.said.slice(0, 40)}…"; a double click on Tide let Tide alone go — Tide back on its rest radius, `
        + `Ember still at 0.85 and the link "${decodeURIComponent(r.doubled.url)}"`,
    };
  },
});

SCENARIOS.push({
  name: 'a long press on any bird lets every bird go',
  area: 'birds',
  // Eugene: *"long press on any bird resets the whole ring's birds, the same
  // gesture the seed button uses"* — the die's own seven hundred milliseconds,
  // with a ring closing round the bird the hand is on.
  query: 'v=2&seed=15576&spell=ember:0.85,tide:0.2',
  page: body(HAND + `
    const arc = (i) => +document.querySelectorAll('#starLive circle[transform^="rotate(-90"]')[i].getAttribute('opacity');
    // every frame of the outline round Zephyr, and of the fill inside every node
    let peakShort = 0;
    let watching = true;
    const fills = () => [...document.querySelectorAll('#starCells g.cell path.fill')].filter((n) => (n.getAttribute('d') || '') !== '').length;
    let filled = 0;
    const tick = () => { peakShort = Math.max(peakShort, arc(2)); filled = Math.max(filled, fills()); if (watching) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    // a short press on Zephyr, a bird nobody is holding: nothing, and nothing drawn
    const z = nodeAt(2);
    mouse('pointermove', z, el('stage'));
    mouse('pointerdown', z, el('tilt'));
    await sleep(180);
    mouse('pointerup', z);
    await sleep(450);
    watching = false;
    const short = { ...state(), peak: peakShort, filled };
    // and a long one on the same bird
    mouse('pointerdown', z, el('tilt'));
    await sleep(420);
    const mid = { arc: arc(2), held: heldNow().length };
    await sleep(480);
    mouse('pointerup', z);
    await sleep(300);
    const settled = await waitFor(() => cells().every((c) => Math.abs(c.radius / c.rest - 1) < 1e-6), 4000);
    return { short, mid, after: { ...state(), settled, arc: arc(2) } };
  `),
  judge: (r) => {
    const kept = r.short.held.length === 2 && r.short.peak === 0 && r.short.filled === 0;
    const drawn = r.mid.arc > 0.3 && r.mid.held === 2;
    const gone = r.after.held.length === 0 && !r.after.url.includes('spell=') && r.after.settled && r.after.arc === 0;
    return {
      ok: kept && drawn && gone,
      why: !kept ? `a short press let ${2 - r.short.held.length} birds go, drew the outline at ${r.short.peak} or filled ${r.short.filled} nodes`
        : !drawn ? `half way through the hold the ring round the bird is at ${r.mid.arc} with ${r.mid.held} held`
        : `the long press left ${JSON.stringify(r.after.held)}, the link ${r.after.url}, settled ${r.after.settled}`,
      note: `a short press on Zephyr let nothing go and drew nothing, outline or fill; held, the outline swept round Zephyr — the die's own `
        + `long-press sweep, ${r.mid.arc} at 420 ms — and at 700 ms both held birds went home, all eight on their rest radius, the link bare `
        + `and the outline gone`,
    };
  },
});

SCENARIOS.push({
  name: 'a drag asks for its value at the drop and not before',
  area: 'birds',
  // Eugene: *"the bird's value applies at the drop, not during the drag"* — and
  // the bird is lifted off the table while it is carried. Asked of the
  // transport while the set plays: no hand-over, no spell asked, no address
  // bar written on any move, and all three at the drop.
  deadline: 120000,
  query: 'v=2&seed=15576',
  page: body(HAND + `
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2, 12000);
    const from = cells()[0].radius * 316;
    const p0 = spoke(0, from);
    mouse('pointerdown', p0, el('tilt'));
    await sleep(40);
    const during = [];
    for (let k = 1; k <= 12; k++) {
      mouse('pointermove', spoke(0, from + 6 * k));
      await sleep(40);
      const c = cells()[0];
      during.push({ url: location.search.includes('spell='), cut: ctl.state.cut ? ctl.state.cut.kind : null,
        asked: JSON.stringify(ctl.mix.spellAsked ?? null), value: c.value, lift: c.lift, size: c.size });
    }
    mouse('pointerup', spoke(0, from + 72));
    const armed = await waitFor(() => ctl.state.cut && ctl.state.cut.kind === 'spell', 6000);
    const after = { url: location.search, value: cells()[0].value, asked: ctl.mix.spellAsked ? ctl.mix.spellAsked.ember : null };
    await sleep(900);
    const set = { lift: cells()[0].lift, size: cells()[0].size, radius: cells()[0].radius };
    ctl.stop();
    await sleep(200);
    return { during, armed, after, set };
  `),
  judge: (r) => {
    const moved = r.during[r.during.length - 1].value > r.during[0].value;
    const quiet = r.during.every((d) => !d.url && d.cut !== 'spell' && d.asked === r.during[0].asked);
    const lifted = r.during.slice(3).every((d) => d.lift > 0.5) && Math.max(...r.during.map((d) => d.size)) > 1.1;
    const dropped = r.armed && decodeURIComponent(r.after.url).includes(`em:${r.after.value.toFixed(2)}`) && r.after.asked === r.after.value;
    const down = r.set.lift === 0;
    return {
      ok: moved && quiet && lifted && dropped && down,
      why: !moved ? 'the drag did not move the bird'
        : !quiet ? `a move asked the transport for something: ${JSON.stringify(r.during.find((d) => d.url || d.cut === 'spell' || d.asked !== r.during[0].asked))}`
        : !lifted ? `the bird was not lifted under the hand: ${r.during.map((d) => d.lift).join(', ')}`
        : !dropped ? `the drop armed ${r.armed}, the link ${r.after.url}, the spell asked ${r.after.asked}`
        : `the bird is still lifted at ${r.set.lift}`,
      note: `twelve moves carried Ember from ${r.during[0].value} to ${r.during[r.during.length - 1].value}, lifted to `
        + `${Math.max(...r.during.map((d) => d.size)).toFixed(3)} of its size, with no hand-over, no spell asked and the address bar untouched `
        + `at every one; the drop asked for ${r.after.asked}, laid the seam and wrote the link, and set the bird down to ${r.set.size.toFixed(3)}`,
    };
  },
});

SCENARIOS.push({
  name: 'a drop fills the bird from inside until the phrase line, as the die fills',
  area: 'birds',
  // Eugene, 09-23: *"reuse the dice button's progress indicator for the time
  // until a bird's new value applies, as a radial fill inside the bird's
  // circle; reserve the outline sweep for the long press."* Read every frame
  // from the drop to the swap: the sector's own angle against the hand-over's
  // clock, `1 - cutIn / cutSpan`, the same two numbers the die fills from.
  deadline: 300000,
  query: 'v=2&seed=15576',
  page: body(HAND + `
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2, 12000);
    const path = (i) => document.querySelectorAll('#starCells g.cell')[i].querySelector('path.fill');
    // the sector's sweep as a share of a turn, read off its own path
    const swept = (i) => {
      const d = path(i).getAttribute('d') || '';
      if (!d) return 0;
      if (/A [\\d.]+ [\\d.]+ 0 1 1 -0\\.01/.test(d)) return 1;
      const n = d.match(/-?[\\d.]+/g).map(Number);
      const x = n[n.length - 2];
      const y = n[n.length - 1];
      const a = Math.atan2(x, -y) / (2 * Math.PI);
      return a < 0 ? a + 1 : a;
    };
    const outline = () => Math.max(...[...document.querySelectorAll('#starLive circle[transform^="rotate(-90"]')].map((c) => +c.getAttribute('opacity')));
    const themeWas = ctl.readout().mix.themeNumber;
    // Tide, whose change is heard at the seam: the tempo's fill runs on through
    // the glide since round K12c, and has its own row
    window.ring.pull(6, 0.9);
    const frames = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 120000) {
      await frame();
      const r = ctl.readout();
      const clock = r.mix.cutting ? Math.min(1, Math.max(0, 1 - (r.mix.cutIn || 0) / Math.max(0.001, r.mix.cutSpan || 0.001))) : null;
      frames.push({ fill: +swept(6).toFixed(4), clock, others: [0, 1, 2, 3, 4, 5, 7].reduce((n, i) => n + (cells()[i].consequent ? 0 : swept(i)), 0), outline: outline(), theme: r.mix.themeNumber, pending: cells()[6].pending });
      // (a bird move keeps the place since 09-24: the landing is the ask heard, the theme number stays)
      if (frames.length > 20 && !r.mix.cutting && !cells()[6].pending) { for (let k = 0; k < 20; k++) { await frame(); frames.push({ fill: +swept(6).toFixed(4), clock: null, others: 0, outline: outline(), theme: ctl.readout().mix.themeNumber, pending: cells()[6].pending }); } break; }
    }
    ctl.stop();
    await sleep(200);
    return { frames, themeWas };
  `),
  judge: (r) => {
    const during = r.frames.filter((f) => f.pending && f.clock != null && f.clock > 0.02 && f.clock < 0.97);
    if (during.length < 20) return { ok: false, why: `only ${during.length} frames of wait were seen` };
    const worst = Math.max(...during.map((f) => Math.abs(f.fill - f.clock)));
    const rose = during.every((f, i) => i === 0 || f.fill >= during[i - 1].fill - 1e-3);
    const after = r.frames.slice(-10);
    const empty = after.every((f) => f.fill === 0 && !f.pending) && after[0].theme === r.themeWas;
    const alone = r.frames.every((f) => f.others === 0);
    const noOutline = r.frames.every((f) => f.outline === 0);
    return {
      ok: worst <= 0.02 && rose && empty && alone && noOutline,
      why: worst > 0.02 ? `the fill stood ${worst.toFixed(3)} of a turn off the hand-over's clock`
        : !rose ? 'the fill ran backwards'
        : !empty ? `after the phrase line the fill reads ${after.map((f) => f.fill).join(', ')}`
        : !alone ? 'another bird filled'
        : 'the outline swept during a wait, which is the long press\'s mark',
      note: `a drop on Tide filled its node from twelve o'clock over ${during.length} frames of wait, never more than ${worst.toFixed(3)} `
        + `of a turn off the hand-over's own clock, emptied at the phrase line as theme ${r.themeWas} arrived under it, in place; no other bird filled `
        + `and the outline, which is the long press's, never moved`,
    };
  },
});

SCENARIOS.push({
  name: 'every bird stays within fifteen degrees of home, slowly, and a pointer twenty off never picks it',
  area: 'ring',
  // Eugene, 09-23: *"the movement of the bird bullets should be a bit slower —
  // could be proportional to BPM — and the positions of birds should not leave
  // their domains for more than 15° left or right. Now they travel far enough
  // to be accidentally picked as the neighbour bird for adjustment."* Every
  // frame, every bird's angle from its home as drawn on the screen: over a
  // whole theme at 104 (a seek to every tenth of it and to the sway's two
  // peaks, and a second of play at each), through a throw and the seam it
  // casts, and again at 54 — with
  // the star's own turning speed against its ceiling, and a pointer twenty
  // degrees either side of each bird, at its own radius, asked what it picks.
  deadline: 300000,
  query: 'v=2&seed=1',
  page: body(HAND + `
    const home = (i) => i * 45;
    // Where each bird is drawn, read off its own node's place on the star and
    // the star's own turn — the ring's geometry, not the screen's, because the
    // whole ring leans a few degrees in perspective under a hand and a
    // bounding box read through that lean is not where the bird stands.
    const angles = () => {
      const turn = starAngle() || 0;
      return [...document.querySelectorAll('#starCells g.cell')].map((g, i) => {
        const m = /translate\\(([-\\d.]+) ([-\\d.]+)\\)/.exec(g.firstChild.getAttribute('transform') || '');
        const a = (Math.atan2(+m[1] - 500, -(+m[2] - 500)) * 180) / Math.PI + turn;
        return (((a - home(i)) % 360) + 540) % 360 - 180;
      });
    };
    const watch = { worst: 0, speed: 0, frames: 0, last: null, lastT: 0 };
    let on = true;
    const tick = (t) => {
      const a = window.ring.turn().spin === 0 ? angles() : [];
      for (const v of a) watch.worst = Math.max(watch.worst, Math.abs(v));
      // the turning speed over a tenth of a second at a time: a frame's own
      // callback may run before or after the ring's in the same frame, so a
      // single frame's difference carries a frame of jitter a window does not
      // (the continuous turn only: a finger's spin is deliberate and outside
      // the ceiling and the domain, and the birds are measured once it is over)
      const tn = window.ring.turn();
      const s = tn.sway;
      if (tn.spin !== 0) { watch.spinning = true; if (on) requestAnimationFrame(tick); return; }
      watch.hist = (watch.hist || []).concat([[t, s]]).filter((h) => t - h[0] <= 400);
      const back = watch.hist.find((h) => t - h[0] >= 100);
      if (back) watch.speed = Math.max(watch.speed, Math.abs(s - back[1]) / ((t - back[0]) / 1000));
      watch.frames++;
      if (on) requestAnimationFrame(tick);
    };
    const probe = () => {
      const b = tilt();
      const out = [];
      cells().forEach((c, i) => {
        for (const side of [-20, 20, 0]) {
          const a = ((home(i) + side) * Math.PI) / 180;
          const r = c.radius * 316 / 1000;
          // twenty degrees off home, at the bird's own radius; and, for the
          // control, the bird where it is drawn
          const p = side === 0 ? nodeAt(i)
            : { x: b.x + b.width / 2 + Math.sin(a) * b.width * r, y: b.y + b.height / 2 - Math.cos(a) * b.height * r };
          out.push({ bird: c.name, side, picked: window.ring.pick(p.x, p.y), touch: window.ring.pick(p.x, p.y, true) });
        }
      });
      return out;
    };
    // **Thirteen places a theme, not twenty-one** (09-24). The excursion is
    // one sine of the theme's progress (sway · sin 2π·progress, in ring.ts), so
    // its two peaks are a quarter and three quarters of the way through, and
    // those two are where a bird stands furthest from home; the tenths either
    // side of them and the rest of the tenths walk the curve between. A second
    // of play at each is the ease onto the new reading (1.2 s, and a jump of a
    // tenth is most of the way there in one) with the wander running over it,
    // as before. The pointer probes are taken at both peaks, where a bird is
    // nearest a probe twenty degrees off on its own side, and at two places
    // off them — where the twentieths took them at none.
    const PLACES = [0, 0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1];
    const PROBED = [0.1, 0.25, 0.6, 0.75];
    const sweep = async (label) => {
      const res = { label, bpm: 0, worst: 0, speed: 0, picks: [] };
      watch.worst = 0; watch.speed = 0;
      for (const at of PLACES) {
        ctl.seekTo(at, true);
        await sleep(1000);
        if (PROBED.includes(at)) res.picks.push(...probe());
      }
      res.bpm = ctl.readout().gridBpm || ctl.readout().bpm;
      res.worst = +watch.worst.toFixed(2);
      res.speed = +watch.speed.toFixed(2);
      return res;
    };
    requestAnimationFrame(tick);
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
    const fast = await sweep('104');
    // a hard throw, its settle and the seam it casts
    watch.worst = 0; watch.speed = 0;
    const at = (deg, rad) => { const b = tilt(); const a = deg * Math.PI / 180;
      return { x: b.x + b.width / 2 + Math.sin(a) * b.width * (rad / 1000), y: b.y + b.height / 2 - Math.cos(a) * b.height * (rad / 1000) }; };
    // a finger's hard swipe (round K3: only a finger throws)
    const seed0 = ctl.readout().seed;
    finger('pointerdown', at(20, 260), el('tilt'));
    await sleep(30);
    for (let k = 1; k <= 12; k++) { finger('pointermove', at(20 + 25 * k, 260)); await sleep(16); }
    finger('pointerup', at(320, 260));
    await waitFor(() => window.ring.turn().spin === 0, 20000);
    await waitFor(() => ctl.readout().seed !== seed0, 30000);
    await sleep(3000);
    const thrown = { worst: +watch.worst.toFixed(2), speed: +watch.speed.toFixed(2), cast: ctl.readout().seed !== seed0, spun: !!watch.spinning };
    // and slow: Ember at 0.05 plays unmetered near fifty
    ctl.stop();
    await sleep(300);
    window.ring.pull(0, 0.05);
    await sleep(300);
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
    const slow = await sweep('slow');
    on = false;
    ctl.stop();
    await sleep(200);
    return { fast, thrown, slow, frames: watch.frames };
  `),
  judge: (r) => {
    const all = [r.fast, r.slow];
    const inside = all.every((x) => x.worst <= 15) && r.thrown.worst <= 15;
    const slowIsSlower = r.slow.bpm < 60 && r.fast.bpm > 100 && r.slow.worst < r.fast.worst;
    const ceiling = 20.5;
    const calm = all.every((x) => x.speed <= ceiling) && r.thrown.speed <= ceiling;
    const picks = [...r.fast.picks, ...r.slow.picks];
    const wrong = picks.filter((p) => (p.side !== 0 && (p.picked === p.bird || p.touch === p.bird)) || (p.side === 0 && p.picked !== p.bird));
    return {
      ok: inside && slowIsSlower && calm && r.thrown.cast && r.thrown.spun && !wrong.length,
      why: !inside ? `a bird stood ${Math.max(r.fast.worst, r.slow.worst, r.thrown.worst)} degrees from home (${r.fast.worst} at ${r.fast.bpm}, ${r.thrown.worst} through the throw, ${r.slow.worst} at ${r.slow.bpm})`
        : !slowIsSlower ? `at ${r.slow.bpm} the birds reached ${r.slow.worst}° against ${r.fast.worst}° at ${r.fast.bpm}`
        : !calm ? `the star turned at ${Math.max(r.fast.speed, r.slow.speed, r.thrown.speed)}° a second`
        : !r.thrown.cast ? 'the throw cast nothing'
        : `the hit test answered ${JSON.stringify(wrong[0])}`,
      note: `over a whole theme at ${r.fast.bpm} BPM no bird stood further than ${r.fast.worst}° from home and the star turned at most `
        + `${r.fast.speed}°/s; through a hard throw, its settle and the seam it cast, ${r.thrown.worst}° and ${r.thrown.speed}°/s; at `
        + `${r.slow.bpm} BPM ${r.slow.worst}° and ${r.slow.speed}°/s — all inside fifteen degrees and the ${20}°/s ceiling; and `
        + `${picks.length} pointer probes at each bird's own radius picked the bird at home and never at twenty degrees off, mouse or finger`,
    };
  },
});

SCENARIOS.push({
  name: 'every bird\'s words stand a fixed gap off its edge, clear of every bird, word and the transport',
  area: 'words',
  // Eugene, round K3: *"improve the floating label positioning to be closer to
  // the bird circles in various cases"*, and *"text should be under the bird
  // circle"*: below it wherever below is clear, never above — Ember's words were over its bird,
  // Zephyr's far out from it, Root's floating above it. All eight birds at 0 %,
  // at the house and at 130 %, on a phone-sized square and on a desktop's,
  // read off the placer's own boxes (the gap, exactly) and off the drawn words
  // and nodes (no overlap on the screen).
  deadline: 120000,
  query: 'v=2&seed=15576',
  page: body(HAND + `
    const boxDist = (b, x, y) => Math.hypot(Math.max(b.x - x, 0, x - (b.x + b.w)), Math.max(b.y - y, 0, y - (b.y + b.h)));
    const meet = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const shot = (label) => {
      const cs = cells();
      const gaps = cs.map((c) => +(boxDist(c.words.box, c.words.bird.x, c.words.bird.y) - c.words.bird.r).toFixed(2));
      const costs = cs.map((c) => c.words.cost);
      // on the screen: every word group's rect against every other bird's node and every other word group
      const words = [...document.querySelectorAll('#starWords > g')].map((g) => g.getBoundingClientRect());
      const nodes = [...document.querySelectorAll('#starCells g.cell')].map((g) => g.firstChild.getBoundingClientRect());
      const act = [...document.querySelectorAll('#actions > g')].map((g) => g.getBoundingClientRect());
      const shrink = (r) => ({ x: r.x + 2, y: r.y + 2, w: r.width - 4, h: r.height - 4 });
      const hits = [];
      words.forEach((w, i) => {
        const a = shrink(w);
        nodes.forEach((n, j) => { const q = shrink(n); const cx = q.x + q.w / 2, cy = q.y + q.h / 2; if (boxDist(a, cx, cy) < q.w / 2) hits.push(label + ' words ' + i + ' on bird ' + j); });
        words.forEach((v, j) => { if (j > i && meet(a, shrink(v))) hits.push(label + ' words ' + i + ' on words ' + j); });
        act.forEach((n, j) => { const q = shrink(n); const cx = q.x + q.w / 2, cy = q.y + q.h / 2; if (boxDist(a, cx, cy) < q.w / 2) hits.push(label + ' words ' + i + ' on action ' + j); });
      });
      // below whenever below is clear, and never above
      const notBelow = cs.filter((c) => c.words.below === 0 && c.words.side !== 0).map((c) => c.name);
      // above only as the last resort, inside towards the centre (round K4)
      const above = cs.filter((c) => c.words.side < 5 && c.words.box.y + c.words.box.h <= c.words.bird.y - c.words.bird.r).map((c) => c.name);
      // and never over the track: no corner of the box past the lane band's inner edge
      const corners = (b) => [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]];
      const onTrack = cs.filter((c) => Math.max(...corners(c.words.box).map(([x, y]) => Math.hypot(x - 500, y - 500))) > 352).map((c) => c.name);
      const below = cs.filter((c) => c.words.side === 0).length;
      return { label, gaps, costs, sides: cs.map((c) => c.words.side), hits, notBelow, above, below, onTrack };
    };
    const out = [];
    for (const size of ['phone', 'desktop']) {
      if (size === 'desktop') { el('tilt').style.width = '940px'; el('tilt').style.height = '940px'; }
      await sleep(400);
      for (const v of [0, null, 1]) {
        if (v === null) window.ring.release(null);
        else for (let i = 0; i < 8; i++) window.ring.pull(i, v);
        await sleep(900);
        out.push(shot(size + ' ' + (v === null ? 'house' : v === 0 ? '0%' : '130%')));
      }
    }
    el('tilt').style.width = ''; el('tilt').style.height = '';
    window.ring.release(null);
    await sleep(300);
    return out;
  `),
  judge: (r) => {
    const gapBad = r.flatMap((x) => x.gaps.map((g, i) => ({ at: x.label, i, g }))).filter((g) => Math.abs(g.g - 8) > 0.6);
    const costBad = r.flatMap((x) => x.costs.map((c, i) => ({ at: x.label, i, c }))).filter((c) => c.c > 0);
    const hits = r.flatMap((x) => x.hits);
    const all = r.flatMap((x) => x.gaps);
    const notBelow = r.flatMap((x) => x.notBelow.map((n) => `${n} at ${x.label}`));
    const above = r.flatMap((x) => x.above.map((n) => `${n} at ${x.label}`));
    const onTrack = r.flatMap((x) => x.onTrack.map((n) => `${n} at ${x.label}`));
    return {
      ok: !gapBad.length && !costBad.length && !hits.length && !notBelow.length && !above.length && !onTrack.length,
      why: gapBad.length ? `words stand ${gapBad[0].g} off bird ${gapBad[0].i} at ${gapBad[0].at}`
        : costBad.length ? `bird ${costBad[0].i}'s words found no clear spot at ${costBad[0].at} (cost ${costBad[0].c})`
        : hits.length ? hits[0]
        : notBelow.length ? `${notBelow[0]}'s words are not below it where below was clear`
        : above.length ? `${above[0]}'s words stand above it without being refused everywhere else`
        : `${onTrack[0]}'s words reach over the track`,
      note: `all eight birds at 0 %, at the house and at 130 %, on a phone's square and a desktop's: every bird's words stand `
        + `${Math.min(...all)}-${Math.max(...all)} units off its edge (the gap is 8), on no bird, no other words and no action, on the placer's `
        + `boxes and on the drawn page alike; below the bird wherever below was clear (${r.map((x) => x.below).join('/')} of eight across the six states), `
        + `to the side otherwise, inside towards the centre only when both were refused, and never over the track`,
    };
  },
});

SCENARIOS.push({
  name: 'a dragged bird\'s words follow it, never under or over it, over the lines and under the birds',
  area: 'words',
  // **Alone, after the rest** (`serial`, 09-24): the placer places the words
  // on the frame the bird moves on, and under three other browsers the page's
  // frames come far enough apart that a hand's moves arrive in bursts. One
  // full run of six at four, and a four-slice run the same morning, saw
  // bird 0's words over the track on one frame; eight at once on a quiet
  // minute, never. What it asks is every frame, so it is asked where the
  // frames come on time.
  serial: true,
  // Eugene, round K3: *"labels are drawn over the ring's lines but under the
  // bird circles. And while dragging a bird, the label follows it around, while
  // never overlapping the bird's position."* Every frame of a drag along the
  // spoke from the core to the rim and back across the off-axis play: the
  // placer's own box against the bird, and the drawn words against the drawn
  // node; and the three sheets in the order the rule says.
  deadline: 120000,
  query: 'v=2&seed=15576',
  page: body(HAND + `
    const boxDist = (b, x, y) => Math.hypot(Math.max(b.x - x, 0, x - (b.x + b.w)), Math.max(b.y - y, 0, y - (b.y + b.h)));
    const sheets = [...el('star').children].map((n) => n.id);
    const samples = [];
    let on = true;
    const tick = () => {
      for (const i of [0, 3]) {
        const c = cells()[i];
        const w = c.words;
        const gap = boxDist(w.box, w.bird.x, w.bird.y) - w.bird.r;
        const wr = document.querySelectorAll('#starWords > g')[i].getBoundingClientRect();
        const nr = document.querySelectorAll('#starCells g.cell')[i].firstChild.getBoundingClientRect();
        const cx = nr.x + nr.width / 2, cy = nr.y + nr.height / 2, rr = nr.width / 2 - 2;
        const inner = { x: wr.x + 2, y: wr.y + 2, w: wr.width - 4, h: wr.height - 4 };
        const far = Math.max(...[[w.box.x, w.box.y], [w.box.x + w.box.w, w.box.y], [w.box.x, w.box.y + w.box.h], [w.box.x + w.box.w, w.box.y + w.box.h]]
          .map(([x, y]) => Math.hypot(x - 500, y - 500)));
        samples.push({ i, gap: +gap.toFixed(2), onScreen: boxDist(inner, cx, cy) < rr, side: w.side, track: far > 352 });
      }
      if (on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const travel = travelUnits();
    for (const i of [0, 3]) {
      const from = cells()[i].radius * 316;
      const at = (rad, sd) => { const b = tilt(); const a = (i / 8) * Math.PI * 2 + (starAngle() || 0) * Math.PI / 180;
        return { x: b.x + b.width / 2 + Math.sin(a) * b.width * (rad / 1000) + Math.cos(a) * b.width * (sd / 1000),
                 y: b.y + b.height / 2 - Math.cos(a) * b.height * (rad / 1000) + Math.sin(a) * b.height * (sd / 1000) }; };
      mouse('pointerdown', at(from, 0), el('tilt'));
      await sleep(30);
      mouse('pointermove', at(from - 8, 0));
      // in to the core, out to the rim, and across through the middle
      for (let k = 1; k <= 20; k++) { mouse('pointermove', at(from - 8 - (travel * 1.1 * k) / 20, 0)); await sleep(25); }
      for (let k = 1; k <= 40; k++) { mouse('pointermove', at(from - 8 - travel * 1.1 + (travel * 2.2 * k) / 40, 0)); await sleep(25); }
      for (let k = 1; k <= 30; k++) { mouse('pointermove', at(from - 8, Math.sin((k / 30) * Math.PI * 2) * 60)); await sleep(25); }
      mouse('pointerup', at(from - 8, 0));
      await sleep(500);
    }
    on = false;
    await sleep(40);
    window.ring.release(null);
    return { sheets, samples };
  `),
  judge: (r) => {
    const order = ['starLines', 'starWords', 'starCells', 'starLive'].map((id) => r.sheets.indexOf(id));
    const zOk = order.every((v, k) => v >= 0 && (k === 0 || v > order[k - 1]));
    const worst = r.samples.reduce((a, s) => Math.max(a, Math.abs(s.gap - 8)), 0);
    const under = r.samples.filter((s) => s.onScreen);
    const track = r.samples.filter((s) => s.track);
    const sides = [...new Set(r.samples.map((s) => s.side))].sort();
    return {
      ok: zOk && worst <= 0.6 && !under.length && !track.length && r.samples.length > 100,
      why: !zOk ? `the star's sheets stand ${r.sheets.join(', ')}`
        : worst > 0.6 ? `a dragged bird's words stood ${worst.toFixed(2)} off the gap`
        : under.length ? `on ${under.length} frames the drawn words met the drawn bird ${under[0].i}`
        : track.length ? `on ${track.length} frames bird ${track[0].i}'s words reached over the track`
        : `only ${r.samples.length} samples`,
      note: `lines, words, birds, lights — in that order on the star; over ${r.samples.length} samples of Ember and Gleam dragged from the core `
        + `to the rim and through the off-axis play, the words stood within ${worst.toFixed(2)} units of the 8-unit gap on every frame and never `
        + `met the drawn bird or reached over the track, gliding through sides ${sides.join(', ')}`,
    };
  },
});

SCENARIOS.push({
  name: 'the sway alone never moves a bird\'s words off their side, nor two birds\' words onto each other, at 104 and at 50 BPM',
  area: 'words',
  // Eugene, round K4: *"unfortunate effect: the text jumps, changing position
  // due to the slow bird move, and it looks like a glitch."* Every frame, every
  // bird's words — their side, their box and their gap — over a whole theme's
  // sway (a seek to every tenth of it and a second of play at each) at the
  // house's 104 BPM and at the unmetered fifty Ember 0.05 plays, on a desktop's
  // square and a phone's. Nobody touches a bird while it is watched.
  // K14: red in WebKit since K11 — Veil's words left their side at 54 BPM on
  // the phone's square, because each bird's own wander (up to `FLEX_REACH`
  // an axis) had carried Tide's words onto them, which the keep read as a
  // crowding; the face is wider in WebKit, so only there did it reach. The
  // wander is taken out of the keep now, and put into the clearance a side is
  // taken with, so the words neither jump nor meet.
  deadline: 300000,
  query: 'v=2&seed=1',
  page: body(HAND + `
    let on = false;
    const run = { changes: [], worstMove: 0, worstGap: 0, frames: 0, sway: [0, 0] };
    let prev = null;
    const tick = (t) => {
      if (!on) return;
      const cs = cells();
      const now = cs.map((c) => ({ side: c.words.side, x: c.words.box.x, y: c.words.box.y,
        gap: Math.hypot(Math.max(c.words.box.x - c.words.bird.x, 0, c.words.bird.x - (c.words.box.x + c.words.box.w)),
          Math.max(c.words.box.y - c.words.bird.y, 0, c.words.bird.y - (c.words.box.y + c.words.box.h))) - c.words.bird.r }));
      const sw = window.ring.turn().sway;
      run.sway = [Math.min(run.sway[0], sw), Math.max(run.sway[1], sw)];
      if (prev && t > prev.t) {
        const k = 16.7 / Math.max(16.7, t - prev.t);
        now.forEach((n, i) => {
          const p = prev.w[i];
          if (n.side !== p.side) run.changes.push({ bird: cs[i].name, from: p.side, to: n.side });
          run.worstMove = Math.max(run.worstMove, Math.hypot(n.x - p.x, n.y - p.y) * k);
        });
      }
      for (const n of now) run.worstGap = Math.max(run.worstGap, Math.abs(n.gap - 8));
      // and two birds' words never meet, however the sway and each bird's
      // own wander carry them (K14: in WebKit's wider face they did, on the
      // phone's square, by up to 7.7 units — and in Chromium's by 6.7)
      for (let a = 0; a < cs.length; a++) for (let b2 = a + 1; b2 < cs.length; b2++) {
        const A = cs[a].words.box, B = cs[b2].words.box;
        const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x), oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
        const m = Math.min(ox, oy);
        if (m > (run.lap?.m ?? -99)) run.lap = { m: +m.toFixed(2), a: cs[a].name, b: cs[b2].name };
      }
      run.frames++;
      prev = { t, w: now };
      requestAnimationFrame(tick);
    };
    const sweep = async (label) => {
      const out = [];
      for (const size of ['desktop', 'phone']) {
        el('tilt').style.width = size === 'desktop' ? '940px' : '';
        el('tilt').style.height = size === 'desktop' ? '940px' : '';
        ctl.seekTo(0, true);
        await sleep(1500);
        run.changes = []; run.worstMove = 0; run.worstGap = 0; run.frames = 0; run.sway = [99, -99]; run.lap = null;
        prev = null;
        on = true;
        requestAnimationFrame(tick);
        for (let k = 0; k <= 10; k++) { ctl.seekTo(k / 10, true); await sleep(1000); }
        on = false;
        await sleep(50);
        out.push({ label, size, bpm: ctl.readout().gridBpm || ctl.readout().bpm, changes: run.changes.slice(0, 5), nChanges: run.changes.length,
          move: +run.worstMove.toFixed(2), gap: +run.worstGap.toFixed(2), lap: run.lap, frames: run.frames, sway: run.sway.map((v) => +v.toFixed(2)) });
      }
      return out;
    };
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
    const fast = await sweep('fast');
    ctl.stop();
    await sleep(300);
    window.ring.pull(0, 0.05);
    await sleep(300);
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
    const slow = await sweep('slow');
    ctl.stop();
    el('tilt').style.width = ''; el('tilt').style.height = '';
    window.ring.release(null);
    await sleep(200);
    return [...fast, ...slow];
  `),
  judge: (r) => {
    const tempos = r.some((x) => x.label === 'fast' && x.bpm > 100) && r.some((x) => x.label === 'slow' && x.bpm < 60);
    const hopped = r.filter((x) => x.nChanges);
    // continuous: no frame moves a box further than the star's own ceiling of
    // 20 degrees a second carries a point at the rim, 1.9 units a frame, with
    // a little over for the frame's own jitter
    const jumped = r.filter((x) => x.move > 2.5);
    const gapBad = r.filter((x) => x.gap > 0.6);
    const met = r.filter((x) => !x.lap || x.lap.m >= 0);
    const ran = r.every((x) => x.frames > 200);
    return {
      ok: tempos && ran && !hopped.length && !jumped.length && !gapBad.length && !met.length,
      why: !tempos ? `the sets ran at ${r.map((x) => x.bpm).join(', ')}`
        : !ran ? `only ${r.map((x) => x.frames).join(', ')} frames`
        : hopped.length ? `at ${hopped[0].bpm} BPM on the ${hopped[0].size}'s square the words changed side ${hopped[0].nChanges} times: ${JSON.stringify(hopped[0].changes)}`
        : jumped.length ? `at ${jumped[0].bpm} BPM on the ${jumped[0].size}'s square words moved ${jumped[0].move} units in a frame`
        : gapBad.length ? `words stood ${gapBad[0].gap} off the gap`
        : met.length ? `at ${met[0].bpm} BPM on the ${met[0].size}'s square ${met[0].lap ? `${met[0].lap.a}'s and ${met[0].lap.b}'s words met by ${met[0].lap.m} units` : 'no pair was measured'}` : '',
      note: r.map((x) => `${x.bpm} BPM, ${x.size}: ${x.frames} frames through a sway of ${x.sway[0]}° to ${x.sway[1]}°, no side change, `
        + `at most ${x.move} units a frame and within ${x.gap} of the gap, the nearest two birds' words (${x.lap.a}, ${x.lap.b}) ${-x.lap.m} apart`).join('; '),
    };
  },
});

SCENARIOS.push({
  name: 'a dragged Ember\'s glyph follows the hand, cross-fading at each level, and holds the dropped level through the wait',
  area: 'glyphs',
  // Eugene, round K3: *"icons should change while the user is dragging the
  // bird, with a little fade in/out flip."* Ember from 0.10 to 0.90 under a
  // hand, every frame: its drawings (a group per drawing, each compared to
  // the data's levels scaled as the page scales them) and their opacities, and
  // every other bird's glyph, which must not move; then the dropped level held
  // while the seam waits.
  deadline: 120000,
  query: 'v=2&seed=15576',
  page: body(HAND + `
    const knot = (i) => document.querySelectorAll('#starCells g.cell')[i].firstChild;
    const drawings = (i) => [...knot(i).children].filter((n) => n.tagName === 'g')
      .map((g) => ({ d: [...g.querySelectorAll('path')].filter((p) => p.getAttribute('fill') !== 'url(#gold)').map((p) => p.getAttribute('d')).join(';'),
        op: +(g.getAttribute('opacity') ?? 1) }));
    // the glyph's own groups, and not the wait's fill a bird the move changes draws (round K12c)
    const sum = (i) => [...knot(i).querySelectorAll(':scope > g path')].reduce((a, p) => a + (p.getAttribute('d') || '').length, 0);
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2, 12000);
    window.ring.pull(0, 0.1);
    await sleep(600);
    const others0 = [1, 2, 3, 4, 5, 6, 7].map(sum);
    const frames = [];
    let on = true;
    const tick = () => { frames.push({ d: drawings(0), v: cells()[0].value, others: [1, 2, 3, 4, 5, 6, 7].map(sum) }); if (on) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    // (a walk slow enough that each level stands whole between its cross-fades:
    // the bird is under the hand now, so a step is as far as the hand goes)
    await pullTo(0, 0.9, null, 16, 90);
    // the wait: the promise is out and the seam has not landed
    const wait = [];
    for (let k = 0; k < 10; k++) { await sleep(150); wait.push({ d: drawings(0), pending: cells()[0].pending }); }
    on = false;
    ctl.stop();
    await sleep(200);
    return { frames, wait, others0, ctrl: cells()[0].birdR };
  `),
  judge: (r) => {
    // the levels the drawing passed through, its opaque drawing read against the data
    const name = (d) => ['one', 'two', 'three'].find((l) => drawnAt('ember', l, r.ctrl) === d) || 'something else';
    const seq = [];
    let fades = 0;
    for (const f of r.frames) {
      if (f.d.length > 1) fades++;
      const top = f.d.reduce((a, b) => (b.op > a.op ? b : a), f.d[0]);
      if (top && top.op >= 0.99 && seq[seq.length - 1] !== name(top.d)) seq.push(name(top.d));
    }
    const passed = seq.join(' > ');
    const levels = seq.length === 3 && seq[0] === 'one' && seq[1] === 'two' && seq[2] === 'three';
    const still = r.frames.every((f) => f.others.every((v, k) => v === r.others0[k]));
    const held = r.wait.some((w) => w.pending) && r.wait.every((w) => w.d.length === 1 && name(w.d[0].d) === 'three');
    return {
      ok: levels && fades >= 4 && still && held,
      why: !levels ? `the drawing passed through ${passed}`
        : fades < 4 ? `only ${fades} frames showed two drawings at once`
        : !still ? 'another bird\'s drawing moved'
        : `through the wait Ember showed ${r.wait.map((w) => w.d.map((x) => name(x.d)).join('+')).join(', ')}`,
      note: `Ember dragged from 0.10 to 0.90 passed from embers to fire to a blaze (${passed}, read against the data), ${fades} frames of cross-fade with both `
        + `drawings present, no other bird's drawing moving; after the drop the blaze held through the wait for the seam`,
    };
  },
});

SCENARIOS.push({
  name: 'a glyph stays upright through the sway and a drag, and whirls only with a finger\'s spin',
  area: 'glyphs',
  // Eugene, round K3: *"the icons in the bird circles always keep their
  // intended tilt despite the bird circle's movement"* and *"if the user is
  // spinning the ring, it's okay to use the physical tilt."* The glyph's turn
  // on the page is the star's turn plus its own counter-turn: nought through
  // the sway and a drag, the spin's own during a whirl, nought again at rest.
  deadline: 120000,
  query: 'v=2&seed=15576',
  page: body(HAND + `
    const glyphRot = (i) => {
      const g = [...document.querySelectorAll('#starCells g.cell')[i].firstChild.children].filter((n) => n.tagName === 'g').pop();
      const m = /rotate\\(([-\\d.]+)\\)/.exec(g.getAttribute('transform') || '');
      return m ? +m[1] : 0;
    };
    const norm = (a) => ((a % 360) + 540) % 360 - 180;
    const samples = [];
    let phase = 'sway';
    let on = true;
    const tick = () => {
      const t = window.ring.turn();
      for (const i of [0, 2]) samples.push({ phase, i, page: +norm((starAngle() || 0) + glyphRot(i)).toFixed(2), spin: +norm(t.spin).toFixed(2), sway: t.sway });
      if (on) requestAnimationFrame(tick);
    };
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
    ctl.seekTo(0.25, true);
    await sleep(2500);
    requestAnimationFrame(tick);
    await sleep(1500);
    phase = 'drag';
    await pullTo(2, 0.8, null);
    await pullTo(2, 0.2, null);
    phase = 'spin';
    const at = (deg, rad) => { const b = tilt(); const a = deg * Math.PI / 180;
      return { x: b.x + b.width / 2 + Math.sin(a) * b.width * (rad / 1000), y: b.y + b.height / 2 - Math.cos(a) * b.height * (rad / 1000) }; };
    finger('pointerdown', at(20, 260), el('tilt'));
    await sleep(30);
    for (let k = 1; k <= 12; k++) { finger('pointermove', at(20 + (100 * k) / 12, 260)); await sleep(16); }
    finger('pointerup', at(120, 260));
    await waitFor(() => window.ring.turn().spin === 0, 20000);
    phase = 'rest';
    await sleep(800);
    on = false;
    ctl.stop();
    window.ring.release(null);
    return { samples };
  `),
  judge: (r) => {
    const of = (p) => r.samples.filter((s) => s.phase === p);
    const upright = (xs) => xs.reduce((a, s) => Math.max(a, Math.abs(s.page)), 0);
    const swayMax = Math.max(...of('sway').map((s) => Math.abs(s.sway)));
    const still = upright([...of('sway'), ...of('drag'), ...of('rest')]);
    const whirl = of('spin').filter((s) => Math.abs(s.spin) > 1);
    const withSpin = whirl.reduce((a, s) => Math.max(a, Math.abs(norm2(s.page - s.spin))), 0);
    function norm2(a) { return ((a % 360) + 540) % 360 - 180; }
    return {
      ok: still <= 0.1 && whirl.length > 10 && withSpin <= 0.1 && swayMax > 1,
      why: still > 0.1 ? `a glyph turned ${still}° on the page outside a spin`
        : whirl.length <= 10 ? `the spin showed ${whirl.length} frames`
        : withSpin > 0.1 ? `during the whirl a glyph stood ${withSpin}° off its circle's turn`
        : `the sway reached only ${swayMax}°`,
      note: `with the star swaying ${swayMax.toFixed(1)}°, Ember and Zephyr stood within ${still}° of upright through the sway, a drag and at rest, `
        + `and over ${whirl.length} frames of a finger's whirl they turned with their circles to within ${withSpin.toFixed(2)}°, landing upright`,
    };
  },
});

SCENARIOS.push({
  name: 'the explanation stands still on the track\'s inner edge while its bird is dragged',
  area: 'words',
  // Eugene, round K4: *"that white tooltip text should not move — it was
  // nicely laid out on the inner circle edge; only the gold labels attached to
  // the birds should follow the bird position on drag and continuous
  // animation."* For Ember (the top half) and Root (the bottom): the line's
  // arc when a press opens it at rest, on every move of a drag out to the rim,
  // a second into the wait after the drop (the star swaying under it all), and
  // its radius against the track's inner edge.
  query: 'v=2&seed=15576',
  page: body(HAND + `
    const arc = () => el('tellPath').getAttribute('d');
    const out = [];
    for (const i of [0, 4]) {
      const at = nodeAt(i);
      mouse('pointermove', at, el('stage'));
      mouse('pointerdown', at, el('tilt'));
      await sleep(40);
      mouse('pointerup', at);
      await sleep(300);
      const rest = arc();
      const from = cells()[i].radius * 316;
      const mid = [];
      mouse('pointerdown', spoke(i, from), el('tilt'));
      await sleep(30);
      for (let k = 1; k <= 10; k++) { mouse('pointermove', spoke(i, from + 10 * k)); await sleep(30); mid.push(arc()); }
      mouse('pointerup', spoke(i, from + 100));
      await sleep(1000);
      const r = +(/A([\\d.]+)/.exec(rest || '') || [0, 0])[1];
      out.push({ i, rest, mid, after: arc(), r, value: cells()[i].value, house: cells()[i].house });
      window.ring.release(null);
      await sleep(300);
    }
    return out;
  `),
  judge: (r) => {
    const drawn = r.every((x) => x.rest);
    const moved = r.filter((x) => x.mid.some((d) => d !== x.rest) || x.after !== x.rest);
    const dragged = r.every((x) => x.value > x.house);
    const edge = r.every((x) => x.r === 338 || x.r === 350);
    return {
      ok: drawn && !moved.length && dragged && edge,
      why: !drawn ? 'no explanation was drawn'
        : !dragged ? `a drag did not move the bird: ${JSON.stringify(r.map((x) => [x.value, x.house]))}`
        : !edge ? `the line ran at ${r.map((x) => x.r).join(' and ')}, not on the track's inner edge`
        : moved.length ? `bird ${moved[0].i}'s line moved: ${moved[0].rest} then ${moved[0].after}` : '',
      note: `Ember's and Root's lines stood on one arc each, at ${r.map((x) => x.r).join(' and ')} on the track's inner edge, at rest, on every move `
        + `of a drag out to the rim and a second after the drop, while the birds went to ${r.map((x) => x.value).join(' and ')}`,
    };
  },
});

SCENARIOS.push({
  name: 'a bird dragged off its axis reads nothing there and floats back onto it',
  area: 'birds',
  // Eugene: *"let the bird move off its axis by roughly 40-50 px either side,
  // but only in the central range of the spoke; near the outer ring and near
  // the inner core it locks to the axis. No number is read from the sideways
  // shift; on drop a little animation floats it back."*
  query: 'v=2&seed=15576',
  page: body(HAND + `
    const px = (u) => +(u * perUnit()).toFixed(1);
    const i = 0;
    const from = cells()[i].radius * 316;
    const side = 60 / (el('tilt').getBoundingClientRect().width / 1000);   // 60 screen pixels across, in ring units
    // on the spoke **as it stands**, the star's own sway and drift included, so
    // a move across the spoke is across it and carries no radial part at all
    const at = (rad, s) => { const b = tilt(); const a = (i / 8) * Math.PI * 2 + (starAngle() || 0) * Math.PI / 180;
      return { x: b.x + b.width / 2 + Math.sin(a) * b.width * (rad / 1000) + Math.cos(a) * b.width * (s / 1000),
               y: b.y + b.height / 2 - Math.cos(a) * b.height * (rad / 1000) + Math.sin(a) * b.height * (s / 1000) }; };
    mouse('pointerdown', at(from, 0), el('tilt'));
    await sleep(30);
    mouse('pointermove', at(from - 8, 0));
    await sleep(30);
    // in, to the middle of the spoke, straight
    for (let k = 1; k <= 5; k++) { mouse('pointermove', at(from - 8 - 8 * k, 0)); await sleep(30); }
    const straight = { value: cells()[i].value, side: cells()[i].side };
    // and the same radius with the hand sixty pixels to one side
    for (let k = 1; k <= 5; k++) { mouse('pointermove', at(from - 48, (side * k) / 5)); await sleep(30); }
    const across = { value: cells()[i].value, side: cells()[i].side };
    // out to the rim with the hand still to the side: it locks to the axis. The
    // hand's travel for a whole bird is its own scale (a third of the star's
    // radius, never under 120 screen pixels), so the rim is that far out.
    const rimAt = from - 8 + 1.15 * travelUnits();
    for (let k = 1; k <= 8; k++) { mouse('pointermove', at(from - 48 + ((rimAt - from + 48) * k) / 8, side)); await sleep(30); }
    const rim = { value: cells()[i].value, side: cells()[i].side };
    // back to the middle, to the side, and let go there
    for (let k = 1; k <= 8; k++) { mouse('pointermove', at(rimAt - ((rimAt - from + 48) * k) / 8, side)); await sleep(30); }
    const again = { value: cells()[i].value, side: cells()[i].side };
    mouse('pointerup', at(from - 48, side));
    await sleep(90);
    const dropped = cells()[i].side;
    await sleep(900);
    return { px: { straight: px(straight.side), across: px(across.side), rim: px(rim.side), again: px(again.side), dropped: px(dropped), settled: px(cells()[i].side) },
      straight, across, rim, again, url: location.search };
  `),
  judge: (r) => {
    const read = r.straight.value === r.across.value;
    const played = Math.abs(r.px.across) >= 30 && Math.abs(r.px.across) <= 50.5;
    const locked = Math.abs(r.px.rim) <= 2 && r.rim.value >= 0.99;
    const back = Math.abs(r.px.again) >= 30 && Math.abs(r.px.dropped) > 1 && Math.abs(r.px.settled) < 0.5;
    return {
      ok: read && played && locked && back,
      why: !read ? `sixty pixels to the side moved the value from ${r.straight.value} to ${r.across.value}`
        : !played ? `through the middle of the spoke the bird stood ${r.px.across} px off its axis`
        : !locked ? `at the rim it stood ${r.px.rim} px off its axis at ${r.rim.value}`
        : `let go it stood ${r.px.dropped} px off and settled at ${r.px.settled} px`,
      note: `with the hand sixty pixels to the side the bird stood ${r.px.across} px off its axis through the middle of the spoke and `
        + `read ${r.across.value} exactly as it did straight; at the rim it locked (${r.px.rim} px); let go ${r.px.dropped} px off, `
        + `it floated back to ${r.px.settled} px`,
    };
  },
});

SCENARIOS.push({
  name: 'the explanation holds through a drag and after it, and goes when the pointer leaves the bird',
  area: 'words',
  // Eugene: *"the white circular tooltip blinks during drag; it must show on
  // press, stay through the drag, stay after release until the pointer leaves
  // the bird's circle, then fade out."* Read every frame.
  query: 'v=2&seed=15576',
  page: body(HAND + `
    const frames = [];
    let run = true;
    const tick = () => { frames.push({ t: performance.now(), op: tellOp(), phase: phase }); if (run) requestAnimationFrame(tick); };
    let phase = 'press';
    requestAnimationFrame(tick);
    const from = cells()[0].radius * 316;
    mouse('pointermove', spoke(0, from), el('stage'));
    mouse('pointerdown', spoke(0, from), el('tilt'));
    await sleep(250);
    phase = 'drag';
    for (let k = 1; k <= 25; k++) { mouse('pointermove', spoke(0, from + 3 * k)); await sleep(24); }
    phase = 'lift';
    mouse('pointerup', spoke(0, from + 75));
    await sleep(1200);
    // the hand comes to rest on the bird where it now stands
    phase = 'rest';
    mouse('pointermove', nodeAt(0), el('stage'));
    await sleep(800);
    // and leaves it
    phase = 'gone';
    const b = tilt();
    mouse('pointermove', { x: b.x + b.width / 2, y: b.y + b.height / 2 }, el('stage'));
    await sleep(600);
    run = false;
    await sleep(40);
    const words = (document.querySelectorAll('#starWords > g')[0].querySelector('text') || {}).textContent;
    return { frames: frames.map((f) => [f.phase, +f.op.toFixed(3)]), words, value: cells()[0].value, percent: cells()[0].percent };
  `),
  judge: (r) => {
    const of = (p) => r.frames.filter((f) => f[0] === p).map((f) => f[1]);
    const drag = of('drag');
    const hold = [...of('lift'), ...of('rest')];
    const gone = of('gone');
    const rose = of('press').some((v) => v > 0.85);
    const solid = drag.length > 10 && Math.min(...drag) > 0.85;
    const stayed = hold.length > 10 && Math.min(...hold) > 0.85;
    const out = gone.length > 3 && gone[gone.length - 1] === 0;
    const title = r.words === `EMBER ${r.percent}%`;
    return {
      ok: rose && solid && stayed && out && title,
      why: !rose ? 'the explanation did not open on the press'
        : !solid ? `under the drag it dipped to ${Math.min(...drag)} over ${drag.length} frames`
        : !stayed ? `after the lift it dipped to ${Math.min(...hold)}`
        : !out ? `after the pointer left it reads ${gone[gone.length - 1]}`
        : `the bird's own title reads "${r.words}" where it is at ${r.percent} %`,
      note: `opened on the press, never under ${Math.min(...drag)} over ${drag.length} frames of drag nor under ${Math.min(...hold)} `
        + `over ${hold.length} frames after the lift with the pointer on the bird, and gone ${Math.round(600)} ms after it left; `
        + `the bird kept its short title throughout and reads "${r.words}"`,
    };
  },
});

SCENARIOS.push({
  name: 'a bird change never moves another bird, and the machine never stops',
  area: 'birds',
  // Eugene: *"changing one bird resets the whole ring track and the other birds
  // move. The bird ring must be nearly disconnected from the timeline."* The
  // pull is made a quarter of the way into a theme, where the star's sway is
  // near its widest, and its seam lands (the same theme in place since 09-24;
  // the next theme at nought before) — the moment
  // the whole star, and every bird on it, used to turn eleven and a half
  // degrees in one frame. Every frame across the seam: the sway, and the seven
  // other birds' radius and value.
  // K15c: **serial**. Its "no note late" is the machine keeping time under its
  // own load: in WebKit with three other browsers beside it, one note in about
  // five runs was 2.5–5 ms late at 28.7 s of the context, around the seam's
  // hand-over, with frames 94–106 ms apart (the other browsers' load); alone,
  // 0 of 10.
  serial: true,
  deadline: 300000,
  query: 'v=2&seed=15576',
  page: body(HAND + `
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2, 12000);
    ctl.seekTo(0.25, true);
    await sleep(2500);
    const lateBefore = window.deepHouse.late.count;
    const themeBefore = ctl.readout().mix.themeNumber;
    window.ring.pull(0, 0.8);
    const armed = await waitFor(() => ctl.state.cut && ctl.state.cut.kind === 'spell', 8000);
    const frames = [];
    const t0 = performance.now();
    let turned = -1;
    let seamWall = null;
    while (performance.now() - t0 < 90000) {
      await frame();
      const r = ctl.readout();
      const c = cells();
      frames.push({ t: performance.now(), sway: starAngle(), others: c.slice(1).map((x) => [x.radius / x.rest, x.value, x.house]), playing: ctl.playing, theme: r.mix.themeNumber });
      // the seam has landed when the pull is heard: in place since 09-24, so the theme number stays
      if (turned < 0 && armed && frames.length > 5 && !c[0].pending && !r.mix.cutting) { turned = frames.length; seamWall = +(r.seconds || 0).toFixed(2); }
      if (turned > 0 && frames.length > turned + 150) break;
    }
    const lateSaid = { ...window.deepHouse.late, seamWall, frameGap: Math.max(...frames.map((f, k) => (k ? f.t - frames[k - 1].t : 0))) };
    ctl.stop();
    await sleep(200);
    return { armed, turned, themeBefore, frames, late: window.deepHouse.late.count - lateBefore, lateSaid };
  `),
  judge: (r) => {
    if (!r.armed) return { ok: false, why: 'the pull armed no hand-over' };
    if (r.turned < 0) return { ok: false, why: `the seam never landed over ${r.frames.length} frames` };
    let worst = 0;
    let at = -1;
    for (let i = 1; i < r.frames.length; i++) {
      const d = Math.abs(r.frames[i].sway - r.frames[i - 1].sway);
      if (d > worst) { worst = d; at = i; }
    }
    const still = r.frames.every((f) => f.others.every(([rad, v, h]) => Math.abs(rad - 1) < 1e-6 && v === h));
    const going = r.frames.every((f) => f.playing);
    const next = r.frames[r.frames.length - 1].theme === r.themeBefore;
    return {
      ok: worst <= 1 && still && going && next && !r.late,
      why: worst > 1 ? `the star jumped ${worst.toFixed(2)} degrees in one frame, ${at - r.turned} frames from the seam`
        : !still ? 'another bird moved while Ember changed'
        : !going ? 'the set stopped'
        : !next ? `the hand-over went to theme ${r.frames[r.frames.length - 1].theme} from ${r.themeBefore}`
        : `${r.late} notes were late (the last ${(r.lateSaid.last * 1000).toFixed(1)} ms late at ${r.lateSaid.at} s of the context, cause ${r.lateSaid.cause}; the longest frame gap ${Math.round(r.lateSaid.frameGap)} ms)`,
      note: `Ember pulled a quarter of the way into theme ${r.themeBefore} handed over into the same theme under it, in place, at the next phrase line `
        + `without a stop; over ${r.frames.length} frames either side of the seam the star never turned more than ${worst.toFixed(2)}° `
        + `between two frames, and the other seven birds never left their rest radius or their house, with 0 notes late`,
    };
  },
});

SCENARIOS.push({
  name: 'a mouse never throws, and a finger\'s clear swipe whirls the ring home and rolls at the swipe',
  area: 'ring',
  // Eugene, round K3: *"swipe to spin the birds' ring should be allowed on
  // mobile; disable the drag-to-roll on desktop completely. We can still drag
  // the ring and make it spin — the harder the drag, the longer the spin — but
  // the birds must always return to their houses at the end of the animation.
  // The dice randomness is the same as pressing the button."* A mouse's
  // hundred degrees: nothing. A finger's twenty-two: the star follows and
  // settles home, no roll. A finger's hard hundred: a whirl, the roll at the
  // lift and not at the end of the whirl, and every bird home after it.
  deadline: 120000,
  query: 'v=2&seed=15576',
  page: body(HAND + `
    const at = (deg, rad) => { const b = tilt(); const a = deg * Math.PI / 180;
      return { x: b.x + b.width / 2 + Math.sin(a) * b.width * (rad / 1000), y: b.y + b.height / 2 - Math.cos(a) * b.height * (rad / 1000) }; };
    const drag = async (who, from, to, rad) => {
      who('pointerdown', at(from, rad), el('tilt'));
      await sleep(30);
      for (let k = 1; k <= 12; k++) { who('pointermove', at(from + ((to - from) * k) / 12, rad)); await sleep(16); }
      who('pointerup', at(to, rad));
    };
    const homes = () => [...document.querySelectorAll('#starCells g.cell')].map((g, i) => {
      const m = /translate\\(([-\\d.]+) ([-\\d.]+)\\)/.exec(g.firstChild.getAttribute('transform') || '');
      const a = (Math.atan2(+m[1] - 500, -(+m[2] - 500)) * 180) / Math.PI + (starAngle() || 0);
      return Math.abs((((a - i * 45) % 360) + 540) % 360 - 180);
    });
    const seed0 = ctl.readout().seed;
    await drag(mouse, 20, 120, 260);
    await sleep(1500);
    const mouseDrag = { seed: ctl.readout().seed, spin: window.ring.turn().spin };
    await drag(finger, 14, 36, 290);
    let peakSmall = 0;
    const t1 = performance.now();
    while (performance.now() - t1 < 2500) { peakSmall = Math.max(peakSmall, Math.abs(window.ring.turn().spin)); await frame(); }
    const small = { seed: ctl.readout().seed, spin: window.ring.turn().spin, peak: peakSmall };
    // the hard swipe: watch the whirl and the roll
    const t0 = performance.now();
    await drag(finger, 20, 120, 260);
    const lift = performance.now();
    let peak = 0;
    let rolledAt = -1;
    let homeAt = -1;
    while (performance.now() - t0 < 20000) {
      const sp = window.ring.turn().spin;
      peak = Math.max(peak, Math.abs(sp));
      if (rolledAt < 0 && ctl.readout().seed !== seed0) rolledAt = performance.now() - lift;
      if (sp === 0 && peak > 0) { homeAt = performance.now() - lift; break; }
      await frame();
    }
    await sleep(300);
    return { seed0, mouseDrag, small, peak: +peak.toFixed(1), rolledAt: Math.round(rolledAt), homeAt: Math.round(homeAt),
      seed: ctl.readout().seed, last: window.deepHouse.cast.last, homes: homes(), sway: window.ring.turn().sway };
  `),
  judge: (r) => {
    const noMouse = r.mouseDrag.seed === r.seed0 && r.mouseDrag.spin === 0;
    const noSmall = r.small.seed === r.seed0 && r.small.spin === 0;
    const whirled = r.peak > 180 && r.homeAt > 0;
    const rolled = r.seed !== r.seed0 && r.rolledAt >= 0 && r.rolledAt < r.homeAt && r.last && r.last.distance === null;
    const home = r.homes.every((d) => d <= 15);
    return {
      ok: noMouse && noSmall && whirled && rolled && home,
      why: !noMouse ? `a mouse's drag spun ${r.mouseDrag.spin} or rolled ${r.mouseDrag.seed}`
        : !noSmall ? `a finger's small swipe left the spin at ${r.small.spin} or rolled ${r.small.seed}`
        : !whirled ? `a hard swipe whirled ${r.peak}° and came home at ${r.homeAt} ms`
        : !rolled ? `the roll came at ${r.rolledAt} ms against home at ${r.homeAt} (${JSON.stringify(r.last)})`
        : `after the whirl the birds stand ${r.homes.map((d) => d.toFixed(1)).join(', ')} degrees from home`,
      note: `a mouse's hundred degrees spun nothing and rolled nothing; a finger's twenty-two turned the star ${r.small.peak.toFixed(1)}° and `
        + `settled home without a roll; a finger's hard hundred whirled the star ${r.peak}° and brought it home ${r.homeAt} ms after the lift, `
        + `having rolled seed ${r.seed} ${r.rolledAt} ms after the lift, and every bird ended within ${Math.max(...r.homes).toFixed(1)}° of its house `
        + `(the sway's own ${r.sway}°)`,
    };
  },
});

SCENARIOS.push({
  name: 'a bird is its own size on the desktop and a bit under a control\'s on the phone, 5 % more at the rim, and on the phone never sits on the track',
  area: 'birds',
  // Eugene, round K4: *"make the largest size only slightly larger than the
  // play controls, 5 %, and make them lie more into the inner ring; they
  // overlap the track scroll too much"*, and then *"do not allow a regular bird
  // circle to be more than 5 % larger than the player controls themselves"* —
  // on every square. All eight birds at the house and at 130 %, on a phone's
  // square and a desktop's, read off the drawing: each node's circle and the
  // scale on its knot against the play action's circle, and its outer edge
  // against the lane band's inner edge (352). And round K5, *"we overdid the
  // bird icon size in desktop mode"*: on the desktop's square a bird is its own
  // 26 units at the house, not the control's 35, and at most 27.3 at the rim;
  // the phone's are the control's, as K4 left them.
  deadline: 120000,
  query: 'v=2&seed=15576',
  page: body(HAND + `
    const act = () => +document.querySelector('#actions circle').getAttribute('r');
    const drawn = () => [...document.querySelectorAll('#starCells g.cell')].map((g, i) => {
      const k = g.firstChild;
      const m = /scale\\(([\\d.]+)\\)/.exec(k.getAttribute('transform') || '');
      const r = +k.querySelector('circle').getAttribute('r') * (m ? +m[1] : 1);
      const at = cells()[i].radius * 316;
      return { r: +r.toFixed(2), at: +at.toFixed(1), edge: +(at + r).toFixed(1) };
    });
    const out = [];
    for (const size of ['phone', 'desktop']) {
      if (size === 'desktop') { el('tilt').style.width = '940px'; el('tilt').style.height = '940px'; }
      await sleep(500);
      window.ring.release(null);
      // (settled on the new square's rest radius first: a bird slides there)
      await waitFor(() => cells().every((c) => Math.abs(c.radius / c.rest - 1) < 1e-6), 3000);
      await sleep(100);
      const house = drawn();
      for (let i = 0; i < 8; i++) window.ring.pull(i, 1);
      await sleep(900);
      // round K6: the star's lines, the crisp stroke of each of the three shapes
      const star = [...document.querySelectorAll('#starLines path.ln')].map((p) => +p.getAttribute('stroke-width'));
      // round K6b, *"the thicker lines do not go to the bird circle centre"*:
      // every corner of the three shapes stands on its bird's centre, read off
      // the same frame's drawing, so the line runs on into every bird
      const knots = [...document.querySelectorAll('#starCells g.cell')].map((g) => (/translate\\(([-\\d.]+) ([-\\d.]+)\\)/.exec(g.firstChild.getAttribute('transform')) || []).slice(1).map(Number));
      const legs = [...document.querySelectorAll('#starLines path.ln')].map((p, k) => {
        const pts = [...p.getAttribute('d').matchAll(/(-?[\\d.]+) (-?[\\d.]+)/g)].map((m) => [+m[1], +m[2]]);
        const at = k === 0 ? [0, 2, 4, 6] : k === 1 ? [1, 3, 5, 7] : [0, 1, 2, 3, 4, 5, 6, 7];
        // (a shape with no corners read is as far off as can be)
        return pts.length < at.length ? Infinity : Math.max(...pts.slice(0, at.length).map((q, j) => Math.hypot(q[0] - knots[at[j]][0], q[1] - knots[at[j]][1])));
      });
      const off = +Math.max(...legs).toFixed(3);
      out.push({ size, ctrl: act(), side: box('tilt').width, house, rim: drawn(), rest: cells()[0].rest, star, off });
    }
    el('tilt').style.width = ''; el('tilt').style.height = '';
    window.ring.release(null);
    await sleep(300);
    return out;
  `),
  judge: (r) => {
    const bad = [];
    for (const x of r) {
      // round K8: on the phone a bird is 0.88 of a control, a bit smaller than the controls
      const base = x.size === 'desktop' ? 26 : +(x.ctrl * 0.88).toFixed(3);
      for (const [i, b] of x.house.entries()) if (Math.abs(b.r - base) > 0.01) bad.push(`${x.size}: bird ${i} at the house is ${b.r} where it should be ${base} (the control is ${x.ctrl})`);
      for (const [i, b] of x.rim.entries()) if (b.r > base * 1.05 + 0.01) bad.push(`${x.size}: bird ${i} at 130 % is ${b.r}, over ${(base * 1.05).toFixed(2)}`);
      if (x.size === 'phone') for (const [i, b] of x.rim.entries()) if (b.edge > 352 - 8 + 0.1) bad.push(`phone: bird ${i} at 130 % reaches ${b.edge}, not 8 clear of the band at 352`);
    }
    const phone = r.find((x) => x.size === 'phone');
    const desk = r.find((x) => x.size === 'desktop');
    const squares = phone.side < 629 && desk.side >= 629;
    // round K6, *"the lines that connect the bird circles look hair-thin"* on
    // the phone: each of the star's lines there is the desktop's times 1.3
    // (1.5 in round K6, and Eugene's pick of 1.3 off the sheet in K8)
    if (phone.star.length !== 3 || desk.star.length !== 3) bad.push(`the star has ${phone.star.length} and ${desk.star.length} lines`);
    phone.star.forEach((w, i) => { if (Math.abs(w - desk.star[i] * 1.3) > 0.001) bad.push(`the phone's star line ${i} is ${w} wide against the desktop's ${desk.star[i]}`); });
    for (const x of r) if (!(x.off <= 0.05)) bad.push(`${x.size}: a corner of the star stands ${x.off} off its bird's centre`);
    return {
      ok: squares && !bad.length,
      why: !squares ? `the squares were ${phone.side} and ${desk.side} px` : bad[0],
      note: `on the phone's square (${Math.round(phone.side)} px) the controls are ${phone.ctrl} and every bird ${phone.house[0].r} at the house and `
        + `${Math.max(...phone.rim.map((b) => b.r))} at 130 %, the house at ${phone.house[0].at} and the rim at ${phone.rim[0].at}, `
        + `the outermost edge ${Math.max(...phone.rim.map((b) => b.edge))} — ${(352 - Math.max(...phone.rim.map((b) => b.edge))).toFixed(1)} clear of the band; `
        + `on the desktop's the controls are ${desk.ctrl}, the birds ${desk.house[0].r} and ${Math.max(...desk.rim.map((b) => b.r))}, the house at ${desk.house[0].at}; `
        + `the star's lines ${desk.star.join('/')} on the desktop and ${phone.star.join('/')} on the phone, every corner on its bird's centre (${desk.off} and ${phone.off} at worst)`,
    };
  },
});

SCENARIOS.push({
  name: 'a dragged bird stands under the hand on every frame, along its spoke and across its play, and floats back after the drop',
  area: 'birds',
  // Eugene, round K8: *"the drag behaviour is lacking since previous rounds —
  // there is some drag ratio and delay; I want the bird to follow the hand
  // precisely in the allowed region."* A mouse takes Tide on a desktop's
  // square and on a phone's, and moves in along its spoke, across it within the
  // play and back, a step every frame; after each step, the bird's centre on
  // the screen against where the hand is plus where the hand took it. Then
  // the drop: the bird must float back onto its spoke over several frames, not
  // jump. (A finger never drags a bird — it opens the panel — so the phone's
  // square is driven by a mouse.)
  deadline: 120000,
  query: 'v=2&seed=15576',
  page: body(HAND + `
    const knot = (i) => document.querySelectorAll('#starCells g.cell')[i].firstChild.querySelector('circle').getBoundingClientRect();
    const centre = (i) => { const r = knot(i); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
    const raf = () => new Promise((res) => requestAnimationFrame(res));
    const run = async (size) => {
      el('tilt').style.width = size === 'desktop' ? '940px' : '';
      el('tilt').style.height = size === 'desktop' ? '940px' : '';
      await sleep(900);
      const i = 6;
      const pu = perUnit();
      // off the house, so the walk is out of the magnet's lock (round K11):
      // 90 % of Tide's house, and thirty units in stays in the open middle of
      // the spoke on the phone's square too
      window.ring.pull(i, 0.5);
      await sleep(500);
      const a = (i / 8) * Math.PI * 2;
      // screen directions of the spoke (outward) and across it
      const out = { x: Math.sin(a), y: -Math.cos(a) };
      const side = { x: Math.cos(a), y: Math.sin(a) };
      let p = centre(i);
      mouse('pointermove', p, el('stage'));
      mouse('pointerdown', p, el('tilt'));
      await sleep(30);
      // past the slop, inward
      p = { x: p.x - out.x * 6, y: p.y - out.y * 6 };
      mouse('pointermove', p);
      await raf(); await raf();
      const c0 = centre(i);
      const grab = { x: c0.x - p.x, y: c0.y - p.y };
      const errs = [];
      const step = async (dx, dy) => {
        p = { x: p.x + dx, y: p.y + dy };
        mouse('pointermove', p);
        await raf(); await raf();
        const c = centre(i);
        errs.push(Math.hypot(c.x - (p.x + grab.x), c.y - (p.y + grab.y)));
      };
      // in along the spoke 30 units, a unit's worth of pixels a frame
      const inn = Math.round(30 * pu);
      for (let k = 0; k < inn; k++) await step(-out.x, -out.y);
      // across the spoke, 20 px each way and back, a pixel a frame
      for (let k = 0; k < 20; k++) await step(side.x, side.y);
      for (let k = 0; k < 40; k++) await step(-side.x, -side.y);
      for (let k = 0; k < 20; k++) await step(side.x, side.y);
      // a quick diagonal, three pixels a frame
      for (let k = 0; k < 6; k++) await step(3 * (out.x + side.x) / 1.4, 3 * (out.y + side.y) / 1.4);
      for (let k = 0; k < 6; k++) await step(-3 * (out.x + side.x) / 1.4, -3 * (out.y + side.y) / 1.4);
      // off the spoke by 18 px and let go: the float back
      for (let k = 0; k < 18; k++) await step(side.x, side.y);
      const held = centre(i);
      mouse('pointerup', p);
      const back = [];
      for (let k = 0; k < 20; k++) { await raf(); const c = centre(i); back.push(Math.hypot(c.x - held.x, c.y - held.y)); }
      await sleep(600);
      const rest = centre(i);
      window.ring.release(null);
      await sleep(400);
      return { size, pu: +pu.toFixed(3), n: errs.length, worst: +Math.max(...errs).toFixed(3), back: back.map((v) => +v.toFixed(2)), settled: +Math.hypot(rest.x - held.x, rest.y - held.y).toFixed(2) };
    };
    const out = [await run('desktop'), await run('phone')];
    el('tilt').style.width = ''; el('tilt').style.height = '';
    return out;
  `),
  judge: (r) => {
    const bad = [];
    for (const x of r) {
      if (x.worst > 1) bad.push(`${x.size}: the bird stood ${x.worst} px off the hand`);
      // the float back: under the hand at the drop, and moving on over several frames
      const rising = x.back.every((v, k) => k === 0 || v >= x.back[k - 1] - 0.3);
      if (!(x.settled > 3 && x.back[0] < 0.3 * x.settled && x.back[3] < 0.8 * x.settled && rising)) bad.push(`${x.size}: after the drop the bird moved ${x.back.join(', ')} px of ${x.settled}, not an ease`);
    }
    return {
      ok: !bad.length && r.every((x) => x.n > 100),
      why: bad[0] || `only ${r.map((x) => x.n).join(' and ')} steps`,
      note: r.map((x) => `${x.size} (${x.pu} px a unit): ${x.n} steps along the spoke, across the play and a quick diagonal, the bird within ${x.worst} px of the hand on every one; `
        + `let go ${x.settled} px off its spoke, it floated back over frames (${x.back.slice(0, 5).join(', ')} px …)`).join('; '),
    };
  },
});

SCENARIOS.push({
  name: 'a drag on a bird or a control selects no text, on the page and in the machine view',
  area: 'birds',
  // Eugene, round K9: *"in the debug machine mode, when I drag birds, somehow
  // the whole text in the ring gets selected."* A real mouse — the browser's own
  // input, which is what starts a native selection — drags Ember out along its
  // spoke on the page, and again with the machine view open and the ring in its
  // corner; and, where the view carries them, across a source's switches and
  // its volume. After each, nothing is selected.
  deadline: 90000,
  query: 'v=2&seed=15576',
  drive: async (page) => {
    const sel = () => page.evaluate(() => { const s = window.getSelection(); return { text: s ? s.toString().length : 0, ranges: s ? s.rangeCount : 0, collapsed: !s || !s.rangeCount || s.getRangeAt(0).collapsed }; });
    const bird = () => page.evaluate(() => {
      const r = document.querySelectorAll('#starCells g.cell')[0].firstChild.getBoundingClientRect();
      const t = document.getElementById('tilt').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, cx: t.x + t.width / 2, cy: t.y + t.height / 2 };
    });
    const drag = async (from, to) => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      for (let k = 1; k <= 12; k++) { await page.mouse.move(from.x + ((to.x - from.x) * k) / 12, from.y + ((to.y - from.y) * k) / 12); await page.waitForTimeout(16); }
      await page.mouse.up();
      await page.waitForTimeout(150);
    };
    const across = async (layout) => {
      const b = await bird();
      // out along Ember's spoke and on past the ring's edge, over the words and the lanes
      await drag(b, { x: b.x + (b.x - b.cx) * 0.2 + 40, y: b.y - (b.cy - b.y) * 1.2 - 30 });
      const s1 = await sel();
      await page.evaluate(() => window.getSelection() && window.getSelection().removeAllRanges());
      // and across the ring, bird to bird
      await drag(b, { x: b.cx + (b.cx - b.x), y: b.cy + (b.cy - b.y) });
      const s2 = await sel();
      await page.evaluate(() => { window.getSelection() && window.getSelection().removeAllRanges(); window.ring.release(null); });
      await page.waitForTimeout(300);
      return { layout, out: s1, through: s2 };
    };
    const main = await across('page');
    await page.evaluate(() => window.ring.machine.open());
    await page.waitForTimeout(1500);
    const view = await across('view');
    // the view's own controls, where this build carries them (the private tier's)
    const controls = await page.evaluate(async () => {
      const ns = [...document.querySelectorAll('#machine .desk-strip [role="button"]')].slice(0, 2);
      if (ns[0]) { ns[0].scrollIntoView({ block: 'center', inline: 'center' }); await new Promise((res) => setTimeout(res, 200)); }
      return ns.map((n) => { const r = n.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    });
    let ctl = null;
    if (controls.length) {
      const hitEl = await page.evaluate((p) => { const e = document.elementFromPoint(p.x, p.y); return e ? e.tagName + '.' + (e.getAttribute('class') || '') + ' in ' + (e.closest('g[role=button]') ? 'button' : 'no-button') : 'none'; }, controls[0]);
      await drag(controls[0], { x: controls[0].x + 160, y: controls[0].y + 60 });
      ctl = await sel();
      ctl.hit = hitEl;
      ctl.said = await page.evaluate(() => String(window.getSelection()).slice(0, 80));
      await page.keyboard.press('Escape').catch(() => {});
    }
    await page.evaluate(() => window.ring.machine.close());
    return { main, view, ctl, controls: controls.length };
  },
  judge: (r) => {
    const clean = (s) => s && s.text === 0 && (s.ranges === 0 || s.collapsed);
    const bad = [];
    for (const x of [r.main, r.view]) {
      if (!clean(x.out)) bad.push(`${x.layout}: a drag out from Ember selected ${x.out.text} characters`);
      if (!clean(x.through)) bad.push(`${x.layout}: a drag across the ring selected ${x.through.text} characters`);
    }
    if (r.ctl && !clean(r.ctl)) bad.push(`the view: a drag across a source's switches selected ${r.ctl.text} characters (${r.ctl.hit}: ${r.ctl.said})`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: `a real mouse dragging Ember out past the ring and across it selected nothing, on the page and with the machine view open`
        + (r.controls ? `, and a drag across a source's switches in the view selected nothing either` : ` (this build carries no source switches: the private tier's)`),
    };
  },
});

SCENARIOS.push({
  name: 'the phone panel\'s line says the dropped value once and holds it, naming the tempo',
  area: 'panel',
  // Eugene, round K9: *"dragging Ember down from 100 %, the bottom label
  // flickers — while I drag it shows 'NO HARDER', then a second later it turns
  // to '49 beats in the minute'. Very confusing."* A finger opens Ember's panel
  // while the set plays, the slider takes it to 45 %, and the line under it is
  // read every 100 ms for three seconds from the release: at most one change
  // (the moment the dropped value's reading replaces the house's) and never
  // back, and what it says names the tempo, not the pole word alone.
  deadline: 90000,
  query: 'v=2&seed=15576',
  page: body(HAND + `
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
    const r0 = cells()[0].radius * 316;
    finger('pointerdown', spoke(0, r0), el('tilt'));
    await sleep(60);
    finger('pointerup', spoke(0, r0));
    await sleep(200);
    const line = () => el('birdPanelNow').textContent;
    const atOpen = line();
    const sl = el('birdPanelSlider');
    for (const v of [90, 75, 60, 45]) { sl.value = String(v); sl.dispatchEvent(new Event('input', { bubbles: true })); await sleep(40); }
    sl.dispatchEvent(new Event('change', { bubbles: true }));
    const seen = [];
    for (let k = 0; k < 30; k++) { seen.push(line()); await sleep(100); }
    const pending = cells()[0].pending;
    ctl.stop();
    window.ring.release(null);
    return { atOpen, seen, pending, percent: cells()[0].percent };
  `),
  judge: (r) => {
    const runs = r.seen.filter((x, i) => i === 0 || x !== r.seen[i - 1]);
    const back = runs.some((x, i) => runs.indexOf(x) !== i);
    const last = r.seen[r.seen.length - 1];
    // (the line is the band's short form since the panel round after K13: the kick's word and the tempo it lands at, as a number)
    const tempo = /\bat \d+(\.\d+)?\b/i.test(last);
    const bare = /^(softer, no drums|hits harder)$/i.test(last.trim());
    return {
      ok: runs.length <= 2 && !back && tempo && !bare,
      why: runs.length > 2 || back ? `the line changed ${runs.length - 1} times: ${runs.map((x) => JSON.stringify(x)).join(' → ')}`
        : `the line reads "${last}"`,
      note: `Ember slid to 45 % while the set played: from the release the line read ${runs.map((x) => JSON.stringify(x)).join(' → ')} over three seconds `
        + `of the wait (${r.pending ? 'still pending at the end' : 'landed'}), once and never back, naming the tempo it lands at`,
    };
  },
});

SCENARIOS.push({
  name: 'a finger anywhere outside the phone panel puts it away, and a finger on it does not',
  area: 'panel',
  // Eugene, round K9: *"the bottom slide panel hides on swipe-down or a touch
  // on the ring, but if I touch above the ring's rect it stays — it should hide
  // in that case too: any touch outside the panel."* Touch events on whatever
  // is under the finger: a tap on the panel keeps it; a tap above the ring's
  // square and one beside the ring above the sheet each close it and let the bird go; the tap
  // that closes it starts nothing on the ring.
  query: 'v=2&seed=15576',
  page: body(HAND + `
    const panel = el('birdPanel');
    const tapAt = async (p) => {
      const t = document.elementFromPoint(p.x, p.y) || document.body;
      const ev = (type) => t.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 31, clientX: p.x, clientY: p.y, pointerType: 'touch', isPrimary: true }));
      ev('pointerdown'); await sleep(50); ev('pointerup'); await sleep(200);
      return t.id || t.tagName;
    };
    const open = async () => {
      const r0 = cells()[4].radius * 316;
      finger('pointerdown', spoke(4, r0), el('tilt')); await sleep(60); finger('pointerup', spoke(4, r0)); await sleep(200);
      return !panel.hidden && cells()[4].active;
    };
    const out = {};
    out.opened = await open();
    const pb = panel.getBoundingClientRect();
    out.onPanel = await tapAt({ x: pb.x + pb.width / 2, y: pb.y + 8 });
    out.keptOnPanel = !panel.hidden;
    const tb = tilt();
    out.above = await tapAt({ x: tb.x + tb.width / 2, y: Math.max(4, tb.y - 12) });
    out.closedAbove = panel.hidden && !cells()[4].active;
    out.dragAfter = window.ring.turn().spin;
    out.reopened = await open();
    // (since K20 the panel is a sheet on the page's bottom, and nothing is
    // below it: the second outside touch is beside the ring, just above the sheet)
    const pb2 = panel.getBoundingClientRect();
    out.below = await tapAt({ x: 4, y: pb2.y - 12 });
    out.closedBelow = panel.hidden && !cells()[4].active;
    return out;
  `),
  judge: (r) => {
    const ok = r.opened && r.keptOnPanel && r.closedAbove && r.reopened && r.closedBelow && r.dragAfter === 0;
    return {
      ok,
      why: `opened ${r.opened}, kept after a tap on the panel ${r.keptOnPanel}, closed by a tap above the ring on ${r.above} ${r.closedAbove}, `
        + `reopened ${r.reopened}, closed by a tap beside the ring on ${r.below} ${r.closedBelow}, spin ${r.dragAfter}`,
      note: `a tap on the panel kept it; a tap above the ring (on ${r.above}) and one beside the ring above the sheet (on ${r.below}) each put it away and let Root go, starting nothing`,
    };
  },
});

SCENARIOS.push({
  name: 'a throw of the ring is one motion that slows onto home, for a soft, a middling and a hard swipe',
  area: 'ring',
  // Eugene, round K9: *"when spinning the birds' ring you should calculate the
  // spin so that it stops in the right positions; now it looks cheap — it
  // stops randomly and then another half-ring spin places the birds in
  // position."* Three finger swipes of a hundred degrees, slow to fast; every
  // frame from the lift the star's spin: never reversing, its speed falling
  // all the way to nought, the motion ending on a whole turn with nothing
  // moving after it, the star's turn then its sway alone, and the dice rolled
  // at the lift.
  deadline: 150000,
  query: 'v=2&seed=15576',
  page: body(HAND + `
    const at = (deg, rad) => { const b = tilt(); const a = deg * Math.PI / 180;
      return { x: b.x + b.width / 2 + Math.sin(a) * b.width * (rad / 1000), y: b.y + b.height / 2 - Math.cos(a) * b.height * (rad / 1000) }; };
    const out = [];
    for (const pause of [60, 30, 12]) {
      const seed0 = ctl.readout().seed;
      finger('pointerdown', at(20, 260), el('tilt'));
      await sleep(30);
      for (let k = 1; k <= 12; k++) { finger('pointermove', at(20 + (100 * k) / 12, 260)); await sleep(pause); }
      finger('pointerup', at(120, 260));
      const lift = performance.now();
      const seen = [];
      let rolledAt = -1;
      while (performance.now() - lift < 15000) {
        const t = await new Promise((res) => requestAnimationFrame(res));
        seen.push([t, window.ring.turn().spin]);
        if (rolledAt < 0 && ctl.readout().seed !== seed0) rolledAt = performance.now() - lift;
        if (seen.length > 2 && seen[seen.length - 1][1] === 0) break;
      }
      const after = [];
      for (let k = 0; k < 20; k++) { await new Promise((res) => requestAnimationFrame(res)); after.push(window.ring.turn().spin); }
      const tn = window.ring.turn();
      out.push({ pause, seen, after, rolledAt: Math.round(rolledAt), rest: +(tn.star - tn.sway).toFixed(3) });
      await sleep(600);
    }
    return out;
  `),
  judge: (r) => {
    const bad = [];
    const notes = [];
    for (const x of r) {
      // the spin as it went, the landing on nought read as the whole turn it is
      // (since K30 the ring's loop does its work at 60 a second at most, so on a
      // faster screen a frame the loop skipped repeats the angle: those are
      // taken out, and the speed is read over the frames the ring drew)
      const seen = x.seen.filter((s, i, a) => i === 0 || s[1] !== a[i - 1][1] || i === a.length - 1);
      x.seen = seen;
      const v = seen.map((s) => s[1]);
      const last = v[v.length - 1];
      const before = v[v.length - 2];
      const total = Math.round(before / 360) * 360;
      if (last !== 0 || Math.abs(before - total) > 30) bad.push(`swipe ${x.pause}: it ended at ${last} after ${before}`);
      const ang = v.slice(0, -1).concat([total]);
      const dir = Math.sign(total);
      let reversed = 0; let sped = 0;
      const speeds = [];
      for (let k = 1; k < ang.length; k++) {
        const dt = (x.seen[k][0] - x.seen[k - 1][0]) / 1000;
        const dv = (ang[k] - ang[k - 1]) * dir;
        if (dv < -0.01) reversed++;
        if (dt > 0) speeds.push(dv / dt);
      }
      // (from the second frame: the first interval straddles the lift, and a
      // frame callback of ours can run on either side of the ring's own)
      for (let k = 2; k < speeds.length; k++) if (speeds[k] > speeds[k - 1] * 1.08 + 5) sped++;
      if (reversed) bad.push(`swipe ${x.pause}: it turned back on ${reversed} frames`);
      if (sped) bad.push(`swipe ${x.pause}: it sped up on ${sped} frames (${speeds.slice(0, 8).map((q) => q.toFixed(0)).join(', ')} …)`);
      if (x.after.some((q) => q !== 0)) bad.push(`swipe ${x.pause}: it moved after it stopped`);
      if (Math.abs(x.rest) > 0.1) bad.push(`swipe ${x.pause}: at rest the star stands ${x.rest}° off its sway`);
      if (!(x.rolledAt >= 0 && x.rolledAt < 400)) bad.push(`swipe ${x.pause}: the dice rolled ${x.rolledAt} ms after the lift`);
      notes.push(`${Math.abs(total) / 360} turn${Math.abs(total) === 360 ? '' : 's'} over ${((x.seen[x.seen.length - 1][0] - x.seen[0][0]) / 1000).toFixed(2)} s from ${Math.round(speeds[0] || 0)}°/s`);
    }
    return {
      ok: !bad.length,
      why: bad[0],
      note: `three swipes, slow to hard: ${notes.join('; ')} — each one motion, never turning back, its speed falling every frame to nought on a whole turn, `
        + `nothing moving after, the star then its sway alone and the dice rolled at the lift`,
    };
  },
});

SCENARIOS.push({
  name: 'no hand cursor on the ring: the arrow on the band and the star, the pointer on a bird and an action',
  area: 'ring',
  // Eugene, round K4: *"mouse drag on the ring does nothing — with that we
  // don't need the drag/hand cursor."* A mouse hovering the band, the star
  // between two birds, a bird and the play action, and then pressing and
  // dragging the band and a bird: what the cursor reads at each.
  query: 'v=2&seed=15576',
  page: body(HAND + `
    const cur = () => el('tilt').style.cursor || 'default';
    const out = {};
    const hover = async (name, p) => { mouse('pointermove', p, el('stage')); await sleep(60); out[name] = cur(); };
    await hover('band', spoke(1.5, 380));
    await hover('star', spoke(0.5, 250));
    await hover('bird', nodeAt(2));
    const a = document.querySelector('#actions > g').getBoundingClientRect();
    await hover('action', { x: a.x + a.width / 2, y: a.y + a.height / 2 });
    // a press and a drag along the band, then on a bird
    const b0 = spoke(1.5, 380);
    mouse('pointermove', b0, el('stage'));
    mouse('pointerdown', b0, el('tilt'));
    await sleep(30);
    mouse('pointermove', spoke(1.7, 380));
    await sleep(40);
    out.bandDrag = cur();
    mouse('pointerup', spoke(1.7, 380));
    await sleep(100);
    const n = nodeAt(2);
    mouse('pointermove', n, el('stage'));
    mouse('pointerdown', n, el('tilt'));
    await sleep(30);
    mouse('pointermove', { x: n.x + 12, y: n.y });
    await sleep(40);
    out.birdDrag = cur();
    mouse('pointerup', { x: n.x + 12, y: n.y });
    await sleep(100);
    window.ring.release(null);
    ctl.stop();
    return out;
  `),
  judge: (r) => {
    const want = { band: 'default', star: 'default', bird: 'pointer', action: 'pointer', bandDrag: 'default', birdDrag: 'pointer' };
    const bad = Object.keys(want).filter((k) => r[k] !== want[k]);
    return {
      ok: !bad.length,
      why: `the cursor read ${bad.map((k) => `${r[k]} on the ${k}`).join(', ')}`,
      note: `the band and the star read the arrow, hovered and dragged alike; a bird and an action read the pointer; no grab or grabbing anywhere`,
    };
  },
});

SCENARIOS.push({
  name: 'the pulse is a corona on the transport\'s rim, a wide slow swell at 54 BPM and a close one at 104, and nothing of it travels',
  area: 'ring',
  // Eugene: *"at slow tempos, about 60 BPM and below, make it much more
  // pronounced and wider, ~160 px, so ambient tracks get sparse, wave-like
  // pulsation."* And round K14: *"a solar crown: play is the planet and the
  // glow follows the planet's gravity, not just runs away and back."* Ember at
  // 0.05 plays seed 1 unmetered at 54; the house plays it at 104. What is read
  // is the corona's own strokes: every one standing on the rim on every frame,
  // how far the widest reaches, and the light across it from its edge in.
  deadline: 180000,
  query: 'v=2&seed=1&spell=ember:0.05',
  page: body(HAND + `
    // the corona's strokes, the widest first (the rim's own line is on the transport's sheet since K17)
    const layers = () => [...document.querySelectorAll('#corona > circle')]
      .sort((a, b) => +b.getAttribute('stroke-width') - +a.getAttribute('stroke-width'));
    const watch = async (ms) => {
      const falloff = { layers: 0, step: 0, down: 0, edge: 0 };
      const trace = [];
      let reach = 0;
      let step = 0;
      let edge = 0;
      let off = 0;
      let last = null;
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        const t = await new Promise((res) => requestAnimationFrame(res));
        const ls = layers();
        // the light on the rim, where every stroke lies, composited
        let through = 1;
        const strips = ls.map((n) => { through *= 1 - +n.getAttribute('opacity'); return 1 - through; });
        const rim = strips[strips.length - 1] || 0;
        // K14: while the corona is drawn every stroke stands on the rim — its
        // inner edge at 150 — and the widest is its reach (its own light is
        // near nought by design: the corona falls to nothing there)
        if (rim > 0.02) {
          for (const n of ls) off = Math.max(off, Math.abs(+n.getAttribute('r') - +n.getAttribute('stroke-width') / 2 - 150));
          reach = Math.max(reach, +ls[0].getAttribute('stroke-width'));
        }
        if (last && t > last.t) step = Math.max(step, Math.abs(rim - last.m) * (16.7 / Math.max(16.7, t - last.t)));
        if (rim > 0.15) {
          edge = Math.max(edge, strips[0] / rim);
          const share = strips.map((v) => v / rim);
          for (let j = 1; j < share.length; j++) {
            falloff.step = Math.max(falloff.step, share[j] - share[j - 1]);
            if (share[j] < share[j - 1] - 1e-3) falloff.down++;
          }
          falloff.layers = ls.length;
          falloff.edge = Math.max(falloff.edge, share[0]);
        }
        last = { t, m: rim };
        const rd = ctl.readout();
        trace.push({ m: +rim.toFixed(4), beat: rd.bar * 4 + rd.beatInBar, ph: rd.beatPhase });
      }
      return { reach: +reach.toFixed(2), step: +step.toFixed(4), edge: +edge.toFixed(3), off: +off.toFixed(3), bpm: ctl.readout().gridBpm || ctl.readout().bpm,
        falloff: { layers: falloff.layers, step: +falloff.step.toFixed(3), down: falloff.down, edge: +falloff.edge.toFixed(3) }, trace };
    };
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2, 15000);
    const slow = await watch(11000);
    const room = window.ring.motion().coronaReach;
    ctl.stop();
    await sleep(300);
    window.ring.release(null);
    await sleep(300);
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2, 15000);
    const fast = await watch(4000);
    ctl.stop();
    await sleep(200);
    return { slow, fast, room };
  `),
  judge: (r) => {
    const tempos = r.slow.bpm < 60 && r.fast.bpm > 100;
    // K14: nothing travels — every lit stroke's inner edge on the rim
    const anchored = r.slow.off < 0.02 && r.fast.off < 0.02;
    // at a house tempo the corona reaches the fast anchor's sixteen units at
    // most (read on frames, which never land on the swell's top itself)
    const today = r.fast.reach > 5 && r.fast.reach <= 16.01;
    const wide = r.slow.reach >= 4 * r.fast.reach;
    // K15/K17: the slow crown 1.56 of the trace's 85, the same on every square
    // (it lies under the birds since K17 and is not stopped short of them)
    const slowWant = 85 * 1.56;
    const further = r.slow.reach >= 0.97 * slowWant && r.slow.reach <= slowWant + 0.01 && Math.abs(r.room - slowWant) < 0.05;
    // round K3: at the slow tempo the light never steps more than 0.04 a frame,
    // and the corona's edge carries under a sixth of the rim's light
    const smooth = r.slow.step <= 0.04 && r.slow.edge <= 1 / 6;
    // round K4: a continuous fade — at least eight strokes, the light rising
    // from the edge to the rim strip by strip and never by more than 0.14
    // of the rim's between two neighbours
    const f = r.slow.falloff;
    const graded = f.layers >= 8 && f.down === 0 && f.step <= 0.14;
    // round K4, his breaks: one pulse a bar at 54 — the light at its least on
    // the downbeat, rising to one peak and falling back across the bar with no
    // second swell
    const cycles = (tr, every) => {
      const by = new Map();
      for (const x of tr) { const k = Math.floor(x.beat / every); if (!by.has(k)) by.set(k, []); by.get(k).push({ m: x.m, p: ((x.beat % every) + x.ph) / every }); }
      const whole = [...by.values()].filter((xs) => xs.length > 10 && xs[0].p < 0.1 && xs[xs.length - 1].p > 0.9);
      let bumps = 0;
      for (const xs of whole) {
        const top = xs.reduce((a, x, i) => (x.m > xs[a].m ? i : a), 0);
        const up = xs.slice(0, top + 1).every((x, i, a) => i === 0 || x.m >= a[i - 1].m - 0.003);
        const down = xs.slice(top).every((x, i, a) => i === 0 || x.m <= a[i - 1].m + 0.003);
        if (!up || !down) bumps++;
      }
      return { whole: whole.length, bumps };
    };
    const slowC = cycles(r.slow.trace, 4);
    const breath = slowC.whole >= 1 && slowC.bumps === 0;
    return {
      ok: tempos && anchored && today && wide && further && smooth && graded && breath,
      why: !tempos ? `the two sets ran at ${r.slow.bpm} and ${r.fast.bpm}`
        : !anchored ? `a stroke of the pulse stood ${Math.max(r.slow.off, r.fast.off)} units off the rim`
        : !today ? `at ${r.fast.bpm} the corona reached ${r.fast.reach}, not within the fast anchor's sixteen`
        : !wide ? `at ${r.slow.bpm} it reached ${r.slow.reach} against ${r.fast.reach}`
        : !further ? `at ${r.slow.bpm} the crown reached ${r.slow.reach}, not ${slowWant.toFixed(1)} (the page says ${r.room})`
        : !smooth ? `at ${r.slow.bpm} the light stepped ${r.slow.step} in a frame and the edge carried ${r.slow.edge} of the rim's`
        : !graded ? `at ${r.slow.bpm} the corona's ${f.layers} strokes fell ${f.down} times from edge to rim and stepped ${f.step} of the rim's between neighbours`
        : `at ${r.slow.bpm} ${slowC.bumps} of ${slowC.whole} bars swelled more than once`,
      note: `every stroke on the rim on every frame (${Math.max(r.slow.off, r.fast.off)} units at worst); at ${r.fast.bpm} BPM the corona reached ${r.fast.reach} units `
        + `and at ${r.slow.bpm} ${r.slow.reach} (the crown's reach ${r.room}), ${(r.slow.reach / r.fast.reach).toFixed(1)} times as far, `
        + `its light never stepping more than ${r.slow.step} in a frame (ceiling 0.04) and its edge carrying ${r.slow.edge} of the rim's (ceiling a sixth); `
        + `across it ${f.layers} strokes rising from ${f.edge} of the rim's at the edge, never falling and never more than ${f.step} between neighbours (ceiling 0.14); `
        + `at ${r.slow.bpm} one breath a bar on the downbeat, rising once and falling once across each of ${slowC.whole} whole bars`,
    };
  },
});

SCENARIOS.push({
  name: 'the ring reads a bird as a percent of its house, and the link keeps the value',
  area: 'birds',
  // Eugene: *"0.45 is not obvious"* — and, the same day, *"the URL stays the
  // stable value that never changes."* A drag to 0.62 is `EMBER 111%` on the
  // ring, `ember:0.62` in the link, and 100 % is never printed.
  query: 'v=2&seed=15576',
  page: body(HAND + `
    const title = (i) => (document.querySelectorAll('#starWords > g')[i].querySelector('text') || {}).textContent;
    const house = title(0);
    await pullTo(0, 0.62, null);
    await sleep(300);
    return { house, held: title(0), value: cells()[0].value, percent: cells()[0].percent, url: decodeURIComponent(location.search),
      aria: document.querySelectorAll('#starCells g.cell')[0].getAttribute('aria-valuenow') };
  `),
  judge: (r) => {
    const quiet = r.house === 'EMBER';
    const shown = r.held === `EMBER ${r.percent}%` && r.percent === Math.round(100 + (30 * (r.value - 0.394)) / (1 - 0.394));
    const link = r.url.includes(`em:${r.value.toFixed(2)}`) && !r.url.includes('%');
    const aria = r.aria === String(r.percent);
    return {
      ok: quiet && shown && link && aria,
      why: !quiet ? `at the house the title reads "${r.house}"`
        : !shown ? `held at ${r.value} the title reads "${r.held}"`
        : !link ? `the link reads ${r.url}`
        : `the slider says ${r.aria}`,
      note: `at the house the title is the name alone; held at ${r.value} it reads "${r.held}", the slider says ${r.aria} and the link says "${r.url}"`,
    };
  },
});

SCENARIOS.push({
  name: 'a finger opens the bird\'s panel and steps it with Less and More',
  area: 'panel',
  // Eugene: *"no dragging on the phone: touching a bird makes it active and
  // shows an aux panel under the ring — title and label, and two big buttons,
  // Less and More, that step the bird's value."* Decided by the input, so a
  // finger's pointer events on the built page are the phone. Since K14 a
  // finger may also drag (*"we just always show the bottom aux panel for
  // control, but if the user drags, they drag"*): sliding along Root's spoke
  // drags it and opens nothing, and the bird is let go before the tap.
  query: 'v=2&seed=15576',
  page: body(HAND + `
    const panel = el('birdPanel');
    const r0 = cells()[4].radius * 316;
    // a finger that slides along Root's spoke drags it, and opens no panel
    finger('pointerdown', spoke(4, r0), el('tilt'));
    await sleep(30);
    for (let k = 1; k <= 6; k++) { finger('pointermove', spoke(4, r0 + 10 * k)); await sleep(25); }
    finger('pointerup', spoke(4, r0 + 60));
    await sleep(200);
    const slid = { value: cells()[4].value, open: !panel.hidden, held: cells()[4].held };
    window.ring.release(null);
    await sleep(400);
    // a tap opens the panel on Root
    finger('pointerdown', spoke(4, r0), el('tilt'));
    await sleep(60);
    finger('pointerup', spoke(4, r0));
    await sleep(150);
    const nowLine = () => el('birdPanelNow').textContent;
    const opened = { open: !panel.hidden, name: el('birdPanelName').textContent, means: el('birdPanelMeans').textContent, now: nowLine(),
      steps: !el('birdPanelSteps').hidden, box: panel.getBoundingClientRect().top, ring: el('tilt').getBoundingClientRect().bottom };
    el('birdPanelMore').click();
    await sleep(60);
    el('birdPanelMore').click();
    await sleep(60);
    const mid = { url: location.search, percent: cells()[4].percent, now: nowLine() };
    await sleep(600);
    const pctCount = () => (panel.innerText.match(/%/g) || []).length;
    const more = { urlRaw: location.search, url: decodeURIComponent(location.search), percent: cells()[4].percent, value: cells()[4].value, name: el('birdPanelName').textContent, now: nowLine(),
      pct: el('birdPanelPct').textContent, pcts: pctCount() };
    // the slider: a finger letting go at 118 lands on 120, and commits like a press
    const slider = el('birdPanelSlider');
    slider.value = '118';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    const snappedTo = slider.value;
    const midSlide = { url: location.search };
    await sleep(600);
    const slider2 = { url: decodeURIComponent(location.search), percent: cells()[4].percent, knob: slider.value, pct: el('birdPanelPct').textContent, pcts: pctCount() };
    // and back to 110 with Less twice
    el('birdPanelLess').click();
    await sleep(60);
    el('birdPanelLess').click();
    await sleep(600);
    el('birdPanelLess').click();
    await sleep(60);
    el('birdPanelLess').click();
    await sleep(700);
    const less = { url: location.search, held: cells()[4].held, value: cells()[4].value, now: nowLine() };
    // a finger on the open ring puts the panel away — a point of the star's
    // open face that is no bird's and none of their words' (since K14 a
    // bird's words are the bird to a finger)
    const open = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5].flatMap((f) => [230, 260, 200].map((r) => spoke(f, r)))
      .find((q) => window.ring.pick(q.x, q.y, true) == null);
    finger('pointerdown', open, el('tilt'));
    finger('pointerup', open);
    await sleep(150);
    return { slid, opened, mid, more, snappedTo, midSlide, slider2, less, closed: panel.hidden, house: cells()[4].house };
  `),
  judge: (r) => {
    const noDrag = r.slid.value !== r.house && r.slid.held && !r.slid.open;
    const opened = r.opened.open && r.opened.name === 'Root' && /low end/.test(r.opened.means) && r.opened.steps && r.opened.box >= r.opened.ring - 1;
    const waited = !r.mid.url.includes('spell=') && r.mid.percent === 110;
    // round K3: the name alone, the percent said once, over the knob
    const stepped = r.more.percent === 110 && r.more.url.includes(`ro:${r.more.value.toFixed(2)}`) && r.more.name === 'Root'
      && r.more.pct === '110%' && r.more.pcts === 1;
    const slidOk = r.snappedTo === '120' && r.midSlide.url === r.more.urlRaw
      && Math.abs(r.slider2.percent - 120) <= 1 && r.slider2.url.includes('ro:') && r.slider2.pcts === 1;
    const home = !r.less.held && r.less.value === r.house && !r.less.url.includes('spell=');
    // round K4: the line under the slider is never blank — the reading at the
    // house, the change under a hand, and still there once the finger is off
    const said = [r.opened.now, r.mid.now, r.more.now, r.less.now];
    // (since round K13 it is one sentence of the reading, so a step inside one
    // band says the same sentence, and no pole word ever)
    const nowOk = said.every((x) => x && x.trim() && !/\b(more|less|out|in|shorter|longer|how)\b/i.test(x));
    return {
      ok: noDrag && opened && waited && stepped && slidOk && home && r.closed && nowOk,
      why: !noDrag ? `a finger sliding along Root left it at ${r.slid.value} (held ${r.slid.held}) or opened the panel (${r.slid.open})`
        : !opened ? `the tap opened ${JSON.stringify(r.opened)}`
        : !waited ? `two presses wrote ${r.mid.url} before the finger stopped, at ${r.mid.percent} %`
        : !stepped ? `two presses of More left Root at ${r.more.percent} % and the link ${r.more.url}, the panel saying "${r.more.name}" and "${r.more.pct}" (${r.more.pcts} percents)`
        : !slidOk ? `a slider let go at 118 snapped to ${r.snappedTo} and left Root at ${r.slider2.percent} % (${r.slider2.url}, ${r.slider2.pcts} percents)`
        : !home ? `two presses of Less left Root at ${r.less.value}, held ${r.less.held}, link ${r.less.url}`
        : !nowOk ? `the line under the slider read ${JSON.stringify(said)}`
        : 'a finger on the open ring left the panel up',
      note: `a finger sliding along Root dragged it to ${r.slid.value} and opened nothing; a tap opened the panel under the ring — "${r.opened.name}", "${r.opened.means}" — `
        + `two presses of More took Root to ${r.more.percent} % and wrote "${r.more.url}" once the finger stopped, the percent said once, over the knob; `
        + `the slider let go at 118 snapped to ${r.snappedTo} and committed Root at ${r.slider2.percent} % ("${r.slider2.url}"); Less took it home `
        + `and bared the link, and a finger on the open ring put the panel away; the line under the slider read "${r.opened.now}" at the house, `
        + `"${r.mid.now}" under the presses, "${r.more.now}" once the finger was off and "${r.less.now}" back home`,
    };
  },
});

// **What is set in the machine view leaves with the view** (the page review of
// 09-22, findings 1, 3 and 7). Opening the view installs nothing; a mute is in
// force while the view is open and gone when it closes, with the set playing
// through both; the view opens again clean; and a box at rest is drawn dim
// whatever controls it carries.
SCENARIOS.push({
  name: 'a finger\'s swipe down puts the bird\'s panel away, and a short drag or a slide does not',
  area: 'panel',
  // Eugene, round K7: *"need to close the bottom − / + panel on mobile with a
  // swipe-down gesture."* Touch pointer events on the phone frame: a tap opens
  // Root's panel; a short drag on it follows the finger and springs back, open;
  // a drag on the slider is the slider's and leaves it open; a press of More
  // commits a value, and a quick swipe down carries the panel out and closes
  // it, the bird let go of the hand's attention — and the value still lands
  // at its phrase line.
  deadline: 90000,
  query: 'v=2&seed=15576',
  page: body(HAND + `
    const panel = el('birdPanel');
    const on = (p, type, y, target) => (target || panel).dispatchEvent(new PointerEvent(type, {
      bubbles: true, pointerId: 21, clientX: p.x, clientY: y, pointerType: 'touch', isPrimary: true }));
    const mid = () => { const b = panel.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + 12 }; };
    const shift = () => { const m = /translateY\\(([-\\d.]+)px\\)/.exec(panel.style.transform || ''); return m ? +m[1] : 0; };
    await started();
    await sleep(800);
    const r0 = cells()[4].radius * 316;
    finger('pointerdown', spoke(4, r0), el('tilt'));
    await sleep(60);
    finger('pointerup', spoke(4, r0));
    await sleep(200);
    const opened = { open: !panel.hidden, active: cells()[4].active };
    // a short drag: twelve pixels down, held, let go
    const a = mid();
    on(a, 'pointerdown', a.y);
    for (let k = 1; k <= 4; k++) { on(a, 'pointermove', a.y + 3 * k); await sleep(40); }
    const followed = shift();
    on(a, 'pointerup', a.y + 12);
    await sleep(400);
    const short = { open: !panel.hidden, shift: shift(), followed };
    // the slider: a finger dragging it, which is the slider's own
    const sl = el('birdPanelSlider');
    const sb = sl.getBoundingClientRect();
    const sp = { x: sb.x + sb.width / 2, y: sb.y + sb.height / 2 };
    on(sp, 'pointerdown', sp.y, sl);
    for (let k = 1; k <= 5; k++) { on({ x: sp.x + 10 * k, y: sp.y }, 'pointermove', sp.y + 12 * k, sl); await sleep(30); }
    on(sp, 'pointerup', sp.y + 60, sl);
    await sleep(300);
    const slid = { open: !panel.hidden, shift: shift() };
    // More, then a quick swipe down before the value lands
    el('birdPanelMore').click();
    await sleep(500);
    const held = cells()[4].held;
    const want = cells()[4].value;
    const b = mid();
    on(b, 'pointerdown', b.y);
    for (let k = 1; k <= 5; k++) { on(b, 'pointermove', b.y + 16 * k); await sleep(16); }
    on(b, 'pointerup', b.y + 80);
    const during = [];
    for (let k = 0; k < 6; k++) { await sleep(40); during.push(shift()); }
    await sleep(300);
    const swiped = { open: !panel.hidden, active: cells()[4].active, shift: shift(), during, url: decodeURIComponent(location.search) };
    const landed = await waitFor(() => { const s = ctl.readout().spell; return s && Math.abs((s.root ?? -1) - want) < 1e-6; }, 60000);
    ctl.stop();
    window.ring.release(null);
    return { opened, short, slid, held, want, swiped, landed };
  `),
  judge: (r) => {
    const opened = r.opened.open && r.opened.active;
    const short = r.short.open && r.short.followed > 0 && r.short.shift === 0;
    const slid = r.slid.open && r.slid.shift === 0;
    const out = !r.swiped.open && !r.swiped.active && r.swiped.shift === 0 && r.swiped.during.some((y) => y > 40);
    const kept = r.held && r.swiped.url.includes('ro:') && r.landed;
    return {
      ok: opened && short && slid && out && kept,
      why: !opened ? `a tap opened ${JSON.stringify(r.opened)}`
        : !short ? `a short drag left the panel ${JSON.stringify(r.short)}`
        : !slid ? `a drag on the slider left the panel ${JSON.stringify(r.slid)}`
        : !out ? `a swipe down left the panel ${JSON.stringify(r.swiped)}`
        : `the value pressed before the swipe did not land (${JSON.stringify({ held: r.held, want: r.want, url: r.swiped.url, landed: r.landed })})`,
      note: `a tap opened Root's panel; twelve pixels down carried it ${r.short.followed} px and it sprang back, open; a drag on the slider left it `
        + `open; a swipe of eighty pixels after a press of More carried it down (${r.swiped.during.map((y) => Math.round(y)).join(', ')} px) and closed it, `
        + `Root no longer the bird in hand, and the pressed ${r.want} landed at its phrase line`,
    };
  },
});

SCENARIOS.push({
  name: 'the view\'s mixer leaves with the view, and a resting box is dim',
  area: 'view',
  query: 'v=2&seed=5',
  quiet: true,
  page: body(`
    await started(8000);
    await waitFor(() => ctl.playing && ctl.mix && ctl.mix.state.elapsed > 0.5, 8000);
    const mix = ctl.mix;
    await bounded(window.ring.machine.open(), 12000);
    await waitFor(() => document.querySelector('[role="button"][aria-label="Mute kick"]'), 8000);
    const out = { openedOn: ctl.sourceMixOn };
    const press = (label) => document.querySelector('[role="button"][aria-label="' + label + '"]')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    press('Mute kick');
    await sleep(200);
    out.muted = { on: ctl.sourceMixOn, mute: ctl.sourceMix.mute.join(',') };
    // a box's dimming is on the box, or — where the box carries a control a
    // hand can press, which is never dimmed (M1) — on its drawing under it
    const opOf = (b) => b.hasAttribute('opacity') ? +b.getAttribute('opacity') : b.querySelector(':scope > g[opacity]') ? +b.querySelector(':scope > g[opacity]').getAttribute('opacity') : 1;
    const boxes = [...document.querySelectorAll('[data-box]')].map((b) => ({ state: b.getAttribute('data-state'), op: opOf(b) }));
    out.resting = boxes.filter((b) => b.state === 'gated' || b.state === 'idle');
    // A resting box is dimmed to 0.45, a resting chip, strip or row to 0.5
    // (\`view.tsx\`): the check knew the first alone and passed only while seed 5
    // had no resting strip (the reconciled review of 09-24, R133).
    out.wrong = boxes.filter((b) => (b.state === 'gated' || b.state === 'idle') ? ![0.45, 0.5].includes(b.op) : b.op !== 1).length;
    window.ring.machine.close();
    await sleep(300);
    out.closed = { on: ctl.sourceMixOn, mute: ctl.sourceMix.mute.join(','), playing: ctl.playing && ctl.mix === mix };
    await bounded(window.ring.machine.open(), 12000);
    await waitFor(() => document.querySelector('[role="button"][aria-label="Mute kick"]'), 8000);
    out.reopened = document.querySelector('[role="button"][aria-label="Mute kick"]').getAttribute('aria-pressed');
    window.ring.machine.close();
    ctl.stop();
    await sleep(300);
    return out;
  `),
  judge: (r) => ({
    ok: r.openedOn === false && r.muted.on && r.muted.mute === 'kick' && !r.wrong
      && r.closed.on === false && r.closed.mute === '' && r.closed.playing && r.reopened === 'false',
    why: `opening installed a mixer ${r.openedOn}; a mute left ${JSON.stringify(r.muted)}; ${r.wrong} boxes drawn at the wrong opacity; `
      + `closing left ${JSON.stringify(r.closed)}; the view opened again with Mute kick pressed ${r.reopened}`,
    note: `opening the view installed no mixer; Mute kick put one in with kick muted; ${r.resting.length} resting boxes were dim at 0.45 or 0.5 and `
      + `every other at 1 with the controls on them; closing took the mixer out with the set still on the same mix, and the view opened again clean`,
  }),
});

// **An export never stops the music** (the never-stops rule, and Eugene on
// 09-22: the per-instrument WAV stays, private, and renders beside the set).
// The control exists only in a build of the private tier, so on a release build
// this says the export is not there — which is the other half of the rule — and
// passes; pointed at `npm run build:preview`'s output it presses ↓ on a lane
// while the set plays and holds the transport to not having noticed.
SCENARIOS.push({
  name: 'a per-instrument export renders beside the set and never stops it',
  area: 'view',
  query: 'v=2&seed=5&view=machine',
  quiet: true,
  deadline: 120000,
  page: body(`
    await waitFor(() => document.querySelector('[data-box^="lane:"]'), 8000);
    await started(8000);
    await waitFor(() => ctl.playing && ctl.mix && ctl.mix.state.elapsed > 1, 8000);
    // the WAV tool is in a source strip's popover (round M1), and nowhere else
    const strip = [...document.querySelectorAll('[role="button"][aria-label^="Strip "]')].find((g) => g.getAttribute('aria-disabled') !== 'true');
    if (strip) strip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(200);
    const button = document.querySelector('.desk-pop button[aria-label^="Export "]');
    if (!button) { ctl.stop(); return { absent: true, full: !![...document.querySelectorAll('button')].find((b) => /track wav/i.test(b.textContent)) }; }
    const mix = ctl.mix, late = window.deepHouse.late.count;
    const seen = [];
    button.click();
    const began = await waitFor(() => ctl.state.render.busy, 4000);
    while (ctl.state.render.busy) { seen.push(ctl.playing && ctl.mix === mix); await sleep(100); if (seen.length > 600) break; }
    const out = { absent: false, began, samples: seen.length, stopped: seen.filter((x) => !x).length,
      playing: ctl.playing && ctl.mix === mix, ok: ctl.state.render.ok, note: ctl.state.render.note,
      late: window.deepHouse.late.count - late, label: button.getAttribute('aria-label') };
    ctl.stop();
    await sleep(300);
    return out;
  `),
  judge: (r) => r.absent
    ? { ok: !r.full, why: r.full ? 'the full-track export is still on the page' : '',
      note: 'this build is the release tier: no per-instrument export and no full-track export on the page' }
    : {
      // A render in the page costs the live set a few late notes on the main
      // thread, as *an offline render while a set plays* has always said and
      // reported rather than gated; what is held here is that it never stops.
      ok: r.began && r.ok === true && !r.stopped && r.playing,
      why: `the export began ${r.began}, ended ${r.ok} (${r.note}); the set was off its mix at ${r.stopped} of ${r.samples} looks, playing after ${r.playing}, ${r.late} notes late`,
      note: `"${r.label}" rendered "${r.note}" offline while the set played on the same mix at every one of ${r.samples} looks (${r.late} notes reached late to the render's main-thread work)`,
    },
});

// --- the machine view, round M1 (09-25) ----------------------------------------
//
// Eugene's ten items, each held where a browser is the only judge: the readings
// tiled, a strip's buttons out of one finger's reach of each other, a press
// drawn in the frame it lands in, the popover's fine steps, the WAV tool in the
// popover and only there, the bus column's two areas, every wire in a lane of
// its own, and the three live controls moving a reading and writing a line.

/** Open the view on a playing set, in a page of the row's own or the runner's. */
const OPEN_VIEW = `
  ${LEDGER_SHOWN}
  await started();
  await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
  await bounded(window.ring.machine.open(), 12000);
  await sleep(500);
`;

/** How many rows the readings' tiles stand in, and how many tiles a row holds. */
const TILES = `
  const facts = [...document.querySelectorAll('#machine .fact')];
  const tops = [...new Set(facts.map((f) => Math.round(f.getBoundingClientRect().top)))];
  const perRow = Math.max(...tops.map((t) => facts.filter((f) => Math.round(f.getBoundingClientRect().top) === t).length));
  const list = document.querySelector('#machine .list').getBoundingClientRect();
  const side = document.querySelector('#machine .pane.side').getBoundingClientRect();
  // a row is full when its tiles reach both edges of the list
  const ragged = tops.filter((t) => { const row = facts.filter((f) => Math.round(f.getBoundingClientRect().top) === t).map((f) => f.getBoundingClientRect());
    return Math.min(...row.map((r) => r.left)) > list.left + 2 || Math.max(...row.map((r) => r.right)) < list.right - 2; }).length;
  const last = facts[facts.length - 1];
  const tiles = { facts: facts.length, rows: tops.length, perRow, height: Math.round(list.height), side: Math.round(side.width),
    narrow: facts.filter((f) => !f.classList.contains('wide')).length, wide: facts.filter((f) => f.classList.contains('wide')).map((f) => f.dataset.fact),
    strategy: facts.some((f) => f.dataset.fact === 'strategy'), last: last.dataset.fact,
    lastFull: Math.abs(last.getBoundingClientRect().width - list.width) < 2, ragged };
`;

SCENARIOS.push({
  name: 'the readings are tiles three to a row with no ragged row, the engine left to its keys, and the spell last, end to end',
  area: 'view',
  query: 'v=2&seed=1',
  drive: async (page) => {
    const out = {};
    for (const [name, opts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]]) {
      const own = await ownPage(page, opts);
      try {
        out[name] = await own.page.evaluate(body(OPEN_VIEW + TILES + `window.ring.machine.close(); ctl.stop(); return tiles;`));
      } finally { await own.close(); }
    }
    return out;
  },
  judge: (r) => {
    // M3 (Eugene): no STRATEGY tile — the engine keys above say it — the
    // numbers three to a row with no ragged row, a sentence a row of its own,
    // and the spell last, end to end
    const good = (t) => t && !t.strategy && t.perRow === 3 && !t.ragged && t.rows === Math.ceil(t.narrow / 3) + t.wide.length
      && t.last === 'spell' && t.lastFull;
    return {
      ok: good(r.desktop) && good(r.phone) && r.desktop.side >= 330,
      why: `desktop ${JSON.stringify(r.desktop)}, phone ${JSON.stringify(r.phone)}`,
      note: `${r.desktop.narrow} readings stand three to a row in ${Math.ceil(r.desktop.narrow / 3)} full rows, then ${r.desktop.wide.length > 1 ? `${r.desktop.wide.slice(0, -1).join(', ')} a row each and ` : ''}the spell last, end to end — `
        + `${r.desktop.rows} rows in a ${r.desktop.side} px column (${r.desktop.height} px tall) and ${r.phone.rows} on a phone (${r.phone.height} px); no STRATEGY tile, since the engine keys above say it`,
    };
  },
});

SCENARIOS.push({
  name: 'a source strip\'s buttons are a finger apart, the same on every strip',
  area: 'view',
  query: 'v=2&seed=1',
  page: body(OPEN_VIEW + `
    const rows = [...document.querySelectorAll('#machine [data-box^="lane:"]')];
    const strips = [];
    let overlap = 0, nearest = Infinity, twoAtOnce = 0;
    for (const row of rows) {
      row.scrollIntoView({ block: 'center', inline: 'nearest' });
      await sleep(20);
      const at = row.getBoundingClientRect();
      const keys = [...row.querySelectorAll('.desk-strip > [role="button"], .desk-strip > g > [role="button"]')]
        .map((b) => { const r = b.querySelector('rect').getBoundingClientRect(); return { name: b.getAttribute('aria-label').split(' ')[0], x: r.x - at.x, ax: r.x, y: r.y, w: r.width, h: r.height }; });
      strips.push(keys);
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i], b = keys[j];
        const gap = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
        nearest = Math.min(nearest, gap);
        if (gap < 0) overlap++;
      }
      // from every edge of a button, the element under the finger is that button and no other
      for (const k of keys) for (const [fx, fy] of [[0.05, 0.5], [0.95, 0.5], [0.5, 0.05], [0.5, 0.95]]) {
        const e = document.elementFromPoint(k.ax + k.w * fx, k.y + k.h * fy);
        const hit = e && e.closest('[role="button"]');
        if (!hit || hit.getAttribute('aria-label').split(' ')[0] !== k.name) twoAtOnce++;
      }
    }
    const sig = (keys) => keys.map((k) => k.name + '@' + Math.round(k.x) + '/' + Math.round(k.w) + 'x' + Math.round(k.h)).join(' ');
    const same = strips.every((k) => sig(k) === sig(strips[0]));
    window.ring.machine.close(); ctl.stop();
    return { strips: strips.length, keys: strips[0] ? strips[0].length : 0, overlap, nearest: Math.round(nearest * 10) / 10, twoAtOnce, same, sig: strips[0] ? sig(strips[0]) : '' };
  `),
  judge: (r) => ({
    ok: r.strips >= 10 && r.keys === 3 && !r.overlap && r.nearest >= 6 && !r.twoAtOnce && r.same,
    why: `${r.strips} strips of ${r.keys} keys: ${r.overlap} overlaps, the nearest two ${r.nearest} px apart, ${r.twoAtOnce} edge points hit another key, all alike ${r.same} (${r.sig})`,
    note: `${r.strips} source strips carry the same three keys (${r.sig}); no two touch, the nearest are ${r.nearest} px apart, and a finger on any edge of one is on that one`,
  }),
});

SCENARIOS.push({
  name: 'every press of a strip\'s mute, solo and sends is drawn in the frame it lands in, twenty times over, by a finger and a mouse',
  area: 'view',
  query: 'v=2&seed=5',
  deadline: 150000,
  drive: async (page) => {
    const out = {};
    for (const [name, opts] of [['finger', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }], ['mouse', { viewport: { width: 1440, height: 900 } }]]) {
      const own = await ownPage(page, opts);
      const p = own.page;
      try {
        await p.evaluate(body(OPEN_VIEW + 'return true;'));
        const labels = await p.evaluate(() => [...document.querySelectorAll('#machine [role="button"][aria-pressed]')]
          .filter((g) => g.getAttribute('aria-disabled') !== 'true').map((g) => g.getAttribute('aria-label')).filter((l) => /^(Mute|Solo) /.test(l)).slice(0, 4));
        const misses = [];
        let presses = 0;
        for (const label of labels) {
          const loc = p.locator(`#machine [role="button"][aria-label="${label}"]`).first();
          await loc.scrollIntoViewIfNeeded();
          for (let i = 0; i < 20; i++) {
            const was = await loc.getAttribute('aria-pressed');
            const bb = await loc.boundingBox();
            if (name === 'finger') await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
            else await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
            // two frames: the frame of the press, and the one it is drawn in
            const now = await p.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(null)))).then(() => null));
            void now;
            const is = await loc.getAttribute('aria-pressed');
            presses++;
            if (is === was) misses.push(`${label} ${i}`);
            await p.waitForTimeout(60);
          }
        }
        const lines = await p.evaluate(() => window.ring.machine.snapshot().ledger.filter((e) => e.kind === 'desk').length);
        await p.evaluate(() => { window.ring.machine.close(); window.ring.control.stop(); });
        out[name] = { labels, presses, misses, lines };
      } finally { await own.close(); }
    }
    return out;
  },
  judge: (r) => ({
    ok: ['finger', 'mouse'].every((k) => r[k].labels.length >= 4 && r[k].presses >= 80 && !r[k].misses.length),
    why: `finger: ${r.finger.misses.length} of ${r.finger.presses} presses not drawn (${r.finger.misses.slice(0, 4).join(', ')}); mouse: ${r.mouse.misses.length} of ${r.mouse.presses} (${r.mouse.misses.slice(0, 4).join(', ')})`,
    note: `${r.finger.presses} taps of a finger and ${r.mouse.presses} clicks, 60 ms apart, on ${r.finger.labels.join(', ')}: every one drawn two frames after it landed, `
      + `where on the build before round M1, whose keys were drawn from the view's own snapshot (six a second on a coarse pointer), 69 of 80 taps and 64 of 80 clicks were not; the ledger took the presses as desk lines`,
  }),
});

SCENARIOS.push({
  name: 'a strip\'s popover steps its level by a percent at a time and writes one line a step',
  area: 'view',
  query: 'v=2&seed=1',
  page: body(OPEN_VIEW + `
    const key = [...document.querySelectorAll('#machine [role="button"][aria-label^="Strip "]')].find((g) => g.getAttribute('aria-disabled') !== 'true');
    const label = key.getAttribute('aria-label').replace('Strip ', '');
    key.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(150);
    const pop = document.querySelector('.desk-pop');
    const voice = pop.querySelector('.desk-row .desk-name').textContent;
    const up = pop.querySelector('button[aria-label$="up a step"]');
    const down = pop.querySelector('button[aria-label$="down a step"]');
    const level = () => Math.round((ctl.sourceMix.gain && ctl.sourceMix.gain[voice] != null ? ctl.sourceMix.gain[voice] : 1) * 100);
    const lines0 = window.ring.machine.snapshot().ledger.filter((e) => e.kind === 'desk').length;
    const seen = [level()];
    for (let i = 0; i < 3; i++) { up.click(); await sleep(40); seen.push(level()); }
    for (let i = 0; i < 5; i++) { down.click(); await sleep(40); seen.push(level()); }
    const shown = pop.querySelector('.desk-row output').textContent;
    await sleep(200);
    const all = window.ring.machine.snapshot().ledger.filter((e) => e.kind === 'desk');
    const lines = all;
    const desk = all.length - lines0;
    const open = !!document.querySelector('.desk-pop');
    window.ring.machine.close();
    const after = { on: ctl.sourceMixOn };
    ctl.stop();
    return { label, voice, seen, shown, desk, open, after, last: lines.length ? lines[lines.length - 1].what : '' };
  `),
  judge: (r) => ({
    ok: r.seen.join(',') === '100,101,102,103,102,101,100,99,98' && r.shown === '98 %' && r.desk === 8 && r.open && !r.after.on,
    why: `${r.voice} went ${r.seen.join(' → ')} and reads ${r.shown}; ${r.desk} desk lines; the popover open ${r.open}; after the close the mixer is on ${r.after.on}`,
    note: `the + and − of ${r.label}'s popover took ${r.voice} ${r.seen.join(' → ')} %, one percent a press, with the popover open throughout and one ledger line a press ("${r.last}"); the close took the mixer out`,
  }),
});

SCENARIOS.push({
  name: 'the WAV tool is in a strip\'s popover and nowhere else',
  area: 'view',
  query: 'v=2&seed=1',
  page: body(OPEN_VIEW + `
    const onRows = document.querySelectorAll('#machine svg [aria-label^="Export "]').length;
    const key = [...document.querySelectorAll('#machine [role="button"][aria-label^="Strip "]')].find((g) => g.getAttribute('aria-disabled') !== 'true');
    key.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(150);
    const inPop = document.querySelectorAll('.desk-pop .desk-tools button[aria-label^="Export "]').length;
    const tools = document.querySelectorAll('.desk-pop .desk-tools').length;
    // the whole theme's record row (record-r1) is the set's output and not an
    // instrument's: it stands under the ledger's title, and is counted apart
    const sheet = [...document.querySelectorAll('#machine button')].filter((b) => /wav|export/i.test(b.textContent) && !b.closest('.desk-pop') && !b.closest('.record-tools')).length;
    const record = document.querySelectorAll('#machine [data-slot="capture"] > .capture-block .record-tools').length;
    window.ring.machine.close(); ctl.stop();
    return { onRows, inPop, tools, sheet, record };
  `),
  judge: (r) => ({
    ok: !r.onRows && !r.sheet && r.inPop === r.tools && r.inPop <= 1 && r.record === r.inPop,
    why: `${r.onRows} export keys on the rows, ${r.sheet} elsewhere, ${r.inPop} in the popover's ${r.tools} tool rows, ${r.record} CAPTURE blocks`,
    note: r.inPop
      ? 'this build is the private tier: the WAV tool is in the strip\'s popover, under "tools", and on no row and nowhere else, and the whole theme\'s keys stand in the CAPTURE block'
      : 'this build is the release tier: no WAV tool in the popover, on a row or anywhere else, and no record row',
  }),
});

// --- the record row: the whole theme as a WAV, and the ring as a video (record-r1, 09-25)
//
// Eugene: *"a WAV recording of the current track from 0 to the end of the
// track timer … and explore whether we can do the same but also record a video
// of the ring"*. Both tools are the private tier's (his standing word of 09-22:
// a full-track export is never public), so on a release build each row says
// the tool is absent — no row, no handle — and passes; on a preview build it
// presses the tool while the set plays, takes the downloads, and holds the
// files to the plan, the master and the link.

/** A 24-bit WAV's header and samples, read in the page. */
const WAV24 = `
  const readWav = async (blob) => {
    const b = new Uint8Array(await blob.arrayBuffer());
    const dv = new DataView(b.buffer);
    const ch = dv.getUint16(22, true), rate = dv.getUint32(24, true), bits = dv.getUint16(34, true), size = dv.getUint32(40, true);
    const frames = size / (ch * bits / 8);
    const L = new Float32Array(frames), R = new Float32Array(frames);
    for (let i = 0, at = 44; i < frames; i++) for (let c = 0; c < 2; c++, at += 3) {
      let v = b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);
      if (v & 0x800000) v -= 0x1000000;
      (c ? R : L)[i] = v / 8388608;
    }
    return { ch, rate, bits, frames, L, R };
  };
  // every Blob the page hands to a download, kept, so the page can read the bytes the download got
  window.__saved = [];
  const made = URL.createObjectURL;
  URL.createObjectURL = function (o) { if (o instanceof Blob) window.__saved.push(o); return made.call(URL, o); };
`;

/** Press a record button while the set plays, and watch the set until the tool is done. */
const PRESS_RECORD = (label) => `
  const mix = ctl.mix, late = window.deepHouse.late.count, began = performance.now();
  document.querySelector('.record-tools button[aria-label="${label}"]').click();
  const seen = [];
  await waitFor(() => ctl.state.render.busy, 5000);
  for (let i = 0; i < 1200 && (ctl.state.render.busy || document.querySelector('.record-tools button.running')); i++) {
    seen.push(ctl.playing && ctl.mix === mix);
    await sleep(500);
  }
  // the view's snapshot is taken a few times a second: the tool's own line is waited for
  const lineNow = () => (window.ring.machine.snapshot().ledger.filter((e) => e.kind === 'record').pop() || {}).what || '';
  await waitFor(() => lineNow() === ctl.state.render.note, 3000);
  const press = { ok: ctl.state.render.ok, note: ctl.state.render.note, looks: seen.length, stopped: seen.filter((x) => !x).length,
    late: window.deepHouse.late.count - late, seconds: +((performance.now() - began) / 1000).toFixed(1), line: lineNow() };
`;

/** Wait for `n` downloads on a page, and read each: its name, its size and its bytes' path. */
const takeDownloads = async (list, n, ms = 20000) => {
  for (const until = Date.now() + ms; list.length < n && Date.now() < until;) await new Promise((r) => setTimeout(r, 100));
  return Promise.all(list.map(async (d) => ({ name: d.suggestedFilename(), path: await d.path() })));
};

SCENARIOS.push({
  name: 'the whole theme records as a WAV while the set plays: the plan\'s length, under the master\'s ceiling, the suite\'s sixteen bars, and its link beside it',
  area: 'view',
  // alone: a whole theme rendered in the page is the heaviest thing a row does
  serial: true,
  deadline: 600000,
  query: 'v=2&seed=1&theme=1',
  drive: async (page) => {
    const own = await ownPage(page, { viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const got = [];
    own.page.on('download', (d) => got.push(d));
    try {
      const r = await own.page.evaluate(body(OPEN_VIEW + WAV24 + `
        await waitFor(() => document.querySelector('.record-tools'), 5000);
        if (!document.querySelector('.record-tools button[aria-label="Record the whole theme as a WAV"]')) {
          const out = { absent: true, row: !!document.querySelector('.record-tools'), handle: !!window.deepHouseRecord };
          window.ring.machine.close(); ctl.stop();
          return out;
        }
        const t = ctl.state.track;
        const plan = { bars: t.bars, barSeconds: t.barSeconds, timer: t.bars * t.barSeconds, duration: window.deepHouse.programOf(t).duration, theme: ctl.state.themeIndex };
        ${PRESS_RECORD('Record the whole theme as a WAV')}
        // the file the download got, read back, against the suite's own window of the same plan
        const blob = window.__saved.find((b) => b.type === 'audio/wav');
        const w = await readWav(blob);
        const bars = 16, rate = w.rate, n = Math.round(bars * plan.barSeconds * rate);
        const program = window.deepHouse.programOf(t);
        const slice = window.deepHouse.sliceProgram(program, { from: 0, to: bars * plan.barSeconds, tail: 1.5 });
        const render = () => window.deepHouse.renderProgram(slice, { sampleRate: rate });
        const a = await render(), b = await render();
        const worst = (x, y) => { let m = 0, at = 0; for (const c of [0, 1]) { const p = x[c], q = y[c]; for (let i = 0; i < n; i++) { const d = Math.abs(p[i] - q[i]); if (d > m) { m = d; at = i; } } } return { worst: m, at: +(at / rate).toFixed(3) }; };
        const file = [w.L, w.R], one = [a.getChannelData(0), a.getChannelData(1)], two = [b.getChannelData(0), b.getChannelData(1)];
        const out = { absent: false, plan, press, wav: { ch: w.ch, rate: w.rate, bits: w.bits, frames: w.frames, seconds: w.frames / w.rate, bytes: blob.size },
          bars, againstSuite: worst(file, one), floor: worst(one, two) };
        window.ring.machine.close(); ctl.stop();
        return out;
      `));
      if (r.absent) return r;
      const files = await takeDownloads(got, 2);
      const wav = files.find((f) => /\.wav$/.test(f.name)), txt = files.find((f) => /\.txt$/.test(f.name));
      // the downloaded file itself, read in node: its bytes, its length and its true peak
      const meter = await import('@deep-house/engine/meter');
      const buf = wav ? fs.readFileSync(wav.path) : Buffer.alloc(0);
      const frames = buf.length > 44 ? buf.readUInt32LE(40) / 6 : 0;
      const L = new Float32Array(frames), R = new Float32Array(frames);
      for (let i = 0, at = 44; i < frames; i++) for (let c = 0; c < 2; c++, at += 3) { let v = buf[at] | (buf[at + 1] << 8) | (buf[at + 2] << 16); if (v & 0x800000) v -= 0x1000000; (c ? R : L)[i] = v / 8388608; }
      const ceiling = JSON.parse(fs.readFileSync(new URL('./scenes.json', import.meta.url), 'utf8')).gates.truePeakCeilingDbTP;
      return { ...r, names: files.map((f) => f.name), bytes: buf.length, sameBytes: buf.length === r.wav.bytes, truePeak: meter.truePeak([L, R]), ceiling,
        link: txt ? fs.readFileSync(txt.path, 'utf8').split('\n')[0] : '' };
    } finally { await own.close(); }
  },
  judge: (r) => {
    if (r.absent) return { ok: !r.row && !r.handle, why: `a release build carries the record row ${r.row} and its handle ${r.handle}`, note: 'this build is the release tier: no record row under the ledger\'s title and no handle on the page' };
    const bar = r.plan.barSeconds;
    // the suites' floor: the same window rendered twice, and never under the taps gate's thousandth
    const tol = Math.max(1e-3, 4 * r.floor.worst);
    const lengthOk = Math.abs(r.wav.seconds - r.plan.duration) < 1 / r.wav.rate + 1e-9 && r.wav.seconds - r.plan.timer >= 0 && r.wav.seconds - r.plan.timer < bar + 4 + 1e-6;
    const ok = r.press.ok === true && !r.press.stopped && r.wav.ch === 2 && r.wav.rate === 48000 && r.wav.bits === 24 && r.sameBytes && lengthOk
      && r.truePeak <= r.ceiling && r.againstSuite.worst <= tol
      && r.names.includes('deep-house-1-t1-v2.wav') && r.names.includes('deep-house-1-t1-v2.txt')
      && /[?&]seed=1&v=2(&|$)/.test(r.link) && !/[?&]theme=/.test(r.link) /* K34 */ && !/[?&]bar=/.test(r.link) && /^recorded seed 1 theme 1 house-v2 — \d+:\d\d in \d+ s$/.test(r.press.line);
    return {
      ok,
      why: `pressed: ${JSON.stringify(r.press)}; the file ${JSON.stringify(r.wav)} (${r.bytes} bytes downloaded, the same as the page's ${r.sameBytes}) against the plan ${JSON.stringify(r.plan)}; `
        + `true peak ${r.truePeak} dBTP against ${r.ceiling}; the first ${r.bars} bars against the suite's window ${JSON.stringify(r.againstSuite)} with the floor ${JSON.stringify(r.floor)} (tolerance ${tol}); names ${r.names.join(', ')}; link ${r.link}`,
      note: `"${r.press.line}": ${r.wav.seconds.toFixed(2)} s at 48 kHz, 24-bit — the timer's ${r.plan.timer.toFixed(2)} s and the plan's four-second tail, to the sample — `
        + `true peak ${r.truePeak} dBTP under the ${r.ceiling} dBTP ceiling, its first ${r.bars} bars the suite's own window to ${r.againstSuite.worst.toExponential(2)} (two renders of that window differ by ${r.floor.worst.toExponential(2)}), `
        + `with ${r.names.join(' and ')} downloaded and the link ${r.link.replace(/^https?:\/\/[^?]*/, '')}; the set played on its own mix at every one of ${r.press.looks} looks (${r.press.late} notes late)`,
    };
  },
});

SCENARIOS.push({
  name: 'the ring records as a video with the theme\'s audio: an MP4 as long as the theme, and a frame from its middle in the ring\'s own colour',
  area: 'view',
  serial: true,
  deadline: 600000,
  // the shortest theme of the first forty seeds under house-v2, in a colour that is not the house's gold
  query: 'v=2&seed=32&theme=1&spell=ember:0.90,spark:0.80',
  drive: async (page) => {
    const own = await ownPage(page, { viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const got = [];
    own.page.on('download', (d) => got.push(d));
    try {
      const r = await own.page.evaluate(body(OPEN_VIEW + WAV24 + `
        await waitFor(() => document.querySelector('.record-tools'), 5000);
        const button = document.querySelector('.record-tools button[aria-label="Record the whole theme as a video of the ring"]');
        if (!button) {
          const out = { absent: true, row: !!document.querySelector('.record-tools'), handle: !!window.deepHouseRecord };
          window.ring.machine.close(); ctl.stop();
          return out;
        }
        if (button.disabled) { const why = button.title; window.ring.machine.close(); ctl.stop(); return { absent: false, unsupported: why }; }
        const t = ctl.state.track;
        const plan = { duration: window.deepHouse.programOf(t).duration, hex: window.ring.colour().hex };
        ${PRESS_RECORD('Record the whole theme as a video of the ring')}
        const said = document.querySelector('.record-tools .record-line').textContent;
        const blob = window.__saved.find((b) => b.type === 'video/mp4');
        if (!blob) { window.ring.machine.close(); ctl.stop(); return { absent: false, press, said, noFile: true }; }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const file = window.deepHouseRecord.readMp4(bytes);
        const v = file.tracks.find((x) => x.type === 'vide'), a = file.tracks.find((x) => x.type === 'soun');
        // the key frame at a minute, decoded, and the light of its rim
        const k = v.keys.map((x) => x - 1).filter((x) => x <= 60 * 30).pop();
        let pixels = null, err = null;
        const dec = new VideoDecoder({
          output: (f) => {
            const c = document.createElement('canvas'); c.width = f.displayWidth; c.height = f.displayHeight;
            const g = c.getContext('2d'); g.drawImage(f, 0, 0); f.close();
            const img = g.getImageData(0, 0, c.width, c.height).data, W = c.width, C = W / 2;
            let n = 0, r = 0, gg = 0, b = 0;
            for (let y = 0; y < W; y += 2) for (let x = 0; x < W; x += 2) {
              const d = Math.hypot(x - C, y - C) / W;
              if (d < 0.36 || d > 0.46) continue;
              const i = (y * W + x) * 4, m = Math.max(img[i], img[i + 1], img[i + 2]);
              if (m < 120) continue;
              n++; r += img[i]; gg += img[i + 1]; b += img[i + 2];
            }
            // the corners outside the ring: black, through the codec (the bands are the stage row's)
            let edge = 0;
            for (let y = 0; y < W; y += 2) for (let x = 0; x < W; x += 2) {
              if (!(Math.hypot(x - C, y - C) > W * 0.5)) continue;
              const i = (y * W + x) * 4; edge = Math.max(edge, img[i], img[i + 1], img[i + 2]);
            }
            pixels = { n, rgb: [r / n, gg / n, b / n].map(Math.round), width: W, edge };
          },
          error: (e) => { err = String(e); },
        });
        dec.configure({ codec: 'avc1.640028', description: v.avcC });
        dec.decode(new EncodedVideoChunk({ type: 'key', timestamp: Math.round(k * 1e6 / 30), data: bytes.subarray(v.offsets[k], v.offsets[k] + v.sizes[k]) }));
        await dec.flush().catch((e) => { err = String(e); });
        const out = { absent: false, plan, press, said, size: blob.size, seconds: file.seconds, video: { samples: v.samples, seconds: v.seconds, width: v.width, height: v.height, keys: v.keys.length },
          audio: { samples: a.samples, seconds: a.seconds }, frameAt: +(k / 30).toFixed(2), pixels, err, saved: window.__saved.map((b) => b.type) };
        window.ring.machine.close(); ctl.stop();
        return out;
      `));
      if (r.absent || r.unsupported || r.noFile) return r;
      const files = await takeDownloads(got, 3);
      const mp4 = files.find((f) => /\.mp4$/.test(f.name));
      return { ...r, names: files.map((f) => f.name), downloaded: mp4 ? fs.statSync(mp4.path).size : 0, expected: ringColour({ ember: 0.9, spark: 0.8 }).hex };
    } finally { await own.close(); }
  },
  judge: (r) => {
    if (r.absent) return { ok: !r.row && !r.handle, why: `a release build carries the record row ${r.row} and its handle ${r.handle}`, note: 'this build is the release tier: no record row and no ring as a video' };
    if (r.unsupported) return { ok: false, why: `the video tool is off in this engine: ${r.unsupported}` };
    if (r.noFile) return { ok: false, why: `no MP4 was made: ${JSON.stringify(r.press)} "${r.said}"` };
    const hue = (rgb) => { const [R, G, B] = rgb.map((x) => x / 255), M = Math.max(R, G, B), m = Math.min(R, G, B), d = M - m; if (!d) return 0; const h = M === R ? ((G - B) / d) % 6 : M === G ? (B - R) / d + 2 : (R - G) / d + 4; return (h * 60 + 360) % 360; };
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const apart = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
    const seen = r.pixels ? hue(r.pixels.rgb) : NaN, want = hue(hex(r.expected)), gold = hue(hex('#f2c14e'));
    const ok = r.press.ok === true && !r.press.stopped && r.size === r.downloaded && r.names.some((n) => /^deep-house-32-t1-v2-spell-e90s80\.mp4$/.test(n))
      && Math.abs(r.seconds - r.plan.duration) < 0.1 && Math.abs(r.video.seconds - r.plan.duration) < 1 / 30 + 1e-6 && r.video.width === 1080 && r.video.height === 1080
      && r.video.samples === Math.round(r.plan.duration * 30) && Math.abs(r.audio.seconds - r.plan.duration) < 0.1
      && !r.err && r.pixels && r.pixels.n > 500 && apart(seen, want) <= 15 && apart(seen, gold) > apart(seen, want) && r.plan.hex === r.expected
      && r.pixels.edge <= 12
      && /^filmed seed 32 theme 1 house-v2 — \d+:\d\d in \d+ s, the ring at [\d.]+× real time$/.test(r.press.line);
    return {
      ok,
      why: `pressed ${JSON.stringify(r.press)} ("${r.said}"); the file ${r.size} bytes (downloaded ${r.downloaded}), ${r.seconds} s against the plan's ${r.plan.duration}, video ${JSON.stringify(r.video)}, audio ${JSON.stringify(r.audio)}; `
        + `the frame at ${r.frameAt} s ${JSON.stringify(r.pixels)} ${r.err || ''}: hue ${seen.toFixed(1)} against the spell's ${r.expected} (${want.toFixed(1)}) and the house's gold (${gold.toFixed(1)}); the page wore ${r.plan.hex}; names ${r.names.join(', ')}`,
      note: `"${r.press.line}": an MP4 of ${r.seconds.toFixed(2)} s (the plan's ${r.plan.duration.toFixed(2)}), ${r.video.samples} frames of 1080 × 1080 with ${r.video.keys} key frames and ${r.audio.seconds.toFixed(2)} s of AAC, ${(r.size / 1048576).toFixed(1)} MiB, `
        + `beside ${r.names.filter((n) => !/mp4$/.test(n)).join(' and ')}; the key frame at ${r.frameAt} s decoded to a rim of rgb(${r.pixels.rgb.join(', ')}), hue ${seen.toFixed(0)}° against the spell's ${r.expected} at ${want.toFixed(0)}° and the house's gold at ${gold.toFixed(0)}°; `
        + `the set played on its own mix at every one of ${r.press.looks} looks (${r.press.late} notes late)`,
    };
  },
});

// **The key fills while it records** (round R2, Eugene on the preview build:
// *"we need progress showing that it's going — before it was just nothing and
// then boom, the file to download. Use the inner filling of the button that
// starts the recording itself as the progress."*). The fill's width is sampled
// every 500 ms by a timer of the page's own — a timer that did not fire is a
// page that could not paint either — and every value it ever took is kept, as
// is the value it stood at when each download's file was made.
const WATCH_FILL = (label) => `
  const key = () => document.querySelector('.record-tools button[data-tier]:nth-of-type(' + (${JSON.stringify(label)} === 'wav' ? 1 : 2) + ')');
  const rect = () => key().querySelector('rect.fill');
  const line = () => document.querySelector('.record-tools .record-line');
  const samples = [], every = [], lines = new Set(), atSave = [];
  const made = URL.createObjectURL;
  URL.createObjectURL = function (o) { if (o instanceof Blob) atSave.push({ type: o.type, p: +rect().getAttribute('data-p') }); return made.call(URL, o); };
  const seen = new MutationObserver(() => { every.push(+rect().getAttribute('data-p')); lines.add(line().textContent); });
  seen.observe(rect(), { attributes: true, attributeFilter: ['data-p'] });
  seen.observe(line(), { childList: true, characterData: true, subtree: true });
  const t0 = performance.now();
  const sampler = setInterval(() => samples.push({ t: Math.round(performance.now() - t0), p: +rect().getAttribute('data-p') }), 500);
  const finish = () => { clearInterval(sampler); seen.disconnect(); URL.createObjectURL = made; };
`;

/** What a fill's record says: rising, seen moving, whole before the save, never starved. */
const judgeFill = (f) => {
  const run = f.samples.filter((x) => x.p > 0);
  const rising = f.every.every((v, i) => i === 0 || v >= f.every[i - 1] || v === 0);
  const moving = new Set(run.map((x) => x.p)).size;
  const gaps = f.samples.slice(1).map((x, i) => x.t - f.samples[i].t);
  const files = f.atSave.filter((x) => !/svg/.test(x.type));
  return { rising, moving, gap: gaps.length ? Math.max(...gaps) : 0, beforeSave: files.map((x) => `${x.type || 'text'} at ${x.p}`), whole: files.length > 0 && files.every((x) => x.p === 1) };
};

// **CAPTURE, above ENGINE** (R2, Eugene on the preview: *"recording tools
// should go into a standalone panel in the left column above the ENGINE
// section; call its header CAPTURE, both buttons inside"*, and his picture of
// the video key wrapping to two lines).
SCENARIOS.push({
  name: 'the capture block stands above ENGINE with its two keys the same size on one line, at 1440 and on a phone, and not at all in a release build',
  area: 'view',
  query: 'v=2&seed=1',
  drive: async (page) => {
    const out = {};
    for (const [name, opts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]]) {
      const own = await ownPage(page, opts);
      try {
        out[name] = await own.page.evaluate(body(OPEN_VIEW + `
          await waitFor(() => document.querySelector('#machine .capture-block .record-tools button'), 4000);
          const slot = document.querySelector('#machine [data-slot="capture"]');
          const block = slot && slot.querySelector('.capture-block');
          const engine = document.querySelector('#machine .engine-block');
          const res = { slot: !!slot, block: !!block, slotEmpty: slot ? slot.childElementCount === 0 : null, handle: !!window.deepHouseRecord };
          if (block) {
            const h = block.querySelector('h2'), eh = engine.querySelector('h2');
            const keys = [...block.querySelectorAll('.record-tools button')].map((b) => { const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), over: b.scrollWidth > b.clientWidth + 1, text: b.textContent.trim() }; });
            Object.assign(res, { title: h.textContent.trim(), titleH: Math.round(h.getBoundingClientRect().height), engineH: Math.round(eh.getBoundingClientRect().height),
              above: slot.nextElementSibling === engine && block.getBoundingClientRect().bottom <= engine.getBoundingClientRect().top + 1,
              sameColumn: !!block.closest('.pane.side'), keys });
          }
          window.ring.machine.close(); ctl.stop();
          return res;
        `));
      } finally { await own.close(); }
    }
    return out;
  },
  judge: (r) => {
    const d = r.desktop, p = r.phone;
    if (!d.block && !p.block) return { ok: d.slot && d.slotEmpty && !d.handle && p.slotEmpty, why: JSON.stringify(r), note: 'this build is the release tier: the slot above ENGINE is empty and there is no capture handle' };
    const good = (x) => x.block && x.title.toLowerCase() === 'capture' && x.titleH === x.engineH && x.above && x.sameColumn && x.keys.length === 2
      && x.keys.every((k) => !k.over && k.h === x.keys[0].h && k.h <= 32) && Math.abs(x.keys[0].w - x.keys[1].w) <= 1;
    return {
      ok: good(d) && good(p),
      why: `desktop ${JSON.stringify(d)}; phone ${JSON.stringify(p)}`,
      note: `CAPTURE stands directly above ENGINE in the left column, its header ${d.titleH} px as ENGINE's is, its keys "${d.keys.map((k) => k.text).join('" and "')}" ${d.keys[0].w} × ${d.keys[0].h} at 1440 and ${p.keys[0].w} × ${p.keys[0].h} on a phone, each on one line`,
    };
  },
});

// **Only the ring in the film** (R2, Eugene: *"for the video recording I only
// want to record the black background and the ring; the page header, the
// bottom footer and the gear buttons should be excluded"*): a frame drawn by the
// stage at a minute in, its markup holding none of the ring's controls, the
// bands where a header and a footer would be and the corners past the ring
// black to the last channel, and the rim in the ring's own colour.
SCENARIOS.push({
  name: 'a video frame is the ring alone on black: no transport key, no tell, black bands top and bottom, and the rim in the ring\'s colour',
  area: 'view',
  query: 'v=2&seed=32&theme=1&spell=ember:0.90,spark:0.80',
  page: body(OPEN_VIEW + `
    await waitFor(() => document.querySelector('.capture-block'), 4000);
    const R = window.deepHouseRecord;
    if (!R) { window.ring.machine.close(); ctl.stop(); return { absent: true }; }
    // a quarter of the way in, so the engraved time rides at three o'clock and not through a band
    const quarter = ctl.state.track.bars * ctl.state.track.barSeconds / 4;
    const st = await R.openStage(R.place().link, 1080);
    for (let i = 0; i < 30; i++) await st.drawAt(quarter - 1 + i / 30);
    const markup = st.markup();
    const g = st.canvas.getContext('2d'), W = 1080, C = 540;
    const img = g.getImageData(0, 0, W, W).data;
    let edge = 0, n = 0, r = 0, gg = 0, b = 0;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, d = Math.hypot(x - C, y - C) / W;
      if (y < 40 || y >= W - 40 || d > 0.5) edge = Math.max(edge, img[i], img[i + 1], img[i + 2]);
      else if (d >= 0.36 && d <= 0.46 && Math.max(img[i], img[i + 1], img[i + 2]) >= 120) { n++; r += img[i]; gg += img[i + 1]; b += img[i + 2]; }
    }
    st.close();
    const out = { absent: false, controls: (markup.match(/data-action=/g) || []).length, tell: /class="tell"/.test(markup), cut: /id="cutFill"/.test(markup),
      readings: /seed 32/i.test(markup), edge, rim: { n, rgb: [r / n, gg / n, b / n].map(Math.round) }, hex: window.ring.colour().hex };
    window.ring.machine.close(); ctl.stop();
    return out;
  `),
  judge: (r) => {
    if (r.absent) return { ok: true, note: 'this build is the release tier: no stage to draw a frame on' };
    const hue = (rgb) => { const [R, G, B] = rgb.map((x) => x / 255), M = Math.max(R, G, B), m = Math.min(R, G, B), d = M - m; if (!d) return 0; const h = M === R ? ((G - B) / d) % 6 : M === G ? (B - R) / d + 2 : (R - G) / d + 4; return (h * 60 + 360) % 360; };
    const want = hue([1, 3, 5].map((i) => parseInt(r.hex.slice(i, i + 2), 16))), seen = hue(r.rim.rgb);
    const apart = Math.min(Math.abs(seen - want) % 360, 360 - (Math.abs(seen - want) % 360));
    return {
      ok: !r.controls && !r.tell && !r.cut && r.readings && r.edge === 0 && r.rim.n > 500 && apart <= 15,
      why: JSON.stringify(r),
      note: `a frame a quarter of the way in holds none of the ring's four keys, no tell and no wait fill, and still the seed; the 40-pixel bands top and bottom and everything past the ring's circle are black to the last channel (brightest ${r.edge}), and the rim reads rgb(${r.rim.rgb.join(', ')}), ${seen.toFixed(0)}° against the ring's ${r.hex} at ${want.toFixed(0)}°`,
    };
  },
});

SCENARIOS.push({
  name: 'the WAV key fills from inside while it records, rising every half second to whole before the file, and a second press cancels',
  area: 'view',
  serial: true,
  deadline: 600000,
  query: 'v=2&seed=32&theme=1&spell=ember:0.90,spark:0.80',
  page: body(OPEN_VIEW + `
    await waitFor(() => document.querySelector('.record-tools'), 5000);
    if (!document.querySelector('.record-tools button[aria-label="Record the whole theme as a WAV"]')) { window.ring.machine.close(); ctl.stop(); return { absent: true }; }
    const job = () => document.querySelector('.record-tools button[data-tier]').className;
    // first a press and a second press: the job stops, nothing is saved, both keys come back
    const blobs0 = [];
    const made0 = URL.createObjectURL;
    URL.createObjectURL = function (o) { if (o instanceof Blob) blobs0.push(o.type); return made0.call(URL, o); };
    document.querySelector('.record-tools button[aria-label="Record the whole theme as a WAV"]').click();
    const filling = await waitFor(() => +document.querySelector('.record-tools rect.fill').getAttribute('data-p') > 0.05, 60000);
    const running = { label: document.querySelector('.record-tools button[data-tier]').getAttribute('aria-label'), video: document.querySelector('.record-tools button[data-tier]:nth-of-type(2)').disabled };
    document.querySelector('.record-tools button[aria-label="Cancel the WAV recording"]').click();
    const stopped = await waitFor(() => !ctl.state.render.busy && !job().includes('running'), 20000);
    await sleep(1500);
    URL.createObjectURL = made0;
    const cancel = { filling, running, stopped, saved: blobs0.length, line: document.querySelector('.record-tools .record-line').textContent,
      fill: document.querySelector('.record-tools rect.fill').getAttribute('data-p'), keys: [...document.querySelectorAll('.record-tools button[data-tier]')].map((b) => b.disabled) };
    // then the whole of it
    ${WATCH_FILL('wav')}
    document.querySelector('.record-tools button[aria-label="Record the whole theme as a WAV"]').click();
    await waitFor(() => ctl.state.render.busy, 5000);
    await waitFor(() => !ctl.state.render.busy, 540000);
    await sleep(800);
    finish();
    const out = { absent: false, cancel, samples, every, lines: [...lines], atSave, ok: ctl.state.render.ok, note: ctl.state.render.note };
    window.ring.machine.close(); ctl.stop();
    return out;
  `),
  judge: (r) => {
    if (r.absent) return { ok: true, note: 'this build is the release tier: no record row' };
    const f = judgeFill(r);
    const lined = r.lines.some((l) => /^rendering · \d+ % · \d+:\d\d · about \d+:\d\d left$/.test(l)) && r.lines.some((l) => /^encoding · /.test(l));
    const c = r.cancel;
    const cancelOk = c.filling && c.running.label === 'Cancel the WAV recording' && c.running.video && c.stopped && !c.saved && /cancelled/.test(c.line) && c.fill === '0.0000' && c.keys.every((d) => !d);
    return {
      ok: r.ok === true && f.rising && f.moving >= 3 && f.whole && f.gap < 1500 && lined && cancelOk,
      why: `fill ${JSON.stringify(f)}; samples ${JSON.stringify(r.samples.map((x) => x.p))}; lines ${JSON.stringify(r.lines.slice(0, 12))}; cancel ${JSON.stringify(c)}; ${r.note}`,
      note: `the WAV key filled from inside through ${f.moving} values sampled every half second (never more than ${f.gap} ms apart, never falling), stood whole when ${f.beforeSave.join(' and ')} were made, `
        + `the line read "${r.lines.find((l) => /left$/.test(l))}"; a second press cancelled it at ${(+r.cancel.fill || 0)} with "${c.line}", nothing saved and both keys back`,
    };
  },
});

SCENARIOS.push({
  name: 'the video key fills from inside through the audio, the frames and the file, rising every half second to whole before the MP4',
  area: 'view',
  serial: true,
  deadline: 600000,
  query: 'v=2&seed=32&theme=1&spell=ember:0.90,spark:0.80',
  page: body(OPEN_VIEW + `
    await waitFor(() => document.querySelector('.record-tools'), 5000);
    const button = document.querySelector('.record-tools button[aria-label="Record the whole theme as a video of the ring"]');
    if (!button) { window.ring.machine.close(); ctl.stop(); return { absent: true }; }
    if (button.disabled) { window.ring.machine.close(); ctl.stop(); return { unsupported: button.title }; }
    ${WATCH_FILL('video')}
    button.click();
    await waitFor(() => ctl.state.render.busy, 5000);
    await waitFor(() => !document.querySelector('.record-tools button[data-tier]:nth-of-type(2)').className.includes('running'), 540000);
    await sleep(800);
    finish();
    const out = { absent: false, samples, every, lines: [...lines], atSave, ok: ctl.state.render.ok, note: ctl.state.render.note };
    window.ring.machine.close(); ctl.stop();
    return out;
  `),
  judge: (r) => {
    if (r.absent) return { ok: true, note: 'this build is the release tier: no record row' };
    if (r.unsupported) return { ok: false, why: r.unsupported };
    const f = judgeFill(r);
    const stages = ['rendering the audio', 'frame ', 'muxing'].map((w) => r.lines.some((l) => l.startsWith(w)));
    const mp4 = r.atSave.find((x) => x.type === 'video/mp4');
    return {
      ok: r.ok === true && f.rising && f.moving >= 10 && mp4 && mp4.p === 1 && f.gap < 1500 && stages.every(Boolean) && r.lines.some((l) => /about \d+:\d\d left$/.test(l)),
      why: `fill ${JSON.stringify(f)}; stages ${stages}; lines ${JSON.stringify(r.lines.filter((l, i) => i % 20 === 0).slice(0, 12))}; ${r.note}`,
      note: `the video key filled from inside through ${f.moving} values sampled every half second (never more than ${f.gap} ms apart, never falling) across the audio, the frames and the file, stood whole when the MP4 was made, `
        + `and the line named each stage ("${r.lines.find((l) => l.startsWith('frame ') && /left$/.test(l))}")`,
    };
  },
});

SCENARIOS.push({
  name: 'the bus column is the effects over the meters, inserts left and sends right',
  area: 'view',
  query: 'v=2&seed=1&bar=18',
  drive: async (page) => {
    const own = await ownPage(page, { viewport: { width: 1440, height: 900 } });
    try {
      return await own.page.evaluate(body(OPEN_VIEW + `
        const r = (sel) => { const e = document.querySelector('#machineDiagram ' + sel); return e ? e.getBoundingClientRect() : null; };
        const all = (sel) => [...document.querySelectorAll('#machineDiagram ' + sel)].map((e) => e.getBoundingClientRect());
        const effects = r('[data-area="effects"]');
        const strips = all('[data-box^="bus:"]');
        const sends = all('[data-box^="send:"]');
        const inserts = all('[data-box^="treat:"]');
        const labels = [...document.querySelectorAll('#machineDiagram text[data-area]')].map((t) => t.textContent);
        const out = {
          effects: !!effects, strips: strips.length, sends: sends.length, inserts: inserts.length, labels,
          above: effects && strips.every((s) => s.top >= effects.bottom - 0.5),
          inside: effects && [...sends, ...inserts].every((b) => b.top >= effects.top && b.bottom <= effects.bottom + 0.5),
          sendsRight: sends.every((s) => inserts.every((i) => s.left > i.right)),
          stripH: strips.length ? Math.round(strips[0].height) : 0,
        };
        window.ring.machine.close(); ctl.stop();
        return out;
      `));
    } finally { await own.close(); }
  },
  judge: (r) => ({
    ok: r.effects && r.strips === 5 && r.sends >= 4 && r.above && r.inside && r.sendsRight && r.labels.join('|').includes('SENDS'),
    why: JSON.stringify(r),
    note: `the effects area holds ${r.inserts} insert${r.inserts === 1 ? '' : 's'} on the left and ${r.sends} sends and returns on the right (${r.labels.join(', ')}), and the ${r.strips} bus meters stand under it, ${r.stripH} px tall`,
  }),
});

/** Every wire of the drawn diagram, read back off the page: its kind, its corners, its arrow. */
const WIRES_READ = `
  // a path's runs and its corners as drawn (M6: true arcs): each arc sampled,
  // its radius, and the angle between each run and the arc where they meet
  const arcOf = (x0, y0, rr, large, sweep, x1, y1) => {
    const hx = (x0 - x1) / 2, hy = (y0 - y1) / 2, r2 = rr * rr, den = r2 * hy * hy + r2 * hx * hx;
    const co = Math.sqrt(Math.max(0, (r2 * r2 - den) / (den || 1))) * (large === sweep ? -1 : 1);
    const cxp = co * hy, cyp = -co * hx, cx = cxp + (x0 + x1) / 2, cy = cyp + (y0 + y1) / 2;
    const a0 = Math.atan2((hy - cyp) / rr, (hx - cxp) / rr);
    let da = Math.atan2((-hy - cyp) / rr, (-hx - cxp) / rr) - a0;
    if (sweep === 0 && da > 0) da -= 2 * Math.PI; if (sweep === 1 && da < 0) da += 2 * Math.PI;
    return { cx, cy, a0, da };
  };
  const ang = (u, v) => { const l1 = Math.hypot(u[0], u[1]) || 1, l2 = Math.hypot(v[0], v[1]) || 1; return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (l1 * l2)))) * 180 / Math.PI; };
  const read = (d) => {
    const t = d.match(/[MLA]|-?[\\d.]+/g); let i = 0; const corners = []; const runs = []; let cur = []; let prev = null;
    while (i < t.length) { const c = t[i++];
      if (c === 'M') { if (cur.length) runs.push(cur); cur = [[+t[i++], +t[i++]]]; prev = null; }
      else if (c === 'L') { const p = [+t[i++], +t[i++]]; const q = cur[cur.length - 1]; cur.push(p);
        const last = corners[corners.length - 1];
        // a run too short to have a direction (two corners back to back) says nothing
        if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.3) continue;
        if (last && last.pending) { last.outAngle = ang([p[0] - q[0], p[1] - q[1]], last.endTan); last.pending = false; }
        prev = q; }
      else if (c === 'A') { const rr = +t[i++]; i += 2; const large = +t[i++], sweep = +t[i++]; const to = [+t[i++], +t[i++]]; const from = cur[cur.length - 1];
        const a = arcOf(from[0], from[1], rr, large, sweep, to[0], to[1]); const dir = Math.sign(a.da);
        const tan = (th) => [-Math.sin(th) * dir, Math.cos(th) * dir];
        const smp = []; for (let k = 0; k <= 8; k++) { const th = a.a0 + (a.da * k) / 8; smp.push([a.cx + rr * Math.cos(th), a.cy + rr * Math.sin(th)]); }
        const inAngle = prev ? ang([from[0] - prev[0], from[1] - prev[1]], tan(a.a0)) : 0;
        corners.push({ c: [a.cx, a.cy], r: rr, smp, inAngle, outAngle: 0, endTan: tan(a.a0 + a.da), pending: true });
        cur.push(to); prev = null; } }
    if (cur.length) runs.push(cur);
    return { runs, corners };
  };
  // what is drawn: a wire end to end, a wire's two branches where it rides a
  // trunk, and each trunk once (M3)
  const strokes = [];
  // a wire joining an arrival (M8) is its run and its curve onto the join's
  // stem, arrowed by the stem, which is drawn once; nothing of one join is
  // held against anything else of it
  for (const p of document.querySelectorAll('#machineDiagram path[data-wire]:not([data-selected])')) { const j = p.closest('[data-joins]'); strokes.push({ id: p.getAttribute('data-wire'), kind: p.getAttribute('data-kind'), trunk: j ? 'join ' + j.getAttribute('data-joins') : undefined, arrow: !!p.getAttribute('marker-end') || !!j, ...read(p.getAttribute('d')) }); }
  for (const p of document.querySelectorAll('#machineDiagram path[data-join]')) strokes.push({ id: 'join ' + p.getAttribute('data-join'), stem: true, trunk: 'join ' + p.getAttribute('data-join'), kind: p.getAttribute('data-kind'), arrow: !!p.getAttribute('marker-end'), ...read(p.getAttribute('d')) });
  for (const p of document.querySelectorAll('#machineDiagram path[data-branch]')) strokes.push({ id: p.getAttribute('data-branch'), kind: p.getAttribute('data-kind'), trunk: p.closest('[data-rides]').getAttribute('data-rides'), arrow: !!p.getAttribute('marker-end'), ...read(p.getAttribute('d')) });
  for (const p of document.querySelectorAll('#machineDiagram path[data-trunk]')) strokes.push({ id: 'trunk ' + p.getAttribute('data-trunk'), own: true, trunk: p.getAttribute('data-trunk'), kind: p.getAttribute('data-kind'), arrow: true, ...read(p.getAttribute('d')) });
  const shared = []; const touching = []; const trunkShared = [];
  for (let a = 0; a < strokes.length; a++) for (let b = a + 1; b < strokes.length; b++) {
    const A = strokes[a], B = strokes[b];
    if (A.id === B.id || (A.trunk && A.trunk === B.trunk)) continue;
    for (const RA of A.runs) for (const RB of B.runs) for (let i = 1; i < RA.length; i++) for (let j = 1; j < RB.length; j++) {
      const [p, q, u, v] = [RA[i - 1], RA[i], RB[j - 1], RB[j]];
      const vp = Math.abs(p[0] - q[0]) < 0.05, vu = Math.abs(u[0] - v[0]) < 0.05;
      const hp = Math.abs(p[1] - q[1]) < 0.05, hu = Math.abs(u[1] - v[1]) < 0.05;
      const hit = (vp && vu && Math.abs(p[0] - u[0]) < 3 && Math.min(Math.max(p[1], q[1]), Math.max(u[1], v[1])) - Math.max(Math.min(p[1], q[1]), Math.min(u[1], v[1])) > 0.5)
        || (hp && hu && Math.abs(p[1] - u[1]) < 3 && Math.min(Math.max(p[0], q[0]), Math.max(u[0], v[0])) - Math.max(Math.min(p[0], q[0]), Math.min(u[0], v[0])) > 0.5);
      if (hit) { shared.push(A.id + ' / ' + B.id); if (A.own && B.own) trunkShared.push(A.id + ' / ' + B.id); }
    }
    if (!(A.trunk && A.trunk === B.trunk)) for (const c of A.corners) for (const e of B.corners) {
      if (Math.abs(c.c[0] - e.c[0]) > 80 || Math.abs(c.c[1] - e.c[1]) > 80) continue;
      let near = Infinity; for (const p of c.smp) for (const q of e.smp) near = Math.min(near, Math.hypot(p[0] - q[0], p[1] - q[1]));
      if (near < 2) touching.push(A.id + ' / ' + B.id);
    }
  }
  const ids = [...new Set(strokes.filter((x) => !x.own && !x.stem).map((x) => x.id))];
  const stems = strokes.filter((x) => x.stem);
  const unarrowed = ids.filter((id) => !strokes.some((x) => x.id === id && x.arrow)).length;
  const curvy = [...document.querySelectorAll('#machineDiagram path[data-wire]')].filter((p) => /C/.test(p.getAttribute('d'))).length;
  const blue = [...document.querySelectorAll('#machineDiagram path[data-wire], #machineDiagram path[data-branch], #machineDiagram path[data-trunk]')].filter((p) => /4fc3f7/i.test(p.getAttribute('stroke'))).length;
  const sends = ids.filter((id) => strokes.find((x) => x.id === id).kind === 'send').length;
  const trunks = [...document.querySelectorAll('#machineDiagram path[data-trunk]')].map((p) => p.getAttribute('data-trunk') + '×' + p.getAttribute('data-count'));
  // every corner a true arc (M6): each run meets its arc along the arc's
  // tangent, within a degree — the M5 quadratics met theirs, but were not circles
  let corners = 0, tight = 0; const bent = [];
  for (const x of strokes) for (const c of x.corners) {
    corners++;
    if (c.r < 1.5) tight++;
    if (c.inAngle > 1 || c.outAngle > 1) bent.push(x.id + ' ' + c.inAngle.toFixed(1) + '°/' + c.outAngle.toFixed(1) + '°');
  }
  const joints = [...document.querySelectorAll('#machineDiagram circle')].filter((c) => c.parentElement && c.parentElement.querySelector('path[data-hit]')).length;
  const lines = { wires: ids.length, shared: [...new Set(shared)], touching: [...new Set(touching)], curvy, arrows: { directed: unarrowed }, blue, sends, sendShared: [...new Set(trunkShared)].length, trunks, corners, tight, joints, bent: bent.slice(0, 4), bentN: bent.length, joins: stems.length, stemsBare: stems.filter((x) => !x.arrow).length };
`;

SCENARIOS.push({
  name: 'every wire keeps its own lane, and a trunk is one: no two run in one line, no two corners meet, every one arrowed the way the signal goes, and none is blue',
  area: 'view',
  query: 'v=2&seed=1',
  drive: async (page) => {
    const out = {};
    for (const [name, opts, query] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['wide', { viewport: { width: 2200, height: 1200 } }], ['phone', { viewport: { width: 390, height: 844 } }]]) {
      void query;
      const own = await ownPage(page, opts);
      try {
        out[name] = await own.page.evaluate(body(OPEN_VIEW + WIRES_READ + `window.ring.machine.close(); ctl.stop(); return lines;`));
      } finally { await own.close(); }
    }
    return out;
  },
  judge: (r) => {
    const bad = [];
    for (const [k, x] of Object.entries(r)) {
      if (x.shared.length) bad.push(`${k}: ${x.shared.length} pairs share a lane (${x.shared.slice(0, 3).join('; ')})`);
      if (x.touching.length) bad.push(`${k}: ${x.touching.length} pairs of corners meet (${x.touching.slice(0, 3).join('; ')})`);
      if (x.arrows.directed) bad.push(`${k}: ${x.arrows.directed} wires carry no arrow`);
      if (x.sendShared) bad.push(`${k}: ${x.sendShared} pairs of trunks share a lane`);
      if (x.joints) bad.push(`${k}: ${x.joints} joint dots are drawn on the wires`);
      if (x.bentN) bad.push(`${k}: ${x.bentN} corners leave their runs off the tangent (${x.bent.join(', ')})`);
      if (x.curvy) bad.push(`${k}: ${x.curvy} wires are still curves through a band`);
      if (x.blue) bad.push(`${k}: ${x.blue} wires are drawn in the signal blue`);
      if (x.stemsBare) bad.push(`${k}: ${x.stemsBare} joined arrivals carry no arrowhead`);
    }
    return {
      ok: !bad.length && r.desktop.wires > 40,
      why: bad[0] || `only ${r.desktop.wires} wires`,
      note: `${r.desktop.wires} wires, ${r.desktop.sends} of them sends, read back off the drawn page at 1440, 2200 and on a phone: the sends and the kick's keys ride `
        + `trunks (${r.desktop.trunks.join(', ')}), each drawn once, and every wire's branches, every trunk and every other wire keep a lane of their own — `
        + `no two corners as drawn within 2 units, all ${r.desktop.corners} corners true arcs meeting their runs on the tangent (${r.desktop.tight + r.wide.tight + r.phone.tight} of them under 1.5 units, on jogs that short), no joint dots, an arrowhead on every wire the way its signal goes, and every one grey`,
    };
  },
});

SCENARIOS.push({
  name: 'the three live controls move the graph\'s reading and write a line, and leave with the view',
  area: 'view',
  query: 'v=2&seed=1',
  deadline: 90000,
  page: body(OPEN_VIEW + `
    const snap = () => window.ring.machine.snapshot();
    const node = (id) => snap().part.nodes.find((n) => n.id === id);
    const reading = (id, name) => { const r = node(id).readings.find((x) => x.name === name); return r ? r.value : null; };
    const desk = () => snap().ledger.filter((e) => e.kind === 'desk').map((e) => e.what);
    const press = (sel) => { const e = document.querySelector(sel); e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); };
    // the band: AIR leant up a decibel, by two presses of its popover's +
    const air0 = reading('m:air', 'gain');
    press('#machine [role="button"][aria-label="Band AIR"]');
    await sleep(150);
    const up = document.querySelector('.desk-pop button[aria-label$="up a step"]');
    up.click(); await sleep(30); up.click();
    await sleep(400);
    const air1 = reading('m:air', 'gain');
    const lean = reading('m:air', 'lean');
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await sleep(100);
    // the kick bus: muted as a group
    press('#machine [role="button"][aria-label="Bus kick"]');
    await sleep(150);
    document.querySelector('.desk-pop button[aria-label="Mute bus kick"]').click();
    await sleep(200);
    const kickMuted = reading('bus:kick', 'mute');
    const kickVoices = snap().busVoices.kick || [];
    const muted = ctl.sourceMix.mute.slice();
    // and the drums bus's sends off
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await sleep(100);
    press('#machine [role="button"][aria-label="Bus drums"]');
    await sleep(150);
    document.querySelector('.desk-pop button[aria-label="Dry bus drums"]').click();
    await sleep(200);
    const drumsDry = reading('bus:drums', 'dry');
    const lines = desk();
    const url = location.search;
    window.ring.machine.close();
    await sleep(300);
    const room = ctl.mix.masterSettings.master.airDb;
    const airAfter = +ctl.mix.master.param('air.gain').value.toFixed(2);
    const out = { air0, air1, lean, room, airAfter, kickMuted, kickVoices, muted, drumsDry, lines, url, clean: !ctl.sourceMixOn };
    ctl.stop();
    return out;
  `),
  judge: (r) => {
    const band = Math.abs(r.air1 - r.air0 - 1) < 0.05 && r.lean === 1;
    const bus = r.kickMuted === true && r.kickVoices.length > 0 && r.kickVoices.every((v) => r.muted.includes(v));
    const dry = r.drumsDry === true;
    const said = r.lines.some((l) => /air was leant \+1 dB/.test(l)) && r.lines.some((l) => /kick bus was muted/.test(l)) && r.lines.some((l) => /drums bus was sent dry/.test(l));
    const left = r.clean && Math.abs(r.airAfter - r.room) < 0.05 && !/desk|mute|lean/.test(r.url);
    return {
      ok: band && bus && dry && said && left,
      why: !band ? `AIR read ${r.air0} then ${r.air1} dB with a lean of ${r.lean}` : !bus ? `the kick bus read mute ${r.kickMuted} over ${r.kickVoices.join(', ')} with ${r.muted.join(', ')} muted`
        : !dry ? `the drums bus read dry ${r.drumsDry}` : !said ? `the ledger said ${r.lines.join(' | ')}` : `after the close: clean ${r.clean}, AIR at ${r.airAfter} against the room's ${r.room}, link ${r.url}`,
      note: `two presses of AIR's + moved the node from ${r.air0} to ${r.air1} dB (lean ${r.lean}); the kick bus's M muted ${r.kickVoices.join(', ')} and its strip reads mute; `
        + `the drums bus went dry and reads it; the ledger took ${r.lines.length} desk lines ("${r.lines[0]}" …); the close put AIR back at the room's ${r.room} dB and the mixer out, and the link never heard of it`,
    };
  },
});

// --- the machine view, round M2 (09-25) ----------------------------------------
//
// Eugene's second pass: the pinned ring solid on a phone, a wire picked out by a
// hand, the master's response inside its box and at the foot of its column, the
// manual at every box, and the meters' legend.

/** The darkest and brightest of a square of the page, off a picture of it. */
const SQUARE = async (p, x, y, size = 24) => {
  const shot = await p.screenshot({ clip: { x, y, width: size, height: size } });
  return p.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    let hi = 0;
    for (let i = 0; i < d.length; i += 4) hi = Math.max(hi, d[i], d[i + 1], d[i + 2]);
    return hi;
  }, shot.toString('base64'));
};

SCENARIOS.push({
  name: 'on a phone the pinned ring is solid: the readings scroll under it, not through it',
  area: 'view',
  query: 'v=2&seed=1',
  drive: async (page) => {
    const own = await ownPage(page, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p = own.page;
    try {
      const geo = await p.evaluate(body(OPEN_VIEW + `
        window.scrollTo(0, 0);
        await sleep(100);
        const box = document.querySelector('#machine .ringbox');
        const r = box.getBoundingClientRect();
        const list = document.querySelector('#machine .list').getBoundingClientRect();
        // (M13) the ring and its toolbar are pinned as one block
        const block = document.querySelector('#machine .ring-block');
        return { startsAt: Math.round(r.top + window.scrollY), height: Math.round(r.height), listTop: Math.round(list.top + window.scrollY),
          blockH: Math.round(block.getBoundingClientRect().height), bg: getComputedStyle(box).backgroundColor, position: getComputedStyle(block).position };
      `));
      // scroll the readings up under where the ring is pinned
      // (M13) the readings' first rows scrolled under the pinned block — the ring and its toolbar — while the side column still runs on below it
      await p.evaluate((y) => window.scrollTo(0, y), geo.listTop - geo.blockH + 40);
      await p.waitForTimeout(300);
      const pinned = await p.evaluate(() => { const r = document.querySelector('#machine .ringbox').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width) }; });
      // the ring's corners, where no ring is drawn: what is there must be the ground
      const corners = [];
      // (M10: the bottom-right one is sampled over BACK, which stands in that corner)
      for (const [x, y] of [[4, pinned.top + 4], [pinned.w - 28, pinned.top + 4], [4, pinned.bottom - 28], [pinned.w - 28, pinned.bottom - 64]]) corners.push(await SQUARE(p, x, y));
      await p.evaluate(() => { window.ring.machine.close(); window.ring.control.stop(); });
      return { ...geo, pinned, corners };
    } finally { await own.close(); }
  },
  judge: (r) => {
    const solid = /rgb\(5, 7, 10\)|rgba\(5, 7, 10, 1\)/.test(r.bg);
    const clean = r.corners.every((v) => v <= 16);
    return {
      ok: r.position === 'sticky' && solid && r.pinned.top === 0 && clean,
      why: `the ring's box is ${r.position}, ${r.bg}, pinned at ${r.pinned.top}; the brightest of its four corners with the readings scrolled under: ${r.corners.join(', ')}`,
      note: `on a 390 px phone the ring's box starts ${r.startsAt} px down, is ${r.height} px tall and pins at the top with the page's own ground (${r.bg}); `
        + `with the readings scrolled up under it its corners are dark (brightest ${Math.max(...r.corners)} of 255), where before they showed the readings through the ring`,
    };
  },
});

/** Pick a wire up where it is and no other is: the middle of its path, in the page's pixels. */
const WIRE_PICK = `
  const hitAt = (hit) => {
    const vis = hit;
    const len = vis.getTotalLength();
    for (const f of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
      const pt = vis.getPointAtLength(len * f);
      const m = vis.getScreenCTM();
      const x = pt.x * m.a + pt.y * m.c + m.e, y = pt.x * m.b + pt.y * m.d + m.f;
      const under = document.elementFromPoint(x, y);
      if (under === hit) return { x, y };
    }
    return null;
  };
  const pickable = () => [...document.querySelectorAll('#machineDiagram path[data-hit]')];
`;

SCENARIOS.push({
  name: 'a wire pressed is lit end to end with its two boxes, the rest set back, one at a time, by a mouse and a finger',
  area: 'view',
  query: 'v=2&seed=1',
  deadline: 120000,
  drive: async (page) => {
    const out = {};
    for (const [name, opts] of [['mouse', { viewport: { width: 1440, height: 900 } }], ['finger', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]]) {
      const own = await ownPage(page, opts);
      const p = own.page;
      try {
        await p.evaluate(body(OPEN_VIEW + 'return 1;'));
        const rest = await p.evaluate(() => [...new Set([...document.querySelectorAll('#machineDiagram path[data-wire]')].map((x) => x.getAttribute('opacity')))]);
        const press = async (x, y) => { if (name === 'finger') await p.touchscreen.tap(x, y); else await p.mouse.click(x, y); await p.waitForTimeout(150); };
        const find = async (which) => p.evaluate(body(WIRE_PICK + `
          const want = ${JSON.stringify(which)};
          const hits = pickable().filter((h) => !want || h.getAttribute('data-hit') === want);
          for (const h of hits) { h.scrollIntoView({ block: 'center', inline: 'center' }); await sleep(60); const at = hitAt(h); if (at) return { id: h.getAttribute('data-hit'), ...at }; }
          return null;
        `));
        const state = () => p.evaluate(() => ({
          selected: [...document.querySelectorAll('#machineDiagram path[data-selected]')].map((x) => x.getAttribute('data-wire')),
          ports: document.querySelectorAll('#machineDiagram [data-port]').length,
          lit: [...document.querySelectorAll('#machineDiagram [data-lit]')].map((x) => x.getAttribute('data-box')).sort(),
          away: [...new Set([...document.querySelectorAll('#machineDiagram path[data-wire]:not([data-selected])')].map((x) => x.getAttribute('opacity')))],
          line: (window.ring.machine.snapshot().ledger.filter((e) => /wire selected/.test(e.what)).pop() || {}).what || '',
        }));
        const a = await find('bus:kick>glue') || await find(null);
        await press(a.x, a.y);
        const one = await state();
        const again = await find(a.id);
        await press(again.x, again.y);
        const off = await state();
        const b = await find('duck>width') || await find(null);
        await press(b.x, b.y);
        const two = await state();
        // elsewhere: the empty foot of the canvas under the legend's line
        const empty = await p.evaluate(() => { const r = document.getElementById('machineDiagram').getBoundingClientRect(); const x = Math.max(r.left + 4, 4); const y = Math.min(r.bottom - 6, window.innerHeight - 6); return { x, y }; });
        await p.evaluate(() => { const svg = document.getElementById('machineDiagram'); svg.scrollIntoView({ block: 'end', inline: 'start' }); });
        await p.waitForTimeout(100);
        const empty2 = await p.evaluate(() => { const r = document.getElementById('machineDiagram').getBoundingClientRect(); return { x: r.left + 6, y: Math.min(r.bottom, window.innerHeight) - 6 }; });
        void empty;
        await press(empty2.x, empty2.y);
        const cleared = await state();
        await p.evaluate(() => { window.ring.machine.close(); window.ring.control.stop(); });
        out[name] = { rest, a: a.id, one, off, b: b.id, two, cleared };
      } finally { await own.close(); }
    }
    return out;
  },
  judge: (r) => {
    const bad = [];
    for (const [k, x] of Object.entries(r)) {
      const [af, at] = x.a.split('>');
      if (x.rest.length !== 1 || x.rest[0] !== '0.55') bad.push(`${k}: at rest the wires stood at ${x.rest.join(', ')}`);
      if (x.one.selected.join() !== x.a || x.one.ports !== 1 || x.one.lit.join() !== [af, at].sort().join() || x.one.away.join() !== '0.15')
        bad.push(`${k}: pressing ${x.a} left ${JSON.stringify(x.one)}`);
      // a pick is looking, not a change: the ledger never hears of it (M6)
      if (x.one.line) bad.push(`${k}: a pick wrote "${x.one.line}" in the ledger`);
      if (x.off.selected.length || x.off.lit.length) bad.push(`${k}: pressing it again left ${JSON.stringify(x.off)}`);
      if (x.two.selected.join() !== x.b || x.two.selected.length !== 1) bad.push(`${k}: pressing ${x.b} left ${JSON.stringify(x.two.selected)}`);
      if (x.cleared.selected.length) bad.push(`${k}: a press elsewhere left ${x.cleared.selected.join()}`);
    }
    return {
      ok: !bad.length,
      why: bad[0],
      note: `at rest every wire stands at 0.55; a ${Object.keys(r).join(' and a ')} on ${r.mouse.a} lit it alone, its two ports and the titles of ${r.mouse.one.lit.join(' and ')}, `
        + `set the rest back to 0.15 and wrote nothing in the ledger; the same press again let it go, a press on ${r.mouse.b} took over, and a press on the empty canvas cleared it`,
    };
  },
});

// **A popover opens at its control, and inside the pane** (M8, Eugene: *"some
// bus box popovers went off the screen or too far"* — the KEYS bus's drawn
// over the master's foot, half off the pane). Every bus's, every strip's and
// every band's popover, at 1440, on a phone and with the graph scrolled: whole
// inside the pane and the viewport a spacing step in, and within a strip's
// width of the control that opened it.
SCENARIOS.push({
  name: 'every popover of the desk opens at its control and whole inside the pane, at 1440, on a phone and with the graph scrolled',
  area: 'view',
  query: 'v=2&seed=1',
  deadline: 180000,
  serial: true,
  drive: async (page) => {
    const out = {};
    for (const [name, opts, scrolled] of [['1440', { viewport: { width: 1440, height: 900 } }, false], ['1440 scrolled', { viewport: { width: 1440, height: 900 } }, true], ['2560', { viewport: { width: 2560, height: 1440 } }, false], ['390', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, false]]) {
      const own = await ownPage(page, opts);
      const p = own.page;
      try {
        await p.evaluate(body(OPEN_VIEW + 'return 1;'));
        out[name] = await p.evaluate(async (scrolled) => {
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const pane = document.querySelector('#machine .pane.graph');
          if (scrolled) { pane.scrollLeft = pane.scrollWidth; pane.scrollTop = pane.scrollHeight; await sleep(200); }
          const svg = document.getElementById('machineDiagram');
          const unit = svg.getBoundingClientRect().width / +svg.getAttribute('viewBox').split(' ')[2];
          const strip = 50 * unit;
          const ctrls = [...document.querySelectorAll('#machineDiagram [role="button"][aria-haspopup="dialog"]')].filter((g) => g.getAttribute('aria-disabled') !== 'true');
          const res = [];
          for (const g of ctrls) {
            if (!scrolled) g.scrollIntoView({ block: 'center', inline: 'center' });
            await sleep(60);
            const a = g.getBoundingClientRect();
            const vw = window.visualViewport ? window.visualViewport.width : innerWidth; const vh = window.visualViewport ? window.visualViewport.height : innerHeight;
            // a control the scroll left outside the pane is not one a hand presses
            const pr = pane.getBoundingClientRect();
            if (a.right < pr.left || a.left > pr.right || a.bottom < Math.max(0, pr.top) || a.top > Math.min(vh, pr.bottom)) continue;
            g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await sleep(120);
            const pop = document.querySelector('#machine .desk-pop');
            if (!pop) { res.push({ id: g.getAttribute('aria-label'), open: false }); continue; }
            const b = pop.getBoundingClientRect();
            const L = Math.max(0, pr.left), T = Math.max(0, pr.top), R = Math.min(vw, pr.right), B = Math.min(vh, pr.bottom);
            const inside = Math.min(b.left - L, b.top - T, R - b.right, B - b.bottom);
            const gapX = Math.max(0, a.left - b.right, b.left - a.right); const gapY = Math.max(0, a.top - b.bottom, b.top - a.bottom);
            res.push({ id: g.getAttribute('aria-label'), open: true, inside: +inside.toFixed(1), gap: +Math.hypot(gapX, gapY).toFixed(1), strip: +strip.toFixed(1) });
            pop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            await sleep(80);
          }
          window.ring.machine.close(); window.ring.control.stop();
          return res;
        }, scrolled);
      } finally { await own.close(); }
    }
    return out;
  },
  judge: (r) => {
    const bad = [];
    for (const [k, list] of Object.entries(r)) {
      if (list.length < 6) bad.push(`${k}: only ${list.length} controls were pressed`);
      for (const x of list) {
        if (!x.open) bad.push(`${k}: ${x.id} opened no popover`);
        else if (x.inside < 7.5) bad.push(`${k}: ${x.id}'s popover stands ${x.inside} px inside the pane`);
        else if (x.gap > x.strip) bad.push(`${k}: ${x.id}'s popover stands ${x.gap} px from its control, more than a strip's ${x.strip}`);
      }
    }
    const n = Object.values(r).reduce((m, l) => m + l.length, 0);
    const worst = Math.max(...Object.values(r).flat().filter((x) => x.open).map((x) => x.gap));
    return {
      ok: !bad.length,
      why: bad[0],
      note: `${n} popovers opened — every bus, every source strip and every band, at 1440, at 1440 with the graph scrolled to its far corner, at 2560 (the type step 1.5) and on a phone — each whole inside the pane and the viewport at least 8 px in, and none further from its control than ${worst} px`,
    };
  },
});

// **A lit key keeps its letter** (M8, Eugene's screenshot: a pressed M and S
// read as black blobs, and the level key read "100D"): the letter on the red
// and amber fill as legible as the unlit one — its contrast on the fill at
// least 4.5:1 and its ink within a fifth of the unlit letter's — and the level
// key's number alone, sends off a mark of its own.
const KEY_INK = `
  const inkOf = async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, c.width, c.height).data;
    const inset = Math.round(c.width * 0.18);
    const pts = [];
    for (let y = inset; y < c.height - inset; y++) for (let x = inset; x < c.width - inset; x++) { const i = (y * c.width + x) * 4; pts.push([px[i], px[i + 1], px[i + 2]]); }
    const count = new Map();
    for (const p of pts) { const k = p.map((v) => v >> 4).join(','); count.set(k, (count.get(k) || 0) + 1); }
    const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map((v) => +v);
    const fill = pts.filter((p) => p.every((v, j) => v >> 4 === top[j])).reduce((m, p) => [m[0] + p[0], m[1] + p[1], m[2] + p[2]], [0, 0, 0]).map((v, _, a) => v / pts.filter((p) => p.every((q, j) => q >> 4 === top[j])).length);
    const d = pts.map((p) => Math.hypot(p[0] - fill[0], p[1] - fill[1], p[2] - fill[2]));
    const max = Math.max(...d);
    const ink = d.filter((x) => x > max * 0.5).length;
    const core = pts.filter((_, i) => d[i] > max * 0.8);
    const coreC = core.reduce((m, p) => [m[0] + p[0], m[1] + p[1], m[2] + p[2]], [0, 0, 0]).map((v) => v / core.length);
    const lum = (c) => { const [r, g2, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g2 + 0.0722 * b; };
    const L1 = lum(fill), L2 = lum(coreC);
    return { ink, contrast: +((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)).toFixed(2), fill: fill.map(Math.round) };
  };
`;
SCENARIOS.push({
  name: 'a lit M and S keep a crisp letter on their fill, and the level key reads its number alone with sends off a mark of its own',
  area: 'view',
  query: 'v=2&seed=1',
  deadline: 90000,
  drive: async (page) => {
    const own = await ownPage(page, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const p = own.page;
    try {
      await p.evaluate(body(OPEN_VIEW + 'return 1;'));
      // a source with an instrument on it
      const label = await p.evaluate(() => { const g = [...document.querySelectorAll('#machineDiagram [role="button"][aria-label^="Mute "]')].find((x) => x.getAttribute('aria-disabled') !== 'true'); g.scrollIntoView({ block: 'center', inline: 'center' }); return g.getAttribute('aria-label').replace(/^Mute /, ''); });
      await p.waitForTimeout(200);
      const shot = async (name) => {
        const r = await p.evaluate((n) => { const g = document.querySelector('#machineDiagram [role="button"][aria-label="' + n + '"] rect'); const b = g.getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height }; }, name);
        return (await p.screenshot({ clip: r })).toString('base64');
      };
      const ink = (b64) => p.evaluate(body(KEY_INK + `return await inkOf(${JSON.stringify(b64)});`));
      const off = { m: await ink(await shot('Mute ' + label)), s: await ink(await shot('Solo ' + label)) };
      for (const k of ['Mute ', 'Solo ']) await p.evaluate((n) => document.querySelector('#machineDiagram [role="button"][aria-label="' + n + '"]').dispatchEvent(new MouseEvent('click', { bubbles: true })), k + label);
      await p.mouse.move(2, 2);
      await p.waitForTimeout(250);
      const on = { m: await ink(await shot('Mute ' + label)), s: await ink(await shot('Solo ' + label)) };
      // sends off, from the strip's popover
      const level = await p.evaluate(async (label) => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const key = document.querySelector('#machineDiagram [role="button"][aria-label="Strip ' + label + '"]');
        key.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await sleep(150);
        document.querySelector('.desk-pop [aria-label="Dry ' + label + '"]').click();
        await sleep(150);
        document.querySelector('.desk-pop').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await sleep(100);
        const strip = key.closest('.desk-strip');
        const r = { text: key.querySelector('text').textContent, mark: !!strip.querySelector('[data-dry]'), markText: strip.querySelector('[data-dry]') ? strip.querySelector('[data-dry]').textContent : null, markApart: strip.querySelector('[data-dry]') ? !key.contains(strip.querySelector('[data-dry]')) : false };
        window.ring.machine.close(); window.ring.control.stop();
        return r;
      }, label);
      return { label, off, on, level };
    } finally { await own.close(); }
  },
  judge: (r) => {
    const bad = [];
    for (const k of ['m', 's']) {
      if (r.on[k].contrast < 4.5) bad.push(`the lit ${k.toUpperCase()}'s letter stands ${r.on[k].contrast}:1 on its fill`);
      const ratio = r.on[k].ink / r.off[k].ink;
      if (ratio < 0.8 || ratio > 1.2) bad.push(`the lit ${k.toUpperCase()}'s letter has ${(ratio * 100).toFixed(0)} % of the unlit one's ink`);
    }
    if (r.level.text !== '100' || !r.level.mark || r.level.markText !== 'D' || !r.level.markApart) bad.push(`the level key reads "${r.level.text}" with the mark ${JSON.stringify(r.level)}`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: `${r.label}: the lit M stands ${r.on.m.contrast}:1 on its fill with ${(r.on.m.ink / r.off.m.ink * 100).toFixed(0)} % of the unlit letter's ink, the lit S ${r.on.s.contrast}:1 with ${(r.on.s.ink / r.off.s.ink * 100).toFixed(0)} %; with sends off the level key reads "${r.level.text}" and a separate "${r.level.markText}" stands in its corner`,
    };
  },
});

// **A popover's key has its page** (M8, Eugene: *"when I press SENDS OFF in
// the boxes, what does it mean?"*): a mouse resting on SENDS OFF in a bus's
// popover opens its page after the grace, beside the popover and not over it.
SCENARIOS.push({
  name: 'a mouse resting on SENDS OFF in a bus popover opens its page, beside the popover',
  area: 'view',
  query: 'v=2&seed=1',
  serial: true,
  drive: async (page) => {
    const own = await ownPage(page, { viewport: { width: 1440, height: 900 } });
    const p = own.page;
    try {
      await p.evaluate(body(OPEN_VIEW + 'return 1;'));
      await p.evaluate(() => { const g = document.querySelector('#machineDiagram [role="button"][aria-label="Bus drums"]'); g.scrollIntoView({ block: 'center', inline: 'center' }); g.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await p.waitForTimeout(200);
      const k = await p.evaluate(() => { const b = document.querySelector('.desk-pop [data-page="key:dry"]').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      await p.mouse.move(k.x, k.y, { steps: 3 });
      const t0 = Date.now(); let opened = null;
      while (Date.now() - t0 < 2500) { if (await p.evaluate(() => { const t = document.querySelector('#machine [role="tooltip"][data-help]'); return t ? t.getAttribute('data-help') : null; }) === 'key:dry') { opened = Date.now() - t0; break; } await p.waitForTimeout(25); }
      const r = await p.evaluate(() => {
        const t = document.querySelector('#machine [role="tooltip"][data-help]'); const pop = document.querySelector('.desk-pop');
        if (!t || !pop) return null;
        const a = t.getBoundingClientRect(), b = pop.getBoundingClientRect();
        return { text: t.textContent, over: !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top), inView: a.left >= 0 && a.top >= 0 && a.right <= innerWidth && a.bottom <= innerHeight };
      });
      await p.evaluate(() => { window.ring.machine.close(); window.ring.control.stop(); });
      return { opened, r };
    } finally { await own.close(); }
  },
  judge: (r) => ({
    ok: r.opened != null && r.opened >= 500 && !!r.r && /sends/i.test(r.r.text) && /returns/.test(r.r.text) && !r.r.over && r.r.inView,
    why: JSON.stringify(r),
    note: `SENDS OFF's page opened ${r.opened} ms after the mouse came to rest, beside the popover and inside the window: "${r.r && r.r.text.slice(0, 90)}…"`,
  }),
});

// **COPY LINK and the ledger's key** (M13, Eugene: *"add another button …
// Copy Link, that stores the current browser URL into the clipboard. When I
// open the app from the iOS home screen I have no Share button"*): the copied
// link is the page's own with `view=machine` taken off — the ring's link, the
// track and not the panel — the key reads COPIED for a moment, the ledger says
// "link copied", and the address does not move. Twice per engine: the async
// clipboard where the browser grants it (Chromium, read back), and the
// home-screen case — `navigator.standalone` set and no async clipboard — where
// the hidden field and `execCommand('copy')` carry it, read back off the copy
// the page itself fired. And SHOW LEDGER turns into HIDE LEDGER and back.
SCENARIOS.push({
  name: 'COPY LINK copies the ring\'s link without the view, by the clipboard or the home-screen fallback, says COPIED and writes a ledger line; the ledger key reads what it will do',
  area: 'view',
  query: 'v=2&seed=1',
  deadline: 120000,
  drive: async (page) => {
    const browser = page.context().browser().browserType().name();
    const out = { browser };
    for (const mode of ['clipboard', 'standalone']) {
      const own = await ownPage(page, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, ...(browser === 'chromium' ? { permissions: ['clipboard-read', 'clipboard-write'] } : {}) });
      const p = own.page;
      try {
        await p.evaluate(body(OPEN_VIEW + 'return 1;'));
        if (mode === 'standalone') {
          await p.evaluate(() => {
            Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
            Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
          });
        }
        await p.evaluate(() => { window.__copied = null; document.addEventListener('copy', () => { window.__copied = String(window.getSelection()) || (document.activeElement && document.activeElement.value) || ''; }, true); window.scrollTo(0, 0); });
        const before = await p.evaluate(() => ({ url: location.href, lines: window.ring.machine.snapshot().ledger.filter((e) => e.what === 'link copied').length }));
        const c = await p.evaluate(() => { const r = document.querySelector('#machine [data-tool="copy"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
        await p.touchscreen.tap(c.x, c.y);
        await p.waitForTimeout(250);
        const after = await p.evaluate(async () => {
          let clip = null;
          try { if (navigator.clipboard && navigator.clipboard.readText) clip = await navigator.clipboard.readText(); } catch (e) { clip = null; }
          return { url: location.href, label: document.querySelector('#machine [data-tool="copy"]').textContent.trim(), clip, fired: window.__copied,
            lines: window.ring.machine.snapshot().ledger.filter((e) => e.what === 'link copied').length };
        });
        await p.waitForTimeout(1200);
        const later = await p.evaluate(() => document.querySelector('#machine [data-tool="copy"]').textContent.trim());
        // the ledger's key, both ways
        // (M19) the ledger's key is the ledger's: HIDE in its header when shown, SHOW LEDGER in the rail when not
        const lk = () => p.evaluate(() => { const b = document.querySelector('#machine [data-tool="ledger"]'); return { text: b.textContent.trim(), pressed: b.closest('.ring-tools') ? 'toolbar' : 'beside', pane: !!document.querySelector('#machine .pane.ledger') }; });
        const l0 = await lk();
        await p.evaluate(() => document.querySelector('#machine [data-tool="ledger"]').click()); await p.waitForTimeout(150);
        const l1 = await lk();
        await p.evaluate(() => document.querySelector('#machine [data-tool="ledger"]').click()); await p.waitForTimeout(150);
        const l2 = await lk();
        await p.evaluate(() => { window.ring.machine.close(); window.ring.control.stop(); });
        out[mode] = { before, after, later, ledger: [l0, l1, l2] };
      } finally { await own.close(); }
    }
    return out;
  },
  judge: (r) => {
    const bad = [];
    const ringLink = (u) => u.replace(/([?&])view=machine(&|$)/, (m, a, b) => (b ? a : '')).replace(/[?&]$/, '');
    for (const mode of ['clipboard', 'standalone']) {
      const x = r[mode];
      const want = ringLink(x.before.url);
      const got = mode === 'clipboard' && r.browser === 'chromium' ? x.after.clip : x.after.fired;
      if (x.after.url !== x.before.url) bad.push(`${mode}: the address moved from ${x.before.url} to ${x.after.url}`);
      if (/view=machine/.test(want) || !/[?&]v=2/.test(want)) bad.push(`${mode}: the ring's link is ${want}`);
      if (mode === 'standalone' || r.browser === 'chromium') {
        // (M13, Eugene: *"a link to the song, not to the machine view we are in when copying"*)
        if (got !== want || /[?&]view=/.test(got || '')) bad.push(`${mode}: copied "${got}" where the ring's link, with no view row, is "${want}"`);
        if (x.after.label !== 'copied' || x.later !== 'copy link') bad.push(`${mode}: the key read "${x.after.label}", then "${x.later}"`);
        if (x.after.lines !== x.before.lines + 1) bad.push(`${mode}: ${x.after.lines - x.before.lines} "link copied" lines`);
      }
      const [a, b, c] = x.ledger;
      // (M20) the ledger's key is the log mark, no word: shown or hidden it is beside the ledger, never in the toolbar
      const says = (l) => l.text === '' && l.pressed === 'beside';
      if (!says(a) || !says(b) || !says(c) || b.pane === a.pane || c.pane !== a.pane) bad.push(`${mode}: the ledger's key read ${JSON.stringify(x.ledger)}`);
    }
    const w = r.clipboard;
    return {
      ok: !bad.length,
      why: bad[0],
      note: `${r.browser}: COPY LINK put "${ringLink(w.before.url)}" — the page's link without view=machine — ${r.browser === 'chromium' ? 'into the clipboard (read back)' : '(the async clipboard is not read back here)'}, and with navigator.standalone set and no async clipboard the hidden field and execCommand copied the same link; the key read COPIED then COPY LINK, one "link copied" line each time, the address unmoved; the ledger's key read ${w.ledger.map((l) => l.text.toUpperCase()).join(' → ')}`,
    };
  },
});

// **A float bus over 0 dBFS reads hot in the view, never clipped** (M15, from
// round S9's measurement: on 27191's theme 12 under the ambient spell the
// melodic bus sums to 0 dBFS at bar 31 with the master at −2.4 and nothing
// non-linear before the limiter). The benchmark's own spell, played through
// bars 29–34: the melodic strip's lamp and LEDs never red, a "ran hot" line and
// no clip for a bus, and the output never over the limiter's ceiling.
SCENARIOS.push({
  name: 'on 27191\'s theme 12 under the ambient spell the melodic bus reads hot and never clipped, and the output never passes its ceiling',
  area: 'view',
  query: 'v=2&seed=27191&theme=12&spell=ember:0.10,tide:0.85,zephyr:0.01,root:0.50,veil:0.30,spark:0.00,loom:0.80',
  deadline: 180000,
  serial: true,
  page: body(OPEN_VIEW + `
    const from = 28;
    ctl.seekToBar(from);
    await waitFor(() => ctl.mix.state.elapsed >= from * ctl.readout().barSeconds - 1, 20000);
    const n0 = window.ring.machine.snapshot().ledger.length;
    let melo = -120, outMax = -120, ceiling = null, reds = 0, lampAtMax = null, samples = 0, overZero = 0;
    const until = performance.now() + 60000;
    while (performance.now() < until && ctl.readout().bar < from + 6) {
      await sleep(100);
      const s = window.ring.machine.snapshot();
      if (!s.meters) continue;
      samples++;
      ceiling = s.meters.ceilingDb;
      const m = s.meters.buses.melodic ? s.meters.buses.melodic.peak : -120;
      if (m >= 0) overZero++;
      const cell = document.querySelector('#machine [data-box="bus:melodic"]');
      const lamp = cell ? cell.querySelector('circle.lamp').getAttribute('fill') : null;
      if (m > melo) { melo = m; lampAtMax = lamp; }
      outMax = Math.max(outMax, s.meters.out.peak);
      if (cell && ([...cell.querySelectorAll('g.led rect')].some((x) => x.getAttribute('fill') === '${'#'}ff4d4f') || lamp === '${'#'}ff4d4f')) reds++;
    }
    const lines = window.ring.machine.snapshot().ledger.slice(n0);
    const r = { melo: +melo.toFixed(2), outMax: +outMax.toFixed(2), ceiling, reds, lampAtMax, samples, overZero, bar: ctl.readout().bar,
      hot: lines.filter((e) => e.kind === 'hot').map((e) => e.what), busClips: lines.filter((e) => e.kind === 'clip' && !/^out /.test(e.what)).map((e) => e.what) };
    window.ring.machine.close(); ctl.stop();
    return r;
  `),
  judge: (r) => {
    const bad = [];
    if (r.samples < 20) bad.push(`only ${r.samples} frames were read (to bar ${r.bar})`);
    if (r.melo < -1) bad.push(`the melodic bus peaked at ${r.melo} dBFS: the benchmark no longer runs it hot here`);
    if (r.reds) bad.push(`${r.reds} frames drew the melodic strip red`);
    if (r.busClips.length) bad.push(`the ledger called a bus clipped: ${r.busClips.join('; ')}`);
    if (r.overZero && !r.hot.some((w) => /melodic ran hot/.test(w))) bad.push(`the melodic bus went over 0 dBFS in ${r.overZero} frames and no "ran hot" line was written`);
    if (r.outPeak > r.ceiling + 0.1 || r.outMax > r.ceiling + 0.1) bad.push(`the output reached ${r.outMax} dBFS over its ${r.ceiling} ceiling`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: `bars 29–34 of 27191's theme 12 under the ambient spell: the melodic bus peaked at ${r.melo} dBFS (${r.overZero} of ${r.samples} frames at or over 0), its lamp ${r.lampAtMax} there and no frame red, the ledger ${r.hot.length ? `"${r.hot[0]}"` : 'with no heat line'} and no clip for a bus, the output at most ${r.outMax} dBFS under its ${r.ceiling} ceiling`,
    };
  },
});

// **The root's centre is the style that plays** (M17, Eugene's genre lift):
// proper case on the tiles and the tier's name, one lamp — the centre's — and
// a sub-genre chosen inside a family takes the root's centre, lit while its
// spell plays, kept by this browser through a reload, unlit when a bird moves,
// and given back to Deep House when Deep House is chosen.
SCENARIOS.push({
  name: 'the genres root shows the style that plays in its centre: Tech House chosen inside House stands there lit, a reload keeps it, a bird move unlights it, and Deep House takes it back',
  area: 'view',
  query: 'v=2&seed=1',
  deadline: 180000,
  drive: async (page) => {
    const out = {};
    for (const [name, opts] of [['1440', { viewport: { width: 1440, height: 900 } }], ['390', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]]) {
      const own = await ownPage(page, opts);
      const p = own.page;
      try {
        const read = () => p.evaluate(() => {
          const keys = [...document.querySelectorAll('#machine .genres button')];
          return { caption: document.querySelector('#machine .genre-block .caption').textContent, centre: keys[4] && keys[4].dataset.genre, centreLit: keys[4] && keys[4].getAttribute('aria-pressed'),
            lamps: document.querySelectorAll('#machine .genres [data-lamp]').length, lampOnCentre: !!(keys[4] && keys[4].querySelector('[data-lamp]')),
            labels: keys.map((k) => k.dataset.genre), upper: keys.filter((k) => getComputedStyle(k).textTransform === 'uppercase').length };
        });
        const press = async (genre) => { await p.evaluate((g) => [...document.querySelectorAll('#machine .genres button')].find((k) => k.dataset.genre === g).click(), genre); await p.waitForTimeout(250); };
        await p.evaluate(() => { try { localStorage.removeItem('deep-house.machine.genre'); } catch (e) {} });
        await p.evaluate(body(OPEN_VIEW + 'return 1;'));
        const fresh = await read();
        await press('House');
        await press('Tech House');
        // the move lands at the next phrase line
        await p.waitForFunction(() => { const k = [...document.querySelectorAll('#machine .genres button')].find((x) => x.dataset.genre === 'Tech House'); return k && k.getAttribute('aria-pressed') === 'true'; }, null, { timeout: 100000 });
        await p.evaluate(() => document.querySelector('#machine [aria-label="Back to the genre families"]').click());
        await p.waitForTimeout(250);
        const chosen = await read();
        // a reload: the link carries the spell, this browser the choice
        await p.evaluate(() => window.ring.machine.close());
        await p.reload({ waitUntil: 'networkidle' });
        await p.waitForFunction(() => window.ring && window.deepHouse, null, { timeout: 20000 });
        await p.evaluate(async () => { await window.ring.machine.open(); });
        await p.waitForTimeout(800);
        const reloaded = await read();
        // a bird moved off the style: the centre keeps it, unlit
        await p.evaluate(() => { const c = window.ring.control; const now = c.readout().spell || {}; c.setSpell({ ...now, loom: 0.12 }); });
        await p.waitForFunction(() => { const k = [...document.querySelectorAll('#machine .genres button')][4]; return k && k.getAttribute('aria-pressed') === 'false'; }, null, { timeout: 100000 });
        const moved = await read();
        // Deep House chosen inside House takes the centre back
        await press('House');
        await press('Deep House');
        await p.evaluate(() => document.querySelector('#machine [aria-label="Back to the genre families"]').click());
        await p.waitForTimeout(250);
        const home = await read();
        await p.evaluate(() => { window.ring.machine.close(); window.ring.control.stop(); });
        out[name] = { fresh, chosen, reloaded, moved, home };
      } finally { await own.close(); }
    }
    return out;
  },
  judge: (r) => {
    const bad = [];
    for (const [k, x] of Object.entries(r)) {
      if (x.fresh.caption !== 'Families' || x.fresh.upper || x.fresh.labels.join() !== 'House,Techno,Ambient & Downtempo,DnB & Dub,Deep House,Trance,Breaks & Big Beat,Disco & Nu-Disco,Misc') bad.push(`${k}: the root reads ${x.fresh.caption} over ${x.fresh.labels.join(', ')} (${x.fresh.upper} in upper case)`);
      if (x.fresh.lamps !== 1 || !x.fresh.lampOnCentre || x.fresh.centre !== 'Deep House') bad.push(`${k}: a fresh root has ${x.fresh.lamps} lamps, the centre ${x.fresh.centre}`);
      if (x.chosen.centre !== 'Tech House' || x.chosen.centreLit !== 'true' || x.chosen.lamps !== 1) bad.push(`${k}: after Tech House the centre is ${x.chosen.centre}, lit ${x.chosen.centreLit}, ${x.chosen.lamps} lamps`);
      if (x.reloaded.centre !== 'Tech House' || x.reloaded.centreLit !== 'true') bad.push(`${k}: after a reload the centre is ${x.reloaded.centre}, lit ${x.reloaded.centreLit}`);
      if (x.moved.centre !== 'Tech House' || x.moved.centreLit !== 'false') bad.push(`${k}: with a bird moved the centre is ${x.moved.centre}, lit ${x.moved.centreLit}`);
      if (x.home.centre !== 'Deep House') bad.push(`${k}: Deep House chosen left the centre ${x.home.centre}`);
    }
    return {
      ok: !bad.length,
      why: bad[0],
      note: `at 1440 and on a phone the root reads "${r['1440'].fresh.caption}" in proper case with one lamp, the centre's; Tech House chosen inside House took the root's centre lit, a reload kept it, Loom moved off it left it unlit, and Deep House chosen gave the centre back to Deep House`,
    };
  },
});

// **COPY AT m:ss** (M16, Eugene: *"add another button Copy Link with time"*):
// a key left of COPY LINK whose label is the theme's time, live; pressed, it
// copies the ring's link with `t` (K32's `withTime`) — the same sound rows as
// the address, `t` within a second of the readout — the address never carries
// `t`, the key reads COPIED, the ledger says "link copied at m:ss" and the
// focus stays on the key. At 390, 1440 and 2560, the four keys on one row.
SCENARIOS.push({
  name: 'COPY AT m:ss reads the theme\'s time live and copies the ring\'s link with t within a second of it, the address never carrying t',
  area: 'view',
  query: 'v=2&seed=1',
  deadline: 180000,
  drive: async (page) => {
    const browser = page.context().browser().browserType().name();
    const out = { browser };
    for (const [name, opts] of [['1440', { viewport: { width: 1440, height: 900 } }], ['2560', { viewport: { width: 2560, height: 1440 } }], ['390', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]]) {
      const own = await ownPage(page, { ...opts, ...(browser === 'chromium' ? { permissions: ['clipboard-read', 'clipboard-write'] } : {}) });
      const p = own.page;
      try {
        await p.evaluate(body(OPEN_VIEW + 'await sleep(1500); return 1;'));
        const label = () => p.evaluate(() => document.querySelector('#machine [data-tool="copy-at"]').textContent.trim());
        const l0 = await label();
        await p.waitForTimeout(2200);
        const l1 = await label();
        const row = await p.evaluate(() => { const ks = [...document.querySelectorAll('#machine .ring-tools button')]; const r = ks.map((k) => k.getBoundingClientRect()); return { order: ks.map((k) => k.dataset.tool), oneRow: r.every((x) => Math.abs(x.top - r[0].top) < 1), inside: r.every((x) => x.left >= 0 && x.right <= innerWidth) }; });
        // WebKit's async clipboard is not read back headless: the fallback, read off the copy the page fires
        if (browser !== 'chromium') await p.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }));
        await p.evaluate(() => { window.__copied = null; document.addEventListener('copy', () => { window.__copied = String(window.getSelection()) || (document.activeElement && document.activeElement.value) || ''; }, true); window.scrollTo(0, 0); document.querySelector('#machine [data-tool="copy-at"]').focus(); });
        const before = await p.evaluate(() => ({ url: location.href, lines: window.ring.machine.snapshot().ledger.length }));
        await p.keyboard.press('Enter');
        await p.waitForTimeout(250);
        const after = await p.evaluate(async () => {
          let clip = null;
          try { if (navigator.clipboard && navigator.clipboard.readText) clip = await navigator.clipboard.readText(); } catch (e) { clip = null; }
          const r = window.ring.control.readout();
          return { url: location.href, clip: clip || window.__copied, seconds: r ? r.seconds : null, label: document.querySelector('#machine [data-tool="copy-at"]').textContent.trim(),
            focus: document.activeElement ? document.activeElement.getAttribute('data-tool') : null, lines: window.ring.machine.snapshot().ledger.slice(-3).map((e) => e.what) };
        });
        await p.evaluate(() => { window.ring.machine.close(); window.ring.control.stop(); });
        out[name] = { l0, l1, row, before, after };
      } finally { await own.close(); }
    }
    return out;
  },
  judge: (r) => {
    const bad = [];
    for (const [k, x] of Object.entries(r)) {
      if (k === 'browser') continue;
      if (!/^copy at \d+:\d\d$/.test(x.l0) || x.l0 === x.l1) bad.push(`${k}: the key read "${x.l0}" then "${x.l1}"`);
      // (M19) the ledger's key left the toolbar
      if (x.row.order.join() !== 'copy-at,copy,close' || !x.row.oneRow || !x.row.inside) bad.push(`${k}: the toolbar is ${x.row.order.join(', ')}, one row ${x.row.oneRow}, inside ${x.row.inside}`);
      const got = x.after.clip ? new URL(x.after.clip) : null;
      const here = new URL(x.before.url);
      if (!got) { bad.push(`${k}: nothing was copied`); continue; }
      const t = Number(got.searchParams.get('t'));
      if (!got.searchParams.has('t') || Math.abs(t - x.after.seconds) > 1) bad.push(`${k}: t=${got.searchParams.get('t')} against the readout's ${x.after.seconds}`);
      for (const row of ['seed', 'v', 'theme', 'spell']) if ((got.searchParams.get(row) || '') !== (here.searchParams.get(row) || '')) bad.push(`${k}: the copied ${row} is "${got.searchParams.get(row)}", the address's "${here.searchParams.get(row)}"`);
      if (got.searchParams.has('view')) bad.push(`${k}: the copied link carries the view`);
      if (/[?&]t=/.test(x.after.url) || x.after.url !== x.before.url) bad.push(`${k}: the address became ${x.after.url}`);
      if (x.after.label !== 'copied' || x.after.focus !== 'copy-at') bad.push(`${k}: the key read "${x.after.label}", the focus on ${x.after.focus}`);
      if (!x.after.lines.some((w) => new RegExp('^link copied at ' + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0') + '$').test(w))) bad.push(`${k}: the ledger said ${x.after.lines.join(' / ')}`);
    }
    return {
      ok: !bad.length,
      why: bad[0],
      note: `${r.browser}: at 1440, 2560 and on a phone the toolbar reads COPY AT · COPY LINK · CLOSE on one row, the first key's time running ("${r['1440'].l0}" → "${r['1440'].l1}"); pressed by a key it copied the ring's link with t within a second of the readout (${r['1440'].after.clip}), the same seed, engine, theme and spell as the address, no view and no t in the address, read COPIED with the focus kept, and wrote "link copied at m:ss"`,
    };
  },
});

// **The ledger's key: the log mark, one spot, no panel reserved** (M20, Eugene:
// "closed ledger looks trashy, side panel for no reason … a floating icon with 4
// rows"). Hidden, a key whose face is four short lines floats over the canvas —
// its top-right on a desktop, its bottom-right at the page's foot on a phone —
// with no rail, the graph the whole width; shown, HIDE is the same mark,
// pressed, at the top-right of the ledger's header, where the icon stood (M19's
// taller toolbar keys and 11 px readings held here too).
SCENARIOS.push({
  name: 'the ledger\'s key is the log mark floating at the canvas\'s corner with no panel reserved, and HIDE the same mark where it stood; the toolbar\'s keys are 24 px and the readings 11 px',
  area: 'view',
  query: 'v=2&seed=1',
  deadline: 150000,
  drive: async (page) => {
    const out = {};
    for (const [name, opts] of [['1440', { viewport: { width: 1440, height: 900 } }], ['2560', { viewport: { width: 2560, height: 1440 } }], ['390', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]]) {
      const own = await ownPage(page, opts);
      const p = own.page;
      try {
        await p.evaluate(() => { try { localStorage.removeItem('deep-house.machine.ledger'); } catch (e) {} });
        await p.evaluate(body(`await started(); await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000); await bounded(window.ring.machine.open(), 12000); await sleep(500); return 1;`));
        const read = () => p.evaluate(() => {
          const k = document.querySelector('#machine [data-tool="ledger"]');
          const kr = k.getBoundingClientRect();
          const view = document.getElementById('machine').getBoundingClientRect();
          const graph = document.querySelector('#machine .pane.graph').getBoundingClientRect();
          const ledger = document.querySelector('#machine .pane.ledger');
          const lr = ledger ? ledger.getBoundingClientRect() : null;
          const tools = [...document.querySelectorAll('#machine .ring-tools button')];
          const facts = [...document.querySelectorAll('#machine .fact .v')].map((v) => parseFloat(getComputedStyle(v).fontSize));
          return { text: k.textContent.trim(), label: k.getAttribute('aria-label'), pressed: k.getAttribute('aria-pressed'), lines: k.querySelectorAll('svg line').length,
            inToolbar: !!k.closest('.ring-tools'), inLedger: !!k.closest('.pane.ledger'), rail: !!document.querySelector('#machine .ledger-rail'),
            w: +kr.width.toFixed(1), h: +kr.height.toFixed(1),
            // the key's place, in the page's own coordinates
            x: +(kr.right + scrollX).toFixed(1), y: +(kr.top + scrollY).toFixed(1), bottom: +(kr.bottom + scrollY).toFixed(1),
            viewRight: +(view.right + scrollX).toFixed(1), graphRight: +(graph.right + scrollX).toFixed(1), graphTop: +(graph.top + scrollY).toFixed(1), graphBottom: +(graph.bottom + scrollY).toFixed(1),
            ledgerTop: lr ? +(lr.top + scrollY).toFixed(1) : null, ledgerRight: lr ? +(lr.right + scrollX).toFixed(1) : null, pageEnd: document.documentElement.scrollHeight,
            toolH: tools.map((b) => +b.getBoundingClientRect().height.toFixed(1)), readings: [...new Set(facts)] };
        });
        const hidden = await read();
        await p.evaluate(() => document.querySelector('#machine [data-tool="ledger"]').click());
        await p.waitForTimeout(250);
        const shown = await read();
        await p.evaluate(() => { window.ring.machine.close(); window.ring.control.stop(); });
        out[name] = { hidden, shown };
      } finally { await own.close(); }
    }
    return out;
  },
  judge: (r) => {
    const bad = [];
    for (const [k, x] of Object.entries(r)) {
      const phone = k === '390';
      const t = k === '2560' ? 1.25 : 1;
      const H = x.hidden, S = x.shown;
      for (const [state, y] of [['hidden', H], ['shown', S]]) {
        if (y.inToolbar) bad.push(`${k} ${state}: the ledger's key is in the toolbar`);
        if (y.text || y.lines !== 4) bad.push(`${k} ${state}: the key's face is "${y.text}" and ${y.lines} lines`);
        if (y.toolH.some((h) => Math.abs(h - 24 * t) > 0.6)) bad.push(`${k} ${state}: the toolbar's keys are ${y.toolH.join(', ')} px`);
        if (y.readings.length !== 1 || y.readings[0] !== 11) bad.push(`${k} ${state}: the readings are set at ${y.readings.join(', ')} px`);
      }
      // hidden: no rail, the graph to the view's edge, the icon floating at the canvas's corner
      if (H.rail || H.label !== 'Show the ledger' || H.pressed !== 'false') bad.push(`${k} hidden: rail ${H.rail}, label ${H.label}, pressed ${H.pressed}`);
      if (Math.abs(H.graphRight - H.viewRight) > 1) bad.push(`${k} hidden: the graph ends ${H.viewRight - H.graphRight} px short of the view`);
      if (Math.abs(H.w - 24 * t) > 0.6 || Math.abs(H.h - 24 * t) > 0.6) bad.push(`${k} hidden: the icon is ${H.w}×${H.h}`);
      if (H.viewRight - H.x > 16 * t) bad.push(`${k} hidden: the icon stands ${H.viewRight - H.x} px from the right`);
      if (phone ? H.pageEnd - H.bottom > 16 : H.y - H.graphTop > 16 * t) bad.push(`${k} hidden: the icon stands off its corner (${phone ? `${H.pageEnd - H.bottom} px above the page's end` : `${H.y - H.graphTop} px under the canvas's top`})`);
      // shown: HIDE the same mark, pressed, in the ledger's header, where the icon stood
      if (!S.inLedger || S.label !== 'Hide the ledger' || S.pressed !== 'true') bad.push(`${k} shown: in the ledger ${S.inLedger}, label ${S.label}, pressed ${S.pressed}`);
      if (S.ledgerRight - S.x > 16 * t || S.y - S.ledgerTop > 12 * t) bad.push(`${k} shown: HIDE stands off the ledger header's top-right`);
      if (phone ? S.ledgerTop < H.graphBottom - 1 : Math.hypot(S.x - H.x, S.y - H.y) > 24 * t) bad.push(`${k}: HIDE stands ${Math.round(Math.hypot(S.x - H.x, S.y - H.y))} px from where the icon stood`);
    }
    return {
      ok: !bad.length,
      why: bad[0],
      note: `at 1440, 2560 and on a phone the ledger put away reserves nothing — the graph reaches the view's edge — and its key is the log mark, four lines and no word, ${r['1440'].hidden.w} px, floating at the canvas's top-right (at the page's foot on a phone); shown, HIDE is the same mark pressed at the ledger header's top-right, ${Math.round(Math.hypot(r['1440'].shown.x - r['1440'].hidden.x, r['1440'].shown.y - r['1440'].hidden.y))} px from where the icon stood at 1440; the toolbar's keys ${r['1440'].hidden.toolH[0]} px; every reading ${r['1440'].hidden.readings[0]} px`,
    };
  },
});

// --- round M14 (09-26): the view's findings of the two reviews, reconciled ------------

// (1) **Escape on a desk popover gives the focus back to the key that opened it**
// (both reviews: it fell to the page, fifty stops from the hand).
SCENARIOS.push({
  name: 'Escape on a strip\'s, a bus\'s and a band\'s popover puts the focus back on the key that opened it',
  area: 'view',
  query: 'v=2&seed=1',
  drive: async (page) => {
    const own = await ownPage(page, { viewport: { width: 1440, height: 900 } });
    const p = own.page;
    try {
      await p.evaluate(body(OPEN_VIEW + 'return 1;'));
      const out = {};
      for (const [what, sel] of [['strip', '[role="button"][aria-label^="Strip "]'], ['bus', '[role="button"][aria-label^="Bus "]'], ['band', '[role="button"][aria-label^="Band "]']]) {
        const label = await p.evaluate((sel) => { const k = [...document.querySelectorAll('#machineDiagram ' + sel)].find((g) => g.getAttribute('aria-disabled') !== 'true'); k.scrollIntoView({ block: 'center', inline: 'center' }); k.focus(); return k.getAttribute('aria-label'); }, sel);
        await p.keyboard.press('Enter'); await p.waitForTimeout(150);
        const inside = await p.evaluate(() => !!document.activeElement.closest('.desk-pop'));
        await p.keyboard.press('Escape'); await p.waitForTimeout(150);
        out[what] = { label, inside, back: await p.evaluate(() => (document.activeElement ? document.activeElement.getAttribute('aria-label') || document.activeElement.tagName : null)), pop: await p.evaluate(() => !!document.querySelector('.desk-pop')) };
      }
      await p.evaluate(() => { window.ring.machine.close(); window.ring.control.stop(); });
      return out;
    } finally { await own.close(); }
  },
  judge: (r) => {
    const bad = Object.entries(r).filter(([, x]) => !x.inside || x.pop || x.back !== x.label).map(([k, x]) => `${k}: Escape left the focus on ${x.back} (the key was ${x.label}; in the popover first ${x.inside}; still open ${x.pop})`);
    return { ok: !bad.length, why: bad[0], note: `Enter on ${Object.values(r).map((x) => x.label).join(', ')} opened each popover with the focus inside it, and Escape closed it with the focus back on the same key` };
  },
});

// (2) **Every key the view has draws a focus mark** (the review: the master's
// band rows and RESET sat outside the strip rule and drew nothing). Tabbed
// through the whole view by the keyboard, each stop inside #machine reads
// differently focused than not.
SCENARIOS.push({
  name: 'every key in the view marks its keyboard focus: the strips, the buses, the band rows, RESET, the genres, the toolbar and the engine',
  area: 'view',
  query: 'v=2&seed=1',
  deadline: 150000,
  drive: async (page) => {
    const own = await ownPage(page, { viewport: { width: 1440, height: 900 } });
    const p = own.page;
    const tab = page.context().browser().browserType().name() === 'webkit' ? 'Alt+Tab' : 'Tab';
    try {
      await p.evaluate(body(OPEN_VIEW + 'return 1;'));
      // a lean on a band, so RESET is live
      await p.evaluate(() => { const b = document.querySelector('#machineDiagram [role="button"][aria-label^="Band "]'); b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await p.waitForTimeout(150);
      await p.evaluate(() => { const up = [...document.querySelectorAll('.desk-pop button')].find((b) => /up a step/.test(b.getAttribute('aria-label') || '')); up.click(); document.querySelector('.desk-pop').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
      await p.waitForTimeout(150);
      // (M22) the walk starts from a stated key, the first of the toolbar: after a
      // blur Firefox keeps the sequential focus navigation starting point where
      // the last focus was (the band's popover), and a walk from there ran off
      // the page's end into the browser's own chrome before it could wrap to RESET
      await p.evaluate(() => { window.scrollTo(0, 0); document.querySelector('#machine .ring-tools button').focus({ preventScroll: true }); });
      const seen = new Map();
      for (let i = 0; i < 160; i++) {
        await p.keyboard.press(tab);
        const r = await p.evaluate(() => {
          const a = document.activeElement;
          // the ring's own keys, moved into the view, mark their focus by the ring's rule (K24), and are the ring's rows
          if (!a || !a.closest || !a.closest('#machine') || a.closest('.desk-pop') || a.closest('#stage')) return null;
          if (!(a.matches('button, [role="button"]'))) return null;
          const look = (el) => { const cs = getComputedStyle(el); const rect = el.querySelector && el.querySelector(':scope > rect'); const rs = rect ? getComputedStyle(rect) : null;
            return [cs.outlineStyle, cs.outlineColor, cs.borderTopColor, cs.backgroundColor, cs.boxShadow, rs ? rs.stroke : '', rs ? rs.strokeWidth : ''].join('|'); };
          const focused = look(a);
          const name = a.getAttribute('aria-label') || a.textContent.trim().slice(0, 20);
          a.blur();
          const rest = look(a);
          a.focus({ preventScroll: true });
          return { name, marked: focused !== rest, svg: a instanceof SVGElement };
        });
        if (r && !seen.has(r.name)) seen.set(r.name, r);
      }
      await p.evaluate(() => { window.ring.machine.close(); window.ring.control.stop(); });
      return [...seen.values()];
    } finally { await own.close(); }
  },
  judge: (r) => {
    const unmarked = r.filter((x) => !x.marked).map((x) => x.name);
    const has = (re) => r.some((x) => re.test(x.name));
    const bad = [];
    if (unmarked.length) bad.push(`${unmarked.length} keys draw no focus mark: ${unmarked.slice(0, 6).join(', ')}`);
    for (const [re, what] of [[/^Band /, 'a band row'], [/^Reset the desk/, 'RESET'], [/^Strip /, 'a strip'], [/^Bus /, 'a bus'], [/Copy the link/, 'COPY LINK'], [/^house-v2/, 'an engine key']]) if (!has(re)) bad.push(`Tab never reached ${what}`);
    return { ok: !bad.length, why: bad[0], note: `${r.length} keys reached by the keyboard, ${r.filter((x) => x.svg).length} of them drawn in SVG — the band rows and RESET among them — and every one marks its focus` };
  },
});

// (3) **A resize re-lays the graph at the density's steps, not on every pixel**
// (both reviews: 40 one-pixel steps were 1.1 s of script and 34,572 mutations
// at 1440). The width is read once a frame and the spacing moves in twentieths.
SCENARIOS.push({
  name: 'forty one-pixel resizes re-lay the graph at most at the density\'s steps: a handful of layouts, not forty',
  area: 'view',
  query: 'v=2&seed=1',
  serial: true,
  drive: async (page) => {
    const own = await ownPage(page, { viewport: { width: 1440, height: 900 } });
    const p = own.page;
    try {
      await p.evaluate(body(OPEN_VIEW + `await sleep(400); ctl.stop(); await sleep(600); return 1;`));
      await p.evaluate(() => {
        window.__svgW = 0; window.__paths = 0;
        const svg = document.getElementById('machineDiagram');
        new MutationObserver((l) => { for (const m of l) { if (m.target === svg && m.attributeName === 'width') window.__svgW++; if (m.target instanceof SVGPathElement && m.attributeName === 'd') window.__paths++; } }).observe(svg, { subtree: true, attributes: true });
      });
      for (let i = 1; i <= 40; i++) { await p.setViewportSize({ width: 1440 + i, height: 900 }); await p.waitForTimeout(30); }
      await p.waitForTimeout(400);
      const r = await p.evaluate(() => ({ svgW: window.__svgW, paths: window.__paths }));
      await p.evaluate(() => window.ring.machine.close());
      return r;
    } finally { await own.close(); }
  },
  judge: (r) => ({
    ok: r.svgW <= 4 && r.paths <= 4 * 200,
    why: `the drawing's width was rewritten ${r.svgW} times and ${r.paths} wire paths re-routed over forty one-pixel steps`,
    note: `forty one-pixel steps from 1440: the drawing's width rewritten ${r.svgW} times and ${r.paths} wire paths re-routed — the pane's own settle, not a layout a pixel`,
  }),
});

// (4) **Stopped, the view draws nothing new unless something changed** (both
// reviews: it redrew twelve times a second with the set stopped).
SCENARIOS.push({
  name: 'with the set stopped the view publishes and redraws nothing for three seconds, and a change still draws at once',
  area: 'view',
  query: 'v=2&seed=1',
  serial: true,
  drive: async (page) => {
    const own = await ownPage(page, { viewport: { width: 1440, height: 900 } });
    const p = own.page;
    try {
      await p.evaluate(body(OPEN_VIEW + `ctl.stop(); await sleep(800); return 1;`));
      const r = await p.evaluate(async () => {
        const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        let mut = 0;
        const o = new MutationObserver((l) => { mut += l.length; });
        o.observe(document.getElementById('machineDiagram'), { subtree: true, attributes: true, childList: true, characterData: true });
        const n0 = window.ring.machine.snapshot().n;
        await sleep(3000);
        const idle = { publishes: window.ring.machine.snapshot().n - n0, mutations: mut };
        // a change: a strip muted from the desk, with the set stopped
        const n1 = window.ring.machine.snapshot().n;
        const key = [...document.querySelectorAll('#machineDiagram [role="button"][aria-label^="Mute "]')].find((g) => g.getAttribute('aria-disabled') !== 'true');
        key.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await sleep(400);
        const changed = window.ring.machine.snapshot().n - n1;
        key.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        o.disconnect();
        window.ring.machine.close();
        return { idle, changed };
      });
      return r;
    } finally { await own.close(); }
  },
  judge: (r) => ({
    ok: r.idle.publishes === 0 && r.idle.mutations === 0 && r.changed >= 1,
    why: JSON.stringify(r),
    note: `stopped for three seconds the view published ${r.idle.publishes} times and its drawing took ${r.idle.mutations} mutations; a strip muted from the desk published at once (${r.changed})`,
  }),
});

// (5) **The phone's ring and toolbar stay pinned over the whole page** (the
// review: the block left with the side pane, before the graph and the ledger).
SCENARIOS.push({
  name: 'on a phone the ring and its toolbar stay pinned with the graph and the ledger on screen',
  area: 'view',
  query: 'v=2&seed=1',
  drive: async (page) => {
    const own = await ownPage(page, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p = own.page;
    try {
      await p.evaluate(body(OPEN_VIEW + 'return 1;'));
      const at = async (sel) => {
        await p.evaluate((sel) => { const e = document.querySelector(sel); const y = e.getBoundingClientRect().top + scrollY; scrollTo(0, Math.max(0, y - 300)); }, sel);
        await p.waitForTimeout(250);
        return p.evaluate(() => { const b = document.querySelector('#machine .ring-block').getBoundingClientRect(); const c = document.querySelector('#machine [data-tool="close"]').getBoundingClientRect(); return { scroll: Math.round(scrollY), top: Math.round(b.top), close: c.bottom > 0 && c.top < innerHeight }; });
      };
      const graph = await at('#machine .pane.graph');
      const ledger = await at('#machine .pane.ledger');
      await p.evaluate(() => { scrollTo(0, document.documentElement.scrollHeight); });
      await p.waitForTimeout(250);
      const end = await p.evaluate(() => { const b = document.querySelector('#machine .ring-block').getBoundingClientRect(); return { scroll: Math.round(scrollY), top: Math.round(b.top) }; });
      await p.evaluate(() => { window.ring.machine.close(); window.ring.control.stop(); });
      return { graph, ledger, end };
    } finally { await own.close(); }
  },
  judge: (r) => ({
    ok: r.graph.scroll > 0 && r.graph.top === 0 && r.graph.close && r.ledger.top === 0 && r.ledger.close && r.end.top === 0,
    why: JSON.stringify(r),
    note: `scrolled to the graph (${r.graph.scroll} px), to the ledger (${r.ledger.scroll}) and to the page's end (${r.end.scroll}) the ring's block stands at ${r.graph.top}, ${r.ledger.top} and ${r.end.top}, CLOSE on screen`,
  }),
});

// (6) **The About inside the view holds the page still and gives the focus back**
// (the review: the sheet's body rule let the page scroll under it, and the
// opener rebuilt by the view's close left the focus on the page).
SCENARIOS.push({
  name: 'the About opened from the ring inside the view: the page does not scroll under it, and closed after the view it gives play its focus',
  area: 'view',
  query: 'v=2&seed=1',
  drive: async (page) => {
    const own = await ownPage(page, { viewport: { width: 1440, height: 900 } });
    const p = own.page;
    try {
      await p.evaluate(async () => { await window.ring.machine.open(); });
      await p.waitForTimeout(500);
      await p.evaluate(() => { const g = document.querySelector('#actions g[data-action="play"]'); g.focus(); });
      await p.keyboard.press('Enter');
      await p.waitForTimeout(300);
      const open = await p.evaluate(() => ({ open: document.getElementById('about').open, overflow: getComputedStyle(document.body).overflow }));
      const scroll = await p.evaluate(async () => { const y0 = scrollY; window.scrollBy(0, 600); document.scrollingElement.scrollTop += 600; await new Promise((r) => setTimeout(r, 100)); return [y0, scrollY]; });
      await p.evaluate(() => window.ring.machine.close());
      await p.waitForTimeout(300);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      const back = await p.evaluate(() => { const a = document.activeElement; return { open: document.getElementById('about').open, active: a ? a.getAttribute('data-action') || a.id || a.tagName : null }; });
      return { open, scroll, back };
    } finally { await own.close(); }
  },
  judge: (r) => ({
    ok: r.open.open && r.open.overflow === 'hidden' && r.scroll[0] === r.scroll[1] && !r.back.open && r.back.active === 'play',
    why: JSON.stringify(r),
    note: `opened from play inside the view the About held the page (body overflow ${r.open.overflow}, the scroll ${r.scroll.join(' → ')}); the view closed under it and Escape gave the focus to ${r.back.active}`,
  }),
});

// (7) **COPY LINK keeps the focus on the fallback path** (both reviews).
SCENARIOS.push({
  name: 'COPY LINK pressed by a key with no async clipboard keeps the focus on the key',
  area: 'view',
  query: 'v=2&seed=1',
  drive: async (page) => {
    const own = await ownPage(page, { viewport: { width: 1440, height: 900 } });
    const p = own.page;
    try {
      await p.evaluate(body(OPEN_VIEW + 'return 1;'));
      await p.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); window.scrollTo(0, 0); document.querySelector('#machine [data-tool="copy"]').focus(); });
      await p.keyboard.press('Enter');
      await p.waitForTimeout(200);
      const r = await p.evaluate(() => ({ label: document.querySelector('#machine [data-tool="copy"]').textContent.trim(), active: document.activeElement ? document.activeElement.getAttribute('data-tool') || document.activeElement.tagName : null }));
      await p.evaluate(() => { window.ring.machine.close(); window.ring.control.stop(); });
      return r;
    } finally { await own.close(); }
  },
  judge: (r) => ({ ok: r.label === 'copied' && r.active === 'copy', why: JSON.stringify(r), note: `the fallback copied (the key read "${r.label}") and the focus stayed on the ${r.active} key` }),
});

// (8) **No stale manual page on the next open** (the review: its state lived
// at module level and a page up when the view closed by a key came back).
SCENARIOS.push({
  name: 'a manual page up when the view closes by a key is gone when the view opens again',
  area: 'view',
  query: 'v=2&seed=1',
  serial: true,
  drive: async (page) => {
    const own = await ownPage(page, { viewport: { width: 1440, height: 900 } });
    const p = own.page;
    try {
      await p.evaluate(body(OPEN_VIEW + 'return 1;'));
      const at = await p.evaluate(() => { const g = document.querySelector('#machineDiagram [data-box="duck"]'); g.scrollIntoView({ block: 'center', inline: 'center' }); const r = g.getBoundingClientRect(); return { x: r.left + 20, y: r.top + 7 }; });
      await p.mouse.move(at.x, at.y, { steps: 3 });
      await p.waitForTimeout(1100);
      const up = await p.evaluate(() => (document.querySelector('#machine [role="tooltip"][data-help]') || { getAttribute: () => null }).getAttribute('data-help'));
      await p.evaluate(() => document.querySelector('#machine [data-tool="close"]').focus());
      await p.keyboard.press('Enter');
      await p.waitForTimeout(400);
      await p.evaluate(async () => { await window.ring.machine.open(); });
      await p.waitForTimeout(1500);
      const after = await p.evaluate(() => (document.querySelector('#machine [role="tooltip"][data-help]') || { getAttribute: () => null }).getAttribute('data-help'));
      await p.evaluate(() => { window.ring.machine.close(); window.ring.control.stop(); });
      return { up, after };
    } finally { await own.close(); }
  },
  judge: (r) => ({ ok: r.up === 'duck' && !r.after, why: JSON.stringify(r), note: `the page for ${r.up} was up when CLOSE was pressed by a key, and the view opened again with no page (${r.after})` }),
});

// (11) **One tolerance for the same spell** (the review: Ember held at 0.38 —
// 96 % — still lit Deep House and House, within the lamps' old 0.015).
SCENARIOS.push({
  name: 'a spell a hundredth off the house lights neither Deep House nor House, and the SPELL tile marks that cell off the house',
  area: 'view',
  query: 'v=2&seed=1&spell=ember:0.38',
  drive: async (page) => {
    const own = await ownPage(page, { viewport: { width: 1440, height: 900 } });
    const p = own.page;
    try {
      await p.evaluate(body(OPEN_VIEW + 'return 1;'));
      const r = await p.evaluate(() => ({
        spell: JSON.stringify(window.ring.machine.snapshot().spell),
        lit: [...document.querySelectorAll('#machine .genres button')].filter((k) => k.getAttribute('aria-pressed') === 'true').map((k) => k.dataset.genre),
        ember: document.querySelector('#machine .spell-grid .cell[data-bird="ember"]').className,
      }));
      await p.evaluate(() => { window.ring.machine.close(); window.ring.control.stop(); });
      return r;
    } finally { await own.close(); }
  },
  judge: (r) => ({ ok: !r.lit.length && /off/.test(r.ember), why: JSON.stringify(r), note: `under ${r.spell} no genre key is lit and the tile's Ember cell reads off the house` }),
});

// **Nothing moves when a header's key comes or goes** (M10, Eugene: *"both
// BACK on genres and the LEDGER buttons, when present, stretch the header
// vertically, and the page wiggles on pressing them"*): each header is one
// height with its key and without it, and pressing BACK on the genres, LEDGER
// and HIDE moves none of the ring box, the genre grid or the readings by a
// pixel, at 390 and 1440 — read in the page's own coordinates, and the ring box,
// pinned on a phone, where it stands in the window.
SCENARIOS.push({
  name: 'a header is one height with its key or without, and pressing BACK, LEDGER or HIDE moves nothing above or beside it',
  area: 'view',
  query: 'v=2&seed=1',
  deadline: 120000,
  drive: async (page) => {
    const out = {};
    for (const [name, opts] of [['1440', { viewport: { width: 1440, height: 900 } }], ['390', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]]) {
      const own = await ownPage(page, opts);
      const p = own.page;
      try {
        await p.evaluate(() => { try { localStorage.removeItem('deep-house.machine.ledger'); } catch (e) { /* nothing kept */ } });
        await p.evaluate(body(`await started(); await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000); await bounded(window.ring.machine.open(), 12000); await sleep(500); return 1;`));
        const read = () => p.evaluate(() => {
          const at = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + window.scrollX, r.top + window.scrollY, r.width, r.height].map((v) => Math.round(v * 10) / 10); };
          // the ring box is pinned on a phone: it is read where it stands in the window
          const pin = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 10) / 10); };
          return { ring: pin('#machine .ringbox'), grid: at('#machine .genres'), list: at('#machine .list'), gHead: at('#machine .genre-block h2'), rHead: at('#machine .facts h2'),
            lHead: at('#machine .pane.ledger h2'), back: !!document.querySelector('#machine [aria-label="Back to the genre families"]'), key: !!document.querySelector('#machine [aria-label="Show the ledger"]'),
            scroll: Math.round(window.scrollY), height: document.documentElement.scrollHeight };
        });
        // the key brought into view first, and the page read there, so what a press moves is the press's
        const press = async (sel) => {
          const c = await p.evaluate((sel) => { const e = document.querySelector(sel); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
          await p.waitForTimeout(150);
          const pre = await read();
          if (name === '390') await p.touchscreen.tap(c.x, c.y); else await p.mouse.click(c.x, c.y);
          await p.waitForTimeout(300);
          return pre;
        };
        const families = await read();
        await p.evaluate(() => document.querySelector('#machine .genres button[data-genre="House"]').click());
        await p.waitForTimeout(250);
        const sub = await read();
        const preBack = await press('#machine [aria-label="Back to the genre families"]');
        const backed = await read();
        const preShow = await press('#machine [aria-label="Show the ledger"]');
        const shown = await read();
        const preHide = await press('#machine [aria-label="Hide the ledger"]');
        const hidden = await read();
        await p.evaluate(() => { window.ring.machine.close(); window.ring.control.stop(); });
        out[name] = { families, sub, preBack, backed, preShow, shown, preHide, hidden };
      } finally { await own.close(); }
    }
    return out;
  },
  judge: (r) => {
    const bad = [];
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    for (const [k, x] of Object.entries(r)) {
      if (!x.sub.back || x.families.back) bad.push(`${k}: BACK was not there on the sub-genre tier alone`);
      if (x.sub.gHead[3] !== x.families.gHead[3]) bad.push(`${k}: the GENRES header is ${x.families.gHead[3]} px without BACK and ${x.sub.gHead[3]} with it`);
      if (!x.families.key || x.shown.key) bad.push(`${k}: LEDGER stood over the readings ${x.families.key}, after it was pressed ${x.shown.key}`);
      if (x.shown.rHead[3] !== x.families.rHead[3]) bad.push(`${k}: the READINGS header is ${x.families.rHead[3]} px with LEDGER and ${x.shown.rHead[3]} without it`);
      for (const [a, b, what] of [[x.preBack, x.backed, 'BACK'], [x.preShow, x.shown, 'LEDGER'], [x.preHide, x.hidden, 'HIDE']]) {
        // on a phone the ledger is the page's end: put away, the page is shorter by it and the browser takes the
        // scroll back by as much, which is the page ending and not a wiggle — the pinned ring rides that scroll
        const clamp = k === '390' && what === 'HIDE' ? a.scroll - b.scroll : 0;
        if (clamp && Math.abs(clamp - Math.min(a.height - b.height, a.scroll)) > 2) bad.push(`${k}: HIDE took the scroll back by ${clamp} px where the page shortened by ${a.height - b.height}`);
        for (const el of ['ring', 'grid', 'list']) {
          if (el === 'ring' && clamp) continue;
          if (!same(a[el], b[el])) bad.push(`${k}: pressing ${what} moved the ${el} from ${a[el]} to ${b[el]}`);
        }
      }
    }
    return {
      ok: !bad.length,
      why: bad[0],
      note: `at 1440 and on a phone the GENRES header is ${r['1440'].families.gHead[3]} and ${r['390'].families.gHead[3]} px with BACK or without, the READINGS header ${r['1440'].families.rHead[3]} and ${r['390'].families.rHead[3]} px with LEDGER or without, and pressing BACK, LEDGER and HIDE moved the ring box, the genre grid and the readings by nothing; on a phone HIDE, the page's last block, shortens the page by ${r['390'].preHide.height - r['390'].hidden.height} px and the browser takes the scroll back by ${r['390'].preHide.scroll - r['390'].hidden.scroll}, which is the page ending`,
    };
  },
});

// **An untuned genre key presses nothing** (M10, Eugene: *"the tiles we do not
// support completely need to be disabled and not clickable"*): Liquid pressed
// by a hand at 390 and 1440 asks no spell, changes no address, writes no ledger
// line and lights no lamp; Tech House, tuned, still plays.
SCENARIOS.push({
  name: 'an untuned genre key is disabled: pressed, it changes no spell, link, ledger line or lamp, and a tuned one still plays',
  area: 'view',
  query: 'v=2&seed=1',
  deadline: 120000,
  drive: async (page) => {
    const out = {};
    for (const [name, opts] of [['1440', { viewport: { width: 1440, height: 900 } }], ['390', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]]) {
      const own = await ownPage(page, opts);
      const p = own.page;
      try {
        await p.evaluate(body(OPEN_VIEW + 'return 1;'));
        const state = () => p.evaluate(() => ({ asked: window.ring.control.mix && window.ring.control.mix.spellAsked ? JSON.stringify(window.ring.control.mix.spellAsked) : null, url: location.search,
          lines: window.ring.machine.snapshot().ledger.filter((e) => /genre preset/.test(e.what)).length,
          lamps: [...document.querySelectorAll('#machine .genres button')].filter((k) => k.getAttribute('aria-pressed') === 'true').map((k) => k.dataset.genre).join(',') }));
        const press = async (genre) => {
          const c = await p.evaluate((g) => { const e = document.querySelector('#machine .genres button[data-genre="' + g + '"]'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, genre);
          await p.waitForTimeout(150);
          if (name === '390') await p.touchscreen.tap(c.x, c.y); else await p.mouse.click(c.x, c.y);
          await p.waitForTimeout(400);
        };
        // (M18) an untuned family's whole tier: Breaks & Big Beat
        await press('Breaks & Big Beat');
        const keys = await p.evaluate(() => [...document.querySelectorAll('#machine .genres button')].map((k) => [k.dataset.genre, k.getAttribute('aria-disabled')]));
        const before = await state();
        await press('Big Beat');
        const after = await state();
        await p.evaluate(() => document.querySelector('#machine [aria-label="Back to the genre families"]').click());
        await p.waitForTimeout(200);
        await press('House');
        const house = await p.evaluate(() => [...document.querySelectorAll('#machine .genres button')].filter((k) => k.getAttribute('aria-disabled') !== 'true').map((k) => k.dataset.genre));
        const b2 = await state();
        await press('Tech House');
        const tuned = await state();
        // (M11) Trance, which took Breaks' cell: every key of its tier disabled, and none lit
        await p.evaluate(() => document.querySelector('#machine [aria-label="Back to the genre families"]').click());
        await p.waitForTimeout(200);
        await press('Trance');
        const trance = await p.evaluate(() => [...document.querySelectorAll('#machine .genres button')].map((k) => [k.dataset.genre, k.getAttribute('aria-disabled'), k.getAttribute('aria-pressed')]));
        await p.evaluate(() => { window.ring.machine.close(); window.ring.control.stop(); });
        out[name] = { keys, before, after, house, b2, tuned, trance };
      } finally { await own.close(); }
    }
    return out;
  },
  judge: (r) => {
    const bad = [];
    for (const [k, x] of Object.entries(r)) {
      const on = x.keys.filter(([, d]) => d !== 'true').map(([g]) => g);
      if (on.length) bad.push(`${k}: on Breaks & Big Beat's tier ${on.join(', ')} still press`);
      if (JSON.stringify(x.before) !== JSON.stringify(x.after)) bad.push(`${k}: Big Beat pressed changed ${JSON.stringify(x.before)} to ${JSON.stringify(x.after)}`);
      if (x.house.sort().join() !== 'Deep House,House,Tech House') bad.push(`${k}: on House's tier ${x.house.join(', ')} press`);
      if (x.tuned.lines !== x.b2.lines + 1 || x.tuned.url === x.b2.url) bad.push(`${k}: Tech House pressed wrote ${x.tuned.lines - x.b2.lines} lines and the address ${x.tuned.url}`);
      if (x.trance.length !== 9 || x.trance[4][0] !== 'Trance' || x.trance.some(([, d, l]) => d !== 'true' || l === 'true')) bad.push(`${k}: Trance's tier reads ${JSON.stringify(x.trance)}`);
    }
    return {
      ok: !bad.length,
      why: bad[0],
      note: `at 1440 and on a phone every key of Breaks & Big Beat's tier is disabled and Big Beat pressed left the spell, the address, the ledger and the lamps as they were; on House's tier ${r['1440'].house.join(', ')} press, and Tech House pressed wrote its line and its spell into the address; Trance's tier is its nine keys, every one disabled and none lit`,
    };
  },
});

// **The ways out of the view** (M8, Eugene: *"the bottom-right icon going to
// the machine view should be hidden in the machine view itself, and the exit
// should be a few more obvious things: clicking on the dark space at the edge
// of the ring, and a Close button on the right of the GENRES header"*), and the
// GENRES header's WORK IN PROGRESS (*"to outline that this is wishful thinking
// here"*): the mark unseen in the view, the tag centred between the title and
// the keys, a still press on the dark round the ring closing it and a drag
// there not, each close taking `view=machine` off the address and leaving the
// focus on the ring. **Since M9 the way back is BACK in the ring box's
// top-right corner** (Eugene: *"the RING button on Genres doesn't read — put it
// into the top-right corner of the ring box itself, and just name it Back"*),
// **and since M10 its bottom-right** (*"to mirror the original cog button which
// is always there on the main view"*): there at 390, 1440 and 2560, a spacing
// step clear of the box's bottom edge, clear of the ring's circle and of
// everything the ring draws, and no RING key anywhere.
SCENARIOS.push({
  name: 'in the view the mark is unseen, GENRES says WORK IN PROGRESS on its title\'s line, the toolbar under the ring reads COPY AT · COPY LINK · CLOSE, and CLOSE or a still press on the dark round the ring closes it',
  area: 'view',
  query: 'v=2&seed=1',
  deadline: 150000,
  drive: async (page) => {
    const out = {};
    for (const [name, opts] of [['1440', { viewport: { width: 1440, height: 900 } }], ['2560', { viewport: { width: 2560, height: 1440 } }], ['390', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]]) {
      const own = await ownPage(page, opts);
      const p = own.page;
      try {
        const open = async () => { await p.evaluate(body(OPEN_VIEW + 'return 1;')); await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200); };
        const state = () => p.evaluate(() => ({ on: window.ring.machine.on, view: /(^|[?&])view=machine/.test(location.search),
          focus: !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('#actions')) }));
        await open();
        const inView = await p.evaluate(() => {
          const mark = document.getElementById('panel').getBoundingClientRect();
          const h = document.querySelector('#machine .genre-block h2').getBoundingClientRect();
          const title = document.querySelector('#machine .genre-block h2 .title').getBoundingClientRect();
          const tag = document.querySelector('#machine .genre-block [data-wip]');
          const t = tag.getBoundingClientRect();
          // (M13) the way back: CLOSE, the last key of the toolbar under the ring
          const key = document.querySelector('#machine .ring-tools [data-exit="view"]');
          const k = key.getBoundingClientRect();
          const bar = document.querySelector('#machine .ring-tools').getBoundingClientRect();
          const box = document.querySelector('#machine .ringbox').getBoundingClientRect();
          const keys = [...document.querySelectorAll('#machine .ring-tools button')];
          const rects = keys.map((b) => b.getBoundingClientRect());
          const rings = [...document.querySelectorAll('#machine button, #machine [role="button"]')].filter((b) => /^(ring|back)$/i.test(b.textContent.trim()) && !b.closest('.genre-block')).length;
          const hk = [...document.querySelectorAll('#machine .genre-block h2 .keys button')].map((b) => b.getBoundingClientRect());
          return { markSeen: mark.width > 0 && mark.height > 0, view: /(^|[?&])view=machine/.test(location.search),
            tag: tag.textContent, tagTitle: tag.title,
            // (M13) WORK IN PROGRESS on the title's own line, whole, clear of the title and of any key
            oneLine: Math.abs((t.top + t.bottom) / 2 - (title.top + title.bottom) / 2) < 3, whole: tag.scrollWidth <= tag.clientWidth + 1,
            between: t.left >= title.right && hk.every((b) => t.right <= b.left), headH: +h.height.toFixed(1),
            order: keys.map((b) => b.textContent.trim()), inRow: rects.every((r) => Math.abs(r.top - rects[0].top) < 1) && rects.every((r, i) => !i || r.left > rects[i - 1].right),
            underRing: Math.abs(bar.top - box.bottom) < 1.5, right: +(bar.right - k.right).toFixed(1),
            key: key.textContent, keyTitle: key.title, rings, role: document.querySelector('#machine .ring-tools').getAttribute('role') };
        });
        // CLOSE, pressed as a hand does
        const k = await p.evaluate(() => { const r = document.querySelector('#machine [data-exit="view"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
        if (name === '390') await p.touchscreen.tap(k.x, k.y); else await p.mouse.click(k.x, k.y);
        await p.waitForTimeout(300);
        const byKey = await state();
        // the dark round the ring: a corner of its box, outside its circle
        await open();
        const dark = await p.evaluate(() => {
          const b = document.querySelector('#machine .ringbox').getBoundingClientRect(); const t = document.getElementById('tilt').getBoundingClientRect();
          const rr = Math.min(t.width, t.height) / 2; const cx = t.left + t.width / 2, cy = t.top + t.height / 2;
          for (const [x, y] of [[b.left + 6, b.top + 6], [b.right - 6, b.top + 6], [b.left + 6, b.bottom - 6], [b.right - 6, b.bottom - 6]]) if (Math.hypot(x - cx, y - cy) > rr + 4) return { x, y };
          return null;
        });
        let dragged = null; let byPress = null;
        if (dark) {
          await p.mouse.move(dark.x, dark.y); await p.mouse.down(); await p.mouse.move(dark.x + 30, dark.y + 20, { steps: 6 }); await p.mouse.up();
          await p.waitForTimeout(300);
          dragged = await state();
          if (name === '390') await p.touchscreen.tap(dark.x, dark.y); else await p.mouse.click(dark.x, dark.y);
          await p.waitForTimeout(300);
          byPress = await state();
        }
        await p.evaluate(() => { if (window.ring.machine.on) window.ring.machine.close(); window.ring.control.stop(); });
        out[name] = { inView, byKey, dark, dragged, byPress };
      } finally { await own.close(); }
    }
    return out;
  },
  judge: (r) => {
    const bad = [];
    for (const [k, x] of Object.entries(r)) {
      if (x.inView.markSeen) bad.push(`${k}: the panel mark is seen over the view`);
      if (!x.inView.view) bad.push(`${k}: the open view is not on the address`);
      if (!/work in progress/i.test(x.inView.tag) || !x.inView.oneLine || !x.inView.whole || !x.inView.between) bad.push(`${k}: the tag "${x.inView.tag}" on the title's line ${x.inView.oneLine}, whole ${x.inView.whole}, between the title and the keys ${x.inView.between}`);
      if (!/^copy at \d+:\d\d,copy link,close$/.test(x.inView.order.join()) || !x.inView.inRow || !x.inView.underRing || x.inView.right < 7.5 || x.inView.right > 16) bad.push(`${k}: the toolbar reads ${x.inView.order.join(' · ')}, in one row ${x.inView.inRow}, under the ring ${x.inView.underRing}, ${x.inView.right} px from its right`);
      if (!/\d+ sub-genres? (are|is) tuned/.test(x.inView.tagTitle)) bad.push(`${k}: the tag's tooltip says "${x.inView.tagTitle}"`);
      if (!/^close$/i.test(x.inView.key) || !/closes the machine view/.test(x.inView.keyTitle)) bad.push(`${k}: the key reads "${x.inView.key}" ("${x.inView.keyTitle}")`);
      if (x.inView.rings) bad.push(`${k}: ${x.inView.rings} RING or BACK keys outside the genres are still on the page`);
      // (M14) a plain group of tab stops: a toolbar role promises arrow keys, and the page's one key is Space
      if (x.inView.role !== 'group') bad.push(`${k}: the toolbar's role is ${x.inView.role}`);
      if (x.byKey.on || x.byKey.view || !x.byKey.focus) bad.push(`${k}: CLOSE left ${JSON.stringify(x.byKey)}`);
      if (!x.dark) { bad.push(`${k}: no dark round the ring inside its box`); continue; }
      if (!x.dragged.on || !x.dragged.view) bad.push(`${k}: a drag on the dark closed the view (${JSON.stringify(x.dragged)})`);
      if (x.byPress.on || x.byPress.view || !x.byPress.focus) bad.push(`${k}: a still press on the dark left ${JSON.stringify(x.byPress)}`);
    }
    return {
      ok: !bad.length,
      why: bad[0],
      note: `at 1440, 2560 and on a phone the mark is not seen in the view; the GENRES header's "${r['1440'].inView.tag}" stands whole on the title's line between it and the keys (the header ${r['390'].inView.headH}, ${r['1440'].inView.headH} and ${r['2560'].inView.headH} px), its tooltip "${r['1440'].inView.tagTitle}"; `
        + `the toolbar under the ring reads ${r['1440'].inView.order.join(' · ')} in one row, right-aligned ${r['390'].inView.right}, ${r['1440'].inView.right} and ${r['2560'].inView.right} px in, and no RING or BACK key is left outside the genres; `
        + `CLOSE closed the view, a drag on the dark round the ring did not, a still press there did, and each close took view=machine off the address and left the focus on the ring`,
    };
  },
});

// (M12's row, the ring's ink against BACK in the ring box's corner over five
// themes, is retired with M13: the way out is CLOSE in the toolbar under the
// ring box, which the ring cannot draw into — the box clips it.)

SCENARIOS.push({
  name: 'the wires into DRUMS join into one arrival with one arrowhead, and each pressed on its run, or its curve, lights that wire alone',
  area: 'view',
  query: 'v=2&seed=1',
  deadline: 120000,
  drive: async (page) => {
    const out = {};
    for (const [name, opts] of [['mouse', { viewport: { width: 1440, height: 900 } }], ['finger', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]]) {
      const own = await ownPage(page, opts);
      const p = own.page;
      try {
        await p.evaluate(body(OPEN_VIEW + 'return 1;'));
        const joins = await p.evaluate(() => [...document.querySelectorAll('#machineDiagram path[data-join]')].map((j) => ({ id: j.getAttribute('data-join'), count: +j.getAttribute('data-count'), arrow: !!j.getAttribute('marker-end') })));
        const drums = joins.find((j) => j.id.startsWith('bus:drums|top'));
        const members = drums ? await p.evaluate((id) => [...document.querySelectorAll('#machineDiagram [data-joins="' + id + '"] path[data-hit]')].map((h) => h.getAttribute('data-hit')), drums.id) : [];
        const arrowsIn = drums ? await p.evaluate((id) => document.querySelectorAll('#machineDiagram [data-joins="' + id + '"] path[marker-end]').length, drums.id) : -1;
        const press = async (x, y) => { if (name === 'finger') await p.touchscreen.tap(x, y); else await p.mouse.click(x, y); await p.waitForTimeout(150); };
        // a point on the wire's own hit stroke that the hand reaches there: on its run, or on its curve (the last stretch)
        const find = (id, where) => p.evaluate(async ([id, where]) => {
          const h = [...document.querySelectorAll('#machineDiagram path[data-hit]')].find((x) => x.getAttribute('data-hit') === id && x.closest('[data-joins]'));
          if (!h) return null;
          h.scrollIntoView({ block: 'center', inline: 'center' });
          await new Promise((r) => setTimeout(r, 60));
          const len = h.getTotalLength();
          const fs = where === 'run' ? [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8] : [0.97, 0.95, 0.93, 0.98, 0.91, 0.99];
          for (const f of fs) {
            const pt = h.getPointAtLength(len * f); const m = h.getScreenCTM();
            const x = pt.x * m.a + pt.y * m.c + m.e, y = pt.x * m.b + pt.y * m.d + m.f;
            if (document.elementFromPoint(x, y) === h) return { x, y };
          }
          return null;
        }, [id, where]);
        const selected = () => p.evaluate(() => [...document.querySelectorAll('#machineDiagram path[data-selected]')].map((x) => x.getAttribute('data-wire')));
        const presses = [];
        for (const id of members) for (const where of ['run', 'curve']) {
          const at = await find(id, where);
          if (!at) { presses.push({ id, where, found: false }); continue; }
          await press(at.x, at.y);
          const sel = await selected();
          presses.push({ id, where, found: true, sel });
          // let it go: a second press on the same place
          await press(at.x, at.y);
        }
        await p.evaluate(() => { window.ring.machine.close(); window.ring.control.stop(); });
        out[name] = { drums, members, arrowsIn, presses };
      } finally { await own.close(); }
    }
    return out;
  },
  judge: (r) => {
    const bad = [];
    for (const [k, x] of Object.entries(r)) {
      if (!x.drums || x.drums.count < 3 || !x.drums.arrow) { bad.push(`${k}: DRUMS has no joined arrival with its arrowhead (${JSON.stringify(x.drums)})`); continue; }
      if (x.members.length !== x.drums.count) bad.push(`${k}: the join says ${x.drums.count} wires and ${x.members.length} can be pressed`);
      if (x.arrowsIn) bad.push(`${k}: ${x.arrowsIn} wires of the join carry arrowheads of their own`);
      for (const q of x.presses.filter((q) => q.where === 'run')) if (!q.found || q.sel.join() !== q.id) bad.push(`${k}: ${q.id} pressed on its run lit ${q.found ? q.sel.join(', ') || 'nothing' : '(no point on its run a hand reaches)'}`);
      for (const q of x.presses.filter((q) => q.where === 'curve' && q.found)) if (q.sel.join() !== q.id) bad.push(`${k}: ${q.id} pressed on its curve lit ${q.sel.join(', ') || 'nothing'}`);
    }
    const m = r.mouse;
    const curves = Object.values(r).flatMap((x) => x.presses || []).filter((q) => q.where === 'curve' && q.found).length;
    return {
      ok: !bad.length,
      why: bad[0],
      note: `DRUMS takes ${m.drums && m.drums.count} wires as one arrival with one arrowhead (${m.members.join(', ')}); by a mouse at 1440 and a finger at 390 each pressed on its own run lit it alone, and ${curves} presses on a wire's own curve into the join lit that wire alone`,
    };
  },
});

SCENARIOS.push({
  name: 'a send\'s branch pressed lights that one wire\'s whole path, trunk and all, and the trunk itself picks up nothing',
  area: 'view',
  query: 'v=2&seed=1',
  deadline: 120000,
  drive: async (page) => {
    const out = {};
    for (const [name, opts] of [['mouse', { viewport: { width: 1440, height: 900 } }], ['finger', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]]) {
      const own = await ownPage(page, opts);
      const p = own.page;
      try {
        const geo = await p.evaluate(body(OPEN_VIEW + WIRE_PICK + `
          // the send area on the drawing: from the effects frame's foot to the strips' tops
          const eff = document.querySelector('#machineDiagram [data-area="effects"]').getBoundingClientRect();
          const strip = document.querySelector('#machineDiagram [data-box^="bus:"]').getBoundingClientRect();
          const trunk = document.querySelector('#machineDiagram path[data-trunk="sends"]');
          const riders = document.querySelectorAll('#machineDiagram [data-rides="sends"]').length;
          // a branch into the delay return, from the kick
          const branch = [...document.querySelectorAll('#machineDiagram [data-rides="sends"] path[data-hit]')].find((h) => h.getAttribute('data-hit') === 'bus:kick>send:delay' && h.previousElementSibling);
          const hits = [...document.querySelectorAll('#machineDiagram [data-rides="sends"] path[data-hit="bus:kick>send:delay"]')];
          let at = null;
          for (const h of hits) { h.scrollIntoView({ block: 'center', inline: 'center' }); await sleep(60); at = hitAt(h); if (at) break; }
          // the trunk's own points, and one on it away from every branch
          // its straight runs (M5: the curves where they meet are drawn apart from them)
          const runs = [...trunk.getAttribute('d').matchAll(/M (-?[\\d.]+) (-?[\\d.]+) L (-?[\\d.]+) (-?[\\d.]+)/g)].map((m) => m.slice(1, 5).map(Number));
          const m = trunk.getScreenCTM();
          const onTrunk = [];
          for (const [x0, y0, x1, y1] of runs) for (const f of [0.15, 0.35, 0.55, 0.75]) {
            const x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f;
            onTrunk.push({ x: x * m.a + y * m.c + m.e, y: x * m.b + y * m.d + m.f, ux: x, uy: y });
          }
          void branch;
          return { sendArea: Math.round(strip.top - eff.bottom), riders, at, runs, onTrunk };
        `));
        const press = async (x, y) => { if (name === 'finger') await p.touchscreen.tap(x, y); else await p.mouse.click(x, y); await p.waitForTimeout(150); };
        await press(geo.at.x, geo.at.y);
        const one = await p.evaluate((runs) => {
          const sel = [...document.querySelectorAll('#machineDiagram path[data-selected]')];
          // the lit path, walked a unit at a time (M6: its corners are arcs now)
          const pts = [];
          if (sel[0]) { const L = sel[0].getTotalLength(); for (let u = 0; u <= L; u += 1) { const q = sel[0].getPointAtLength(u); pts.push([q.x, q.y]); } }
          // does the lit path run along the trunk: along each run of it, for some length
          const along = runs.map(([x0, y0, x1, y1]) => {
            const v = Math.abs(x0 - x1) < 0.05;
            const on = pts.filter(([x, y]) => (v ? Math.abs(x - x0) < 0.6 && y >= Math.min(y0, y1) - 0.6 && y <= Math.max(y0, y1) + 0.6 : Math.abs(y - y0) < 0.6 && x >= Math.min(x0, x1) - 0.6 && x <= Math.max(x0, x1) + 0.6));
            return on.length >= 2;
          });
          return { selected: sel.map((x) => x.getAttribute('data-wire')), along, dim: [...new Set([...document.querySelectorAll('#machineDiagram [data-rides] path[data-branch], #machineDiagram path[data-trunk]')].map((x) => x.getAttribute('opacity')))],
            lit: [...document.querySelectorAll('#machineDiagram [data-lit]')].map((x) => x.getAttribute('data-box')).sort() };
        }, geo.runs);
        // let it go, then press the trunk where no branch is
        await press(geo.at.x, geo.at.y);
        let trunkPress = null;
        for (const q of geo.onTrunk) {
          const bare = await p.evaluate((q) => { const e = document.elementFromPoint(q.x, q.y); return !e || !e.closest || !e.closest('[data-hit]'); }, q);
          if (!bare) continue;
          await press(q.x, q.y);
          trunkPress = await p.evaluate(() => document.querySelectorAll('#machineDiagram path[data-selected]').length);
          break;
        }
        await p.evaluate(() => { window.ring.machine.close(); window.ring.control.stop(); });
        out[name] = { sendArea: geo.sendArea, riders: geo.riders, one, trunkPress };
      } finally { await own.close(); }
    }
    return out;
  },
  judge: (r) => {
    const bad = [];
    for (const [k, x] of Object.entries(r)) {
      if (x.one.selected.join() !== 'bus:kick>send:delay') bad.push(`${k}: the branch lit ${JSON.stringify(x.one.selected)}`);
      else if (!x.one.along.every(Boolean)) bad.push(`${k}: the lit path left the trunk (${JSON.stringify(x.one.along)})`);
      else if (x.one.lit.join() !== 'bus:kick,send:delay') bad.push(`${k}: the boxes lit are ${x.one.lit.join(', ')}`);
      else if (x.one.dim.join() !== '0.15') bad.push(`${k}: the other branches and the trunk stood at ${x.one.dim.join(', ')}`);
      if (x.trunkPress !== 0) bad.push(`${k}: a press on the bare trunk left ${x.trunkPress} wires lit`);
    }
    // Measured on seed 1 at 390 px, from the effects' foot to the meters' tops:
    // M1, which drew the sends as one bar, 96 px; M2, a lane each, 224; M3, one
    // trunk lane, 110. Since M4 the rail keeps room for fourteen wires through
    // a set, so the meters never move (RAIL_LANES): at most 40 over M1's.
    const area = r.finger.sendArea;
    if (!(area <= 96 + 40)) bad.push(`the phone's send area is ${area} px, where M1's was 96, M2's 224 and M3's 110`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: `a mouse and a finger on the kick's branch into the delay lit that wire alone — off its own port, along both runs of the trunk ${r.mouse.riders} sends ride, into its own port — `
        + `with the kick bus and the delay lit and the other branches and the trunk at 0.15; a press on the bare trunk lit nothing; the phone's send area is ${area} px (M1 96, M2 224, M3 110)`,
    };
  },
});

SCENARIOS.push({
  name: 'the master\'s response is inside its box, under the output at the foot of the chain',
  area: 'view',
  query: 'v=2&seed=1',
  drive: async (page) => {
    const out = {};
    for (const [name, opts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['wide', { viewport: { width: 2200, height: 1200 } }]]) {
      const own = await ownPage(page, opts);
      try {
        out[name] = await own.page.evaluate(body(OPEN_VIEW + `
          const g = document.querySelector('#machineDiagram [data-bells]');
          const rect = g.querySelector('rect:not(clipPath rect)');
          const w = +rect.getAttribute('width'), h = +rect.getAttribute('height');
          const path = g.querySelector('path');
          const len = path.getTotalLength();
          let outside = 0, n = 0, lo = Infinity, hi = -Infinity;
          for (let s = 0; s <= len; s += 1) { const q = path.getPointAtLength(s); n++; lo = Math.min(lo, q.y); hi = Math.max(hi, q.y); if (q.x < -0.01 || q.x > w + 0.01 || q.y < -0.01 || q.y > h + 0.01) outside++; }
          const place = (id) => { const t = document.querySelector('#machineDiagram [data-box="' + id + '"]').getAttribute('transform').match(/[-\\d.]+/g).map(Number); return t; };
          const [, bellsY] = g.getAttribute('transform').match(/[-\\d.]+/g).map(Number);
          const [, sinkY] = place('sink');
          const [, outY] = place('m:out');
          const wire = document.querySelector('#machineDiagram path[data-wire="m:out>sink"]').getAttribute('d');
          const pts = wire.match(/[-\\d.]+/g).map(Number);
          const straight = pts.length === 4 && Math.abs(pts[0] - pts[2]) < 0.1;
          const title = [...g.querySelectorAll('text')].map((t) => t.textContent)[0];
          const clipped = !!path.getAttribute('clip-path');
          window.ring.machine.close(); ctl.stop();
          return { w, h, n, outside, top: +lo.toFixed(1), bottom: +hi.toFixed(1), clipped, order: outY < sinkY && sinkY < bellsY, straight, title };
        `));
      } finally { await own.close(); }
    }
    return out;
  },
  judge: (r) => {
    const good = (x) => !x.outside && x.top >= 4.9 && x.bottom <= x.h - 4.9 && x.clipped && x.order && x.straight && /MASTER RESPONSE/.test(x.title);
    return {
      ok: good(r.desktop) && good(r.wide),
      why: `desktop ${JSON.stringify(r.desktop)}; wide ${JSON.stringify(r.wide)}`,
      note: `${r.desktop.n} points along the curve at 1440 and ${r.wide.n} at 2200, none outside its ${r.desktop.w}×${r.desktop.h} box and the highest ${r.desktop.top} units in from its edge; `
        + `the chain's last row drops straight into the output, and the response ("${r.desktop.title}") stands under it at the foot of the column`,
    };
  },
});

SCENARIOS.push({
  name: 'hovering a box or holding a finger on it shows its page of the manual beside it, filled and cut to the engine',
  area: 'view',
  query: 'v=2&seed=1',
  deadline: 150000,
  drive: async (page) => {
    const out = {};
    const IDS = ['duck', 'macro', 'm:clip', 'm:trim', 'm:out', 'sink', 'send:delay', 'lane:kick', 'bus:kick'];
    for (const ver of ['2', '1']) {
      const own = await ownPage(page, { viewport: { width: 1440, height: 900 } });
      const p = own.page;
      try {
        if (ver === '1') { await p.goto(p.url().replace(/([?&])v=2/, '$1v=1'), { waitUntil: 'networkidle' }); await p.waitForFunction(() => window.ring && window.deepHouse, null, { timeout: 20000 }); }
        await p.evaluate(body(OPEN_VIEW + 'return 1;'));
        const seen = [];
        for (const id of IDS) {
          const at = await p.evaluate((id) => { const g = document.querySelector(`#machineDiagram [data-box="${id}"]`); g.scrollIntoView({ block: 'center', inline: 'center' }); const r = g.getBoundingClientRect(); return { x: r.left + Math.min(20, r.width / 2), y: r.top + 7, box: { l: r.left, t: r.top, r: r.right, b: r.bottom } }; }, id);
          await p.mouse.move(at.x - 300, at.y - 300);
          await p.waitForTimeout(80);
          await p.mouse.move(at.x, at.y, { steps: 3 });
          await p.waitForTimeout(900);   // HELP_DELAY is 650 ms since M4
          const tip = await p.evaluate(() => { const t = document.querySelector('#machine [role="tooltip"][data-help]'); if (!t) return null; const r = t.getBoundingClientRect(); return { key: t.getAttribute('data-help'), text: t.textContent, l: r.left, t: r.top, r: r.right, b: r.bottom, op: getComputedStyle(t).opacity }; });
          const covers = tip && !(tip.r <= at.box.l || tip.l >= at.box.r || tip.b <= at.box.t || tip.t >= at.box.b) ? { tip: [tip.l, tip.t, tip.r, tip.b].map(Math.round), box: [at.box.l, at.box.t, at.box.r, at.box.b].map(Math.round), key: tip.key } : null;
          seen.push({ id, key: tip && tip.key, words: tip ? tip.text.length : 0, braces: tip ? /\{[a-z:]+\}/i.test(tip.text) : null, covers, v1: tip ? /Under house-v1 the lane plays/.test(tip.text) : null, v2: tip ? /Under house-v2 the instrument is drawn/.test(tip.text) : null });
        }
        // away: it fades and goes
        await p.mouse.move(2, 890);
        await p.waitForTimeout(700);
        const gone = await p.evaluate(() => !document.querySelector('#machine [role="tooltip"][data-help]'));
        // a finger: held half a second on the kick's title (M4: only a title
        // asks), then let go, and on its level key, which is not a title
        const held = await p.evaluate(body(`
          const row = document.querySelector('#machineDiagram [data-box="lane:kick"]');
          row.scrollIntoView({ block: 'center' });
          await sleep(50);
          const key = row;
          const box = row.getBoundingClientRect();
          const r = { left: box.left + 12, top: box.top + 4 };
          const o = { bubbles: true, pointerType: 'touch', pointerId: 7, isPrimary: true, clientX: r.left + 5, clientY: r.top + 5 };
          key.dispatchEvent(new PointerEvent('pointerdown', o));
          await sleep(650);
          const tip = document.querySelector('#machine [role="tooltip"][data-help]');
          key.dispatchEvent(new PointerEvent('pointerup', o));
          key.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: o.clientX, clientY: o.clientY }));
          await sleep(150);
          const out = { key: tip && tip.getAttribute('data-help'), opened: !!document.querySelector('.desk-pop') };
          // the level key held: no page, and its click still opens its popover
          const lk = document.querySelector('#machine [role="button"][aria-label="Strip kick"]');
          const kr = lk.getBoundingClientRect();
          const ko = { bubbles: true, pointerType: 'touch', pointerId: 8, isPrimary: true, clientX: kr.left + 5, clientY: kr.top + 5 };
          document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
          await sleep(300);
          lk.dispatchEvent(new PointerEvent('pointerdown', ko));
          await sleep(650);
          out.onKey = (document.querySelector('#machine [role="tooltip"][data-help]') || { getAttribute: () => null }).getAttribute('data-help');
          lk.dispatchEvent(new PointerEvent('pointerup', ko));
          lk.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: ko.clientX, clientY: ko.clientY }));
          await sleep(150);
          out.keyOpened = !!document.querySelector('.desk-pop');
          return out;
        `));
        await p.evaluate(() => { window.ring.machine.close(); window.ring.control.stop(); });
        out[`v${ver}`] = { seen, gone, held };
      } finally { await own.close(); }
    }
    return out;
  },
  judge: (r) => {
    const bad = [];
    for (const [v, x] of Object.entries(r)) {
      for (const s of x.seen) {
        if (!s.key || s.words < 80) bad.push(`${v} ${s.id}: ${s.key ? `only ${s.words} characters` : 'no tooltip'}`);
        else if (s.braces) bad.push(`${v} ${s.id}: a fill was left in braces`);
        else if (s.covers) bad.push(`${v} ${s.id}: the tooltip covers the box (${JSON.stringify(s.covers)})`);
      }
      if (!x.gone) bad.push(`${v}: the tooltip stayed after the pointer left`);
      if (!x.held.key || !x.held.key.startsWith('lane:') || x.held.opened) bad.push(`${v}: a finger held on the title showed ${x.held.key} and opened the popover ${x.held.opened}`);
      if (x.held.onKey && x.held.onKey !== x.held.key) bad.push(`${v}: a finger held on the level key showed ${x.held.onKey}`);
      if (!x.held.keyOpened) bad.push(`${v}: the level key's click after a hold opened nothing`);
    }
    const lane1 = r.v1.seen.find((s) => s.id === 'lane:kick');
    const lane2 = r.v2.seen.find((s) => s.id === 'lane:kick');
    if (!(lane1 && lane1.v1 && !lane1.v2 && lane2 && lane2.v2 && !lane2.v1)) bad.push(`the kick's page did not follow the engine: v1 ${JSON.stringify(lane1)}, v2 ${JSON.stringify(lane2)}`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: `under both engines ${r.v2.seen.length} boxes (${r.v2.seen.map((s) => s.key).join(', ')}) each showed their page beside the box and never over it, every fill filled; `
        + `the kick's page said its house-v1 line under v1 and its house-v2 line under v2; the page faded when the pointer left; a finger held on the kick's title showed ${r.v2.held.key}, and one held on its level key opened no page and its click its popover`,
    };
  },
});

// --- round M4 (09-25): the manual opens for a pointer that stays on a title ----

/** Where a box's title and its body are, in the page's pixels. */
const TITLE_AT = `
  const titleOf = (id) => { const g = document.querySelector('#machineDiagram [data-box="' + id + '"]'); const r = g.getBoundingClientRect(); return { x: r.left + 24, y: r.top + 6, bx: r.left + r.width / 2, by: r.top + r.height * 0.75 }; };
`;
const TIP = () => { const t = document.querySelector('#machine [role="tooltip"][data-help]'); return t && getComputedStyle(t).opacity !== '0' ? t.getAttribute('data-help') : null; };

SCENARIOS.push({
  name: 'through a set whose themes add and drop returns and inserts, the meters never move',
  area: 'view',
  // seed 2 under house-v2: its first themes carry 9, 10 and 10 wires into the
  // strips, and its returns and inserts come and go with the themes and the rota
  query: 'v=2&seed=2',
  deadline: 120000,
  drive: async (page) => {
    const own = await ownPage(page, { viewport: { width: 1440, height: 900 } });
    const p = own.page;
    try {
      return await p.evaluate(body(OPEN_VIEW + `
        const look = () => { const g = document.querySelector('#machineDiagram [data-box="bus:kick"]');
          const t = g.getAttribute('transform').match(/[-\\d.]+/g).map(Number);
          return { y: t[1], sends: document.querySelectorAll('#machineDiagram [data-box^="send:"]').length,
            inserts: document.querySelectorAll('#machineDiagram [data-box^="treat:"]').length,
            effects: +document.querySelector('#machineDiagram [data-area="effects"]').getAttribute('height') }; };
        const seen = [look()];
        for (let k = 0; k < 3; k++) {
          const theme = ctl.readout().mix.themeNumber;
          ctl.skip();
          await waitFor(() => ctl.readout().mix.themeNumber !== theme, 15000);
          await sleep(600);
          for (let j = 0; j < 4; j++) { ctl.seekTo(0.1 + j * 0.25, true); await sleep(500); seen.push(look()); }
        }
        window.ring.machine.close(); ctl.stop();
        return seen;
      `));
    } finally { await own.close(); }
  },
  judge: (r) => {
    const ys = [...new Set(r.map((x) => x.y))];
    const sends = [...new Set(r.map((x) => x.sends))];
    const inserts = [...new Set(r.map((x) => x.inserts))];
    const effects = [...new Set(r.map((x) => x.effects))];
    return {
      ok: ys.length === 1 && effects.length === 1 && r.length >= 12,
      why: `the meters stood at ${ys.join(', ')} and the effects area was ${effects.join(', ')} tall over ${r.length} looks (${sends.join('/')} returns, ${inserts.join('/')} inserts)`,
      note: `over ${r.length} looks across three themes and four places in each, with ${sends.join(' or ')} returns and ${inserts.join(' or ')} inserts on the desk, `
        + `the meters stood at y ${ys[0]} and the effects area ${effects[0]} units tall every time`,
    };
  },
});

SCENARIOS.push({
  name: 'the manual opens only for a pointer that rests on a title, quickly for the next title once one is open, and never for a box\'s body',
  area: 'view',
  query: 'v=2&seed=1',
  deadline: 90000,
  drive: async (page) => {
    const own = await ownPage(page, { viewport: { width: 1440, height: 900 } });
    const p = own.page;
    try {
      const at = await p.evaluate(body(OPEN_VIEW + TITLE_AT + `
        document.querySelector('#machineDiagram [data-box="duck"]').scrollIntoView({ block: 'center', inline: 'center' });
        await sleep(100);
        // every tooltip that ever appears, however briefly
        window.__tips = [];
        new MutationObserver(() => { const t = document.querySelector('#machine [role="tooltip"][data-help]'); if (t) window.__tips.push(t.getAttribute('data-help')); })
          .observe(document.getElementById('machine'), { childList: true, subtree: true, attributes: true });
        return { a: titleOf('bassBody'), b: titleOf('bassComp'), c: titleOf('duckLow'), duck: titleOf('duck'), width: titleOf('width') };
      `));
      // across three titles in under 400 ms, and off onto the empty ground
      await p.mouse.move(at.a.x - 200, at.a.y);
      const t0 = Date.now();
      for (const q of [at.a, at.b, at.c]) { await p.mouse.move(q.x, q.y, { steps: 3 }); await p.waitForTimeout(40); }
      await p.mouse.move(at.c.x - 200, at.c.y + 10, { steps: 2 });
      const crossed = Date.now() - t0;
      await p.waitForTimeout(900);
      const crossing = await p.evaluate(() => window.__tips.slice());
      // a second on a box's body: nothing
      await p.mouse.move(at.duck.bx, at.duck.by, { steps: 3 });
      await p.waitForTimeout(1000);
      const onBody = await p.evaluate(TIP);
      // resting on the title
      await p.mouse.move(at.duck.x, at.duck.y, { steps: 2 });
      const t1 = Date.now();
      let opened = null;
      while (Date.now() - t1 < 2000) { if (await p.evaluate(TIP) === 'duck') { opened = Date.now() - t1; break; } await p.waitForTimeout(25); }
      // straight on to the next title
      await p.mouse.move(at.width.x, at.width.y, { steps: 2 });
      const t2 = Date.now();
      let next = null;
      while (Date.now() - t2 < 2000) { if (await p.evaluate(TIP) === 'width') { next = Date.now() - t2; break; } await p.waitForTimeout(20); }
      await p.evaluate(() => { window.ring.machine.close(); window.ring.control.stop(); });
      return { crossed, crossing, onBody, opened, next };
    } finally { await own.close(); }
  },
  judge: (r) => ({
    ok: r.crossed < 400 && !r.crossing.length && !r.onBody && r.opened != null && r.opened >= 550 && r.opened <= 1100 && r.next != null && r.next <= 400,
    why: `crossing three titles in ${r.crossed} ms opened ${r.crossing.join(', ') || 'nothing'}; a second on a body opened ${r.onBody}; resting on DUCK's title opened it after ${r.opened} ms; WIDTH's after ${r.next} ms`,
    note: `a pointer across three titles in ${r.crossed} ms opened nothing, and a second on DUCK's body nothing; resting on its title opened its page after ${r.opened} ms (HELP_DELAY 650), `
      + `and moving straight on to WIDTH's opened that after ${r.next} ms (HELP_SWITCH 150)`,
  }),
});

SCENARIOS.push({
  name: 'while a popover is open the manual waits, and opens after its delay once the popover is gone, in plain words',
  area: 'view',
  query: 'v=2&seed=1',
  deadline: 90000,
  drive: async (page) => {
    const own = await ownPage(page, { viewport: { width: 1440, height: 900 } });
    const p = own.page;
    try {
      const at = await p.evaluate(body(OPEN_VIEW + TITLE_AT + `
        document.querySelector('#machineDiagram [data-box="lane:bassline"]').scrollIntoView({ block: 'center', inline: 'center' });
        await sleep(100);
        const key = document.querySelector('#machine [role="button"][aria-label="Strip bassline"]').getBoundingClientRect();
        return { t: titleOf('lane:bassline'), key: { x: key.left + key.width / 2, y: key.top + key.height / 2 } };
      `));
      await p.mouse.click(at.key.x, at.key.y);
      await p.waitForTimeout(200);
      const open = await p.evaluate(() => !!document.querySelector('.desk-pop'));
      // on the title with the popover up, a second: nothing
      await p.mouse.move(at.t.x, at.t.y, { steps: 3 });
      await p.waitForTimeout(1000);
      const during = await p.evaluate(TIP);
      // the popover goes (by its own Escape), the pointer still on the title
      await p.evaluate(() => document.querySelector('.desk-pop').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
      await p.waitForTimeout(100);
      const gone = await p.evaluate(() => !document.querySelector('.desk-pop'));
      const t0 = Date.now();
      let after = null;
      while (Date.now() - t0 < 2500) { if (await p.evaluate(TIP)) { after = Date.now() - t0; break; } await p.waitForTimeout(25); }
      const page2 = await p.evaluate(() => { const t = document.querySelector('#machine [role="tooltip"][data-help]'); const keys = [...document.querySelectorAll('#machine .desk-strip [role="button"]')].map((k) => k.getBoundingClientRect());
        if (!t) return null; const r = t.getBoundingClientRect();
        return { key: t.getAttribute('data-help'), now: (t.querySelector('.help-now') || {}).textContent || '', text: t.textContent,
          onKeys: keys.filter((k) => k.width && !(r.right <= k.left || r.left >= k.right || r.bottom <= k.top || r.top >= k.bottom)).length }; });
      await p.evaluate(() => { window.ring.machine.close(); window.ring.control.stop(); });
      return { open, during, gone, after, page: page2 };
    } finally { await own.close(); }
  },
  judge: (r) => {
    const now = r.page ? r.page.now : '';
    const plain = r.page && !/[a-z][A-Z]/.test(now) && !/\bof \d/.test(now) && !/\bhz\b/.test(now) && !/\bbird/i.test(r.page.text);
    return {
      ok: r.open && !r.during && r.gone && r.after != null && r.after >= 450 && r.page.key === 'lane:bass' && !r.page.onKeys && plain,
      why: `popover open ${r.open}; the manual during it ${r.during}; closed ${r.gone}; opened ${r.after} ms after; ${JSON.stringify(r.page)}`,
      note: `with BASSLINE's level popover open a second on its title opened nothing; the popover gone, the page opened after ${r.after} ms, on none of the strips' keys, `
        + `its readings said "${now}"`,
    };
  },
});

SCENARIOS.push({
  name: 'nothing touches: a key a hair inside its row on every side, a row a gutter inside its family, a return a gutter inside the effects, no two boxes nearer than a gutter',
  area: 'view',
  query: 'v=2&seed=1',
  drive: async (page) => {
    const out = {};
    for (const [name, opts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]]) {
      const own = await ownPage(page, opts);
      try {
        out[name] = await own.page.evaluate(body(OPEN_VIEW + `
          const svg = document.getElementById('machineDiagram');
          const k = svg.getBoundingClientRect().width / +svg.getAttribute('viewBox').split(' ')[2];   // CSS px a unit
          // (M22) a box's own geometry, its stroke not counted: Firefox's bounding
          // rect of an SVG shape takes in half the stroke each side and the other
          // engines' do not, so a 1-unit edge read a gutter of 8 as 7 there
          const rect = (e) => { const b = e.getBoundingClientRect(); if (!e.getBBox || !e.getScreenCTM) return b; const g = e.getBBox(), m = e.getScreenCTM(); const dx = Math.max(0, (b.width - g.width * Math.abs(m.a)) / 2), dy = Math.max(0, (b.height - g.height * Math.abs(m.d)) / 2); return { left: b.left + dx, right: b.right - dx, top: b.top + dy, bottom: b.bottom - dy, width: b.width - 2 * dx, height: b.height - 2 * dy }; };
          const bad = [];
          let keysTight = Infinity, rowTight = Infinity, fxTight = Infinity, near = Infinity;
          // a source's keys: the same inset right, above and below, and the same gap between
          for (const row of document.querySelectorAll('#machineDiagram [data-box^="lane:"]')) {
            const r = rect(row.querySelector('rect'));
            const keys = [...row.querySelectorAll('.desk-strip [role="button"] > rect')].map(rect).sort((a, b) => a.left - b.left);
            if (keys.length !== 3) { bad.push(row.getAttribute('data-box') + ' has ' + keys.length + ' keys'); continue; }
            const right = r.right - keys[2].right, top = keys[0].top - r.top;
            const bottom = +row.getAttribute('data-lines') === 2 ? null : r.bottom - keys[0].bottom;
            const gaps = [keys[1].left - keys[0].right, keys[2].left - keys[1].right];
            keysTight = Math.min(keysTight, right, top);
            if (Math.abs(right - top) > 0.6 || (bottom != null && Math.abs(bottom - top) > 0.6) || Math.abs(gaps[0] - gaps[1]) > 0.6 || top < 3.5 * k)
              bad.push(row.getAttribute('data-box') + ' keys stand ' + [right, top, bottom].map((v) => v == null ? '-' : v.toFixed(1)).join('/') + ' in, ' + gaps.map((g) => g.toFixed(1)).join('/') + ' apart');
          }
          // a row inside its family's frame
          const frames = [...document.querySelectorAll('#machineDiagram [data-frame] > rect')].map(rect);
          for (const row of document.querySelectorAll('#machineDiagram [data-box^="lane:"] > g > rect')) {
            const r = rect(row); const f = frames.find((q) => r.left >= q.left - 0.5 && r.right <= q.right + 0.5 && r.top >= q.top - 0.5 && r.bottom <= q.bottom + 0.5);
            if (!f) { bad.push('a row outside every frame'); continue; }
            const off = Math.min(r.left - f.left, f.right - r.right, f.bottom - r.bottom);
            rowTight = Math.min(rowTight, off);
            if (off < 8 * k - 0.6) bad.push('a row ' + off.toFixed(1) + ' px inside its frame');
          }
          // inserts and returns inside the effects area
          const fx = rect(document.querySelector('#machineDiagram [data-area="effects"]'));
          for (const b of document.querySelectorAll('#machineDiagram [data-box^="send:"] > rect, #machineDiagram [data-box^="treat:"] > rect')) {
            const r = rect(b); const off = Math.min(r.left - fx.left, fx.right - r.right, fx.bottom - r.bottom);
            fxTight = Math.min(fxTight, off);
            if (off < 8 * k - 0.6) bad.push('a return or an insert ' + off.toFixed(1) + ' px inside the effects');
          }
          // no two boxes nearer than a gutter, but a family's rows and the rack's
          const boxes = [...document.querySelectorAll('#machineDiagram [data-box]')].filter((g) => !g.getAttribute('data-box').startsWith('lane:') && !/^(m:|deck:|themeOut)/.test(g.getAttribute('data-box')))
            .map((g) => ({ id: g.getAttribute('data-box'), r: rect(g.querySelector('rect')) }));
          for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i].r, b = boxes[j].r;
            const gap = Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom);
            near = Math.min(near, gap);
            if (gap < 8 * k - 0.6) bad.push(boxes[i].id + ' and ' + boxes[j].id + ' ' + gap.toFixed(1) + ' px apart');
          }
          window.ring.machine.close(); ctl.stop();
          return { k: +k.toFixed(3), bad: bad.slice(0, 6), keysTight: +keysTight.toFixed(1), rowTight: +rowTight.toFixed(1), fxTight: +fxTight.toFixed(1), near: +near.toFixed(1) };
        `));
      } finally { await own.close(); }
    }
    return out;
  },
  judge: (r) => ({
    ok: !r.desktop.bad.length && !r.phone.bad.length,
    why: `desktop ${JSON.stringify(r.desktop)}; phone ${JSON.stringify(r.phone)}`,
    note: `on the drawn page at 1440 (${r.desktop.k} px a unit) and on a phone (${r.phone.k}): a source's keys ${r.desktop.keysTight} px in from its frame on every side and evenly apart, `
      + `a row ${r.desktop.rowTight} px inside its family, the returns ${r.desktop.fxTight} px inside the effects, and no two boxes nearer than ${r.desktop.near} px — on the phone ${r.phone.keysTight}, ${r.phone.rowTight}, ${r.phone.fxTight} and ${r.phone.near}`,
  }),
});

// --- round M6 (09-25): a density by width, words in two fixed inks, rows that do not cut

SCENARIOS.push({
  name: 'the view is dense on a phone and spreads with the width: spacing 1, 1.5 and 2 times, type in steps, the canvas filled by its gutters, nothing cut or overlapping',
  area: 'view',
  query: 'v=2&seed=1',
  deadline: 150000,
  drive: async (page) => {
    const out = {};
    for (const [name, opts] of [['390', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }], ['1440', { viewport: { width: 1440, height: 900 } }], ['1900', { viewport: { width: 1900, height: 1000 } }], ['2560', { viewport: { width: 2560, height: 1440 } }]]) {
      const own = await ownPage(page, opts);
      const p = own.page;
      try {
        out[name] = await p.evaluate(body(OPEN_VIEW + `
          // (M8) the left column's width, and the graph's
          const sideW = Math.round(document.querySelector('#machine .pane.side').getBoundingClientRect().width);
          const graphW = Math.round(document.querySelector('#machine .pane.graph').getBoundingClientRect().width);
          // (M8) the readings: a tile's height, the block's, every one present, and a spell cell's name and value on one line or not
          const tileH = Math.round(document.querySelector('#machine .fact[data-fact="seed"]').getBoundingClientRect().height);
          const listH = Math.round(document.querySelector('#machine .list').getBoundingClientRect().height);
          const present = [...document.querySelectorAll('#machine .fact:not(.spell)')].filter((f) => { const k = f.querySelector('.k'), v = f.querySelector('.v'); return k && v && k.textContent.trim() && v.textContent.trim() && v.getBoundingClientRect().width > 0; }).length;
          const c0 = document.querySelector('#machine .spell-grid .cell');
          const cellOneLine = Math.abs(c0.querySelector('.k').getBoundingClientRect().bottom - c0.querySelector('.v').getBoundingClientRect().bottom) < 3;
          await waitFor(() => { const m = window.ring.machine.snapshot().meters; return m && m.reduction.posting; }, 6000);
          await sleep(300);
          const svg = document.getElementById('machineDiagram');
          const pane = document.querySelector('#machine .pane.graph').getBoundingClientRect();
          const t = svg.getBoundingClientRect().width / +svg.getAttribute('viewBox').split(' ')[2];
          // a source row's inset in its family's frame, in pixels
          const row = document.querySelector('#machineDiagram [data-box="lane:kick"] rect').getBoundingClientRect();
          const frame = document.querySelector('#machineDiagram [data-frame="drums"] > rect').getBoundingClientRect();
          const inset = row.left - frame.left;
          // the limiter's bar and its number
          const bar = document.querySelector('#machineDiagram [data-gr-bar]'); const num = document.querySelector('#machineDiagram [data-gr-text]');
          let grClash = null;
          if (bar && num) { const a = bar.getBoundingClientRect(), b = num.getBoundingClientRect(); grClash = !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top); }
          // the rack's values: none cut
          const cutRack = [...document.querySelectorAll('#machineDiagram [data-box^="m:"] text[data-value], #machineDiagram [data-box="sink"] text[data-value]')].filter((x) => x.textContent.includes('…')).map((x) => x.textContent);
          // the popover's keys are the strips' keys
          // (M22) the key's own geometry, its stroke not counted (Firefox's bounding rect takes it in: 21 for 20)
          const key = ((e) => { const b = e.getBoundingClientRect(); if (!e.getBBox || !e.getScreenCTM) return b; const g = e.getBBox(), m = e.getScreenCTM(); const dx = Math.max(0, (b.width - g.width * Math.abs(m.a)) / 2), dy = Math.max(0, (b.height - g.height * Math.abs(m.d)) / 2); return { left: b.left + dx, right: b.right - dx, top: b.top + dy, bottom: b.bottom - dy, width: b.width - 2 * dx, height: b.height - 2 * dy }; })(document.querySelector('#machine .desk-strip [role="button"] > rect'));
          const keyFont = parseFloat(getComputedStyle(document.querySelector('#machine .desk-strip text.k')).fontSize) * t;
          const lk = document.querySelector('#machine [role="button"][aria-label="Strip kick"]');
          lk.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          await sleep(150);
          const pops = [...document.querySelectorAll('.desk-pop .desk-keys button, .desk-pop .desk-fader button')].map((b) => { const r = b.getBoundingClientRect(); return { h: r.height, w: r.width, f: parseFloat(getComputedStyle(b).fontSize) }; });
          document.querySelector('.desk-pop').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          // the spell's cells
          const cells = [...document.querySelectorAll('#machine .spell-grid .cell')];
          const cellRows = new Set(cells.map((c) => Math.round(c.getBoundingClientRect().top))).size;
          // (M8) raw values, 0.00 to 1.00, and the tile on every tile's geometry
          const cellCut = cells.filter((c) => { const v = c.querySelector('.v'); return v.scrollWidth > v.clientWidth + 1 || !/^[01]\\.\\d\\d$/.test(v.textContent); }).length;
          const pad = (el) => { const cs = getComputedStyle(el); return [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map((x) => Math.round(parseFloat(x) * 10) / 10).join(' '); };
          const spellTile = document.querySelector('#machine .fact.spell'); const seedTile = document.querySelector('#machine .fact[data-fact="seed"]');
          const lab = spellTile.querySelector('.spell-head .k').getBoundingClientRect(); const seedLab = seedTile.querySelector('.k').getBoundingClientRect();
          const sw = spellTile.querySelector('.spell-head .swatch').getBoundingClientRect();
          const cellBoxes = cells.map((c) => c.getBoundingClientRect());
          const widths = cellBoxes.map((b) => +b.width.toFixed(1));
          const tile = { pad: pad(spellTile), seedPad: pad(seedTile),
            labelIn: +(lab.left - spellTile.getBoundingClientRect().left).toFixed(1), seedLabelIn: +(seedLab.left - seedTile.getBoundingClientRect().left).toFixed(1),
            labelTop: +(lab.top - spellTile.getBoundingClientRect().top).toFixed(1), seedLabelTop: +(seedLab.top - seedTile.getBoundingClientRect().top).toFixed(1),
            cellsIn: +(cellBoxes[0].left - lab.left).toFixed(1), swatchAfter: +(sw.left - lab.right).toFixed(1), swatchMid: +((sw.top + sw.bottom) / 2 - (lab.top + lab.bottom) / 2).toFixed(1),
            widths: Math.max(...widths) - Math.min(...widths) };
          const out = { sideW, graphW, tileH, listH, present, cellOneLine, t: +t.toFixed(3), inset: +inset.toFixed(1), fills: +(svg.getBoundingClientRect().width - pane.width).toFixed(0),
            grClash, cutRack, keyH: +key.height.toFixed(1), keyFont: +keyFont.toFixed(1), pops, cells: cells.length, cellRows, cellCut, tile };
          window.ring.machine.close(); ctl.stop();
          return out;
        `));
      } finally { await own.close(); }
    }
    return out;
  },
  judge: (r) => {
    const bad = [];
    // (M8) the type steps once, at 2000 px: 1900 is 1440's left column with a wider graph
    // (M14) the spacing in twentieths: 1900 is 1.705 stepped to 1.7
    const want = { 390: [1, 1], 1440: [1.5, 1], 1900: [1.7, 1], 2560: [2, 1.25] };
    if (r['1900'].sideW !== r['1440'].sideW || r['1900'].graphW <= r['1440'].graphW) bad.push(`1900: the left column is ${r['1900'].sideW} px (1440's ${r['1440'].sideW}) and the graph ${r['1900'].graphW} (1440's ${r['1440'].graphW})`);
    // (M8) on a phone a tile is one line: about half the desktop's, every reading there
    if (r['390'].tileH > 0.62 * r['1440'].tileH || !r['390'].cellOneLine || r['1440'].cellOneLine) bad.push(`390: a tile is ${r['390'].tileH} px where 1440's is ${r['1440'].tileH}, the spell's pairs on one line ${r['390'].cellOneLine} (1440 ${r['1440'].cellOneLine})`);
    if (r['390'].present < 18 || r['390'].present !== r['1440'].present) bad.push(`390: ${r['390'].present} readings present, 1440 ${r['1440'].present}`);
    if (Math.abs(r['2560'].sideW - r['1440'].sideW * 1.25) > 2) bad.push(`2560: the left column is ${r['2560'].sideW} px, not one step (1.25) over 1440's ${r['1440'].sideW}`);
    for (const [w, x] of Object.entries(r)) {
      const [g, t] = want[w];
      if (Math.abs(x.t - t) > 0.02) bad.push(`${w}: the drawing is shown at ${x.t}, where the type step is ${t}`);
      if (Math.abs(x.inset - 8 * g) > 1.2) bad.push(`${w}: a row stands ${x.inset} px in its frame, where 8 × ${g} is ${8 * g}`);
      if (w !== '390' && w !== '1440' && x.fills < -2) bad.push(`${w}: the canvas is ${-x.fills} px short of its pane`);
      if (x.grClash) bad.push(`${w}: the limiter's bar lies on its number`);
      if (x.grClash === null) bad.push(`${w}: the limiter posted no reduction to draw`);
      if (x.cutRack.length) bad.push(`${w}: rack values cut: ${x.cutRack.join(' | ')}`);
      // a popover is zoomed with the type step, so its letters are drawn at their size times the key's height over 20
      if (x.pops.some((b) => Math.abs(b.h - x.keyH) > 0.6 || b.w < x.keyH * 1.2 - 0.6 || Math.abs((b.f * b.h) / 20 - x.keyFont) > 0.3)) bad.push(`${w}: popover keys ${JSON.stringify(x.pops)} against a strip key ${x.keyH} high in ${x.keyFont} px`);
      if (x.cells !== 8 || x.cellCut) bad.push(`${w}: the spell has ${x.cells} cells, ${x.cellCut} of them cut`);
      // (M8: one row at every width, a phone's too)
      if (x.cellRows !== 1) bad.push(`${w}: the spell's cells stand in ${x.cellRows} rows`);
      const T = x.tile;
      if (T.pad !== T.seedPad || Math.abs(T.labelIn - T.seedLabelIn) > 0.6 || Math.abs(T.labelTop - T.seedLabelTop) > 0.6) bad.push(`${w}: the spell tile is padded ${T.pad} with its name ${T.labelIn},${T.labelTop} in, where a tile is ${T.seedPad} and ${T.seedLabelIn},${T.seedLabelTop}`);
      if (Math.abs(T.cellsIn) > 0.6 || T.widths > 0.6) bad.push(`${w}: the spell's cells start ${T.cellsIn} px off its name's left edge, their widths differ by ${T.widths}`);
      if (T.swatchAfter < 0 || T.swatchAfter > 12 || Math.abs(T.swatchMid) > 1.5) bad.push(`${w}: the swatch stands ${T.swatchAfter} px after the name and ${T.swatchMid} px off its middle`);
    }
    return {
      ok: !bad.length,
      why: bad[0],
      note: `at 390, 1440, 1900 and 2560 the drawing is shown at ${r['390'].t}, ${r['1440'].t}, ${r['1900'].t} and ${r['2560'].t} and a row stands ${r['390'].inset}, ${r['1440'].inset}, ${r['1900'].inset} and ${r['2560'].inset} px in its frame (8 × 1, 1.5, 1.7, 2); the left column is ${r['1440'].sideW} px at 1440 and at 1900, where the graph has ${r['1900'].graphW - r['1440'].graphW} px more, and ${r['2560'].sideW} at 2560, one step up; on a phone a tile is one line, ${r['390'].tileH} px against the desktop's ${r['1440'].tileH}, the readings ${r['390'].listH} px tall for all ${r['390'].present}; `
        + `at 2560 the canvas fills its pane by its gutters; the limiter's bar never lies on its number; no rack value is cut; the popover's keys are the strips' ${r['1440'].keyH} px keys in their ${r['1440'].keyFont} px letters; `
        + `the spell is eight cells in one row at every width, every value raw (0.00 to 1.00), the tile padded ${r['390'].tile.pad} px like every tile, its name where a tile's name is, the swatch ${r['1440'].tile.swatchAfter} px after it on its middle, and the cells in equal columns from the name's left edge`,
    };
  },
});

// (M10, Eugene: *"in the machine view, for all new users the ledger is hidden
// by default"*): a viewer with nothing kept opens the view with the ledger put
// away and LEDGER over the readings; brought back, it is kept through a
// reload; put away again, that is kept too.
SCENARIOS.push({
  name: 'the ledger is put away for a new viewer, brought back by LEDGER, the graph giving it its width, and the page remembers the choice',
  area: 'view',
  query: 'v=2&seed=1',
  drive: async (page) => {
    const own = await ownPage(page, { viewport: { width: 1440, height: 900 } });
    const p = own.page;
    try {
      const read = () => p.evaluate(() => ({ ledger: !!document.querySelector('#machine .pane.ledger'), graph: Math.round(document.querySelector('#machine .pane.graph').getBoundingClientRect().width),
        show: !!document.querySelector('#machine [aria-label="Show the ledger"]'), key: (document.querySelector('#machine [aria-label="Show the ledger"]') || { textContent: '' }).textContent }));
      const reopen = async () => {
        await p.evaluate(() => { window.ring.machine.close(); });
        await p.reload({ waitUntil: 'networkidle' });
        await p.waitForFunction(() => window.ring && window.deepHouse, null, { timeout: 20000 });
        await p.evaluate(() => window.ring.machine.open());
        await p.waitForTimeout(600);
      };
      await p.evaluate(() => { try { localStorage.removeItem('deep-house.machine.ledger'); } catch (e) { /* nothing kept */ } });
      await p.evaluate(() => window.ring.machine.open());
      await p.waitForTimeout(600);
      const fresh = await read();
      await p.click('#machine [aria-label="Show the ledger"]');
      await p.waitForTimeout(200);
      const shown = await read();
      await reopen();
      const keptShown = await read();
      await p.click('#machine [aria-label="Hide the ledger"]');
      await p.waitForTimeout(200);
      await reopen();
      const keptHidden = await read();
      await p.evaluate(() => { window.ring.machine.close(); window.ring.control.stop(); });
      return { fresh, shown, keptShown, keptHidden };
    } finally { await own.close(); }
  },
  judge: (r) => ({
    ok: !r.fresh.ledger && r.fresh.show && r.fresh.key.trim() === '' && r.shown.ledger && !r.shown.show && r.fresh.graph >= r.shown.graph + 300
      && r.keptShown.ledger && !r.keptHidden.ledger && r.keptHidden.show,
    why: JSON.stringify(r),
    note: `a new viewer opened the view with the ledger put away and "${r.fresh.key}" over the readings, the graph ${r.fresh.graph} px; LEDGER brought it back (graph ${r.shown.graph} px) and a reload kept it; put away again, a reload kept that`,
  }),
});

SCENARIOS.push({
  name: 'the view\'s colours are its own: under a spell off the house its labels, values and wires read as at the house',
  area: 'view',
  query: 'v=2&seed=1',
  drive: async (page) => {
    const out = {};
    for (const q of ['v=2&seed=1', 'v=2&seed=1&spell=ember:0.95,tide:0.05,veil:0.9']) {
      const own = await ownPage(page, { viewport: { width: 1440, height: 900 } });
      const p = own.page;
      try {
        await p.goto(p.url().replace(/\?.*$/, '') + '?' + q + '&out=silent', { waitUntil: 'networkidle' });
        await p.waitForFunction(() => window.ring && window.deepHouse, null, { timeout: 20000 });
        out[q] = await p.evaluate(body(OPEN_VIEW + `
          const fill = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).fill : null; };
          const r = { label: fill('#machineDiagram [data-box="m:mid"] text.l'), value: fill('#machineDiagram [data-box="m:mid"] text.v'),
            wire: (() => { const e = document.querySelector('#machineDiagram path[data-wire]'); return e ? getComputedStyle(e).stroke : null; })(),
            ringGold: getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() };
          window.ring.machine.close(); ctl.stop();
          return r;
        `));
      } finally { await own.close(); }
    }
    return out;
  },
  judge: (r) => {
    const [a, b] = Object.values(r);
    return {
      ok: a.label === b.label && a.value === b.value && a.wire === b.wire && a.label === 'rgb(242, 193, 78)' && a.value === 'rgb(219, 232, 240)' && a.ringGold !== b.ringGold,
      why: JSON.stringify(r),
      note: `at the house and under a spell that turns the ring's gold from ${a.ringGold} to ${b.ringGold}, a rack label reads ${a.label}, its value ${a.value} and a wire ${a.wire} both times`,
    };
  },
});

SCENARIOS.push({
  name: 'a page of the manual says its reading once',
  area: 'view',
  query: 'v=2&seed=1',
  drive: async (page) => {
    const own = await ownPage(page, { viewport: { width: 1440, height: 900 } });
    const p = own.page;
    try {
      await p.evaluate(body(OPEN_VIEW + 'return 1;'));
      const at = await p.evaluate(() => { const g = document.querySelector('#machineDiagram [data-box="push"]'); g.scrollIntoView({ block: 'center', inline: 'center' }); const r = g.getBoundingClientRect(); return { x: r.left + 24, y: r.top + 6 }; });
      await p.mouse.move(at.x, at.y, { steps: 3 });
      await p.waitForTimeout(900);
      const r = await p.evaluate(() => { const t = document.querySelector('#machine [role="tooltip"][data-help]'); return t ? { key: t.getAttribute('data-help'), now: !!t.querySelector('.help-now'), nows: (t.textContent.match(/now:/gi) || []).length } : null; });
      await p.evaluate(() => { window.ring.machine.close(); window.ring.control.stop(); });
      return r;
    } finally { await own.close(); }
  },
  judge: (r) => ({
    ok: !!r && r.key === 'push' && !r.now && r.nows === 1,
    why: JSON.stringify(r),
    note: 'PUSH\'s page says "Now: … dB." in its own sentence and adds no raw "now:" line under it',
  }),
});

SCENARIOS.push({
  name: 'the genre keys have a header of their own, one lamp — the centre\'s — and no italics',
  area: 'view',
  query: 'v=2&seed=1',
  page: body(OPEN_VIEW + `
    const block = document.querySelector('#machine .genre-block');
    const head = block && block.querySelector('h2');
    const keys = [...document.querySelectorAll('#machine .genres button')];
    // (M17) one lamp, the centre's: the style that plays
    const lamped = keys.filter((k) => k.querySelector('[data-lamp]'));
    const insets = lamped.map((k) => +(k.querySelector('[data-lamp]').getBoundingClientRect().left - k.getBoundingClientRect().left).toFixed(1));
    const lampOnCentre = lamped.length === 1 && lamped[0] === keys[4];
    const italic = keys.filter((k) => getComputedStyle(k).fontStyle === 'italic').length;
    // (M8) the genres directly under the ring, and the engine at the foot of the column under a header of its own
    // (M13) directly under the ring's block: the ring and its toolbar
    const ring = document.querySelector('#machine .ring-block').getBoundingClientRect();
    const gap = head ? head.getBoundingClientRect().top - ring.bottom : null;
    const eb = document.querySelector('#machine .engine-block');
    const engineHead = eb && eb.querySelector('h2') ? eb.querySelector('h2').textContent : null;
    const engineLast = !!eb && eb === eb.parentElement.lastElementChild && eb.getBoundingClientRect().top >= document.querySelector('#machine .list').getBoundingClientRect().bottom - 1;
    window.ring.machine.close(); ctl.stop();
    return { head: head ? head.textContent : null, keys: keys.length, insets: [...new Set(insets)], lampOnCentre, italic, gap, engineHead, engineLast };
  `),
  judge: (r) => ({
    ok: r.head && /genres/i.test(r.head) && r.keys >= 8 && r.insets.length === 1 && r.lampOnCentre && !r.italic && r.gap >= 0 && r.gap <= 1 && /engine/i.test(r.engineHead || '') && r.engineLast,
    why: JSON.stringify(r),
    note: `the ${r.keys} keys stand under their own header ("${r.head}") directly under the ring, the engine row last in the column under "${r.engineHead}", one lamp, on the centre, ${r.insets[0]} px in from its left edge, none in italics`,
  }),
});

SCENARIOS.push({
  name: 'under house-v1 only the centre genre key stands, lit, and the other eight do nothing; under house-v2 they steer',
  area: 'view',
  query: 'v=1&seed=1',
  drive: async (page) => {
    const out = {};
    for (const q of ['v=1&seed=1', 'v=2&seed=1']) {
      const own = await ownPage(page, { viewport: { width: 1440, height: 900 } });
      const p = own.page;
      try {
        await p.goto(p.url().replace(/\?.*$/, '') + '?' + q + '&out=silent', { waitUntil: 'networkidle' });
        await p.waitForFunction(() => window.ring && window.deepHouse, null, { timeout: 20000 });
        out[q] = await p.evaluate(body(OPEN_VIEW + `
          const keys = [...document.querySelectorAll('#machine .genres button')];
          const lines = () => window.ring.machine.snapshot().ledger.filter((e) => /genre preset/.test(e.what)).length;
          const before = lines();
          const outer = keys[0];
          outer.click();
          await sleep(300);
          const r = { disabled: keys.filter((k) => k.disabled).map((k) => k.dataset.genre), centreLit: keys[4].getAttribute('aria-pressed'), centre: keys[4].dataset.genre,
            opened: document.querySelector('#machine .genre-block .caption').dataset.tier === 'sub',
            lines: lines() - before, asked: ctl.mix && ctl.mix.spellAsked ? Object.keys(ctl.mix.spellAsked).length : 0,
            caption: document.querySelector('#machine .genre-block .caption').textContent };
          window.ring.machine.close(); ctl.stop();
          return r;
        `));
      } finally { await own.close(); }
    }
    return out;
  },
  judge: (r) => {
    const v1 = r['v=1&seed=1']; const v2 = r['v=2&seed=1'];
    return {
      // (since M8 the first tier is the eight families round Deep House)
      ok: v1.disabled.length === 8 && v1.centre === 'Deep House' && v1.centreLit === 'true' && v1.lines === 0 && /house-v2 only/.test(v1.caption) && v2.disabled.length === 0 && v2.lines === 0 && v2.opened,
      why: JSON.stringify(r),
      note: `under house-v1 the outer keys are disabled ("${v1.caption}"), the centre is lit, and a press on one wrote nothing and asked no spell; under house-v2 the same press opened that family's sub-genres`,
    };
  },
});

SCENARIOS.push({
  name: 'the genres are two tiers: a family pressed opens its sub-genres round it, an untuned one is disabled, a tuned one plays its spell, and back returns to the families',
  area: 'view',
  query: 'v=2&seed=1',
  page: body(OPEN_VIEW + `
    const keys = () => [...document.querySelectorAll('#machine .genres button')];
    const tier = () => ({ caption: document.querySelector('#machine .genre-block .caption').textContent.toLowerCase(),
      centre: keys()[4] && keys()[4].dataset.genre, labels: keys().map((k) => k.dataset.genre), back: !!document.querySelector('#machine [aria-label="Back to the genre families"]') });
    const t1 = tier();
    t1.lit = keys().filter((k) => k.getAttribute('aria-pressed') === 'true').map((k) => k.dataset.genre);
    // (M8) the centre is Deep House, and pressed it plays the house and opens nothing
    const houseLines = window.ring.machine.snapshot().ledger.filter((e) => /genre preset: Deep House/.test(e.what)).length;
    keys()[4].click();
    await sleep(200);
    t1.pressed = { tier: tier(), line: window.ring.machine.snapshot().ledger.filter((e) => /genre preset: Deep House/.test(e.what)).length - houseLines };
    keys().find((k) => k.dataset.genre === 'DnB & Dub').click();
    await sleep(200);
    const t2 = tier();
    const lines = () => window.ring.machine.snapshot().ledger.filter((e) => /genre preset/.test(e.what)).map((e) => e.what);
    // (M10) Liquid is not tuned: its key is disabled, and a press on it does nothing
    const askedBefore = ctl.mix && ctl.mix.spellAsked ? JSON.stringify(ctl.mix.spellAsked) : null;
    const linesBefore = lines().length; const urlBefore = location.search;
    const liquid = keys().find((k) => k.dataset.genre === 'Liquid');
    liquid.click();
    await sleep(400);
    const refused = { disabled: liquid.getAttribute('aria-disabled'), asked: (ctl.mix && ctl.mix.spellAsked ? JSON.stringify(ctl.mix.spellAsked) : null) === askedBefore,
      lines: lines().length - linesBefore, url: location.search === urlBefore, lit: liquid.getAttribute('aria-pressed'), about: liquid.title };
    document.querySelector('#machine [aria-label="Back to the genre families"]').click();
    await sleep(200);
    const t3 = tier();
    // a tuned one still plays: DnB & Dub → Dub Techno (M18: the merged family)
    keys().find((k) => k.dataset.genre === 'DnB & Dub').click();
    await sleep(200);
    const dubCentre = { genre: keys()[4].dataset.genre, disabled: keys()[4].getAttribute('aria-disabled') };
    keys().find((k) => k.dataset.genre === 'Dub Techno').click();
    await waitFor(() => ctl.mix && ctl.mix.spellAsked, 3000);
    await sleep(300);
    const played = { asked: ctl.mix && ctl.mix.spellAsked ? JSON.stringify(ctl.mix.spellAsked) : null, line: lines().pop() || '', url: location.search };
    window.ring.machine.close(); ctl.stop();
    return { t1, t2, refused, t3, dubCentre, played };
  `),
  judge: (r) => {
    const ok = r.t1.caption === 'families' && r.t1.centre === 'Deep House' && !r.t1.back
      && r.t1.labels.length === 9 && r.t1.labels.join() === 'House,Techno,Ambient & Downtempo,DnB & Dub,Deep House,Trance,Breaks & Big Beat,Disco & Nu-Disco,Misc' && !r.t1.labels.includes('Dub Techno') && !r.t1.labels.includes('UK Garage') && [...r.t1.lit].sort().join() === 'Deep House,House'
      && r.t1.pressed.tier.caption === 'families' && r.t1.pressed.tier.centre === 'Deep House' && r.t1.pressed.line === 1
      && r.t2.centre === 'DnB & Dub' && r.t2.labels.includes('Liquid') && r.t2.labels.includes('Dub Techno') && r.t2.back && r.t2.caption === 'dnb & dub'
      && r.refused.disabled === 'true' && r.refused.asked && r.refused.lines === 0 && r.refused.url && r.refused.lit === 'false' && /not tuned yet/.test(r.refused.about) && /Disabled until it is tuned/.test(r.refused.about)
      && r.t3.caption === 'families' && r.t3.centre === 'Deep House' && !r.t3.back
      && r.dubCentre.genre === 'DnB & Dub' && r.dubCentre.disabled === 'true'
      && r.played.asked && /genre preset: Dub Techno/.test(r.played.line) && !/dub|techno/i.test(decodeURIComponent(r.played.url));
    return {
      ok,
      why: JSON.stringify(r),
      note: `the first tier is the eight families round ${r.t1.centre}, ${r.t1.lit.join(' and ')} lit at the house, and ${r.t1.centre} pressed played the house and opened nothing; DnB & Dub pressed took the centre with ${r.t2.labels.filter((x) => x !== 'DnB & Dub').join(', ')} round it; Liquid, not tuned, is disabled — a press asked no spell, wrote no line and changed no address, its tooltip "${r.refused.about}"; `
        + `back returned to the families with ${r.t3.centre} in the centre, not the family visited; the merged family's own key is disabled (no spell of its own), and Dub Techno played ${r.played.asked} ("${r.played.line}") with no genre word in the address`,
    };
  },
});

SCENARIOS.push({
  name: 'a bus meter explains its three colours and its held peak, from its M S D row and not its LEDs',
  area: 'view',
  query: 'v=2&seed=1',
  drive: async (page) => {
    const own = await ownPage(page, { viewport: { width: 1440, height: 900 } });
    const p = own.page;
    try {
      await p.evaluate(body(OPEN_VIEW + 'return 1;'));
      const at = await p.evaluate(() => { const g = document.querySelector('#machineDiagram [data-box="bus:drums"]'); g.scrollIntoView({ block: 'center', inline: 'center' }); const r = g.getBoundingClientRect();
        const msd = g.querySelector('.desk-strip text').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height * 0.6, mx: msd.left + 2, my: msd.top + msd.height / 2, hx: r.left + 8, hy: r.top + 5 }; });
      const tip = () => p.evaluate(() => { const t = document.querySelector('#machine [role="tooltip"][data-help]'); return t && getComputedStyle(t).opacity !== '0' ? { key: t.getAttribute('data-help'), text: t.textContent } : null; });
      await p.mouse.move(at.x, at.y, { steps: 3 });
      await p.waitForTimeout(1000);
      const leds = await tip();
      await p.mouse.move(at.mx, at.my, { steps: 3 });
      await p.waitForTimeout(900);
      const meter = await tip();
      await p.mouse.move(at.hx, at.hy, { steps: 2 });
      await p.waitForTimeout(500);
      const head = await tip();
      await p.evaluate(() => { window.ring.machine.close(); window.ring.control.stop(); });
      return { leds, meter, head: head && head.key };
    } finally { await own.close(); }
  },
  judge: (r) => {
    const t = r.meter ? r.meter.text : '';
    // (M15) red is the output's alone: a bus is float, and over 0 dBFS it is hot
    const ok = !r.leds && r.meter && r.meter.key === 'meter' && /Green/.test(t) && /Amber, from −1 dBFS/.test(t) && /only the output's meter turns red/.test(t) && /floating point/.test(t) && /peak held/.test(t) && r.head === 'bus:drums';
    return {
      ok: !!ok,
      why: `the LEDs showed ${r.leds && r.leds.key}, the M S D row ${r.meter && r.meter.key} and the name ${r.head}`,
      note: 'a second on the drums strip\'s LEDs opened nothing; its M S D row showed the legend — green within the headroom, amber from −1 dBFS and over 0 on a float bus, red only on the output, and the held peak — and its name the bus\'s own page',
    };
  },
});

SCENARIOS.push({
  name: 'a held bird\'s promise is planned with the recipe and the modes the set plays',
  area: 'recipe',
  query: 'v=2&seed=10&recipe=house/growl-room',
  page: body(`
    await started();
    await sleep(600);
    window.ring.pull(2, 0.9);
    await frame(); await frame();
    const got = window.ring.impliedPlan(2);
    const r = ctl.readout();
    const spell = {};
    for (const c of window.ring.cells()) if (c.held) spell[c.bird] = c.value;
    const want = got ? ctl.planned(got.about, r.seed, ctl.state.strategyTo ?? r.strategy, spell) : null;
    const said = (t) => t ? JSON.stringify({ bpm: t.bpm, room: t.presetLabel, key: t.key && t.key.name, bars: t.bars, dice: t.dice }) : null;
    const out = { got: said(got && got.plan), want: said(want), recipe: r.recipe, implied: window.ring.cells()[2].implied,
      keys: got && got.plan.dice ? got.plan.dice.keys : null, wantKeys: want && want.dice ? want.dice.keys : null };
    window.ring.release(null);
    ctl.stop();
    return out;
  `),
  judge: (r) => ({
    ok: !!r.got && r.got === r.want,
    why: !r.got ? 'no promise was worked out for the held bird' : `the promise was read off ${r.got.slice(0, 160)} where the set plans ${String(r.want).slice(0, 160)}`,
    note: `under ${r.recipe}, Zephyr held at 90 % promises "${r.implied}" off the control's own plan (keys ${r.keys}, as planned ${r.wantKeys})`,
  }),
});

// **Under `?recipe=` the birds stand at the spell the recipe rolled** (R58 of
// the review of 09-24, Eugene's question 15: the reading that shows the
// truth). With no `spell=` on the link the set plays a spell rolled inside the
// row, and the birds were drawn at the house while it did. Each unheld bird now
// stands at the value the set plays, radius and all; a hand's first pull
// commits a spell the set plays whole, so the others rest at the house from
// then on, and the link carries both the recipe and the hand's spell.
SCENARIOS.push({
  name: 'under a recipe the birds stand at the spell it rolled, and at the house once a hand has pulled one',
  area: 'recipe',
  query: 'v=2&seed=10&recipe=house/growl-room',
  page: body(`
    await started();
    await sleep(900);
    const cells = () => window.ring.cells();
    const r = ctl.readout();
    const at = (spell) => cells().map((c, i) => {
      const want = spell && typeof spell[c.bird] === 'number' ? spell[c.bird] : c.house;
      return { bird: c.bird, value: c.value, want, held: c.held, off: Math.abs(c.radius * 316 - window.ring.radiusAt(i, want)) };
    });
    const rolled = at(r.spell);
    const off = rolled.filter((c) => Math.abs(c.want - (window.ring.cells().find((x) => x.bird === c.bird).house)) > 1e-9).map((c) => c.bird);
    const url0 = location.search;
    window.ring.pull(2, 0.9);
    await sleep(900);
    const after = at(null).filter((c, i) => i !== 2);
    const asked = ctl.mix ? ctl.mix.spellAsked : null;
    const url1 = location.search;
    window.ring.release(null);
    ctl.stop();
    return { recipe: r.recipe, spell: r.spell, rolled, off, url0, after, asked, url1, held2: cells()[2] && cells()[2].bird };
  `),
  judge: (r) => {
    const drawn = r.rolled.every((c) => !c.held && Math.abs(c.value - c.want) < 1e-9 && c.off < 0.5);
    const home = r.after.every((c) => !c.held && Math.abs(c.value - c.want) < 1e-9 && c.off < 0.5);
    const asked = !!r.asked && Object.keys(r.asked).length === 1;
    const link = !/spell=/.test(r.url0) && /recipe=house\/growl-room/.test(r.url1) && /spell=ze:0\.90\b/.test(r.url1);
    return {
      ok: !!r.recipe && r.off.length > 0 && drawn && home && asked && link,
      why: !r.off.length ? `the recipe rolled the house (${JSON.stringify(r.spell)}), so nothing is proved`
        : !drawn ? `under the roll the birds stood at ${JSON.stringify(r.rolled)}`
        : !home ? `after one pull the others stood at ${JSON.stringify(r.after)}`
        : !asked ? `the set was asked for ${JSON.stringify(r.asked)}`
        : `the links were "${r.url0}" and "${r.url1}"`,
      note: `under ${r.recipe} ${r.off.length} birds stand off the house at the roll (${r.off.join(', ')}), each at its radius; `
        + `Zephyr pulled to 90 % leaves the other seven at the house and the link "${decodeURIComponent(r.url1)}"`,
    };
  },
});

// **The tap's candidates are planned as the cast would play them** (R59): under
// the page's engine and modes, through the control. They were planned as the
// bare record — house-v1 on a v2 page — and under `development=shaped` every
// one of the twelve threw and the tap fell back to a plain roll.
SCENARIOS.push({
  name: 'a tap on the die measures candidates planned under the page\'s engine and modes',
  area: 'recipe',
  query: 'v=2&seed=5&development=shaped',
  page: body(`
    const look = window.deepHouse.cast.look(0);
    const strategy = ctl.state.strategy;
    const styles = look.pool.map((c) => ctl.planned(0, c.seed, strategy).style.id);
    const agree = look.pool.every((c) => Math.abs(window.deepHouse.cast.distanceTo(c.seed).distance - c.distance) < 1e-9);
    return { n: look.pool.length, pick: look.pick && look.pick.seed, styles: [...new Set(styles)], strategy, agree };
  `),
  judge: (r) => ({
    ok: r.n >= 10 && r.styles.length === 1 && r.styles[0] === 'deep-house-v2' && r.agree && !!r.pick,
    why: r.n < 10 ? `only ${r.n} of 12 candidates could be planned under ${r.strategy} with development shaped`
      : !r.agree ? "a candidate's distance is not the one the ring measures for its seed"
      : `the candidates were planned in ${r.styles.join(', ')}`,
    note: `${r.n} candidates planned under ${r.strategy} (${r.styles.join(', ')}) with development shaped, each measured as the ring measures it; the tap picks ${r.pick}`,
  }),
});

// **The coming theme's lanes are the coming plan's** (R62). A pull re-plans the
// theme ahead under the same seed; the band keyed what it had drawn on the seed
// and went on showing the old plan's lanes through the whole approach.
SCENARIOS.push({
  name: 'a pull during the approach redraws the coming theme\'s lanes',
  area: 'view',
  query: 'v=2&seed=1',
  page: body(`
    await started();
    await sleep(500);
    ctl.seekTo(0.9, true);
    const shown = await waitFor(() => window.ring.nextDrawn().shown > 0.01 && ctl.readout().mix.next, 6000);
    await frame(); await frame();
    const before = window.ring.nextDrawn();
    const lanesBefore = ctl.readout().mix.next && ctl.readout().mix.next.lanes;
    const bpmBefore = ctl.readout().mix.next && ctl.readout().mix.next.bpm;
    window.ring.pull(0, 1);
    const moved = await waitFor(() => ctl.readout().mix.next && ctl.readout().mix.next.lanes !== lanesBefore, 4000);
    await frame(); await frame(); await frame();
    const after = window.ring.nextDrawn();
    const bpmAfter = ctl.readout().mix.next && ctl.readout().mix.next.bpm;
    window.ring.release(null);
    ctl.stop();
    return { shown, moved, before, after, bpmBefore, bpmAfter };
  `),
  judge: (r) => ({
    ok: r.shown && r.moved && r.before.own && r.after.own && r.after.sig !== r.before.sig,
    why: !r.shown ? 'the coming theme never showed through' : !r.moved ? 'the pull did not re-plan the coming theme'
      : !r.after.own ? 'the band still shows the lanes of the plan the pull replaced'
      : r.after.sig === r.before.sig ? 'the drawing did not change with the plan' : "the band was not the coming plan's before the pull",
    note: `the coming theme re-planned from ${r.bpmBefore} to ${r.bpmAfter} BPM by a pull on Ember, and the band drew its lanes again (${r.before.marks} marks, then ${r.after.marks})`,
  }),
});

// **A hand's steps are percents of the house** (R64 of the review of 09-24,
// Eugene's question 16). An arrow was 0.05 of a value and the snap 0.03, so
// the same key moved Spark 2 % above its house and Root 7 % below, and a drag
// let go at 94.5 % of Spark's house snapped home while one at 102 % held. Now an
// arrow is a 5 % step to the phone's grid, a page 20 %, and the snap 3 %
// either side of the house for every bird.
SCENARIOS.push({
  name: 'an arrow, a page and the house\'s snap are percents of the house, the same for every bird',
  area: 'panel',
  query: 'v=2&seed=15576',
  page: body(HAND + `
    const idx = (b) => cells().findIndex((c) => c.bird === b);
    const gs = () => document.querySelectorAll('#starCells g.cell');
    const key = async (b, k) => { gs()[idx(b)].dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); await sleep(700); };
    const read = (b) => { const c = cells()[idx(b)]; return { held: c.held, percent: c.percent, value: c.value }; };
    await key('spark', 'ArrowUp');
    await key('root', 'ArrowDown');
    await key('loom', 'PageUp');
    const keys = { spark: read('spark'), root: read('root'), loom: read('loom'), url: decodeURIComponent(location.search) };
    window.ring.release(null);
    await sleep(400);
    // a drag let go just inside and just outside the snap, on the short and the long half of Spark
    window.ring.pull(idx('spark'), 0.32);   // 101.9 % of Spark's house
    await sleep(500);
    const in102 = read('spark');
    window.ring.release(null); await sleep(300);
    window.ring.pull(idx('spark'), 0.26);   // 94.5 %, a hundredth under it being 90.9 %
    await sleep(500);
    const out94 = read('spark');
    window.ring.release(null);
    return { keys, in102, out94 };
  `),
  judge: (r) => {
    const k = r.keys;
    const keys = k.spark.held && k.spark.percent === 105 && k.root.held && k.root.percent === 95 && k.loom.held && k.loom.percent === 120;
    const snap = !r.in102.held && r.in102.percent === 100 && r.out94.held && r.out94.percent === 95;
    return {
      ok: keys && snap,
      why: !keys ? `an arrow up on Spark, down on Root and a page up on Loom stood at ${k.spark.percent}, ${k.root.percent} and ${k.loom.percent} % (${k.url})`
        : `a drag let go at 101.9 % of Spark's house came back ${JSON.stringify(r.in102)}, one at 94.5 % ${JSON.stringify(r.out94)}`,
      note: `an arrow up took Spark to ${k.spark.percent} %, an arrow down Root to ${k.root.percent} %, a page up Loom to ${k.loom.percent} % ("${k.url}"); `
        + `a drag let go at 101.9 % of Spark's house (0.32) snapped home and one at 94.5 % (0.26) held`,
    };
  },
});

// **Two birds stepped inside the commit's wait both reach the spell** (R65). The
// keys and the phone's panel each shared one 300 ms timer across all eight
// birds, so a second bird moved inside it cancelled the first one's commit: the
// first stood moved on the ring, still pulling, out of the spell and the link.
SCENARIOS.push({
  name: 'two birds stepped inside the commit\'s wait both reach the spell, by keys and on the panel',
  area: 'panel',
  query: 'v=2&seed=15576',
  page: body(HAND + `
    const gs = () => document.querySelectorAll('#starCells g.cell');
    const key = (i, k) => gs()[i].dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    key(0, 'ArrowUp');
    await sleep(80);
    key(2, 'ArrowUp');
    await sleep(700);
    const keys = { held: cells().filter((c) => c.held).map((c) => c.bird).sort().join(','),
      pulling: cells().filter((c) => c.pulling).map((c) => c.bird).join(','), url: decodeURIComponent(location.search) };
    window.ring.release(null);
    await sleep(400);
    // the panel: a finger's tap on Root, More, then a tap on Loom and More, all inside the wait
    const tap = async (i) => { const p = nodeAt(i); finger('pointerdown', p, el('tilt')); await sleep(50); finger('pointerup', p); await sleep(90); };
    await tap(4);
    el('birdPanelMore').click();
    await sleep(40);
    await tap(5);
    el('birdPanelMore').click();
    await sleep(700);
    const panel = { held: cells().filter((c) => c.held).map((c) => c.bird).sort().join(','),
      pulling: cells().filter((c) => c.pulling).map((c) => c.bird).join(','), url: decodeURIComponent(location.search) };
    window.ring.release(null);
    return { keys, panel };
  `),
  judge: (r) => {
    const both = (x, a, b) => x.held === [a, b].sort().join(',') && !x.pulling && x.url.includes(`${BIRD_CODE[a]}:`) && x.url.includes(`${BIRD_CODE[b]}:`);
    const k = both(r.keys, 'ember', 'zephyr'), p = both(r.panel, 'root', 'loom');
    return {
      ok: k && p,
      why: !k ? `by keys: held ${r.keys.held || 'none'}, still pulling ${r.keys.pulling || 'none'}, link ${r.keys.url}`
        : `on the panel: held ${r.panel.held || 'none'}, still pulling ${r.panel.pulling || 'none'}, link ${r.panel.url}`,
      note: `Ember then Zephyr by arrow keys 80 ms apart, and Root then Loom on the phone's panel inside the wait: all four held, none left pulling, all four in the link`,
    };
  },
});

// **The panel mark follows the hand through the chunk's load, and an open that
// fails leaves nothing behind** (R117, R130). A second press while the view's
// chunk was in flight got `null` back and set the mark to closed while the view
// opened anyway; and an open that threw half way left the sheet, `data-view`
// and the ring moved into a panel that was never drawn.
SCENARIOS.push({
  name: 'the panel mark follows the hand while the view loads, and a failed open leaves the page as it was',
  area: 'view',
  query: 'v=2&seed=3',
  page: body(`
    const mark = el('panel');
    const home = el('stage').parentNode;
    const state = () => ({ on: window.ring.machine.on, aria: mark.getAttribute('aria-expanded'),
      view: document.documentElement.getAttribute('data-view'), host: !!el('machine'), sheet: !!el('machineSheet'),
      home: el('stage').parentNode === home });
    // two presses inside the load: open, then close
    mark.click(); mark.click();
    const early = state();
    await waitFor(() => false, 1500);
    const twice = state();
    // three: open, close, open
    mark.click(); mark.click(); mark.click();
    await waitFor(() => window.ring.machine.on, 3000);
    await sleep(200);
    const thrice = state();
    mark.click();
    await sleep(200);
    // an open that throws half way: the store cannot subscribe
    const sub = ctl.subscribe;
    ctl.subscribe = () => { throw new Error('scenario: the store cannot subscribe'); };
    let threw = null;
    try { await window.ring.machine.open(); } catch (e) { threw = String(e); }
    ctl.subscribe = sub;
    await sleep(100);
    const failed = state();
    // and the page still opens it
    await window.ring.machine.open();
    await sleep(200);
    const again = state();
    window.ring.machine.close();
    await sleep(100);
    return { early, twice, thrice, failed, again, threw };
  `),
  judge: (r) => {
    const closed = (x) => !x.on && x.aria === 'false' && !x.view && !x.host && !x.sheet && x.home;
    const open = (x) => x.on && x.aria === 'true' && x.view === 'machine' && x.host && x.sheet && !x.home;
    const bad = !closed(r.twice) ? `two presses in the load left ${JSON.stringify(r.twice)}`
      : !open(r.thrice) ? `three presses in the load left ${JSON.stringify(r.thrice)}`
      : !closed(r.failed) ? `an open that threw left ${JSON.stringify(r.failed)}`
      : !open(r.again) ? `the page did not open the view after a failed open: ${JSON.stringify(r.again)}` : null;
    return {
      ok: !bad,
      why: bad,
      note: 'two presses inside the load end closed and the mark says so, three end open; an open whose store could not subscribe took the sheet, the attribute and its host away and put the ring home, and the next open worked',
    };
  },
});

// **The ledger runs whether the view is open or not** (R54, R114). The section,
// lane, voice, treatment, late and clock lines were written by the view's own
// frame, so a view opened after hearing something showed only the transport's
// lines — and the open itself wrote "engaged" for every lane already treated.
SCENARIOS.push({
  name: 'the ledger writes the section and the voices with the view shut, and opening it writes no treatment',
  area: 'view',
  query: 'v=2&seed=1',
  deadline: 60000,
  page: body(`
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 10000);
    // just short of the next section's first bar, and on over it
    const r = ctl.readout();
    const next = r.plan.find((s) => s.startBar > r.bar + 1);
    const from = r.section;
    if (next) ctl.seekTo((next.startBar - 0.6) / r.bars, true);
    const turned = await waitFor(() => ctl.readout().section !== from, 12000);
    // and into the next theme, whose lanes are drawn by other voices
    const theme = ctl.readout().mix.themeNumber;
    ctl.skip();
    const skipped = await waitFor(() => ctl.readout().mix.themeNumber !== theme, 15000);
    await sleep(600);
    const openAt = performance.now();
    await bounded(window.ring.machine.open(), 12000);
    await sleep(300);
    const lines = window.ring.machine.snapshot().ledger.map((e) => ({ kind: e.kind, what: e.what, at: e.at, bar: e.bar }));
    window.ring.machine.close();
    ctl.stop();
    return { turned, skipped, openAt, lines };
  `),
  judge: (r) => {
    const before = r.lines.filter((l) => l.at < r.openAt);
    const after = r.lines.filter((l) => l.at >= r.openAt);
    const section = before.find((l) => l.kind === 'section');
    const voices = before.filter((l) => l.kind === 'voice' || l.kind === 'lane');
    const engaged = after.filter((l) => l.kind === 'treatment' && /engaged/.test(l.what));
    const ok = r.turned && r.skipped && !!section && voices.length > 0 && engaged.length <= 1;
    return {
      ok,
      why: !r.turned ? 'the section never turned over' : !r.skipped ? 'the skip never landed'
        : !section ? `nothing wrote the section turning over while the view was shut (${before.map((l) => l.kind).join(', ')})`
        : !voices.length ? 'no lane or voice line was written while the view was shut'
        : `opening the view wrote ${engaged.length} treatment lines: ${engaged.map((l) => l.what).slice(0, 3).join('; ')}`,
      note: `with the view shut the ledger took "${section && section.what}" at bar ${section && section.bar} and ${voices.length} lane and voice lines over a skip; the open wrote ${engaged.length} treatment lines`,
    };
  },
});

// **A pause keeps the spatial returns** (R56). A theme of house-v2 whose notes
// send to the immersed or the background return drew that box and its wires
// only while a graph was built, so a pause took them away and the play put them
// back — the structure changing with the state. Seed 4's first theme sends to
// the immersed return.
SCENARIOS.push({
  name: 'a pause keeps a theme\'s immersed return in the picture, idle',
  area: 'view',
  query: 'v=2&seed=4',
  page: body(`
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
    await bounded(window.ring.machine.open(), 12000);
    await sleep(400);
    const shot = () => {
      const svg = el('machineDiagram');
      const g = svg && svg.querySelector('[data-box="send:immersed"]');
      return { box: !!g, state: g ? g.getAttribute('data-state') : null, at: g ? g.getAttribute('transform') : null,
        wires: window.ring.machine.snapshot().part.edges.filter((e) => e.from === 'send:immersed' || e.to === 'send:immersed').length,
        boxes: svg ? svg.querySelectorAll('[data-box]').length : 0 };
    };
    const playing = shot();
    ctl.stop();
    await sleep(600);
    const paused = shot();
    window.ring.machine.close();
    return { playing, paused };
  `),
  judge: (r) => ({
    ok: r.playing.box && r.paused.box && r.paused.state === 'idle' && r.paused.at === r.playing.at && r.paused.wires === r.playing.wires,
    why: !r.playing.box ? 'the playing theme drew no immersed return' : !r.paused.box ? 'the pause took the immersed return away'
      : r.paused.state !== 'idle' ? `paused, the return is ${r.paused.state}` : `the return moved or lost wires: ${JSON.stringify(r)}`,
    note: `the immersed return stood at the same place playing and paused, ${r.playing.state} then idle, with its ${r.playing.wires} wires both times`,
  }),
});

// **The view's small controls keep their word** (R118, R119). A source's volume
// popover took the keyboard back to its first slider every time a theme change
// re-drew the source's instruments; and a ledger line was marked copied before
// the clipboard had said it took the line.
SCENARIOS.push({
  name: 'a theme change leaves the focus where the hand put it in a volume popover, and a line is marked copied only once it is',
  area: 'view',
  query: 'v=2&seed=1',
  deadline: 90000,
  page: body(`
    ${LEDGER_SHOWN}
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
    await bounded(window.ring.machine.open(), 12000);
    await sleep(400);
    const vols = () => [...document.querySelectorAll('#machine [aria-label^="Strip "]')].filter((g) => g.getAttribute('aria-disabled') !== 'true');
    const rows = () => [...document.querySelectorAll('.desk-pop .desk-row .desk-name')].map((x) => x.textContent).join('+');
    let tried = 0, changed = false, kept = null, stillOpen = false, onto = '';
    // the popover of each source in turn, until a skip re-draws the instruments under an open one
    for (let k = 0; k < 4 && !changed; k++) {
      const v = vols()[k * 3 % Math.max(1, vols().length)];
      if (!v) break;
      v.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await sleep(150);
      const reset = document.querySelector('.desk-pop button[aria-label^="Reset "]');
      if (!reset) continue;
      reset.focus();
      const before = rows();
      const theme = ctl.readout().mix.themeNumber;
      ctl.skip();
      await waitFor(() => ctl.readout().mix.themeNumber !== theme, 15000);
      await sleep(500);
      tried++;
      stillOpen = !!document.querySelector('.desk-pop');
      changed = stillOpen && rows() !== before;
      kept = document.activeElement === reset;
      onto = document.activeElement ? document.activeElement.tagName + (document.activeElement.getAttribute('aria-label') ? ' ' + document.activeElement.getAttribute('aria-label') : '') : 'nothing';
      if (!changed) { reset.blur(); document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await sleep(100); }
    }
    // the copy: refused, then taken
    const line = document.querySelector('#machine .lines button.line');
    const real = navigator.clipboard && navigator.clipboard.writeText;
    let refused = null, taken = null;
    if (line && navigator.clipboard) {
      navigator.clipboard.writeText = () => Promise.reject(new Error('scenario: no'));
      line.click();
      await sleep(150);
      refused = document.querySelector('#machine .lines button.line.copied') ? 'marked' : 'unmarked';
      navigator.clipboard.writeText = () => Promise.resolve();
      line.click();
      await sleep(150);
      taken = document.querySelector('#machine .lines button.line.copied') ? 'marked' : 'unmarked';
      navigator.clipboard.writeText = real;
    }
    window.ring.machine.close();
    ctl.stop();
    return { tried, changed, kept, onto, refused, taken };
  `),
  judge: (r) => {
    const focus = !r.changed || r.kept;
    const copy = r.refused === 'unmarked' && r.taken === 'marked';
    return {
      ok: focus && copy && r.changed,
      why: !r.changed ? `no skip re-drew the instruments under an open popover in ${r.tried} tries`
        : !focus ? `a theme change took the focus off the popover's Reset onto ${r.onto}`
        : `a refused copy left the line ${r.refused}, a taken one ${r.taken}`,
      note: `a skip re-drew the instruments under an open volume popover and the focus stayed on its Reset; a refused copy left the line unmarked and a taken one marked it`,
    };
  },
});

// **The words are measured in the face they are drawn in** (R126). The page's
// face is held back a second and a half, as a cold visit on a slow line would
// have it, so the ring is built in the fallback; once the face arrives every
// bird's words' box is the one its words measure in it.
SCENARIOS.push({
  name: 'a bird\'s words are measured again when the page\'s face arrives late',
  area: 'words',
  // seed 1 by name: since K16 a bare page throws the die
  query: 'seed=1',
  deadline: 90000,
  drive: async (page) => {
    const url = page.url();
    const late = async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); };
    await page.route('**/fonts/jost.woff2', late);
    try {
      await page.goto(url.replace(/([?&])v=[^&]*/, '$1') + (url.includes('?') ? '&' : '?') + 'v=2&seed=7', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.ring && window.deepHouse, { timeout: 20000 });
      const early = await page.evaluate(() => ({ status: document.fonts.status, face: [...document.fonts].filter((f) => f.family.replace(/"/g, '') === 'Jost').map((f) => f.status).join(',') }));
      await page.waitForFunction(() => document.fonts.status === 'loaded', { timeout: 20000 });
      await page.waitForTimeout(300);
      const boxes = await page.evaluate(() => window.ring.cells().map((_, i) => window.ring.wordBox(i)));
      return { early, boxes };
    } finally {
      await page.unroute('**/fonts/jost.woff2', late).catch(() => {});
    }
  },
  judge: (r) => {
    const off = r.boxes.map((b, i) => ({ i, dw: Math.abs(b.kept.w - b.now.w), dh: Math.abs(b.kept.h - b.now.h) })).filter((d) => d.dw > 0.01 || d.dh > 0.01);
    return {
      ok: !off.length && r.boxes.length === 8,
      why: off.length ? `${off.length} birds keep a box the words no longer measure: bird ${off[0].i} is ${off[0].dw.toFixed(2)} wide and ${off[0].dh.toFixed(2)} tall out` : `${r.boxes.length} boxes`,
      note: `with the face held back the ring was built with the fonts ${r.early.status} (Jost ${r.early.face || 'not asked for yet'}); once it arrived all eight birds' boxes were the ones their words measure in it`,
    };
  },
});

// **The hot paths, measured on the page** (the reconciled review of 09-24,
// round (c)). A sway, a pull, a tap on the die, a skip and ten notches of the
// phone panel's slider, each watched for a long task where the engine reports
// them (Chromium; WebKit and Firefox have no such entry and say so), with the
// late counter held at nought across all of it. And three numbers that do not
// depend on how fast the machine is: the word placer asks at most two birds the
// whole question a frame through an untouched sway (it asked all eight, twice a
// frame, R71); the scheduler's tick planned and compiled nothing for itself
// (`tickWork`, R12); and a slider pushed through ten notches in two hundred
// milliseconds plans at most six themes (it planned one a notch, R13).
SCENARIOS.push({
  name: 'a sway, a pull, a cast, a skip and the panel\'s notches make no long task, and the placer and the tick keep their budgets',
  area: 'ring',
  // **Alone, after the rest** (`serial`, 09-24): a long task is fifty
  // milliseconds of the page's own thread, and a task that takes forty on a
  // machine to itself takes more when four browsers share it — one full run
  // of five read the pull's re-plan at 53 ms. The rule is a budget on the
  // page's own work, so it is measured where the page has the machine. (Even
  // alone it read 55 ms once, at a load of 21 from other work: the re-plan
  // stands a few milliseconds under the line on this machine.)
  serial: true,
  deadline: 120000,
  query: 'v=2&seed=1',
  page: body(HAND + `
    const lt = [];
    const longtasks = typeof PerformanceObserver !== 'undefined' && (PerformanceObserver.supportedEntryTypes || []).includes('longtask');
    let phase = 'start';
    if (longtasks) new PerformanceObserver((l) => { for (const e of l.getEntries()) lt.push({ phase, ms: Math.round(e.duration) }); }).observe({ type: 'longtask' });
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2, 12000);
    await sleep(2500);
    const late0 = ctl.mix.state.late.count;
    // a sway, untouched, on a desktop's square
    el('tilt').style.width = '940px'; el('tilt').style.height = '940px';
    await sleep(600);
    phase = 'sway';
    window.ring.resetPlacer();
    await sleep(10000);
    const sway = window.ring.placer();
    // a pull, dropped
    phase = 'pull';
    window.ring.pull(0, 0.3);
    await sleep(2500);
    // a tap on the die, and the cast landing
    phase = 'cast';
    const seed0 = ctl.readout().seed;
    window.ring.newMix();
    const cast = await waitFor(() => ctl.readout().seed !== seed0, 25000);
    await sleep(1500);
    // a skip
    phase = 'skip';
    window.ring.skip();
    await sleep(4000);
    // ten notches of Root's slider on the phone's panel, a finger's width apart in time
    el('tilt').style.width = ''; el('tilt').style.height = '';
    await sleep(400);
    phase = 'panel';
    const r0 = cells()[4].radius * 316;
    finger('pointerdown', spoke(4, r0), el('tilt'));
    await sleep(60);
    finger('pointerup', spoke(4, r0));
    await sleep(300);
    const sl = el('birdPanelSlider');
    const plans0 = ctl.plansMade;
    for (let k = 1; k <= 10; k++) { sl.value = String(100 - 5 * k); sl.dispatchEvent(new Event('input', { bubbles: true })); await sleep(20); }
    sl.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(300);
    const panelPlans = ctl.plansMade - plans0;
    const line = el('birdPanelNow').textContent;
    phase = 'end';
    const out = {
      longtasks, lt, sway, cast, panelPlans, line,
      tickWork: ctl.mix ? ctl.mix.tickWork : null,
      late: ctl.mix ? ctl.mix.state.late.count - late0 : null,
    };
    ctl.stop();
    window.ring.release(null);
    await sleep(200);
    return out;
  `),
  judge: (r) => {
    const LONG = 50;
    const long = r.lt.filter((x) => x.ms > LONG);
    const perCall = r.sway.calls ? r.sway.full / r.sway.calls : Infinity;
    const placerOk = r.sway.calls > 100 && perCall <= 2;
    const tickOk = r.tickWork === 0;
    // (the line is the short band line since round K13 — "Thin bass, body
    // rare" — so it is held to say something, not to a list of long words)
    const panelOk = r.panelPlans <= 6 && !!(r.line || '').trim();
    return {
      ok: r.cast && !long.length && placerOk && tickOk && panelOk && r.late === 0,
      why: !r.cast ? 'the tap on the die never landed'
        : long.length ? `a long task of ${long[0].ms} ms in the ${long[0].phase} (${long.map((x) => x.phase + ' ' + x.ms).join(', ')})`
        : !placerOk ? `the placer asked ${r.sway.full} birds afresh over ${r.sway.calls} calls of an untouched sway (${perCall.toFixed(2)} a call)`
        : !tickOk ? `the scheduler's tick planned or compiled ${r.tickWork} themes for itself`
        : !panelOk ? `ten notches of the slider planned ${r.panelPlans} themes, and the line read ${JSON.stringify(r.line)}`
        : `${r.late} notes were late`,
      note: `${r.longtasks ? `no long task over ${LONG} ms through a ten-second sway, a pull, a cast, a skip and ten notches of the panel` : 'this engine reports no long tasks, so the three counts are the gate'}; `
        + `the placer asked ${(perCall).toFixed(2)} birds afresh a call over ${r.sway.calls} calls (${(r.sway.ms / r.sway.calls).toFixed(3)} ms a call); `
        + `the tick planned and compiled nothing for itself; ten notches planned ${r.panelPlans} themes; nothing late`,
    };
  },
});

// **Reduced motion rests the ring's ornament and draws its state** (the
// reconciled review, R53 and C11). The preference is turned on with the page
// already open — which is the change listener's case as well as the rule's —
// and the set is started: the star stands north, the ring leans into no pointer,
// the pulse and the breath stand at rest, a cast is its end state at once and a
// flash is not drawn; while the beat dot steps, the cursor goes round, and a
// bird a hand moves stands at its value on the next frame and not over an ease.
// The machine view under it redraws on a state that changed, not on every emit.
// Turned off again, the star sways.
SCENARIOS.push({
  name: 'reduced motion rests the sway, the lean and the pulse, and still draws the beat, the cursor and a moved bird',
  area: 'ring',
  deadline: 90000,
  query: 'v=2&seed=15576',
  drive: async (page) => {
    const m = () => page.evaluate(() => window.ring.motion());
    const out = {};
    try {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForTimeout(200);
      out.flipped = (await m()).reduced;
      await page.evaluate(async () => {
        const ctl = window.ring.control;
        await Promise.race([ctl.start(), new Promise((r) => setTimeout(r, 15000))]);
      });
      await page.waitForTimeout(700);
      // a pointer over the ring, a click on the play node's nudge, and sixty frames of watching
      const t = await page.evaluate(() => { const b = document.getElementById('tilt').getBoundingClientRect(); return { x: b.x + b.width * 0.8, y: b.y + b.height * 0.2 }; });
      await page.mouse.move(t.x, t.y);
      await page.evaluate(() => window.ring.nudge(1));
      out.samples = await page.evaluate(async () => {
        const got = [];
        for (let k = 0; k < 90; k++) {
          await new Promise((r) => requestAnimationFrame(() => r()));
          got.push(window.ring.motion());
        }
        return got;
      });
      // a cast: its end state on the next frames, no turn, no ring leaving
      out.cast = await page.evaluate(async () => {
        window.ring.cast('full');
        const got = [];
        for (let k = 0; k < 6; k++) { await new Promise((r) => requestAnimationFrame(() => r())); got.push(window.ring.motion()); }
        return got;
      });
      // a bird moved by a hand stands at its value on the next frame
      out.bird = await page.evaluate(async () => {
        const want = window.ring.radiusAt(0, 0.8);
        window.ring.pull(0, 0.8);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        const c = window.ring.cells()[0];
        const got = { want, at: c.radius * 316, value: c.value };
        window.ring.release(null);
        return got;
      });
      // the view: a snapshot for a state that changed, not one for every emit
      out.view = await page.evaluate(async () => {
        await window.ring.machine.open();
        await new Promise((r) => setTimeout(r, 400));
        const a = window.ring.machine.facts();
        const readout = window.ring.control.readout();
        await new Promise((r) => setTimeout(r, 2000));
        const b = window.ring.machine.facts();
        const bars = Math.abs(window.ring.control.readout().bar - readout.bar);
        // and a state that does change — the set stopping — is drawn
        window.ring.control.stop();
        await new Promise((r) => setTimeout(r, 400));
        const c = window.ring.machine.facts();
        const stopped = window.ring.machine.snapshot().playing;
        window.ring.machine.close();
        return { reduced: a.reduced, fps: a.fps, published: b.published - a.published, bars, onStop: c.published - b.published, stopped };
      });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      out.after = await page.evaluate(async () => {
        const got = [];
        for (let k = 0; k < 8; k++) { await new Promise((r) => setTimeout(r, 250)); got.push(window.ring.motion()); }
        return got;
      });
    } finally {
      await page.emulateMedia({ reducedMotion: null }).catch(() => {});
      await page.evaluate(() => { try { window.ring.release(null); window.ring.control.stop(); } catch (e) { /* nothing */ } }).catch(() => {});
    }
    return out;
  },
  judge: (r) => {
    const s = r.samples || [];
    const one = (k) => new Set(s.map((x) => x[k])).size;
    const bad = [];
    if (!r.flipped) bad.push('the page did not hear the preference arrive');
    if (!s.length) bad.push('no frames were sampled');
    if (s.some((x) => x.star !== 0)) bad.push(`the star turned under reduced motion: ${[...new Set(s.map((x) => x.star))].slice(0, 5).join(', ')}°`);
    if (one('tilt') > 1 || s.some((x) => /rotateX\((?!0deg)/.test(x.tilt) || /rotateY\((?!0deg)/.test(x.tilt))) bad.push(`the ring leaned: ${[...new Set(s.map((x) => x.tilt))].slice(0, 3).join(' / ')}`);
    if (one('pulseR') > 1 || one('breathR') > 1 || one('breathOp') > 1) bad.push(`the pulse moved: r ${[...new Set(s.map((x) => x.pulseR))].slice(0, 4).join(', ')}, breath ${[...new Set(s.map((x) => x.breathR))].slice(0, 4).join(', ')}`);
    if (one('beat') < 2) bad.push('the beat dot never stepped');
    if (one('cursor') < 2) bad.push('the cursor did not move');
    const c = r.cast || [];
    // the inner layer's turn and scale as numbers, whatever the browser serialises them as
    const turned = (v) => { const rot = /rotate\(([-\d.]+)deg\)/.exec(v || ''), sc = /scale\(([-\d.]+)\)/.exec(v || ''); return (rot && Math.abs(+rot[1]) > 0.001) || (sc && Math.abs(+sc[1] - 1) > 0.0001); };
    if (c.some((x) => turned(x.inner))) bad.push(`the cast turned the star: ${c.map((x) => x.inner).find(turned)}`);
    if (c.some((x) => Number(x.castRing) > 0.001)) bad.push('a ring left the circle at the cast');
    if (c.concat(s).some((x) => x.flash > 0.001)) bad.push('a flash was drawn');
    if (!r.bird || Math.abs(r.bird.at - r.bird.want) > 0.1) bad.push(`a moved bird stood at ${r.bird && r.bird.at.toFixed(2)} on the next frame, not at its value's ${r.bird && r.bird.want.toFixed(2)}`);
    const v = r.view || {};
    // at most one snapshot for each bar that turned over and a couple for the open itself — never a dozen a second
    if (!v.reduced || v.fps !== 0) bad.push(`the view read reduced ${v.reduced} at ${v.fps} fps`);
    else if (v.published > v.bars * 3 + 4) bad.push(`the view took ${v.published} snapshots in two seconds over ${v.bars} bars`);
    else if (v.onStop < 1 || v.stopped !== false) bad.push(`the view did not draw the set stopping (${v.onStop} snapshots, playing ${v.stopped})`);
    const a = r.after || [];
    if (new Set(a.map((x) => x.star)).size < 2) bad.push('with the preference gone the star did not sway again');
    return {
      ok: !bad.length,
      why: bad[0],
      note: `the preference heard with the page open; over ${s.length} frames the star stood at 0°, the ring leaned nowhere, the pulse and breath held at r ${s[0] && s[0].pulseR}, `
        + `while the beat dot stepped ${one('beat') - 1} times and the cursor moved; a cast was its end state at once and no flash was drawn; a pulled bird stood at its value on the next frame; `
        + `the view took ${v.published} snapshots in two seconds over ${v.bars} bars and drew the stop; and with the preference gone the star swayed again (${[...new Set(a.map((x) => x.star))].length} angles)`,
    };
  },
});

// **A bad link is a ring with a line on it, never a black page** (Eugene,
// 09-22). One scenario per way a link goes wrong, each opened cold on the built
// page: the ring has to come up with its eight cells, the part of the link the
// page would not play has to be gone from the address with the ring's one line
// saying so in the free band, a start has to play the house, nothing may have
// been fetched from outside the page's own folder, and — `quiet` — the console
// may not have said an error at any point from the load on, which the harness
// holds the scenario to.
const BAD_LINKS = [
  ['a recipe the library does not hold', 'v=2&seed=5&recipe=nobody/x', 'recipe', 'no such recipe'],
  ['a seed nobody could type', 'seed=%01%02%03', 'seed', 'bad seed'],
  ['a spell that does not parse', 'v=2&seed=5&spell=ember:lots,tide', 'spell', 'bad spell'],
  ['a hand part without its accompaniment', 'v=2&seed=5&recipe=house/hand-rolling', 'recipe', 'hand part alone'],
  // The line names what plays, and it is the page's default (R125): it said
  // "the record" while v2 played.
  ['an engine nothing answers to', 'seed=5&v=9', 'v', 'no such engine · v2', 'house-v2'],
  ['a recipe that is a path', 'v=2&seed=5&recipe=../../mining/attempts/x/a.json', 'recipe', 'no such recipe'],
];
for (const [what, query, param, line, engine] of BAD_LINKS) {
  SCENARIOS.push({
    name: `a bad link is a ring with a line on it: ${what}`,
    area: 'link',
    query,
    quiet: true,
    page: body(`
      const note = document.querySelector('[data-link-note]');
      const cells = document.querySelectorAll('#starCells g.cell').length;
      const stage = box('stage');
      const out = {
        cells, drawn: stage.width > 100 && stage.height > 100,
        note: note && note.firstChild ? note.firstChild.textContent : null, noteOpacity: note ? +note.getAttribute('opacity') : null,
        said: (el('say') || {}).textContent || '',
        // gone, or — the seed, which the transport writes back — no longer the value the link carried
        kept: ctl.link.raw(${JSON.stringify(param)}) === ctl.link.raw(${JSON.stringify(param)}, ${JSON.stringify('?' + query)}),
        refused: ctl.linkProblems.map((p) => p.param),
        fetched: performance.getEntriesByType('resource').map((e) => e.name)
          .filter((u) => !u.startsWith(location.origin + '/') || /mining|__auditions|\\.json/.test(u)),
      };
      await started(8000);
      await waitFor(() => ctl.playing && ctl.mix && ctl.mix.state.elapsed > 0.3, 8000);
      const r = ctl.readout();
      out.playing = ctl.playing;
      out.recipe = r.recipe;
      out.strategy = r.strategy;
      out.noteAfter = note ? +note.getAttribute('opacity') : null;
      ctl.stop();
      await sleep(300);
      return out;
    `),
    judge: (r) => {
      const ring = r.cells === 8 && r.drawn;
      const said = r.note && r.note.toLowerCase().startsWith(line) && r.noteOpacity > 0 && r.said.length > 0;
      const off = !r.kept && r.refused.includes(param);
      const plays = r.playing && r.recipe === null && r.noteAfter === 0 && (!engine || r.strategy === engine);
      const clean = !r.fetched.length;
      return {
        ok: ring && said && off && plays && clean,
        why: !ring ? `the ring came up with ${r.cells} cells, drawn ${r.drawn}`
          : !said ? `the free band said ${JSON.stringify(r.note)} at ${r.noteOpacity}, the screen reader ${JSON.stringify(r.said)}`
          : !off ? `the address kept ${JSON.stringify(param)}: refused ${r.refused.join(',') || 'nothing'}`
          : !plays ? `a start played ${r.playing} with the recipe ${r.recipe}, and the line stayed at ${r.noteAfter}`
          : `the page fetched ${r.fetched.join(', ')}`,
        note: `the ring came up whole with "${r.note}" in the free band, the ${param} was taken off the address, `
          + `a start played the house under ${r.strategy} and put the line away, nothing was fetched from outside the page, and the console said no error`,
      };
    },
  });
}

// **Round K11: the house magnet, the live label, one apply rule, visible
// progress** (`notes/rounds/ring-k.md`). One block, appended: the magnet's two
// numbers are read from the one table the page reads them from.
import { HOUSE_ZONE as K11_IN, HOUSE_HOLD as K11_OUT } from '../src/bird-percent.ts';

const K11 = HAND + `
  const K11_IN = ${K11_IN}, K11_OUT = ${K11_OUT};
  const frames = async () => { await frame(); await frame(); };
  // the radius, in ring units, a hand's own percent of a bird's house stands at
  const radiusOfPercent = (i, p) => { const r0 = window.ring.radiusAt(i, 0), rh = window.ring.radiusAt(i, cells()[i].house); return r0 + (rh - r0) * p / 100; };
  // a mouse on bird i, past the slop, then walked through the hand's own percents
  const walkBird = async (i, walk, watch) => {
    const from = cells()[i].radius * 316;
    hand('pointermove', spoke(i, from), el('stage'));
    hand('pointerdown', spoke(i, from), el('tilt'));
    await sleep(30);
    const w = el('star').getBoundingClientRect().width || 1000;
    const way = Math.sign(radiusOfPercent(i, walk[0]) - from) || 1;
    const base = from + way * Math.max(8, 6 / (w / 1000));
    hand('pointermove', spoke(i, base), window);
    await frames();
    const seen = [];
    let at = base;
    for (const p of walk) {
      at = base + radiusOfPercent(i, p) - from;
      hand('pointermove', spoke(i, at), window);
      await frames();
      const c = cells()[i];
      seen.push({ hand: p, value: c.value, percent: c.percent, home: c.value === c.house, off: +Math.abs(c.radius * 316 - radiusOfPercent(i, p)).toFixed(2), ...(watch ? watch() : {}) });
    }
    hand('pointerup', spoke(i, at), window);
    await sleep(400);
    const c = cells()[i];
    return { seen, held: c.held, percent: c.percent, value: c.value, url: decodeURIComponent(location.search) };
  };
`;

SCENARIOS.push({
  name: 'the house is a magnet under a drag: a bird at the house stays until the hand is out of the lock, a hand coming home snaps it there, and a 5 % step holds',
  area: 'birds',
  // Eugene, round K11: *"a little snap/lock into the 100 % position, so you need
  // to pull harder to get it out, and when you're close to 100 % it snaps into
  // position"* — and *"don't make the magnet too hard … we can't lose the option
  // to tune a bird a bit up from 100 %"*. A mouse on Tide, the hand's own percent
  // walked out of the house, on past the lock, back in to the snap, and let go
  // there; then inward past the lock and let go; then a 5 % step off the house.
  deadline: 90000,
  query: 'v=2&seed=15576',
  page: body(K11 + `
    const i = 6;
    const out = await walkBird(i, [100.5, 101.5, 100 + K11_OUT - 0.4, 100 + K11_OUT + 0.6, 100 + K11_OUT + 2, 110, 100 + K11_IN + 0.6, 100 + K11_IN - 0.5, 101]);
    const inward = await walkBird(i, [99.5, 100 - K11_OUT + 0.4, 100 - K11_OUT - 0.6, 92]);
    window.ring.release(null);
    await sleep(400);
    const step = await walkBird(i, [101, 103.5, 105]);
    await sleep(600);
    const stayed = { held: cells()[i].held, percent: cells()[i].percent };
    window.ring.release(null);
    await sleep(300);
    return { out, inward, step, stayed, IN: K11_IN, OUT: K11_OUT };
  `),
  judge: (r) => {
    const bad = [];
    const s = r.out.seen;
    const locked = s.filter((x) => Math.abs(x.hand - 100) <= r.OUT && x.hand < 100 + r.OUT + 0.5 && s.indexOf(x) < 3);
    if (!locked.every((x) => x.home)) bad.push(`inside the lock the bird left the house: ${JSON.stringify(locked)}`);
    const pulled = s.slice(3, 7);
    if (!pulled.every((x) => !x.home && x.off <= 1)) bad.push(`past the lock the bird was not under the hand: ${JSON.stringify(pulled)}`);
    const snapped = s.slice(7);
    if (!snapped.every((x) => x.home && x.percent === 100)) bad.push(`a hand coming inside ${r.IN} % did not snap the bird home: ${JSON.stringify(snapped)}`);
    if (r.out.held || r.out.url.includes('ti:')) bad.push(`a drop inside the zone held Tide at ${r.out.percent} % (${r.out.url})`);
    const inn = r.inward.seen;
    if (!(inn[0].home && inn[1].home && !inn[2].home && inn[2].off <= 1 && inn[3].off <= 1)) bad.push(`inward: ${JSON.stringify(inn)}`);
    if (!(r.inward.held && Math.abs(r.inward.percent - 92) <= 1)) bad.push(`let go at 92 % Tide stood at ${r.inward.percent} %, held ${r.inward.held}`);
    if (!(r.step.held && r.step.percent === 105 && r.stayed.held && r.stayed.percent === 105)) bad.push(`a 5 % step off the house landed at ${r.step.percent} % (held ${r.step.held}) and stood at ${r.stayed.percent} %`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: `with the lock at ${r.OUT} % and the snap at ${r.IN} %: Tide stayed at the house with the hand at ${locked.map((x) => x.hand).join(', ')} %, `
        + `stood under the hand from ${s[3].hand} % (within ${Math.max(...pulled.map((x) => x.off))} units), snapped home with the hand back at ${s[7].hand} % and let go there bared the link; `
        + `inward it left at ${inn[2].hand} % and held at ${r.inward.percent} %; a pull to 105 % held at ${r.stayed.percent} %`,
    };
  },
});

SCENARIOS.push({
  name: 'a dragged bird\'s label reads the value it would leave, live, and holds it through the wait; the explanation says no next',
  area: 'words',
  // Eugene, round K11: *"the big label like DRY on Veil doesn't change; there
  // is a radial tooltip about NEXT DEEP FX, but it's confusing. The bird should
  // change not only the percent but the label itself, to what it would be if I
  // dropped the bird right now."* Ember (the tempo) dragged out to the rim while
  // the set plays, a move a frame: the bird's reading is the reading of the
  // value under the hand, cross-fading as it changes, and the music is asked
  // nothing; after the drop the reading holds until the seam; the line along
  // the track is the long form, never "now" or "next".
  deadline: 120000,
  query: 'v=2&seed=15576',
  page: body(K11 + `
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
    // **The race** (K30, the chain's report: fails once under load, passes on a
    // rerun): the wait is read in quarter seconds from the drop, and a drop that
    // fell just before a phrase line landed before the first reading, so no
    // reading of the wait was pending. The walk now starts at a phrase line, so
    // the drop is most of four bars from the next one whatever the load.
    await waitFor(() => { const x = ctl.readout(); return x && x.bar % 4 === 0 && x.barPhase < 0.2; }, 30000);
    const i = 0;
    const r0 = ctl.readout();
    const atRest = cells()[i].reading;
    const walk = [];
    for (let p = 104; p <= 130; p += 1) walk.push(p);
    let fades = 0;
    const drag = await walkBird(i, walk, () => {
      const c = cells()[i];
      if (c.fading) fades += 1;
      return { reading: c.reading, implied: c.implied, tell: tellSaid(), asked: JSON.stringify(ctl.readout().spell || null), url: location.search };
    });
    const dropped = cells()[i].reading;
    const wait = [];
    const until = performance.now() + 60000;
    while (performance.now() < until) {
      const c = cells()[i];
      wait.push({ reading: c.reading, pending: c.pending, filled: c.filled, tell: tellSaid() });
      if (!c.pending) break;
      await sleep(250);
    }
    const landed = cells()[i].reading;
    ctl.stop();
    window.ring.release(null);
    return { atRest, drag, dropped, wait, landed, fades, askedAtStart: JSON.stringify(r0.spell || null) };
  `),
  judge: (r) => {
    const s = r.drag.seen;
    const lastMove = s[s.length - 1];
    // the plan behind the label is asked at most eleven times a second, so a
    // sample may be one move behind; the last move is read whole
    const behind = s.filter((x) => x.implied && x.reading.toUpperCase() !== x.implied.toUpperCase()).length;
    const live = behind <= s.length / 4 && lastMove.reading.toUpperCase() === lastMove.implied.toUpperCase() && lastMove.reading !== r.atRest;
    const readings = [...new Set(s.map((x) => x.reading))];
    const unasked = s.every((x) => x.asked === r.askedAtStart && !x.url.includes('em:'));
    // through the wait the label is the dropped reading; from the landing it is
    // the set's, which for the tempo is the grid gliding onto it (\`tempoNow\`)
    const held = r.wait.filter((x) => x.pending).every((x) => x.reading === r.dropped) && r.dropped === lastMove.reading && r.wait.some((x) => x.pending);
    const said = [...s.map((x) => x.tell), ...r.wait.map((x) => x.tell)];
    // (the line is the band's short form since the panel round after K13: the kick's word at the tempo, no number)
    const noNext = said.every((t) => !/\\b(NEXT|NOW)\\b/.test(t)) && /^(STEADY FOUR|DRIVING KICK|FAST BEAT|FREE PULSE|NO DRUMS)/.test(said[said.length - 1]);
    const filled = r.wait.some((x) => x.pending && x.filled);
    return {
      ok: live && unasked && held && noNext && filled && r.fades > 0,
      why: !live ? `under the hand the bird read ${JSON.stringify(readings)} against the value's ${JSON.stringify(lastMove.implied)}`
        : !unasked ? 'the drag asked the music for something before the drop'
        : !held ? `after the drop the bird read ${JSON.stringify([...new Set(r.wait.map((x) => x.reading))])}, dropped at ${r.dropped}, landed at ${r.landed}`
        : !noNext ? `the explanation said ${JSON.stringify([...new Set(said)])}`
        : !filled ? 'the wait drew no fill'
        : 'the reading never cross-faded',
      note: `Ember dragged from the house to the rim while the set played: its label went ${JSON.stringify(r.atRest)} → ${readings.map((x) => JSON.stringify(x)).join(' → ')}, `
        + `each the reading of the value under the hand (${s.length - behind} of ${s.length} moves read at once), cross-fading on ${r.fades} samples, with nothing asked of the music; dropped, it held ${JSON.stringify(r.dropped)} `
        + `over ${r.wait.filter((x) => x.pending).length} readings of the wait (the fill drawn) and read ${JSON.stringify(r.landed)} once landed, the grid gliding onto it; the line along the track said ${JSON.stringify(said[said.length - 1])}, never "now" or "next"`,
    };
  },
});

SCENARIOS.push({
  name: 'the phone\'s slider applies at the release and not while the dot moves, with the house\'s gravity and a 5 % step that holds',
  area: 'panel',
  // Eugene, round K11: *"on mobile, dragging the dot applies the value live, the
  // opposite of desktop. It should apply only when I stop dragging; while
  // dragging I should see the updated label and value the bird will have if I
  // leave it here"* — and the gravity at 100 %. A finger opens Root's panel
  // while the set plays and holds the slider: notches with pauses longer than
  // the old 300 ms commit move the bird, its label and the panel's line, and
  // reach neither the link nor the music; the lift applies at once and the
  // wait's fill starts there. Then home by the gravity, and a 5 % step.
  deadline: 200000,
  query: 'v=2&seed=15576',
  page: body(K11 + `
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
    const i = 4;
    const r0 = cells()[i].radius * 316;
    finger('pointerdown', spoke(i, r0), el('tilt'));
    await sleep(60);
    finger('pointerup', spoke(i, r0));
    await sleep(200);
    const sl = el('birdPanelSlider');
    const line = () => el('birdPanelNow').textContent;
    const atOpen = { line: line(), reading: cells()[i].reading };
    const touch = (type) => sl.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 31, pointerType: 'touch', isPrimary: true }));
    const to = (v) => { sl.value = String(v); sl.dispatchEvent(new Event('input', { bubbles: true })); };
    const look = () => ({ knob: sl.value, percent: cells()[i].percent, home: cells()[i].value === cells()[i].house, held: cells()[i].held, pulling: cells()[i].pulling,
      url: decodeURIComponent(location.search), asked: JSON.stringify(ctl.readout().spell || null), reading: cells()[i].reading, implied: cells()[i].implied, line: line() });
    const asked0 = JSON.stringify(ctl.readout().spell || null);
    touch('pointerdown');
    to(102); await sleep(80);
    const locked = look();
    to(104); await sleep(450);
    const step = look();
    to(117); await sleep(450);
    to(124); await sleep(450);
    const during = look();
    touch('pointerup');
    const lifted = look();
    await sleep(400);
    const after = { ...look(), pending: cells()[i].pending, filled: cells()[i].filled };
    // home by the gravity: from 125 % a finger let go at 102 is the house (once
    // 125 has landed: a release inside a seam already in flight is the
    // transport's, and not the slider's, question)
    await waitFor(() => !cells()[i].pending, 60000);
    touch('pointerdown'); to(102); await sleep(80); const snapped = look(); touch('pointerup');
    const home0 = look();
    await sleep(400);
    const home = look();
    await sleep(1500);
    const home2 = look();
    // and one notch off the house holds (once the release has landed, for the same reason)
    await waitFor(() => !(ctl.readout().spell || {}).root, 60000);
    // **and once the hand-over that landed it is over** (09-24): the readout
    // drops the spell at the swap and the face takes the arriving theme a
    // moment later, and a notch made in between was one in eight times read
    // by the theme that was leaving and never applied (the knob back at 100,
    // the address already on the next theme)
    await waitFor(() => !ctl.readout().mix.cutting, 30000);
    await sleep(300);
    touch('pointerdown'); to(105); await sleep(80); touch('pointerup'); await sleep(700);
    const five = look();
    ctl.stop();
    window.ring.release(null);
    return { atOpen, asked0, locked, step, during, lifted, after, snapped, home0, home, home2, five };
  `),
  judge: (r) => {
    const bad = [];
    if (!(r.locked.knob === '100' && r.locked.home)) bad.push(`at 102 the knob stood at ${r.locked.knob} and the bird ${r.locked.percent} %`);
    if (r.step.knob !== '105') bad.push(`at 104 the knob stood at ${r.step.knob}`);
    for (const [k, x] of [['a notch', r.step], ['the slide', r.during]]) {
      if (x.held || !x.pulling || x.url.includes('ro:') || x.asked !== r.asked0) bad.push(`${k} applied under the finger: held ${x.held}, ${x.url}, asked ${x.asked}`);
    }
    if (!(r.during.percent === 125 && r.during.reading.toUpperCase() === r.during.implied.toUpperCase() && r.during.line && r.during.line !== r.atOpen.line))
      bad.push(`under the finger the bird read ${r.during.percent} %, ${JSON.stringify(r.during.reading)} against ${JSON.stringify(r.during.implied)}, the line ${JSON.stringify(r.during.line)}`);
    if (!(r.lifted.held && r.lifted.url.includes('ro:') && r.lifted.percent === 125)) bad.push(`the lift did not apply at once: held ${r.lifted.held}, ${r.lifted.url}`);
    if (r.after.pending && !r.after.filled) bad.push('the wait after the lift drew no fill');
    if (!(r.snapped.knob === '100' && r.snapped.home && !r.home.held && !r.home.url.includes('ro:'))) bad.push(`let go at 102 the knob stood at ${r.snapped.knob}, Root held ${r.home.held} (${JSON.stringify([r.home0, r.home, r.home2].map((x) => [x.url, x.asked, x.held]))})`);
    if (!(r.five.held && r.five.percent === 105 && r.five.url.includes('ro:'))) bad.push(`a notch to 105 stood at ${r.five.percent} %, held ${r.five.held}`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: `with a finger on Root's slider, 102 held the knob at the house and 104 went to 105; notches to 115 and 125 with 450 ms pauses moved the bird to ${r.during.percent} %, `
        + `its label to ${JSON.stringify(r.during.reading)} and the line to ${JSON.stringify(r.during.line)} with the link and the music untouched; the lift wrote "${r.lifted.url}" at once`
        + `${r.after.pending ? ' and the fill started' : ''}; let go at 102 it went home and bared the link; a notch to 105 held at ${r.five.percent} %`,
    };
  },
});

SCENARIOS.push({
  name: 'the wait\'s fill reads on the black at the phone\'s size, and the resets\' sweeps are the same gold, a real line wide',
  area: 'ring',
  // Eugene, round K11: *"the radial spin indicator is hard to see … On a phone
  // in bright light that shade of grey is guaranteed to be unnoticeable. Do it
  // for the other radial progress too: next, prev and the dice roll."* On the
  // phone's frame, under reduced motion (the fill is then the whole wait, drawn
  // once): Tide dropped while the set plays, its node photographed and the
  // fill's own colour read off the pixels against the black; the die's and the
  // three actions' fills share its ink and strength; a still press on the die
  // and on held Tide draws a sweep at full strength and at least 2.5 px wide.
  deadline: 90000,
  query: 'v=2&seed=15576',
  drive: async (page) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    try {
      const where = await page.evaluate(body(K11 + `
        await started();
        await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
        window.ring.pull(6, 0.9);
        await waitFor(() => cells()[6].filled, 4000);
        await sleep(250);
        const r = document.querySelectorAll('#starCells g.cell')[6].firstChild.querySelector('circle').getBoundingClientRect();
        const f = document.querySelectorAll('#starCells g.cell')[6].querySelector('path.fill');
        return { x: r.x, y: r.y, w: r.width, h: r.height, filled: cells()[6].filled, pending: cells()[6].pending,
          opacity: +getComputedStyle(f).opacity, vw: innerWidth };
      `));
      const shot = await page.screenshot({ clip: { x: where.x, y: where.y, width: where.w, height: where.h } });
      const px = await page.evaluate(async (b64) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const cv = document.createElement('canvas');
        cv.width = img.width; cv.height = img.height;
        const g = cv.getContext('2d');
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, img.width, img.height).data;
        const count = new Map();
        const R = img.width / 2;
        for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
          if (Math.hypot(x - R, y - R) > R * 0.8) continue;
          const k = (y * img.width + x) * 4;
          const key = d[k] + ',' + d[k + 1] + ',' + d[k + 2];
          count.set(key, (count.get(key) || 0) + 1);
        }
        const [top, n] = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
        return { rgb: top.split(',').map(Number), share: n / [...count.values()].reduce((a, b) => a + b, 0), size: img.width };
      }, shot.toString('base64'));
      const sweeps = await page.evaluate(body(K11 + `
        const unit = el('tilt').offsetWidth / 1000;
        const read = (n) => n ? { w: +(+n.getAttribute('stroke-width') * unit).toFixed(2), op: +n.getAttribute('opacity'), ink: n.getAttribute('stroke') } : null;
        // the die: a still press, read half way, let go off the node so it is not a tap
        const dim = document.querySelector('circle[fill="#000"][cx="500.0"]');
        const db = dim.getBoundingClientRect();
        const die = { x: db.x + db.width / 2, y: db.y + db.height / 2 };
        mouse('pointermove', die, el('stage'));
        mouse('pointerdown', die, el('tilt'));
        await sleep(420);
        const ring = [...document.querySelectorAll('circle[transform^="rotate(-90"]')].find((n) => !n.closest('#starLive') && +n.getAttribute('opacity') > 0);
        const dieSweep = read(ring);
        mouse('pointerup', { x: die.x, y: die.y - 200 });
        await sleep(200);
        // held Tide: a still press, read half way, let go as a click
        const t = nodeAt(6);
        mouse('pointermove', t, el('stage'));
        mouse('pointerdown', t, el('tilt'));
        await sleep(450);
        const arc = [...document.querySelectorAll('#starLive circle[transform^="rotate(-90"]')].find((n) => +n.getAttribute('opacity') > 0);
        const birdSweep = read(arc);
        mouse('pointerup', t);
        await sleep(200);
        const f = document.querySelectorAll('#starCells g.cell')[6].querySelector('path.fill');
        const out = { dieSweep, birdSweep, birdFillInk: f.getAttribute('fill'), birdFillOp: +f.getAttribute('opacity') };
        // and the skip's own fill: asked, and read while the cut is in flight
        window.ring.skip();
        await waitFor(() => { const g = el('cutFill'); return g && g.getAttribute('opacity') === '1' && g.querySelector('.fill'); }, 4000);
        const cf = el('cutFill') && el('cutFill').querySelector('.fill');
        out.skipFill = cf ? { op: +cf.getAttribute('opacity'), ink: cf.getAttribute('fill') } : null;
        ctl.stop();
        window.ring.release(null);
        await sleep(200);
        return out;
      `));
      return { where, px, sweeps };
    } finally {
      await page.emulateMedia({ reducedMotion: null });
    }
  },
  judge: (r) => {
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const [R, G, B] = r.px.rgb;
    const ratio = (0.2126 * lin(R) + 0.7152 * lin(G) + 0.0722 * lin(B) + 0.05) / 0.05;
    const s = r.sweeps;
    const bad = [];
    if (!r.where.filled) bad.push('the dropped bird drew no fill');
    else if (!(ratio >= 3 && r.px.share > 0.4)) bad.push(`the fill reads ${r.px.rgb.join(',')} on ${Math.round(r.px.share * 100)} % of the node, ${ratio.toFixed(2)}:1 against the black`);
    for (const [k, x] of [['the die', s.dieSweep], ['Tide', s.birdSweep]]) if (!x || x.op !== 1 || x.w < 2.5) bad.push(`${k}'s sweep was ${JSON.stringify(x)}`);
    if (s.skipFill && s.skipFill.op !== s.birdFillOp) bad.push(`the skip fills at ${s.skipFill.op} and a bird at ${s.birdFillOp}`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: `on a ${r.where.vw} px phone frame Tide's wait filled its ${r.px.size} px node with ${r.px.rgb.join(',')} (${Math.round(r.px.share * 100)} % of it): ${ratio.toFixed(2)}:1 against the black, `
        + `over the 3:1 a graphic needs (the 0.18 it was measured 1.35:1); the sweeps round the die and round held Tide at full strength, ${s.dieSweep && s.dieSweep.w} and ${s.birdSweep && s.birdSweep.w} px wide; `
        + `${s.skipFill ? `the skip's fill at ${s.skipFill.op}, the bird's strength` : 'the skip landed before its fill was read'}`,
    };
  },
});

// **Round K11b: the whole ring reads the consequence of a hand**
// (`notes/rounds/ring-k.md`). One block, appended.
SCENARIOS.push({
  name: 'a dragged bird\'s consequences read on every bird it moves, live and through the wait, with only the dragged one lifted',
  area: 'words',
  // Eugene, round K11b: *"when I drag Ember the value of Zephyr changed too …
  // the big label while dragging should also extend to the other birds whose
  // values will update because of the dropped bird."* Ember dragged to the rim
  // while the set plays: every other cell whose reading of the theme the value
  // implies differs from that theme without the hand reads the implied one,
  // cross-fading; the rest read the set; none is lifted; nothing is asked of
  // the music; after the drop each holds through the wait, and at the seam
  // none reads a consequence any more.
  deadline: 120000,
  query: 'v=2&seed=15576',
  page: body(K11 + `
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
    const theme0 = ctl.readout().mix.themeNumber;
    const atRest = cells().map((c) => c.reading);
    const walk = [];
    for (let p = 104; p <= 130; p += 2) walk.push(p);
    let fades = 0;
    const drag = await walkBird(0, walk, () => {
      const cs = cells();
      if (cs.some((c, k) => k > 0 && c.fading)) fades += 1;
      return { all: cs.map((c) => ({ reading: c.reading, consequent: c.consequent, lift: c.lift })), url: location.search, theme: ctl.readout().mix.themeNumber };
    });
    const dropped = cells().map((c) => ({ reading: c.reading, consequent: c.consequent }));
    const wait = [];
    const until = performance.now() + 60000;
    while (performance.now() < until) {
      const cs = cells();
      wait.push({ pending: cs[0].pending, all: cs.map((c) => ({ reading: c.reading, consequent: c.consequent })) });
      if (!cs[0].pending) break;
      await sleep(250);
    }
    await sleep(600);
    const after = cells().map((c) => ({ reading: c.reading, consequent: c.consequent }));
    ctl.stop();
    window.ring.release(null);
    return { theme0, atRest, drag, dropped, wait, after, fades, names: cells().map((c) => c.name) };
  `),
  judge: (r) => {
    const s = r.drag.seen;
    const last = s[s.length - 1].all;
    const moved = last.map((c, k) => k > 0 && c.consequent).map((x, k) => (x ? k : -1)).filter((k) => k >= 0);
    const bad = [];
    if (!moved.length) bad.push('no other bird read a consequence of the drag');
    const sameTheme = s.every((x) => x.theme === r.theme0);
    if (sameTheme) for (const x of s) x.all.forEach((c, k) => { if (k > 0 && !c.consequent && c.reading !== r.atRest[k]) bad.push(`${r.names[k]} read ${c.reading} with no consequence, at rest ${r.atRest[k]}`); });
    if (!s.every((x) => x.all.every((c, k) => k === 0 || c.lift === 0))) bad.push('another bird was lifted');
    if (s.some((x) => x.url.includes('em:'))) bad.push('the drag asked the music for something');
    // At the drop each moved bird goes on reading a consequence. Since a bird
    // move keeps the place (09-24) the consequence is this theme's, whose
    // Zephyr turns on the drag's last notch here (saw lead at 128 %, karplus
    // at 130 %), and the last notch's plan is made in the next task (K12d): the
    // reading it settles on is the wait's, held from its second reading on.
    const waiting = r.wait.filter((w) => w.pending);
    const held = waiting[Math.min(1, waiting.length - 1)];
    if (moved.length && !moved.every((k) => r.dropped[k].consequent)) bad.push(`at the drop the consequences did not hold: ${JSON.stringify(moved.map((k) => [r.names[k], last[k].reading, r.dropped[k]]))}`);
    if (!held || !waiting.slice(1).every((w) => moved.every((k) => w.all[k].consequent && w.all[k].reading === held.all[k].reading))) bad.push('through the wait a consequence let go');
    if (r.after.some((c) => c.consequent)) bad.push(`after the seam ${r.after.filter((c) => c.consequent).length} birds still read a consequence`);
    if (moved.length && !r.fades) bad.push('no consequence cross-faded');
    return {
      ok: !bad.length,
      why: bad[0],
      note: `Ember dragged to the rim while the set played: ${moved.map((k) => `${r.names[k]} ${JSON.stringify(r.atRest[k])} → ${JSON.stringify(last[k].reading)}`).join(', ')} read the move's consequence, `
        + `cross-fading on ${r.fades} samples, the other ${7 - moved.length} read the set and none but Ember was lifted, with nothing asked of the music; `
        + `each held its reading over ${waiting.length} readings of the wait and none read a consequence after the seam`,
    };
  },
});

SCENARIOS.push({
  name: 'the phone\'s slider shows a bird\'s consequences on the other birds under the finger and through the wait',
  area: 'panel',
  // The same rule on the phone (round K11b): Ember's panel, a finger on the
  // slider taking it to 125 %, pauses longer than a commit; the other birds
  // read the consequence with nothing applied, and hold it from the lift.
  deadline: 120000,
  query: 'v=2&seed=15576',
  page: body(K11 + `
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
    const r0 = cells()[0].radius * 316;
    finger('pointerdown', spoke(0, r0), el('tilt'));
    await sleep(60);
    finger('pointerup', spoke(0, r0));
    await sleep(200);
    const sl = el('birdPanelSlider');
    const touch = (type) => sl.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 32, pointerType: 'touch', isPrimary: true }));
    const read = () => cells().map((c) => ({ reading: c.reading, consequent: c.consequent, lift: c.lift }));
    touch('pointerdown');
    sl.value = '125'; sl.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(450);
    const during = { all: read(), url: location.search };
    touch('pointerup');
    await sleep(300);
    const lifted = { all: read(), url: decodeURIComponent(location.search), pending: cells()[0].pending };
    ctl.stop();
    window.ring.release(null);
    return { during, lifted, names: cells().map((c) => c.name) };
  `),
  judge: (r) => {
    const moved = r.during.all.map((c, k) => (k > 0 && c.consequent ? k : -1)).filter((k) => k >= 0);
    const ok = moved.length > 0 && !r.during.url.includes('em:') && r.during.all.every((c, k) => k === 0 || c.lift === 0)
      && r.lifted.url.includes('em:') && (!r.lifted.pending || moved.every((k) => r.lifted.all[k].consequent && r.lifted.all[k].reading === r.during.all[k].reading));
    return {
      ok,
      why: !moved.length ? 'no other bird read a consequence under the finger' : `under the finger ${r.during.url}, at the lift ${JSON.stringify(r.lifted)}`,
      note: `with a finger holding Ember at 125 %, ${moved.map((k) => `${r.names[k]} read ${JSON.stringify(r.during.all[k].reading)}`).join(', ')} with nothing applied; `
        + `the lift wrote "${r.lifted.url}" and the consequences held${r.lifted.pending ? ' through the wait' : ''}`,
    };
  },
});

// **Round K12: the bird under the pointer, the bird in action and the birds it
// moves** (`notes/rounds/ring-k.md`). One block, appended.
const K12_PIXELS = `
  // the brightest pixel of an annulus round a screen point, off a picture of the page
  const brightest = async (b64, cx, cy, r0, r1) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const g = cv.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    let best = 0, rgb = null;
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      const q = Math.hypot(x - cx, y - cy);
      if (q < r0 || q > r1) continue;
      const k = (y * img.width + x) * 4;
      const L = 0.2126 * lin(d[k]) + 0.7152 * lin(d[k + 1]) + 0.0722 * lin(d[k + 2]);
      if (L > best) { best = L; rgb = [d[k], d[k + 1], d[k + 2]]; }
    }
    return { ratio: +((best + 0.05) / 0.05).toFixed(2), rgb };
  };
`;

// **Round K14: a page of the row's own, in a context the row asks for** — a
// device scale, a viewport, a touch screen — beside the runner's (390 × 844 at
// scale 1). Opened on the row's own link, closed by the row.
const ownPage = async (page, opts) => {
  const ctx = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, ...opts });
  const p2 = await ctx.newPage();
  await p2.goto(page.url(), { waitUntil: 'networkidle', timeout: 30000 });
  await p2.waitForFunction(() => window.ring && window.deepHouse, { timeout: 20000 });
  await p2.waitForTimeout(900);
  return { page: p2, close: () => ctx.close() };
};
// The brightest pixel of a small square of the page round (x, y), off a
// picture of it: its contrast on the black and its colour.
const pixelAt = async (page, x, y, half = 12) => {
  const shot = await page.screenshot({ clip: { x: Math.max(0, x - half), y: Math.max(0, y - half), width: 2 * half, height: 2 * half } });
  return page.evaluate(body(K12_PIXELS + `return await brightest(${JSON.stringify(shot.toString('base64'))}, 1e6, 1e6, 0, 1e9);`));
};
// Everything drawn out of the picture but `keep` (a selector), hidden branch by
// branch and never an ancestor of theirs: WebKit draws nothing under a hidden
// <svg>, whatever its children say.
const ISOLATE = `
  const isolate = (keep) => {
    const hideBut = (n) => { for (const ch of n.children) { if (keep.includes(ch)) continue; if (keep.some((k) => ch.contains(k))) hideBut(ch); else ch.style.visibility = 'hidden'; } };
    for (const sv of document.querySelectorAll('svg')) { if (keep.some((k) => sv.contains(k))) hideBut(sv); else sv.style.visibility = 'hidden'; }
    document.body.style.color = 'transparent';
  };
`;

SCENARIOS.push({
  name: 'a bird under the pointer carries a halo at least as strong as a transport circle\'s, and loses it when the pointer leaves',
  area: 'birds',
  // Eugene, round K12: *"the play circles have a nice halo highlight on
  // mouse-over, the bird circles do not — should be the same, and even more
  // pronounced."* A mouse over Tide on a desktop's square, then over the skip
  // node, then off both.
  query: 'v=2&seed=15576',
  page: body(K11 + `
    el('tilt').style.width = '940px'; el('tilt').style.height = '940px';
    await sleep(900);
    const t = nodeAt(6);
    mouse('pointermove', t, el('stage'));
    await sleep(500);
    const bird = cells()[6].marks;
    const others = cells().filter((c, k) => k !== 6).map((c) => c.marks.halo);
    const act = (w) => Math.max(0, ...[...document.querySelectorAll('circle[stroke-width="' + w + '"]')].map((n) => +n.getAttribute('opacity')));
    const sk = document.querySelectorAll('#starCells g.cell')[6];
    // the skip node, east of the centre on the core's stroke
    const tb = el('tilt').getBoundingClientRect();
    const dim = document.querySelector('circle[fill="#000"][cx="500.0"]').getBoundingClientRect();
    const core = (dim.y + dim.height / 2) - (tb.y + tb.height / 2);
    mouse('pointermove', { x: tb.x + tb.width / 2 + core, y: tb.y + tb.height / 2 }, el('stage'));
    await sleep(300);
    const transport = { crisp: act('1.3'), wide: act('6') };
    const birdAfter = cells()[6].marks.halo;
    mouse('pointermove', { x: tb.x + 5, y: tb.y + 5 }, el('stage'));
    await sleep(500);
    const gone = cells().map((c) => c.marks.halo);
    el('tilt').style.width = ''; el('tilt').style.height = '';
    return { bird, others, transport, birdAfter, gone };
  `),
  judge: (r) => {
    const strong = r.bird.crisp >= r.transport.crisp && r.bird.wide >= r.transport.wide && r.bird.crispW >= 1.3 && r.bird.wideW >= 6 && r.bird.orn === 0;
    const ok = r.transport.crisp > 0 && strong && r.others.every((x) => x === 0) && r.birdAfter < 0.2 && r.gone.every((x) => x < 0.02);
    return {
      ok,
      why: !(r.transport.crisp > 0) ? 'the skip node lit no halo' : !strong ? `the bird's halo ${JSON.stringify(r.bird)} against the transport's ${JSON.stringify(r.transport)}`
        : `the halo did not follow the pointer: others ${r.others}, after ${r.birdAfter}, off ${r.gone}`,
      note: `under the pointer Tide lit a halo of ${r.bird.crisp} over ${r.bird.crispW} units and ${r.bird.wide} over ${r.bird.wideW} (the skip node's: ${r.transport.crisp} and ${r.transport.wide} over 1.3 and 6), `
        + `no ornament and no other bird; it went when the pointer moved to the skip node and off the ring`,
    };
  },
});

SCENARIOS.push({
  name: 'the dragged bird and the birds its move changes carry the halo and the ornament through the drag and the wait, the lift the dragged one\'s alone, and none after the seam',
  area: 'birds',
  // Eugene, round K12: *"when the user starts dragging a bird … another visual
  // treatment that the bird is in action … and if other birds get involved in
  // the change, we draw the ornament and halo on those bird circles too
  // (without the extra size)."* Seed 15576: Ember dragged to the rim while the
  // set plays changes Zephyr's keys (round K11b).
  deadline: 120000,
  query: 'v=2&seed=15576',
  page: body(K11 + `
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
    const walk = [];
    for (let p = 104; p <= 130; p += 2) walk.push(p);
    const mark = () => cells().map((c) => ({ halo: c.marks.halo, orn: c.marks.orn, lift: c.lift, consequent: c.consequent }));
    const drag = await walkBird(0, walk, () => ({ all: mark() }));
    const wait = [];
    const until = performance.now() + 60000;
    while (performance.now() < until) {
      const pending = cells()[0].pending;
      wait.push({ pending, all: mark() });
      if (!pending) break;
      await sleep(250);
    }
    mouse('pointermove', { x: 2, y: 2 }, el('stage'));
    await sleep(800);
    const after = mark();
    ctl.stop();
    window.ring.release(null);
    return { drag, wait, after, names: cells().map((c) => c.name) };
  `),
  judge: (r) => {
    const bad = [];
    const end = r.drag.seen[r.drag.seen.length - 1].all;
    const moved = end.map((c, k) => (k > 0 && c.consequent ? k : -1)).filter((k) => k >= 0);
    if (!moved.length) bad.push('no other bird was changed by the drag');
    const lit = (c) => c.halo > 0.9 && c.orn > 0.9;
    if (!(lit(end[0]) && end[0].lift > 0.9)) bad.push(`the dragged Ember read ${JSON.stringify(end[0])}`);
    // A bird the move changes is read half a second into the wait: since a
    // bird move keeps the place (09-24) the consequence is this theme's, and
    // Zephyr's keys here turn only on the drag's last notch, so its ornament is
    // still easing in on the drag's last frame.
    const settled = (r.wait[2] || r.wait[r.wait.length - 1]).all;
    for (const k of moved) if (!(lit(settled[k]) && settled[k].lift === 0)) bad.push(`${r.names[k]}, changed by the move, read ${JSON.stringify(settled[k])}`);
    for (let k = 1; k < 8; k++) if (!moved.includes(k) && end[k].orn > 0) bad.push(`${r.names[k]}, untouched by the move, carried the ornament`);
    const waiting = r.wait.filter((w) => w.pending);
    if (!waiting.length || !waiting.every((w, i) => lit(w.all[0]) && moved.every((k) => (i < 2 ? w.all[k].halo > 0.9 : lit(w.all[k])) && w.all[k].lift === 0))) bad.push('the marks let go during the wait');
    if (!r.after.every((c) => c.orn < 0.05 && c.halo < 0.05)) bad.push(`after the seam: ${JSON.stringify(r.after.map((c) => [c.halo, c.orn]))}`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: `Ember dragged to the rim carried the halo and the ornament and the lift; ${moved.map((k) => r.names[k]).join(', ')}, whose reading the move changes, carried the halo and the ornament unlifted, `
        + `and the other ${7 - moved.length} nothing; both held over ${waiting.length} readings of the wait and were gone after the seam`,
    };
  },
});

SCENARIOS.push({
  name: 'on the phone the ring\'s own bird follows the slider and the steps, and the selected bird and the birds it changes carry the halo and the ornament',
  area: 'panel',
  // Eugene, round K12: *"on mobile it seems we also need to update the bird's
  // % and label values in the ring while the user drags the cursor in the
  // bottom panel — it's important to see up front which bird is updated."* The
  // words read here are the ring's own, on the star, not the panel's.
  deadline: 120000,
  query: 'v=2&seed=15576',
  page: body(K11 + `
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
    const ringWords = (k) => [...document.querySelectorAll('#starWords > g')[k].querySelectorAll('text')].map((t) => t.textContent).filter(Boolean).join(' ');
    const r0 = cells()[0].radius * 316;
    const atRest = { ember: ringWords(0), zephyr: ringWords(2) };
    finger('pointerdown', spoke(0, r0), el('tilt'));
    await sleep(60);
    finger('pointerup', spoke(0, r0));
    // the marks ease in over MARK_EASE on the frame clock: read them once they
    // have stopped moving (six frames without a change, four seconds at most),
    // since a frame's timing is the engine's and not the ring's (K15c)
    const settled = async (read) => {
      let prev = JSON.stringify(read()), same = 0;
      const t0 = performance.now();
      while (same < 6 && performance.now() - t0 < 4000) { await frame(); const now = JSON.stringify(read()); same = now === prev ? same + 1 : 0; prev = now; }
    };
    await sleep(100);
    await settled(() => cells().map((c) => c.marks));
    const selected = { ...cells()[0].marks, others: cells().filter((c, k) => k > 0).map((c) => c.marks.orn) };
    const sl = el('birdPanelSlider');
    const touch = (type) => sl.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 33, pointerType: 'touch', isPrimary: true }));
    touch('pointerdown');
    const steps = [];
    for (const v of [110, 120, 130]) {
      sl.value = String(v); sl.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(350);
      if (v === 130) await settled(() => [cells()[0].marks, cells()[2].marks, ringWords(2)]);
      steps.push({ v, ember: ringWords(0), zephyr: ringWords(2), zMarks: cells()[2].marks, eMarks: cells()[0].marks, zLift: cells()[2].lift, url: location.search });
    }
    touch('pointerup');
    await sleep(300);
    // and Less, a press at a time
    el('birdPanelLess').click();
    await sleep(80);
    const less = { ember: ringWords(0), percent: cells()[0].percent };
    ctl.stop();
    window.ring.release(null);
    return { atRest, selected, steps, less };
  `),
  judge: (r) => {
    const bad = [];
    if (!(r.selected.halo > 0.9 && r.selected.orn > 0.9 && r.selected.others.every((x) => x === 0))) bad.push(`the selected Ember read ${JSON.stringify(r.selected)}`);
    for (const s of r.steps) {
      if (!s.ember.includes(`${s.v}%`)) bad.push(`at ${s.v} % the ring's Ember read "${s.ember}"`);
      if (s.url.includes('em:')) bad.push(`at ${s.v} % the finger applied the value`);
    }
    const last = r.steps[r.steps.length - 1];
    if (last.ember === r.atRest.ember) bad.push('the ring\'s Ember never changed');
    if (last.zephyr === r.atRest.zephyr) bad.push(`the ring's Zephyr stayed "${last.zephyr}"`);
    else if (!(last.zMarks.halo > 0.9 && last.zMarks.orn > 0.9 && last.zLift === 0)) bad.push(`Zephyr, changed, read ${JSON.stringify(last.zMarks)}`);
    if (!r.less.ember.includes(`${r.less.percent}%`) || r.less.percent !== 125) bad.push(`a press of Less left the ring's Ember "${r.less.ember}" at ${r.less.percent} %`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: `a finger on Ember lit its halo and ornament; the slider at ${r.steps.map((s) => s.v).join(', ')} % turned the ring's own Ember into ${r.steps.map((s) => JSON.stringify(s.ember)).join(', ')} with nothing applied, `
        + `and Zephyr into ${JSON.stringify(last.zephyr)} with the halo and the ornament, unlifted; a press of Less read "${r.less.ember}" on the ring at once`,
    };
  },
});

SCENARIOS.push({
  name: 'the ornament and the halo read on the black at the phone\'s size, inside the words\' gap and clear of the track',
  area: 'ring',
  // Round K12's measure: on the phone's frame, the ornament round a bird the
  // move changes against the black (at least 3:1), and every bird held at the
  // rim with its ornament up keeps it inside the 8-unit gap its words stand
  // at and clear of the lane band (352) — read off the geometry the ornament
  // is drawn at, whether or not a bird's own wait has already landed.
  deadline: 90000,
  query: 'v=2&seed=15576',
  drive: async (page) => {
    const where = await page.evaluate(body(K11 + `
      await started();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
      window.ring.pull(0, 1);
      await waitFor(() => cells()[2].marks.orn > 0.99, 4000);
      await sleep(300);
      const z = document.querySelectorAll('#starCells g.cell')[2].firstChild.querySelector('circle').getBoundingClientRect();
      const unit = el('tilt').offsetWidth / 1000;
      return { x: z.x + z.width / 2, y: z.y + z.height / 2, rPx: z.width / 2, unit, m: cells()[2].marks, size: cells()[2].size, birdR: cells()[2].birdR };
    `));
    const pad = 30;
    const clip = { x: where.x - where.rPx - pad, y: where.y - where.rPx - pad, width: 2 * (where.rPx + pad), height: 2 * (where.rPx + pad) };
    const shot = await page.screenshot({ clip });
    const u = where.unit * where.size;
    const inner = (where.m.ornR - where.m.ornPx / where.unit / 2) * u;
    const outer = (where.m.ornR + where.m.ornPx / where.unit / 2) * u;
    const px = await page.evaluate(body(K12_PIXELS + `return await brightest(${JSON.stringify(shot.toString('base64'))}, ${clip.width / 2}, ${clip.height / 2}, ${inner - 0.5}, ${outer + 0.5});`));
    const rim = await page.evaluate(body(K11 + `
      for (let k = 0; k < 8; k++) window.ring.pull(k, 1);
      await sleep(900);
      const out = cells().map((c) => {
        const w = c.marks.ornPx / (el('tilt').offsetWidth / 1000);
        return { name: c.name, orn: c.marks.orn, edge: +((c.marks.ornR + w / 2 - c.birdR) * c.size).toFixed(2), reach: +(c.radius * 316 + (c.marks.ornR + w / 2) * c.size).toFixed(2) };
      });
      ctl.stop();
      window.ring.release(null);
      return out;
    `));
    return { where, px, rim };
  },
  judge: (r) => {
    const bad = [];
    if (!(r.px.ratio >= 3)) bad.push(`the ornament's brightest pixel ${r.px.rgb} is ${r.px.ratio}:1 against the black`);
    for (const b of r.rim) {
      if (b.edge >= 8) bad.push(`${b.name}'s ornament reaches ${b.edge} units off its edge, into its words' gap`);
      if (b.reach > 352) bad.push(`${b.name}'s ornament reaches ${b.reach}, over the lane band`);
    }
    return {
      ok: !bad.length,
      why: bad[0],
      note: `on a phone frame the ornament round Zephyr reads ${r.px.rgb.join(',')} at its brightest, ${r.px.ratio}:1 on the black, ${r.where.m.ornPx} px wide; `
        + `with every bird held at the rim the ornament stands at most ${Math.max(...r.rim.map((b) => b.edge))} units off a bird's edge (the words stand at 8) and reaches ${Math.max(...r.rim.map((b) => b.reach))} (the band begins at 352)`,
    };
  },
});

// **Round K12b: one halo, and a grab that does not dip it** (`notes/rounds/ring-k.md`).
SCENARIOS.push({
  name: 'a press on a hovered bird hands the halo over to the drag with no dip, every frame, and the ornament only rises',
  area: 'birds',
  // Eugene, round K12b: *"when the hover highlight shows up and I click to
  // drag, it fades out and in again."* A mouse rests on Tide, presses, crosses
  // the slop and drags a little; the crisp halo is read every frame from the
  // press to the drop, and the ornament beside it.
  query: 'v=2&seed=15576',
  page: body(K11 + `
    // from a clean ring, whatever the row before left (round K12c): no bird
    // held, no pointer resting anywhere, the square the size this row wants
    window.ring.release(null);
    mouse('pointermove', { x: 2, y: 2 }, el('stage'));
    mouse('pointerup', { x: 2, y: 2 });
    el('tilt').style.width = '940px'; el('tilt').style.height = '940px';
    await sleep(900);
    await waitFor(() => cells().every((c) => !c.held && !c.pulling && c.marks.orn < 0.01 && c.marks.halo < 0.01), 3000);
    const i = 6;
    const t = nodeAt(i);
    mouse('pointermove', t, el('stage'));
    await sleep(400);
    const hover = cells()[i].marks.crisp;
    const seen = [];
    let on = true;
    const tick = () => { if (!on) return; const m = cells()[i].marks; seen.push({ crisp: m.crisp, wide: m.wide, orn: m.orn }); if (on) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    mouse('pointerdown', t, el('tilt'));
    for (let k = 0; k < 6; k++) await frame();
    const a = (i / 8) * Math.PI * 2;
    let p = { ...t };
    for (let k = 1; k <= 20; k++) { p = { x: t.x - Math.sin(a) * 2 * k, y: t.y + Math.cos(a) * 2 * k }; mouse('pointermove', p); await frame(); }
    // **Held for half a second, not for ten frames** (09-24). The ornament
    // eases on the clock (MARK_EASE, 140 ms in ring.ts), so ten frames were
    // enough on a busy page, whose frames are long, and not on a quiet one:
    // alone in a page of its own it stood at 0.86-0.90 eight times of eight.
    // Half a second is three and a half of its time constants.
    const heldFrom = performance.now();
    while (performance.now() - heldFrom < 500) await frame();
    on = false;
    mouse('pointerup', p);
    await sleep(300);
    window.ring.release(null);
    el('tilt').style.width = ''; el('tilt').style.height = '';
    return { hover, frames: seen };
  `),
  judge: (r) => {
    const low = Math.min(...r.frames.map((f) => f.crisp));
    const rose = r.frames.every((f, k) => k === 0 || f.orn >= r.frames[k - 1].orn - 1e-3);
    // (the ornament eases in over 140 ms; a loaded page draws fewer frames, so
    // it is asked to have risen well past half, not to have arrived)
    const ok = r.hover > 0 && r.frames.length > 30 && low >= r.hover && rose && r.frames[r.frames.length - 1].orn > 0.6;
    return {
      ok,
      why: !(r.hover > 0) ? 'no hover halo to hand over' : low < r.hover ? `the halo dipped to ${low} from ${r.hover}`
        : !rose ? `the ornament fell and rose again: ${r.frames.map((f) => f.orn).join(',')}` : `the ornament stood at ${r.frames[r.frames.length - 1].orn} after the drag`,
      note: `hovered, Tide's halo stood at ${r.hover}; over ${r.frames.length} frames from the press through the slop and the drag it never fell under it (lowest ${low}), `
        + `and the ornament only rose, to ${r.frames[r.frames.length - 1].orn}`,
    };
  },
});

// **Round K12c: the wait is the time until the value is heard, on every bird
// that is changing, in the ring's own colour** (`notes/rounds/ring-k.md`).
SCENARIOS.push({
  name: 'a tempo pulled up and back fills Ember over the seam and the glide as one sector, ending when the tempo read is the target',
  area: 'birds',
  // Eugene, round K12c: *"when I move Ember to 160 BPM and play, then move back
  // to 104, the in-bird radial progress finishes quickly, but the BPM … takes
  // 20–30 s until it rolls into the new target."* Seed 15576 at 105 BPM: Ember
  // to the rim (170 BPM) and home again, the fill and the tempo read every
  // tenth of a second.
  deadline: 300000,
  query: 'v=2&seed=15576',
  page: body(K11 + `
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
    const leg = async (go) => {
      go();
      const seen = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 120000) {
        await sleep(100);
        const r = ctl.readout();
        const f = cells()[0].fill;
        seen.push({ t: +((performance.now() - t0) / 1000).toFixed(2), on: f.on, p: f.p, grid: r.gridBpm, bpm: r.bpm, bar: r.barSeconds });
        if (!f.on && seen.length > 10) break;
      }
      return seen;
    };
    const up = await leg(() => window.ring.pull(0, 1));
    const down = await leg(() => window.ring.release(0));
    ctl.stop();
    return { up, down };
  `),
  judge: (r) => {
    const bad = [];
    const notes = [];
    for (const [name, s] of [['up', r.up], ['down', r.down]]) {
      const on = s.filter((x) => x.on);
      const off = s.find((x, k) => k > 0 && !x.on && s[k - 1].on);
      if (!on.length || !off) { bad.push(`${name}: the fill ran ${on.length} samples and never ended`); continue; }
      if (!on.every((x, k) => k === 0 || x.p >= on[k - 1].p - 1e-4)) bad.push(`${name}: the fill ran backwards or restarted`);
      const reach = s.find((x) => Math.abs(x.grid - x.bpm) < 0.1 && x.t > on[0].t && s.some((y) => y.t < x.t && Math.abs(y.grid - y.bpm) >= 0.1));
      if (!reach) { bad.push(`${name}: the tempo never reached its target`); continue; }
      if (Math.abs(off.t - reach.t) > reach.bar + 0.2) bad.push(`${name}: the fill ended at ${off.t} s and the tempo read its target at ${reach.t} s`);
      const last = on[on.length - 1];
      if (last.p < 0.95) bad.push(`${name}: the fill stood at ${last.p} when it ended`);
      const seam = s.find((x, k) => k > 0 && x.bpm !== s[k - 1].bpm);
      // **Where the tempo is heard depends on the seam's tempo rule** (the fault
      // pass of 09-24, `seamTempo`): a near move glides after the seam, so a
      // fill that stood near full at the seam was drawn to the seam and not to
      // the tempo; a far one — 105 → 170 and back is one — rides the record to
      // the new tempo before the blend, so the tempo is the target at the swap
      // and the fill ends there, with the grid seen moving before it.
      if (seam && reach.t > seam.t + reach.bar) {
        const at = on.find((x) => x.t >= seam.t);
        if (!at || at.p > 0.8) bad.push(`${name}: at the seam the fill already stood at ${at && at.p}, so it was drawn to the seam and not to the tempo`);
        notes.push(`${name}: ${s[0].grid} → ${s[s.length - 1].bpm} BPM, the seam at ${seam.t} s with the fill at ${at && at.p}, the tempo on target at ${reach.t} s and the fill ended at ${off.t} s`);
      } else if (seam) {
        const rode = s.some((x) => x.t < seam.t && Math.abs(x.grid - s[0].grid) >= 1);
        if (!rode) bad.push(`${name}: the tempo was the target at the seam, ${seam.t} s, with no ride seen before it`);
        notes.push(`${name}: ${s[0].grid} → ${s[s.length - 1].bpm} BPM ridden before the seam, the tempo on target at the swap ${reach.t} s and the fill ended at ${off.t} s`);
      }
    }
    return { ok: !bad.length, why: bad[0], note: notes.join('; ') + ' — one sector each, never backwards' };
  },
});

SCENARIOS.push({
  name: 'a drop fills every bird its move changes, each until its own reading is what plays: Zephyr at the seam, Ember through the glide',
  area: 'birds',
  // Eugene, round K12c: *"since all connected birds change in some cases, we
  // need to show, appropriate to each bird's change speed, a radial progress in
  // each bird circle that is transitioning now."* Seed 15576: Ember to the rim
  // changes Zephyr's keys (round K11b).
  deadline: 200000,
  query: 'v=2&seed=15576',
  page: body(K11 + `
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
    const walk = [];
    for (let p = 104; p <= 130; p += 2) walk.push(p);
    await walkBird(0, walk);
    const seen = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 120000) {
      await sleep(100);
      const cs = cells();
      const r = ctl.readout();
      seen.push({ t: +((performance.now() - t0) / 1000).toFixed(2), bpm: r.bpm, grid: r.gridBpm, fills: cs.map((c) => (c.fill.on ? c.fill.p : -1)), zRead: cs[2].reading });
      if (cs.every((c) => !c.fill.on) && seen.length > 10) break;
    }
    ctl.stop();
    window.ring.release(null);
    return { seen, names: cells().map((c) => c.name) };
  `),
  judge: (r) => {
    const s = r.seen;
    const seam = s.find((x, k) => k > 0 && x.bpm !== s[k - 1].bpm);
    const bad = [];
    if (!seam) return { ok: false, why: 'no seam was seen' };
    const zOn = s.filter((x) => x.fills[2] >= 0);
    const zOff = s.find((x, k) => k > 0 && x.fills[2] < 0 && s[k - 1].fills[2] >= 0);
    if (!zOn.length || !zOff) bad.push('Zephyr, whose keys the move changes, drew no fill');
    else if (Math.abs(zOff.t - seam.t) > 0.35) bad.push(`Zephyr's fill ended at ${zOff.t} s and the seam came at ${seam.t} s`);
    const eOff = s.find((x, k) => k > 0 && x.fills[0] < 0 && s[k - 1].fills[0] >= 0);
    // Ember's fill ends when its tempo is heard: after the glide for a near
    // move, at the swap for a far one, which is ridden before the blend (the
    // fault pass of 09-24, `seamTempo`) — 104 → 130 here is far.
    const eReach = s.find((x) => x.t >= seam.t && Math.abs(x.grid - x.bpm) < 0.1);
    const bar = 240 / s[s.length - 1].bpm;
    if (!eOff || !eReach || Math.abs(eOff.t - eReach.t) > bar + 0.2) bad.push(`Ember's fill ended at ${eOff && eOff.t} s and its tempo was heard at ${eReach && eReach.t} s (the seam at ${seam.t} s)`);
    const others = [1, 3, 4, 5, 6, 7].filter((k) => s.some((x) => x.fills[k] >= 0));
    if (others.length) bad.push(`${others.map((k) => r.names[k]).join(', ')}, which the move does not change, filled`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: `Ember dropped at the rim: Zephyr filled to ${zOn.length ? zOn[zOn.length - 1].fills[2] : '-'} and let go at ${zOff && zOff.t} s with the seam at ${seam.t} s; `
        + `Ember filled until its tempo was heard and let go at ${eOff && eOff.t} s; no other bird filled`,
    };
  },
});

SCENARIOS.push({
  name: 'every bird taken from the house to the rim fills for as long as its value takes to be heard, within a bar, or draws nothing when nothing waits',
  area: 'birds',
  // Eugene, round K12c: *"just changed Loom from 100 % to 130 % and there was
  // no radial indicator at all"* — Loom at the rim changes the composition,
  // the texture and the timbres and not its own density word, and the fill
  // was drawn only when a bird's own word changed. Each bird in turn is taken
  // to the rim while the set plays, after the one before has been heard; its
  // fill's end is read against the moment its value is heard (the swap, and
  // for the tempo the grid on its target). A bird whose move changes nothing
  // the plan carries is heard on the next note and must draw nothing.
  deadline: 600000,
  query: 'v=2&seed=15576',
  page: body(K11 + `
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
    const sig = (t) => JSON.stringify([t.bpm, t.key && t.key.name, t.bars, t.presetLabel, t.dice]);
    const out = [];
    for (const i of [5, 0, 1, 2, 3, 4, 6, 7]) {
      const r0 = ctl.readout();
      // the theme playing (one-based on the readout): a bird move keeps the place (09-24)
      const about = r0.mix.themeNumber - 1;
      const strat = ctl.state.strategyTo ?? r0.strategy;
      const before = sig(ctl.planned(about, r0.seed, strat, r0.spell || null));
      const ask = { ...(r0.spell || {}), [cells()[i].bird]: 1 };
      const after = sig(ctl.planned(about, r0.seed, strat, ask));
      window.ring.pull(i, 1);
      const t0 = performance.now();
      let fillEnd = null, heard = null, seen = false, bar = r0.barSeconds;
      while (performance.now() - t0 < 110000) {
        await sleep(100);
        const r = ctl.readout();
        const c = cells()[i];
        const t = (performance.now() - t0) / 1000;
        if (c.fill.on) seen = true;
        if (seen && !c.fill.on && fillEnd == null) fillEnd = t;
        const landed = !c.pending;
        if (heard == null && landed && (i !== 0 || Math.abs(r.gridBpm - r.bpm) < 0.1)) heard = t;
        if (heard != null && (fillEnd != null || (!seen && t > heard + 1))) break;
      }
      await sleep(400);
      out.push({ name: cells()[i].name, changes: before !== after, seen, fillEnd, heard, bar });
    }
    ctl.stop();
    window.ring.release(null);
    return out;
  `),
  judge: (r) => {
    const bad = [];
    for (const b of r) {
      if (b.changes && !b.seen) bad.push(`${b.name} changes the plan and drew no fill`);
      else if (!b.changes && b.seen) bad.push(`${b.name} changes nothing the plan carries and drew a fill`);
      else if (b.seen && (b.fillEnd == null || b.heard == null || Math.abs(b.fillEnd - b.heard) > b.bar + 0.2)) bad.push(`${b.name}'s fill ended at ${b.fillEnd} s and it was heard at ${b.heard} s`);
    }
    return {
      ok: !bad.length,
      why: bad[0],
      note: r.map((b) => (b.seen ? `${b.name} filled ${b.fillEnd && b.fillEnd.toFixed(1)} s, heard at ${b.heard && b.heard.toFixed(1)} s` : `${b.name} no fill (${b.changes ? 'changes the plan!' : 'seasoning only, heard at once'})`)).join('; '),
    };
  },
});

SCENARIOS.push({
  name: 'Loom slid to the rim on the phone fills from the lift',
  area: 'panel',
  // The phone's half of *"Loom from 100 % to 130 % and there was no radial
  // indicator"*: a finger opens Loom's panel while the set plays, slides it to
  // 130 % and lifts; Loom's fill runs from the lift.
  deadline: 90000,
  query: 'v=2&seed=15576',
  page: body(K11 + `
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
    const r0 = cells()[5].radius * 316;
    finger('pointerdown', spoke(5, r0), el('tilt'));
    await sleep(60);
    finger('pointerup', spoke(5, r0));
    await sleep(200);
    const sl = el('birdPanelSlider');
    const touch = (type) => sl.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 34, pointerType: 'touch', isPrimary: true }));
    touch('pointerdown');
    sl.value = '130'; sl.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(300);
    const during = cells()[5].fill;
    touch('pointerup');
    await sleep(1200);
    const after = cells()[5].fill;
    const pending = cells()[5].pending;
    ctl.stop();
    window.ring.release(null);
    return { during, after, pending };
  `),
  judge: (r) => ({
    ok: !r.during.on && r.pending && r.after.on && r.after.p > 0,
    why: `under the finger ${JSON.stringify(r.during)}, a second after the lift ${JSON.stringify(r.after)} (pending ${r.pending})`,
    note: `no fill under the finger, and a second after the lift Loom's fill stood at ${r.after.p} of its wait`,
  }),
});

SCENARIOS.push({
  name: 'the wait\'s fill, the sweeps, the halo and the ornament wear the ring\'s colour when its hue has moved',
  area: 'ring',
  // Eugene, round K12c: *"the in-bird radial indicator colour doesn't match the
  // current ring colour — it seems a permanent gold-ish colour now."* A link
  // whose spell takes the ring to lilac: the fill in a dropped bird, the halo
  // and the ornament, and an untouched bird's own line of the same gold, all
  // one colour, and not the gold.
  deadline: 90000,
  query: 'v=2&seed=15576&spell=gleam:1.00,root:0.00,tide:1.00,ember:0.00,veil:1.00',
  page: body(K11 + `
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
    window.ring.pull(5, 1);
    await waitFor(() => cells()[5].fill.on, 4000);
    await sleep(300);
    const g = (k) => document.querySelectorAll('#starLive > g')[k];
    const fill = document.querySelectorAll('#starCells g.cell')[5].querySelector('path.fill').getAttribute('fill');
    const orn = g(5).querySelector('circle.orn').getAttribute('stroke');
    // an untouched bird's own playing light, cut in the same gold (#f2c14e)
    const line = g(1).querySelector('circle').getAttribute('stroke');
    const stops = [...document.querySelectorAll('#gold stop')].map((s) => s.getAttribute('stop-color'));
    ctl.stop();
    window.ring.release(null);
    return { fill, orn, line, stops };
  `),
  judge: (r) => ({
    ok: r.fill === r.line && r.orn === r.line && r.fill.toLowerCase() !== '#f2c14e' && r.stops[2].toLowerCase() !== '#f3c22c',
    why: `the fill ${r.fill}, the ornament ${r.orn}, an untouched line ${r.line}, the gradient ${r.stops.join(' ')}`,
    note: `with the ring at ${r.stops[2]}, the fill, the ornament and an untouched bird's line all read ${r.fill}, and none the gold`,
  }),
});

// **Round K13: every big label answers its own bird, and the lines tell the
// truth.** Eugene, 2026-09-24: *"it's a dead UX that we bold a value on a bird
// that doesn't change on movement"* and *"we do need lines to all birds
// connected by function — but a dotted line … if there is a strong line
// already we don't downgrade it"*. Seed 15576, stopped, so the promise is about
// the theme the cursor is on: Veil pulled in changes Zephyr's keys, Gleam's
// voicing and Root's room there, the three through dotted lines.
const K13_ROLE = { ember: /^BPM$/, spark: / · \d+ HITS?$/, zephyr: /^KEYS$/, gleam: / · /, root: / · ROOM$/, loom: / · DENSITY$/, tide: / SECTIONS$/, veil: / · FX$/ };

SCENARIOS.push({
  name: 'every bird\'s big word changes when its own bird is dragged to either wall, and the subtitle carries the locked reading and its role',
  area: 'words',
  deadline: 240000,
  query: 'v=2&seed=15576',
  page: body(K11 + `
    await sleep(600);
    const out = [];
    const rest = cells().map((c) => ({ word: c.word, sub: c.sub, bird: c.bird, name: c.name }));
    const settle = (p) => Array.from({ length: 10 }, () => p);
    for (let i = 0; i < 8; i++) {
      const watch = () => ({ word: cells()[i].word, sub: cells()[i].sub });
      const up = await walkBird(i, [104, 110, 116, 122, 128, ...settle(130)], watch);
      window.ring.release(null);
      await sleep(500);
      const down = await walkBird(i, [96, 80, 60, 40, 20, 5, ...settle(0)], watch);
      window.ring.release(null);
      await sleep(500);
      const s = up.seen, d = down.seen;
      out.push({ ...rest[i], rim: s[s.length - 1], zero: d[d.length - 1], back: { word: cells()[i].word, sub: cells()[i].sub } });
    }
    return out;
  `),
  judge: (r) => {
    const bad = [];
    for (const b of r) {
      if (b.rim.word === b.word) bad.push(`${b.name} at the rim still reads ${b.word}`);
      if (b.zero.word === b.word) bad.push(`${b.name} at 0 % still reads ${b.word}`);
      if (b.back.word !== b.word) bad.push(`${b.name} let go reads ${b.back.word}, not ${b.word}`);
      if (!K13_ROLE[b.bird].test(b.sub)) bad.push(`${b.name}'s subtitle "${b.sub}" does not say its role`);
      // the locked readings no bird of their own moves stay put under their own bird
      if (['loom', 'tide', 'veil'].includes(b.bird) && (b.rim.sub !== b.sub || b.zero.sub !== b.sub)) bad.push(`${b.name}'s locked subtitle moved: ${b.sub} → ${b.zero.sub} / ${b.rim.sub}`);
    }
    return {
      ok: !bad.length,
      why: bad[0],
      note: r.map((b) => `${b.name} ${b.zero.word} ‹ ${b.word} › ${b.rim.word} (${b.sub})`).join('; '),
    };
  },
});

// K37: why the phone picture's scale is not measured in Firefox, in the rows' own words
const FIREFOX_SCALE = "headless Firefox draws a device-scale-2 page at scale 1 and enlarges the picture (measured, K37: its scale-2 shot is its scale-1 shot enlarged, within 3.3 of 255 on average, where Chromium's differs by 11.8), so the phone picture's scale is not one Firefox can give here";

SCENARIOS.push({
  name: 'the ring draws a dotted line for exactly the declared pairs the frame does not join, never downgrades a strong one, and every dash shows on the black at the phone\'s size beside the octagon\'s line',
  area: 'ring',
  deadline: 90000,
  query: 'v=2&seed=15576',
  drive: async (page) => {
    const got = await page.evaluate(body(K11 + ISOLATE + `
      await sleep(900);
      const links = window.ring.links();
      const dots = [...document.querySelectorAll('#starLines path.dot')];
      const dom = dots.map((p) => p.getAttribute('data-link')).sort();
      // a point an eighth of the way along each dot's line, on the screen, off every bird
      const pts = dots.map((p) => {
        const len = p.getTotalLength();
        const q = p.getPointAtLength(len * 0.12);
        const s = new DOMPoint(q.x, q.y).matrixTransform(p.getScreenCTM());
        return { link: p.getAttribute('data-link'), x: s.x, y: s.y };
      });
      // round K13b: the dashes wear the octagon's weight, so the octagon's own
      // crisp line is measured beside them, a point along its first edge
      const oct = [...document.querySelectorAll('#starLines path.ln')][2];
      const ol = oct.getTotalLength();
      // (the gold runs light to dark across the ring, so all eight edges are sampled)
      const octPts = Array.from({ length: 8 }, (_, k) => {
        const oq = oct.getPointAtLength(ol / 8 * (k + 0.5));
        const os = new DOMPoint(oq.x, oq.y).matrixTransform(oct.getScreenCTM());
        return { x: os.x, y: os.y };
      });
      // everything but the dashes and that line out of the picture, so a pixel
      // is theirs — hidden branch by branch, never an ancestor of theirs (K14:
      // WebKit draws nothing under a hidden <svg>, whatever its children say,
      // so the whole row read 1:1 there since K13b)
      isolate([...dots, oct]);
      return { links, dom, pts, octPts, square: el('tilt').offsetWidth };
    `));
    await page.waitForTimeout(200);
    const px = [];
    for (const p of got.pts) {
      const clip = { x: Math.max(0, p.x - 12), y: Math.max(0, p.y - 12), width: 24, height: 24 };
      const shot = await page.screenshot({ clip });
      px.push({ link: p.link, ...(await page.evaluate(body(K12_PIXELS + `return await brightest(${JSON.stringify(shot.toString('base64'))}, 12, 12, 0, 20);`))) });
    }
    const octagon = [];
    for (const o of got.octPts) {
      const oshot = await page.screenshot({ clip: { x: Math.max(0, o.x - 12), y: Math.max(0, o.y - 12), width: 24, height: 24 } });
      octagon.push((await page.evaluate(body(K12_PIXELS + `return await brightest(${JSON.stringify(oshot.toString('base64'))}, 12, 12, 0, 20);`))).ratio);
    }
    // K14: the phone picture's own scale (K11 measured its fills there), where
    // the dash is a pixel wide and its opacity is what it reads at
    const two = await ownPage(page, { deviceScaleFactor: 2 });
    const pts2 = await two.page.evaluate(body(ISOLATE + `
      const dots = [...document.querySelectorAll('#starLines path.dot')];
      isolate(dots);
      return dots.map((p) => { const q = p.getPointAtLength(p.getTotalLength() * 0.12); const s = new DOMPoint(q.x, q.y).matrixTransform(p.getScreenCTM()); return { link: p.getAttribute('data-link'), x: s.x, y: s.y }; });
    `));
    await two.page.waitForTimeout(200);
    const px2 = [];
    for (const p of pts2) px2.push({ link: p.link, ...(await pixelAt(two.page, p.x, p.y)) });
    await two.close();
    return { ...got, px, octagon, px2, engine: page.context().browser().browserType().name() };
  },
  judge: (r) => {
    const bad = [];
    const dist = (l) => Math.min((l.a - l.b + 8) % 8, (l.b - l.a + 8) % 8);
    const dotted = r.links.filter((l) => l.dotted).map((l) => `${l.a}-${l.b}`).sort();
    const want = r.links.filter((l) => l.declared && dist(l) > 2).map((l) => `${l.a}-${l.b}`).sort();
    if (JSON.stringify(dotted) !== JSON.stringify(want)) bad.push(`dotted ${dotted} against the declared pairs off the frame ${want}`);
    if (JSON.stringify(r.dom) !== JSON.stringify(want)) bad.push(`the page draws ${r.dom.length} dots (${r.dom}) for ${want.length} declared pairs`);
    const strong = r.links.filter((l) => l.declared && dist(l) <= 2);
    if (strong.some((l) => l.dotted || l.kind === 'dotted')) bad.push('a declared pair on the frame was drawn dotted');
    if (!want.length) bad.push('no dotted line at all');
    const worst = Math.min(...r.px.map((p) => p.ratio));
    // Round K13b gives the dashes the octagon's own weight (Eugene: *"the same
    // thickness as the thin lines that connect each bird on the circle
    // path"*), which on a phone at device scale 1 is a sub-pixel line, so its
    // brightest pixel depends on where a dash falls; K13's 3:1 was at 1.5 px and
    // 0.75. What is held: every dash shows, and the octagon is measured the
    // same way along its eight edges beside it for the record.
    if (!(worst > 1.1)) bad.push(`a dash reads ${worst}:1 on the black, nothing`);
    // K14: the dashes take an opacity of their own (`DASH_OP`) and read 3:1 on
    // the black on the phone picture's scale in every engine that draws it (K37)
    const worst2 = Math.min(...r.px2.map((p) => p.ratio));
    // K37: the phone picture's scale is not one Firefox can give (FIREFOX_SCALE)
    const scale2 = r.engine !== 'firefox';
    if (scale2 && !(worst2 >= 3)) bad.push(`at device scale 2 a dash reads ${worst2}:1 on the black (${r.px2.map((p) => `${p.link} ${p.ratio}`).join(', ')})`);
    if (r.px2.length !== r.px.length) bad.push(`${r.px2.length} dashes at device scale 2 against ${r.px.length}`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: `${want.length} dotted lines (${want.join(', ')}) from the model and ${r.dom.length} in the page; ${strong.length} declared pairs stay on the frame's strong lines; `
        + `on a ${r.square}-px square each dot ${r.links.find((l) => l.dotted)?.dotPx} px at ${r.links.find((l) => l.dotted)?.dotOp} of the gold reads at least ${worst}:1 on the black (${r.px.map((p) => p.ratio).join(', ')}), the octagon's line ${Math.min(...r.octagon)}–${Math.max(...r.octagon)}:1; `
        + (scale2 ? `at device scale 2 every dash reads at least ${worst2}:1 (${r.px2.map((p) => p.ratio).join(', ')})`
          : `at device scale 2 not held in Firefox: ${FIREFOX_SCALE} (it read ${worst2}:1)`),
    };
  },
});

SCENARIOS.push({
  name: 'the dashes under the transport read through its ground, stopped and playing alike',
  area: 'ring',
  // K14, Eugene: *"for the dashed lines under the player circle we need to
  // increase the transparency by 15 % more, I can barely see them"*, and *"when
  // the player is working I see the lines better, but when it's stopped it's
  // nearly a black hole."* The ground is one alpha in both states
  // (`CORE_GROUND` 0.55) and nothing at rest sits over it; playing, the breath
  // only adds light. On the phone picture's scale (device scale 2) every dashed
  // line under the disc is read off one picture of it, with the transport's
  // words, actions and marks out of it: its brightest pixel inside the disc,
  // stopped and at four moments of a breath while it plays, all over one floor.
  deadline: 90000,
  query: 'v=2&seed=15576',
  drive: async (page) => {
    const two = await ownPage(page, { deviceScaleFactor: 2 });
    const read = () => two.page.evaluate(body(`
      for (const q of document.querySelectorAll('#actions, #innerLive, #inner text, #star text, #starCells, #starWords')) q.style.visibility = 'hidden';
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const ground = document.querySelector('#core circle.ground').getBoundingClientRect();
      const cx = ground.x + ground.width / 2, cy = ground.y + ground.height / 2, R = ground.width / 2;
      const inR = R * 137 / 150;
      // each line from bird to bird where the birds are drawn — their knots'
      // boxes carry every transform the star turns under, which a path's own
      // matrix does not in every engine
      const knot = (i) => { const b = document.querySelectorAll('#starCells g.cell')[i].firstChild.querySelector('circle').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; };
      const lines = [...document.querySelectorAll('#starLines path.dot')].map((p) => {
        const [a, b] = p.getAttribute('data-link').split('-').map(Number);
        const [ax, ay] = knot(a), [bx, by] = knot(b), pts = [];
        for (let k = 0; k <= 400; k++) { const x = ax + (bx - ax) * k / 400, y = ay + (by - ay) * k / 400; const d = Math.hypot(x - cx, y - cy); if (d < inR * 0.9 && d > inR * 0.15) pts.push([x, y]); }
        return { link: p.getAttribute('data-link'), pts };
      }).filter((l) => l.pts.length);
      return { lines, box: { x: cx - R, y: cy - R, w: 2 * R, h: 2 * R }, cx, cy, inR };
    `));
    const measure = async () => {
      const g = await read();
      const shot = await two.page.screenshot({ clip: { x: g.box.x, y: g.box.y, width: g.box.w, height: g.box.h } });
      const out = await two.page.evaluate(body(`
        const g = ${JSON.stringify(g)};
        const img = new Image(); img.src = 'data:image/png;base64,${shot.toString('base64')}'; await img.decode();
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
        const c2 = cv.getContext('2d'); c2.drawImage(img, 0, 0);
        const d = c2.getImageData(0, 0, img.width, img.height).data;
        const k = img.width / g.box.w;
        const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
        const L = (x, y) => { const i = (Math.round(y) * img.width + Math.round(x)) * 4; return 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]); };
        const per = g.lines.map((l) => {
          let best = 0;
          for (const [x, y] of l.pts) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) best = Math.max(best, L((x - g.box.x) * k + dx, (y - g.box.y) * k + dy));
          return { link: l.link, ratio: +((best + 0.05) / 0.05).toFixed(2) };
        });
        // the ground itself, a little off the centre and off every line
        let lo = 1;
        for (let a = 0; a < 64; a++) { const x = (g.cx - g.box.x + Math.cos(a) * g.inR * 0.6) * k, y = (g.cy - g.box.y + Math.sin(a) * g.inR * 0.6) * k; lo = Math.min(lo, L(x, y)); }
        return { per, ground: +((lo + 0.05) / 0.05).toFixed(2) };
      `));
      return out;
    };
    const stopped = await measure();
    await two.page.evaluate(async () => { await window.ring.control.start(); });
    await two.page.waitForFunction(() => window.ring.control.mix && window.ring.control.mix.state.elapsed > 2, null, { timeout: 20000 });
    const playing = [];
    for (let k = 0; k < 4; k++) { playing.push(await measure()); await two.page.waitForTimeout(170); }
    await two.page.evaluate(() => window.ring.control.stop());
    await two.close();
    return { stopped, playing, engine: page.context().browser().browserType().name() };
  },
  judge: (r) => {
    const FLOOR = 1.4;
    const worst = (m) => Math.min(...m.per.map((p) => p.ratio));
    const bad = [];
    // K37: the row is the phone picture's scale, which Firefox cannot give (FIREFOX_SCALE)
    const scale2 = r.engine !== 'firefox';
    if (!r.stopped.per.length) bad.push('no dashed line runs under the disc');
    if (!scale2) return { ok: !bad.length, why: bad[0], note: `every dashed line under the disc found; the floor of ${FLOOR}:1 not held in Firefox: ${FIREFOX_SCALE} (stopped it read ${worst(r.stopped)}:1)` };
    if (worst(r.stopped) < FLOOR) bad.push(`stopped, a dash under the disc reads ${worst(r.stopped)}:1 (${r.stopped.per.map((p) => `${p.link} ${p.ratio}`).join(', ')})`);
    for (const [k, m] of r.playing.entries()) if (worst(m) < FLOOR) bad.push(`playing (${k}), a dash under the disc reads ${worst(m)}:1`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: `on the phone picture's scale every dashed line under the disc reads at least ${worst(r.stopped)}:1 on it stopped (${r.stopped.per.map((p) => `${p.link} ${p.ratio}`).join(', ')}, the ground ${r.stopped.ground}:1) `
        + `and ${r.playing.map(worst).join(', ')}:1 at four moments while it plays (the ground ${r.playing.map((m) => m.ground).join(', ')}:1), over the floor of ${FLOOR}:1`,
    };
  },
});

SCENARIOS.push({
  name: 'the corona is brightest on the transport\'s rim in every phase of a slow breath, and falls away outward',
  area: 'ring',
  // K14: *"a solar crown … the glow follows the planet's gravity, not just
  // runs away and back."* At 54 BPM, on a desktop's square, the corona alone
  // is kept in the picture and read along four arcs between the actions, at
  // four moments of one breath — near its floor, halfway up, at its top and
  // halfway down: the brightest pixel of each ray is on the rim, and past it
  // the light only falls.
  deadline: 120000,
  query: 'v=2&seed=1&spell=ember:0.05',
  drive: async (page) => {
    const own = await ownPage(page, { viewport: { width: 1200, height: 1000 } });
    const p = own.page;
    await p.evaluate(async () => { await window.ring.control.start(); });
    await p.waitForFunction(() => window.ring.control.mix && window.ring.control.mix.state.elapsed > 2, null, { timeout: 20000 });
    await p.evaluate(body(ISOLATE + `isolate([document.getElementById('corona'), document.getElementById('coronaRim')]);`));
    const geo = await p.evaluate(() => {
      const t = document.getElementById('tilt').getBoundingClientRect();
      return { cx: t.x + t.width / 2, cy: t.y + t.height / 2, unit: t.width / 1000 };
    });
    // the breath's own point, 0 to 1, off the light it paints under the reading
    const at = () => p.evaluate(() => (Number(window.ring.motion().breathOp) - 0.03) / 0.07);
    const phases = [];
    const shoot = async (name) => {
      const e = await at();
      const R = 150 * geo.unit, reach = 100 * geo.unit;
      const shot = await p.screenshot({ clip: { x: geo.cx - R - reach, y: geo.cy - R - reach, width: 2 * (R + reach), height: 2 * (R + reach) } });
      const prof = await p.evaluate(body(`
        const img = new Image(); img.src = 'data:image/png;base64,${shot.toString('base64')}'; await img.decode();
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
        const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, img.width, img.height).data;
        const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
        const k = img.width / ${2 * (R + reach)};
        const c0 = img.width / 2;
        const out = [];
        for (const deg of [22.5, 112.5, 202.5, 292.5]) {
          const a = deg * Math.PI / 180;
          const ray = [];
          for (let u = 140; u <= 245; u += 0.5) {
            // the light at this radius, averaged over sixteen degrees of arc
            // round the ray: the corona's profile, its rays' texture evened out
            let sum = 0, n = 0;
            for (let t = -8; t <= 8; t += 0.25) {
              const b = a + t * Math.PI / 180;
              const x = Math.round(c0 + Math.cos(b) * u * ${geo.unit} * k), y = Math.round(c0 + Math.sin(b) * u * ${geo.unit} * k);
              const i = (y * img.width + x) * 4;
              sum += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
              n++;
            }
            ray.push({ u, L: sum / n });
          }
          const top = ray.reduce((m, q) => (q.L > m.L ? q : m), ray[0]);
          // past the rim (and a stroke's own antialias) the light never rises by more than a trace
          let rise = 0, prev = Infinity;
          for (const q of ray) if (q.u >= 153) { if (q.L > prev) rise = Math.max(rise, q.L - prev); prev = Math.min(prev, q.L); }
          out.push({ deg, topAt: top.u, topL: +top.L.toFixed(4), at160: +(ray.find((q) => q.u === 160).L).toFixed(4), rise: +rise.toFixed(4) });
        }
        return out;
      `));
      phases.push({ name, e: +e.toFixed(2), prof });
    };
    // one breath: its floor, halfway up, its top, halfway down
    const waitE = async (test, ms = 12000) => { const t0 = Date.now(); let prev = await at(); while (Date.now() - t0 < ms) { const e = await at(); if (test(e, prev)) return e; prev = e; await p.waitForTimeout(16); } return null; };
    await waitE((e, prev) => e < 0.12 && e >= prev - 1e-6 && prev < 0.12);
    await shoot('floor');
    await waitE((e, prev) => e >= 0.5 && prev < 0.5);
    await shoot('rising');
    await waitE((e, prev) => e < prev && prev > 0.85);
    await shoot('top');
    await waitE((e, prev) => e <= 0.5 && prev > 0.5);
    await shoot('falling');
    const bpm = await p.evaluate(() => { const rd = window.ring.control.readout(); return rd.gridBpm || rd.bpm; });
    await p.evaluate(() => window.ring.control.stop());
    await own.close();
    return { bpm, phases };
  },
  judge: (r) => {
    const bad = [];
    if (!(r.bpm < 60)) bad.push(`the set ran at ${r.bpm}`);
    if (r.phases.length !== 4) bad.push(`${r.phases.length} phases read`);
    for (const ph of r.phases) for (const q of ph.prof) {
      // on the rim: within the corona's innermost strip at its floor (a
      // twentieth of 0.4 of 85 units) and a pixel of the picture
      if (Math.abs(q.topAt - 150) > 3) bad.push(`${ph.name} (e ${ph.e}), along ${q.deg}° the brightest is at ${q.topAt}, not on the rim`);
      // (a stroke's antialiased edge is allowed a trace: a fiftieth of the rim's light)
      if (q.rise > 0.02 * q.topL) bad.push(`${ph.name} (e ${ph.e}), along ${q.deg}° the light rises ${q.rise} past the rim, where the rim's is ${q.topL}`);
      if (!(q.topL > 0.003)) bad.push(`${ph.name}, along ${q.deg}° there is no corona to read (${q.topL})`);
    }
    return {
      ok: !bad.length,
      why: bad[0],
      note: `at ${r.bpm} BPM, in each of four moments of one breath (${r.phases.map((ph) => `${ph.name} ${ph.e}`).join(', ')}), along four arcs between the actions the corona is brightest `
        + `${Math.max(...r.phases.flatMap((ph) => ph.prof.map((q) => Math.abs(q.topAt - 150))))} units from the rim at worst and only falls past it; `
        + `its light on the rim ${r.phases.map((ph) => Math.max(...ph.prof.map((q) => q.topL)).toFixed(3)).join(', ')} and ten units out ${r.phases.map((ph) => Math.max(...ph.prof.map((q) => q.at160)).toFixed(3)).join(', ')}`,
    };
  },
});

SCENARIOS.push({
  name: 'a drag lights the lines from the held bird to the birds its move changes, dotted or strong, and only those, until it lets go',
  area: 'birds',
  deadline: 120000,
  query: 'v=2&seed=15576',
  page: body(K11 + `
    await sleep(600);
    const settle = (p) => Array.from({ length: 10 }, () => p);
    const watch = () => ({ lit: window.ring.links().filter((l) => l.lit > 0.5).map((l) => l.a + '-' + l.b).sort(), cons: cells().map((c) => c.consequent) });
    const ember = await walkBird(0, [104, 112, 120, 126, ...settle(130)], watch);
    window.ring.release(null);
    await sleep(700);
    const between = window.ring.links().filter((l) => l.lit > 0.02).length;
    const veil = await walkBird(7, [96, 70, 40, 15, ...settle(0)], watch);
    window.ring.release(null);
    await sleep(700);
    const after = window.ring.links().filter((l) => l.lit > 0.02).length;
    return { links: window.ring.links(), ember: ember.seen[ember.seen.length - 1], veil: veil.seen[veil.seen.length - 1], between, after, names: cells().map((c) => c.name) };
  `),
  judge: (r) => {
    const bad = [];
    const expect = (h, seen) => r.links.filter((l) => (l.a === h && seen.cons[l.b]) || (l.b === h && seen.cons[l.a])).map((l) => `${l.a}-${l.b}`).sort();
    const kind = (k) => r.links.find((l) => `${l.a}-${l.b}` === k).kind;
    for (const [h, seen, who] of [[0, r.ember, 'Ember'], [7, r.veil, 'Veil']]) {
      const want = expect(h, seen);
      if (!want.length) bad.push(`${who}'s move changed no bird a line joins`);
      if (JSON.stringify(seen.lit) !== JSON.stringify(want)) bad.push(`${who} lit ${seen.lit} where the birds it changes are ${want}`);
    }
    if (!r.veil.lit.some((k) => kind(k) === 'dotted')) bad.push('no dotted line lit under Veil');
    if (r.between || r.after) bad.push(`lines still lit after the release: ${r.between}, ${r.after}`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: `Ember to the rim lit ${r.ember.lit.map((k) => `${k} (${kind(k)})`).join(', ')}; Veil to 0 % lit ${r.veil.lit.map((k) => `${k} (${kind(k)})`).join(', ')}; nothing lit once each let go`,
    };
  },
});

SCENARIOS.push({
  name: 'a held bird traces the lines into it, faint and dashed, and lights only the lines to the birds it changes; nothing at rest',
  area: 'birds',
  // K14, Eugene's pick: *"the faint trace"*. While a bird is held, every line
  // along which another bird reaches it — an edge into it, by the model — is
  // the dash at `TRACE_OP`, distinct from the lit lines to the birds its move
  // changes. Seed 15576: Zephyr to the rim traces what feeds it and lights
  // nothing; Ember to the rim lights Ember–Zephyr and traces what feeds Ember.
  // At rest, before and after, no line is traced or lit.
  deadline: 120000,
  query: 'v=2&seed=15576',
  page: body(K11 + `
    await sleep(600);
    const settle = (p) => Array.from({ length: 10 }, () => p);
    const rest0 = window.ring.links().filter((l) => l.traced > 0.02 || l.lit > 0.02 || l.traceOp > 0).map((l) => l.a + '-' + l.b);
    const watch = () => {
      const ls = window.ring.links();
      return { lit: ls.filter((l) => l.lit > 0.5).map((l) => l.a + '-' + l.b).sort(), traced: ls.filter((l) => l.traced > 0.5).map((l) => l.a + '-' + l.b).sort(),
        traceOp: Math.max(0, ...ls.filter((l) => l.traced > 0.5).map((l) => +(l.traceOp / l.traced).toFixed(3))), cons: cells().map((c) => c.consequent) };
    };
    const zephyr = await walkBird(2, [104, 112, 120, 126, ...settle(130)], watch);
    window.ring.release(null);
    await sleep(700);
    const between = window.ring.links().filter((l) => l.traced > 0.02 || l.lit > 0.02).length;
    const ember = await walkBird(0, [104, 112, 120, 126, ...settle(130)], watch);
    window.ring.release(null);
    await sleep(700);
    const after = window.ring.links().filter((l) => l.traced > 0.02 || l.lit > 0.02 || l.traceOp > 0).length;
    return { links: window.ring.links(), zephyr: zephyr.seen[zephyr.seen.length - 1], ember: ember.seen[ember.seen.length - 1], rest0, between, after };
  `),
  judge: (r) => {
    const bad = [];
    // the lines into bird h, by the model, that are not lit
    const into = (h, seen) => r.links.filter((l) => l.into.includes((l.a === h ? l.b : l.a) + '>' + h) && (l.a === h || l.b === h) && !seen.lit.includes(l.a + '-' + l.b)).map((l) => l.a + '-' + l.b).sort();
    const z = r.zephyr, e = r.ember;
    const zIn = into(2, z), eIn = into(0, e);
    if (r.rest0.length) bad.push(`at rest ${r.rest0.join(', ')} were drawn`);
    if (!zIn.length) bad.push('the model sends nothing into Zephyr');
    if (JSON.stringify(z.traced) !== JSON.stringify(zIn)) bad.push(`Zephyr held traced ${z.traced} where the lines into it are ${zIn}`);
    if (z.lit.length) bad.push(`Zephyr held lit ${z.lit}`);
    if (!e.lit.includes('0-2')) bad.push(`Ember held lit ${e.lit}, not Ember–Zephyr`);
    if (JSON.stringify(e.traced) !== JSON.stringify(eIn)) bad.push(`Ember held traced ${e.traced} where the lines into it are ${eIn}`);
    if (e.traced.some((k) => e.lit.includes(k))) bad.push('a line both lit and traced');
    if (Math.abs(z.traceOp - 0.45) > 0.01) bad.push(`the trace drawn at ${z.traceOp}`);
    if (r.between || r.after) bad.push(`lines still drawn after the release: ${r.between}, ${r.after}`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: `nothing at rest; Zephyr held traced ${z.traced.join(', ')} at ${z.traceOp} and lit nothing; Ember held lit ${e.lit.join(', ')} and traced ${e.traced.join(', ') || 'nothing'}; nothing drawn once each let go`,
    };
  },
});

SCENARIOS.push({
  name: 'the explanation under a dragged bird is its provisional band in five words, with no pole word, and the screen reader hears the same',
  area: 'words',
  // Eugene, on round K13: *"Tide says 'Dry, short · Shorter' — what does this
  // even mean … when dragging, the user should see human language explaining
  // the CURRENT value instead of computing it in their heads."* Tide walked to
  // the rim and to 0 % with the pointer on it; Veil the same.
  deadline: 120000,
  query: 'v=2&seed=15576',
  page: body(K11 + `
    await sleep(600);
    const settle = (p) => Array.from({ length: 10 }, () => p);
    const read = (i) => () => ({ word: cells()[i].word, tell: tellSaid(), aria: document.querySelectorAll('#starCells g.cell')[i].getAttribute('aria-valuetext') || '' });
    const out = {};
    for (const [i, name] of [[6, 'tide'], [7, 'veil']]) {
      const up = await walkBird(i, [104, 112, 120, ...settle(130)], read(i));
      window.ring.release(null);
      await sleep(500);
      const down = await walkBird(i, [96, 70, 40, ...settle(0)], read(i));
      window.ring.release(null);
      await sleep(500);
      out[name] = { rim: up.seen[up.seen.length - 1], zero: down.seen[down.seen.length - 1] };
    }
    return out;
  `),
  judge: (r) => {
    const bad = [];
    // (the line is the band's short form since the panel round after K13; the sentence is the screen reader's)
    // (since K15 a wall is its band's far lean: very close, far back, very still, always shifting)
    // (since K30 the far lean names a part only where it plays: "Very wide", then the part)
    const want = { tide: { rim: ['DISTANT', 'Very wide'], zero: ['NEAR', 'Very close, dry sound'] },
      veil: { rim: ['SHIFTING', 'Always shifting'], zero: ['STATIC', 'Very still'] } };
    const banned = /\b(more|less|out|in|shorter|longer|how)\b/i;
    for (const b of Object.keys(want)) for (const at of ['rim', 'zero']) {
      const got = r[b][at];
      const [word, starts] = want[b][at];
      if (got.word !== word) bad.push(`${b} at ${at} reads ${got.word}, not ${word}`);
      // (the line along the track is set in capitals; the words are the sentence's)
      if (!got.tell.toLowerCase().startsWith(starts.toLowerCase())) bad.push(`${b} at ${at}: the explanation says "${got.tell}"`);
      if (banned.test(got.tell)) bad.push(`${b} at ${at}: "${got.tell}" carries a pole word`);
      if (!got.aria.toLowerCase().includes(got.tell.toLowerCase())) bad.push(`${b} at ${at}: the screen reader hears "${got.aria}"`);
    }
    return { ok: !bad.length, why: bad[0], note: ['tide', 'veil'].map((b) => `${b}: "${r[b].zero.tell}" … "${r[b].rim.tell}"`).join('; ') };
  },
});

// **Round K12d: a stop or a play ends every wait** (`notes/rounds/ring-k.md`).
SCENARIOS.push({
  name: 'a stop mid-wait and a play leave no fill and no ornament on any bird from the first note, also with a bird moved while stopped',
  area: 'birds',
  // Eugene, round K12d: *"moved a bird, saw the progress, too long to wait,
  // stopped the player, pressed play — the music plays with all changes, but
  // the progress never leaves the bird circle."* Tide dragged out while the set
  // plays (Zephyr's keys change with it), the set stopped mid-wait and played
  // again; every frame from the first readout that plays, for a quarter of a
  // second: no bird's fill, no ornament, no consequence, nothing pending, and
  // the tempo label the grid's. Then again with Root moved while stopped.
  deadline: 120000,
  query: 'v=2&seed=15576',
  page: body(K11 + `
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
    const look = () => cells().map((c) => ({ fill: c.fill.on, filled: c.filled, orn: c.marks.orn, consequent: c.consequent, pending: c.pending, reading: c.reading }));
    const round = async (between, to) => {
      const walk = [];
      for (let k = 1; k <= 12; k++) walk.push(cells()[6].percent + (to - cells()[6].percent) * k / 12);
      await walkBird(6, walk);
      mouse('pointermove', { x: 2, y: 2 }, el('stage'));
      await sleep(1500);
      const before = look();
      ctl.stop();
      await sleep(300);
      if (between) await between();
      const stopped = look();
      const go = ctl.start();
      const frames = [];
      await waitFor(() => ctl.playing, 8000);
      const t0 = performance.now();
      while (performance.now() - t0 < 250) {
        await frame();
        const r = ctl.readout();
        frames.push({ cells: look(), grid: r.gridBpm, playing: r.playing });
      }
      await bounded(go, 3000);
      await sleep(400);
      return { before, stopped, frames };
    };
    const one = await round(null, 130);
    const two = await round(async () => { window.ring.pull(4, 0.95); await sleep(300); }, 40);
    ctl.stop();
    window.ring.release(null);
    return { one, two, names: cells().map((c) => c.name) };
  `),
  judge: (r) => {
    const bad = [];
    for (const [name, x] of [['a stop and a play', r.one], ['with Root moved while stopped', r.two]]) {
      if (!x.before.some((c) => c.fill)) bad.push(`${name}: no fill was running before the stop`);
      if (!x.frames.length) { bad.push(`${name}: no frame was read after the play`); continue; }
      for (const f of x.frames) {
        f.cells.forEach((c, k) => {
          if (c.fill || c.filled || c.orn > 0.01 || c.consequent || c.pending) bad.push(`${name}: after the play ${r.names[k]} read ${JSON.stringify(c)}`);
        });
        if (!f.cells[0].reading.includes(String(f.grid))) bad.push(`${name}: Ember read ${f.cells[0].reading} with the grid at ${f.grid}`);
      }
    }
    return {
      ok: !bad.length,
      why: bad[0],
      note: `Tide dragged out filled ${r.one.before.filter((c) => c.fill).length} birds; stopped mid-wait and played, over ${r.one.frames.length} frames from the first note no bird carried a fill, an ornament, a consequence or a wait; `
        + `the same with Root moved while stopped (${r.two.frames.length} frames)`,
    };
  },
});

SCENARIOS.push({
  name: 'the phone panel reads top to bottom as the live line and the percent, the slider, then the bird\'s name and what it means, nothing live under the thumb',
  area: 'panel',
  // Eugene, round K12d: *"on mobile the bottom bird panel needs to flip
  // vertically: the changing value on top, so it's not covered by the finger;
  // the static bird name and subtitle at the bottom of the slider."* On the
  // 390 px frame, a finger opens Root's panel and slides it to 120 %: the live
  // line and the percent stand wholly above the slider's knob, the name and the
  // meaning wholly below the slider, and the panel inside the screen.
  query: 'v=2&seed=15576',
  page: body(K11 + `
    const r0 = cells()[4].radius * 316;
    finger('pointerdown', spoke(4, r0), el('tilt'));
    await sleep(60);
    finger('pointerup', spoke(4, r0));
    await sleep(250);
    const sl = el('birdPanelSlider');
    sl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 35, pointerType: 'touch', isPrimary: true }));
    sl.value = '120'; sl.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(200);
    const rect = (id) => { const b = el(id).getBoundingClientRect(); return { top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), h: +b.height.toFixed(1) }; };
    const s = sl.getBoundingClientRect();
    const knobY = s.top + s.height / 2;
    const out = { now: rect('birdPanelNow'), pct: rect('birdPanelPct'), slider: rect('birdPanelSlider'), name: rect('birdPanelName'), means: rect('birdPanelMeans'),
      panel: rect('birdPanel'), knobTop: +(knobY - 11).toFixed(1), vh: innerHeight, nowText: el('birdPanelNow').textContent, pctText: el('birdPanelPct').textContent };
    sl.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 35, pointerType: 'touch', isPrimary: true }));
    await sleep(200);
    window.ring.release(null);
    return out;
  `),
  judge: (r) => {
    const bad = [];
    if (!(r.now.h > 0 && r.now.bottom <= r.knobTop)) bad.push(`the live line reaches ${r.now.bottom}, the knob's top is at ${r.knobTop}`);
    if (!(r.pct.h > 0 && r.pct.bottom <= r.knobTop)) bad.push(`the percent reaches ${r.pct.bottom}, the knob's top is at ${r.knobTop}`);
    if (!(r.now.top < r.slider.top && r.name.top >= r.slider.bottom && r.means.top >= r.name.bottom)) bad.push(`top to bottom: ${JSON.stringify(r)}`);
    if (r.panel.bottom > r.vh) bad.push(`the panel runs to ${r.panel.bottom} on a ${r.vh} px screen`);
    if (!r.nowText.trim() || r.pctText !== '120%') bad.push(`the live line read "${r.nowText}" and the percent "${r.pctText}"`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: `on the 390 px frame the live line ("${r.nowText}") ends at ${r.now.bottom} and the percent ${r.pctText} at ${r.pct.bottom}, above the knob's top at ${r.knobTop}; `
        + `the slider ${r.slider.top}–${r.slider.bottom}, the name from ${r.name.top} and the meaning from ${r.means.top}, the panel ending at ${r.panel.bottom} of ${r.vh}`,
    };
  },
});

// **Round K14: a finger decides by its motion, on every square** (Eugene: *"we
// should allow drag on mobile too — we just always show the bottom aux panel
// for control, but if the user drags, they drag"*; *"the wheel spin still
// doesn't work: if I touch anywhere to pull down, the bird circles steal the
// first touch to select"*; and, on his car's screen, *"touch but giant, not
// mobile size … I want both options"*). One suite of gestures, run on the
// phone's square and on a big touch screen: a still tap on a bird opens its
// panel and a second puts it away; a swipe round the ring that begins on a
// bird, on its words or on the open face spins the star and takes nothing; a
// drag along a bird's spoke drags it, the panel open on it following and the
// panel moving to another bird dragged at the lift; and a mouse is what it was.
const FINGER_SUITE = HAND + `
  const pt = (p) => ({ x: +p.x.toFixed(1), y: +p.y.toFixed(1) });
  const dir = (i) => { const a = (i / 8) * Math.PI * 2; return { out: { x: Math.sin(a), y: -Math.cos(a) }, round: { x: Math.cos(a), y: Math.sin(a) } }; };
  const panel = () => ({ open: !el('birdPanel').hidden, name: el('birdPanelName').textContent, slider: +(el('birdPanelSlider') || { value: 0 }).value });
  const words = (i) => { const b = cells()[i].words.box, t = el('tilt').getBoundingClientRect(), k = t.width / 1000; return { x: t.x + (b.x + b.w / 2) * k, y: t.y + (b.y + b.h / 2) * k }; };
  const face = (i) => spoke(i + 0.5, 316);
  const spin = () => Math.abs(window.ring.turn().spin);
  const touch = async (p, moves, watch) => {
    finger('pointerdown', p, el('tilt'));
    await sleep(30);
    const seen = [];
    let q = p;
    for (const m of moves) { q = { x: q.x + m.x, y: q.y + m.y }; finger('pointermove', q); await frame(); await frame(); if (watch) seen.push(watch()); }
    if (!moves.length) await sleep(60);
    finger('pointerup', q);
    await sleep(120);
    return seen;
  };
  const steps = (v, n, px) => Array.from({ length: n }, () => ({ x: v.x * px, y: v.y * px }));
  const settle = async () => { await waitFor(() => window.ring.turn().spin === 0, 8000); await sleep(150); };
  const out = {};
  const i = 6, j = 5;
  const name = (k) => cells()[k].name;
  // a still tap: the panel opens on the bird, and a second puts it away
  await touch(nodeAt(i), []);
  out.tap = panel();
  await touch(nodeAt(i), []);
  // (the sheet slides down before it is put away, K20)
  await waitFor(() => el('birdPanel').hidden, 1500);
  out.untap = panel();
  // round the ring from the bird, from its words and from the open face: the star, nothing else
  for (const [what, from] of [['bird', () => nodeAt(i)], ['words', () => words(i)], ['face', () => face(i)]]) {
    const v0 = cells()[i].value, url0 = location.search;
    const seen = await touch(from(), steps(dir(i).round, 10, 5), () => ({ spin: spin(), pulling: cells()[i].pulling || cells()[i].held, panel: panel().open }));
    out['round-' + what] = { spun: Math.max(...seen.map((x) => x.spin)), took: seen.some((x) => x.pulling), panel: seen.some((x) => x.panel) || panel().open,
      value: cells()[i].value === v0, url: location.search === url0, seed: ctl.readout().seed };
    await settle();
  }
  // a tap on the open face opens nothing
  await touch(face(i), []);
  out.faceTap = panel();
  // along the spoke from the bird: the bird, dragged, and asked for at the lift
  {
    const v0 = cells()[i].value;
    const seen = await touch(nodeAt(i), steps(dir(i).out, 10, 4), () => ({ v: cells()[i].value, pulling: cells()[i].pulling, url: location.search }));
    out.drag = { moved: seen.some((x) => x.v !== v0), pulling: seen[seen.length - 1].pulling, quiet: seen.every((x) => x.url === seen[0].url),
      held: cells()[i].held, link: decodeURIComponent(location.search), panel: panel().open };
    window.ring.release(null);
    await sleep(300);
  }
  // with the panel open on the bird, its drag carries the panel's slider with it
  await touch(nodeAt(i), []);
  {
    const seen = await touch(nodeAt(i), steps(dir(i).out, 10, 4), () => ({ p: panel(), pct: cells()[i].percent }));
    const last = seen[seen.length - 1];
    out.dragOpen = { open: seen.every((x) => x.p.open && x.p.name === name(i)), follows: last.p.slider === last.pct && last.pct !== 100, after: panel(), who: name(i) };
  }
  // and a drag on another bird moves the panel there at the lift, never under the hand
  {
    const seen = await touch(nodeAt(j), steps(dir(j).out, 10, 4), () => panel().name);
    out.dragOther = { during: [...new Set(seen)], after: panel(), was: name(i), to: name(j) };
    // a touch on the open face puts the panel away
    await touch(face(2), []);
    await waitFor(() => el('birdPanel').hidden, 1500);
    out.closed = panel();
    window.ring.release(null);
    await sleep(300);
  }
  // a mouse is what it was: a drag drags, and a click opens no panel
  {
    const v0 = cells()[i].value;
    await pullTo(i, Math.min(1, v0 + 0.2));
    out.mouseDrag = { moved: cells()[i].value !== v0 };
    await click(nodeAt(j));
    await sleep(200);
    out.mouseClick = panel();
    window.ring.release(null);
    await sleep(300);
  }
  out.square = el('tilt').offsetWidth;
  return out;
`;
const judgeFingers = (o, where) => {
  const bad = [];
  if (!(o.tap.open && o.tap.name.toLowerCase() === 'tide')) bad.push(`${where}: a tap on Tide left the panel ${JSON.stringify(o.tap)}`);
  if (o.untap.open) bad.push(`${where}: a second tap left the panel open`);
  for (const w of ['bird', 'words', 'face']) {
    const r = o['round-' + w];
    if (!(r.spun > 1)) bad.push(`${where}: a swipe round the ring from the ${w} turned the star ${r.spun}°`);
    if (r.took || r.panel || !r.value || !r.url) bad.push(`${where}: a swipe round the ring from the ${w} took the bird or opened the panel: ${JSON.stringify(r)}`);
  }
  if (o.faceTap.open) bad.push(`${where}: a tap on the open face opened the panel`);
  if (!(o.drag.moved && o.drag.pulling && o.drag.quiet && o.drag.held && /ti:/.test(o.drag.link) && !o.drag.panel)) bad.push(`${where}: a drag along Tide's spoke ${JSON.stringify(o.drag)}`);
  if (!(o.dragOpen.open && o.dragOpen.follows && o.dragOpen.after.open)) bad.push(`${where}: the panel open on Tide under its drag ${JSON.stringify(o.dragOpen)}`);
  const low = (x) => String(x).toLowerCase();
  if (!(o.dragOther.during.every((n) => low(n) === low(o.dragOther.was)) && o.dragOther.after.open && low(o.dragOther.after.name) === low(o.dragOther.to))) bad.push(`${where}: a drag on ${o.dragOther.to} with the panel on ${o.dragOther.was} ${JSON.stringify(o.dragOther)}`);
  if (o.closed.open) bad.push(`${where}: a touch on the open face left the panel open`);
  if (!o.mouseDrag.moved) bad.push(`${where}: a mouse's drag moved nothing`);
  if (o.mouseClick.open) bad.push(`${where}: a mouse's click opened the panel`);
  return bad;
};
const noteFingers = (o, where) => `${where} (${o.square} px square): a tap opened ${o.tap.name}'s panel and a second put it away; a swipe round the ring turned the star `
  + `${['bird', 'words', 'face'].map((w) => `${o['round-' + w].spun.toFixed(1)}° from the ${w}`).join(', ')} and took nothing; a drag along the spoke wrote "${o.drag.link}" at the lift; `
  + `the panel followed its own bird's drag and moved to ${o.dragOther.to} at the other's lift; a mouse dragged and its click opened nothing`;

SCENARIOS.push({
  name: 'a finger decides by its motion, on the phone\'s square and on a big touch screen: a tap opens the panel, round the ring spins, along the spoke drags',
  area: ['birds', 'panel'],
  deadline: 180000,
  query: 'v=2&seed=15576',
  drive: async (page) => {
    const phone = await page.evaluate(body(FINGER_SUITE));
    const big = await ownPage(page, { viewport: { width: 1920, height: 1200 }, hasTouch: true, isMobile: false });
    const car = await big.page.evaluate(body(FINGER_SUITE));
    await big.close();
    return { phone, car };
  },
  judge: (r) => {
    const bad = [...judgeFingers(r.phone, 'phone'), ...judgeFingers(r.car, 'big touch')];
    return { ok: !bad.length, why: bad[0], note: `${noteFingers(r.phone, 'on the phone')}; ${noteFingers(r.car, 'on the big touch screen')}` };
  },
});

// **Round K14: the ring in the middle of the viewport it is seen in** (Eugene:
// *"the ring on mobile is off-centre … on all screen sizes and platforms the
// ring should be exactly in the centre of the viewport; in the machine view …
// that box is the viewport"*). On four viewports — a phone upright and on its
// side, a desktop and a big touch screen — the ring's square is centred on the
// viewport within a pixel, before and after its panel opens; and in the
// machine view it is centred in its own box.
SCENARIOS.push({
  name: 'the ring stands in the middle of the viewport on every screen, with its panel open or not, and in the middle of its box in the machine view',
  area: ['ring', 'panel'],
  deadline: 120000,
  query: 'v=2&seed=15576',
  drive: async (page) => {
    const read = (p) => p.evaluate(() => {
      const t = document.getElementById('tilt').getBoundingClientRect();
      const vv = window.visualViewport;
      const w = vv ? vv.width : innerWidth, h = vv ? vv.height : innerHeight;
      return { dx: +(t.x + t.width / 2 - (vv ? vv.offsetLeft : 0) - w / 2).toFixed(2), dy: +(t.y + t.height / 2 - (vv ? vv.offsetTop : 0) - h / 2).toFixed(2), side: +t.width.toFixed(1), w, h };
    });
    const out = [];
    for (const [name, opts] of [['phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }],
      ['phone on its side', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }],
      ['desktop', { viewport: { width: 1440, height: 900 } }],
      ['big touch', { viewport: { width: 1920, height: 1200 }, hasTouch: true, isMobile: false }]]) {
      const own = await ownPage(page, opts);
      const before = await read(own.page);
      // the panel, opened as a finger opens it
      await own.page.evaluate(async () => {
        const c = document.querySelectorAll('#starCells g.cell')[6].firstChild.getBoundingClientRect();
        const p = { clientX: c.x + c.width / 2, clientY: c.y + c.height / 2 };
        const t = document.getElementById('tilt');
        t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 41, pointerType: 'touch', isPrimary: true, ...p }));
        await new Promise((res) => setTimeout(res, 60));
        window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 41, pointerType: 'touch', isPrimary: true, ...p }));
        // the ring leans toward a finger and eases back once it lifts: its
        // place is read once the lean has settled, which is ornament and not where it stands
        const t0 = performance.now();
        while (performance.now() - t0 < 4000 && !/rotateX\(0deg\) rotateY\(0deg\)/.test(t.style.transform)) await new Promise((res) => setTimeout(res, 50));
        await new Promise((res) => setTimeout(res, 100));
      });
      const open = await own.page.evaluate(() => !document.getElementById('birdPanel').hidden);
      const after = await read(own.page);
      out.push({ name, before, after, open });
      await own.close();
    }
    // the machine view: the ring in the middle of its own box
    const view = await ownPage(page, { viewport: { width: 1440, height: 900 } });
    await view.page.evaluate(() => window.ring.machine.open());
    await view.page.waitForTimeout(1500);
    const machine = await view.page.evaluate(() => {
      const t = document.getElementById('tilt').getBoundingClientRect();
      const box = document.getElementById('stage').parentElement.getBoundingClientRect();
      const svg = document.getElementById('star').getBoundingClientRect();
      return { dx: +(svg.x + svg.width / 2 - (box.x + box.width / 2)).toFixed(2), dy: +(svg.y + svg.height / 2 - (box.y + box.height / 2)).toFixed(2), tilt: [t.width, t.height], box: [box.width, box.height] };
    });
    await view.close();
    return { out, machine };
  },
  judge: (r) => {
    const bad = [];
    for (const x of r.out) {
      for (const [when, m] of [['before', x.before], ['with the panel open', x.after]]) {
        if (Math.abs(m.dx) > 1 || Math.abs(m.dy) > 1) bad.push(`${x.name} ${when}: the ring's centre stands ${m.dx}, ${m.dy} px off the viewport's`);
      }
      if (!x.open) bad.push(`${x.name}: the panel did not open under a finger`);
    }
    if (Math.abs(r.machine.dx) > 1 || Math.abs(r.machine.dy) > 1) bad.push(`the machine view: the ring stands ${r.machine.dx}, ${r.machine.dy} px off its box's middle`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: r.out.map((x) => `${x.name} (${x.before.w}×${x.before.h}, a ${x.before.side} px ring): ${x.before.dx}, ${x.before.dy} off the middle, and ${x.after.dx}, ${x.after.dy} with the panel open`).join('; ')
        + `; in the machine view ${r.machine.dx}, ${r.machine.dy} off its box's middle`,
    };
  },
});

// **Round K14b: the whole panel inside the viewport it is seen in** (Eugene on
// the preview: *"the sliders from the bottom bird panel are gone"*). An
// iPhone's bars make the visual viewport shorter than the layout viewport, and
// the headless engines have no bars; so the phone's page is given a stand-in
// visual viewport — shorter, then shorter and scrolled down — and the window is
// resized under it, as the bars do; then a panel taller than the stylesheet's
// guess (the words set larger, as a phone's text size may); then the real
// viewport made shorter. Each time every row of the panel — the line, the
// slider row, the name and the meaning — stands inside the visual viewport.
// **Since K20 the panel is a bottom sheet** (*"the panel always starts from the
// bottom of the page up and covers everything underneath — the site logo, the
// machine button, etc. It's a pop-up"*): its bottom is the visual viewport's,
// its last row above the inset, and where the footer's name and the machine
// view's mark are inside the visual viewport the sheet is what stands at them;
// the ring is where it was before the sheet opened.
SCENARIOS.push({
  name: 'the panel is a bottom sheet whole inside the visual viewport, over the footer and the machine mark, however the browser\'s bars shorten it',
  area: 'panel',
  deadline: 120000,
  query: 'v=2&seed=15576',
  drive: async (page) => {
    const own = await ownPage(page, { viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 3 });
    const p = own.page;
    const ringBefore = await p.evaluate(() => { const b = document.getElementById('tilt').getBoundingClientRect(); return [b.x, b.y, b.width].map((v) => +v.toFixed(2)); });
    await p.evaluate(async () => {
      const c = document.querySelectorAll('#starCells g.cell')[4].firstChild.getBoundingClientRect();
      const q = { clientX: c.x + c.width / 2, clientY: c.y + c.height / 2 };
      document.getElementById('tilt').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 51, pointerType: 'touch', isPrimary: true, ...q }));
      await new Promise((res) => setTimeout(res, 60));
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 51, pointerType: 'touch', isPrimary: true, ...q }));
      await new Promise((res) => setTimeout(res, 500));
    });
    const read = (name) => p.evaluate(async (name) => {
      for (let k = 0; k < 4; k++) await new Promise((res) => requestAnimationFrame(res));
      const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; };
      const vv = window.visualViewport;
      const sheet = document.getElementById('birdPanel');
      // what stands at the footer's name and the machine mark, where they are inside the visual viewport
      const covered = ['mark', 'panel'].map((id) => { const b = document.getElementById(id).getBoundingClientRect(); const x = b.x + b.width / 2, y = b.y + b.height / 2;
        if (y < vv.offsetTop || y > vv.offsetTop + vv.height) return { id, seen: false };
        const top = document.elementFromPoint(x, y); return { id, seen: true, sheet: !!top && sheet.contains(top) }; });
      const rb = document.getElementById('tilt').getBoundingClientRect();
      return { name, open: !sheet.hidden, vvTop: vv.offsetTop, vvBottom: vv.offsetTop + vv.height, covered,
        ring: rb.bottom, ringAt: [rb.x, rb.y, rb.width].map((v) => +v.toFixed(2)), sheetBottom: r('birdPanel').bottom,
        rows: { line: r('birdPanelNow'), slider: r('birdPanelSteps'), name: r('birdPanelName'), meaning: r('birdPanelMeans') }, panel: r('birdPanel') };
    }, name);
    const standIn = (top, h) => p.evaluate(({ top, h }) => {
      if (!window.__vv0) window.__vv0 = window.visualViewport;
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: Object.assign(new EventTarget(), { offsetTop: top, offsetLeft: 0, width: innerWidth, height: h, scale: 1, pageTop: top, pageLeft: 0 }) });
      window.dispatchEvent(new Event('resize'));
    }, { top, h });
    const out = [await read('the whole screen')];
    await standIn(0, 600);
    out.push(await read('bars 244 px'));
    await standIn(120, 560);
    out.push(await read('bars, scrolled 120 px'));
    await standIn(0, 600);
    await p.evaluate(() => { for (const id of ['birdPanelName', 'birdPanelMeans', 'birdPanelNow']) document.getElementById(id).style.fontSize = '24px'; });
    out.push(await read('bars, the words set large'));
    await p.evaluate(() => { Object.defineProperty(window, 'visualViewport', { configurable: true, value: window.__vv0 }); for (const id of ['birdPanelName', 'birdPanelMeans', 'birdPanelNow']) document.getElementById(id).style.fontSize = ''; });
    await p.setViewportSize({ width: 390, height: 600 });
    out.push(await read('a 600 px viewport'));
    await own.close();
    return { out, ringBefore };
  },
  judge: (res) => {
    const bad = [];
    const r = res.out;
    for (const x of r) {
      if (!x.open) { bad.push(`${x.name}: the panel is not open`); continue; }
      for (const [row, b] of Object.entries(x.rows)) if (b.top < x.vvTop - 0.5 || b.bottom > x.vvBottom + 0.5) bad.push(`${x.name}: the ${row} runs ${b.top.toFixed(1)}–${b.bottom.toFixed(1)}, the visual viewport ${x.vvTop}–${x.vvBottom}`);
      if (Math.abs(x.sheetBottom - x.vvBottom) > 1) bad.push(`${x.name}: the sheet ends at ${x.sheetBottom.toFixed(1)}, the visual viewport at ${x.vvBottom}`);
      for (const c of x.covered) if (c.seen && !c.sheet) bad.push(`${x.name}: the ${c.id === 'mark' ? 'footer\'s name' : 'machine mark'} shows past the sheet`);
    }
    // (within half a pixel: a finger's lean on the ring eases back, and is ornament)
    if (r[0].ringAt.some((v, k) => Math.abs(v - res.ringBefore[k]) > 0.5)) bad.push(`the ring moved when the sheet opened: ${res.ringBefore} → ${r[0].ringAt}`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: r.map((x) => `${x.name}: the rows ${x.rows.line.top.toFixed(0)}–${x.rows.meaning.bottom.toFixed(0)}, the slider row ending ${x.rows.slider.bottom.toFixed(0)}, inside ${x.vvTop}–${x.vvBottom}`).join('; '),
    };
  },
});

// **Round K15: a band leans** (Eugene: *"we have at best 3–4 word variations
// per bird — could we fill in more text variants on bird movement so the user
// feels it's more dynamic?"*). Root dragged across its FULL band with the
// pointer on it: the line along the track says three things — leaning thin,
// plain, leaning heavy — before the word turns HEAVY; the screen reader's
// sentence leans with it.
SCENARIOS.push({
  name: 'a bird dragged across its band reads three lines, leaning either way, before its word turns',
  area: 'words',
  deadline: 120000,
  query: 'v=2&seed=15576',
  page: body(K11 + `
    await sleep(600);
    const read = () => ({ word: cells()[4].word, tell: tellSaid(), aria: document.querySelectorAll('#starCells g.cell')[4].getAttribute('aria-valuetext') || '' });
    // (each value held for a few moves, so the reading of the theme it implies has caught up)
    const walk = await walkBird(4, [93, 90, 88, 88, 88, 95, 99, 99, 104, 107, 110, 110, 110, 112, 118, 125, 125, 125, 125, 125], read);
    window.ring.release(null);
    await sleep(300);
    return walk.seen;
  `),
  judge: (seen) => {
    const full = seen.filter((x) => x.word === 'FULL');
    const lines = [...new Set(full.map((x) => x.tell.toLowerCase()))];
    const want = ['full bass, leaning thin', 'full bass', 'full bass, leaning heavy'];
    const bad = [];
    for (const w of want) if (!lines.includes(w)) bad.push(`FULL never read "${w}" (it read ${JSON.stringify(lines)})`);
    const turned = seen.findIndex((x) => x.word === 'HEAVY');
    if (turned < 0 || seen.slice(0, turned).some((x) => x.word !== 'FULL')) bad.push(`the word went ${seen.map((x) => x.word).join(' ')}`);
    const heavyLean = full.find((x) => x.tell.toLowerCase() === 'full bass, leaning heavy');
    if (heavyLean && !/leaning heavy/i.test(heavyLean.aria)) bad.push(`the screen reader heard "${heavyLean.aria}" at the heavy lean`);
    return { ok: !bad.length, why: bad[0], note: `Root across FULL read ${lines.map((l) => JSON.stringify(l.toUpperCase())).join(' → ')} and then the word turned ${seen[turned] && seen[turned].word}, reading ${JSON.stringify(seen[seen.length - 1].tell)}` };
  },
});

// **Round K15: the keys said as a person says them** (*"The keys are a
// vibes"*). Zephyr's sentence and short line for every keyboard seeds 1–40
// draw: never "a" before a vowel, never an article guessed, vibes as vibes.
SCENARIOS.push({
  name: 'the keys are said with their own words: vibes, an electric piano, a reed organ, and are the keys that play',
  area: 'words',
  deadline: 60000,
  query: 'v=2&seed=8',
  page: body(HAND + `
    const out = [];
    for (let s = 1; s <= 40; s++) {
      const t = window.deepHouse.planTheme(String(s), 0, { strategy: 'house-v2' });
      out.push({ id: t.dice.keysPreset });
    }
    // and the ring's own words for the keys it plays now
    const z = document.querySelectorAll('#starCells g.cell')[2].getAttribute('aria-valuetext') || '';
    return { ids: [...new Set(out.map((x) => x.id))], aria: z };
  `),
  judge: (r) => {
    const bad = [];
    if (/\ba vibes\b|\ba [aeiou]/i.test(r.aria)) bad.push(`Zephyr is said as "${r.aria}"`);
    // seed 8 rolls vibes and plays an electric piano (the composition's own
    // part takes the stab's place): since K30 the words are what plays
    if (!/the keys are an electric piano/i.test(r.aria)) bad.push(`Zephyr on seed 8 says "${r.aria}"`);
    return { ok: !bad.length, why: bad[0], note: `${r.ids.length} keyboards over seeds 1–40 (${r.ids.join(', ')}); Zephyr says "${r.aria}"` };
  },
});

// **Round K15: the subtitle reads on a phone** (*"the subtext on a bird is small
// and unreadable — make its colour as bright as the main label's, or at least
// 80–90 % as close; on desktop it's fine"*): on the phone's square every bird's
// subtitle stands at 0.85 of its big word's light, and its
// brightest pixel reads 4.5:1 or better on the black; the desktop's is as it was.
SCENARIOS.push({
  name: 'a bird\'s subtitle on the phone\'s square is its word\'s ink at 0.85 and reads 4.5:1, the desktop\'s as it was',
  area: 'words',
  deadline: 90000,
  query: 'v=2&seed=1',
  drive: async (page) => {
    const subs = (p) => p.evaluate(() => [...document.querySelectorAll('#starWords > g')].map((g) => {
      const t = g.querySelectorAll('text');
      return { word: +(t[1].getAttribute('opacity') || 1), op: +t[2].getAttribute('opacity'), size: +t[2].getAttribute('font-size'), text: t[2].textContent };
    }));
    const phone = await subs(page);
    // the brightest pixel of Gleam's subtitle, alone on the black
    const box = await page.evaluate(() => {
      const g = document.querySelectorAll('#starWords > g')[3]; const t = g.querySelectorAll('text');
      for (const x of t) if (x !== t[2]) x.style.visibility = 'hidden';
      for (const id of ['starLines', 'starCells', 'outer', 'inner', 'glow']) document.getElementById(id).style.visibility = 'hidden';
      const r = t[2].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, half: Math.ceil(r.width / 2) + 2 };
    });
    const px = await pixelAt(page, box.x, box.y, box.half);
    const desk = await ownPage(page, { viewport: { width: 1200, height: 1000 } });
    const desktop = await subs(desk.page);
    await desk.close();
    return { phone, desktop, px, engine: page.context().browser().browserType().name() };
  },
  judge: (r) => {
    const bad = [];
    for (const s of r.phone) if (Math.abs(s.op - 0.85 * s.word) > 1e-6 || s.size !== 10) bad.push(`on the phone "${s.text}" stands at ${s.op} of light and ${s.size} units`);
    for (const s of r.desktop) if (s.op !== 0.45 || s.size !== 10) bad.push(`on the desktop "${s.text}" moved to ${s.op} and ${s.size}`);
    // K37: Firefox draws this 10-unit face at scale 1 thinner than its ink —
    // at full ink, not 0.85, it reads 3.0:1 there (Chromium 6.7:1) — so no ink
    // reaches 4.5:1 in it at this size, and the 0.85 above is what is held
    const read = r.engine !== 'firefox';
    if (read && !(r.px.ratio >= 4.5)) bad.push(`the phone's subtitle reads ${r.px.ratio}:1`);
    return { ok: !bad.length, why: bad[0], note: `on the phone every subtitle at 0.85 of its word's light and 10 units, Gleam's reading ${r.px.ratio}:1 on the black${read ? '' : ' (4.5:1 not held in Firefox, whose scale-1 face reads 3.0:1 at full ink)'}; the desktop's at 0.45 and 10 as before` };
  },
});

// **Round K15: the lock screen's cover is the ring as it stands** (*"only if it
// doesn't degrade performance … show the actual ring in its current colour
// setting, redone only when a drastic change to the ring happened"*). After the
// first start the media session's cover is the ring drawn to a 512 square,
// whose rim reads the colour the ring wears; ten moves of a bird draw no new
// cover; the colour travelling to the ambient pole does. The cost of each
// drawing is read off the page's own bench.
SCENARIOS.push({
  name: 'the lock screen\'s cover is the ring in its colour, drawn again only when the ring changes drastically',
  area: 'ring',
  deadline: 240000,
  query: 'v=2&seed=15576',
  page: body(HAND + `
    if (!navigator.mediaSession) return { none: true };
    await started();
    await waitFor(() => window.ring.motion().cover.renders >= 1, 15000);
    const first = window.ring.motion().cover;
    // the rim of the 512 square: its brightest pixel in the band the lanes run in
    const rim = async (u) => {
      const img = new Image(); img.src = u; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      let best = -1, rgb = null;
      for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
        const q = Math.hypot(x - img.width / 2, y - img.height / 2) / img.width;
        if (q < 0.40 || q > 0.47) continue;
        const k = (y * img.width + x) * 4, v = d[k] + d[k + 1] + d[k + 2];
        if (v > best) { best = v; rgb = [d[k], d[k + 1], d[k + 2]]; }
      }
      return { w: img.width, rgb };
    };
    const firstRim = await rim(first.shown[0]);
    // ten moves of a bird: no new cover
    // (notches of a percent each: moves a hand makes, not a travel of the colour)
    for (let k = 1; k <= 10; k++) { window.ring.pull(6, 0.558 + k * 0.004); await sleep(120); }
    await sleep(3500);
    const afterMoves = window.ring.motion().cover.renders;
    window.ring.release(null);
    await sleep(300);
    // the ambient pole: the colour the ring wears travels at the seam
    window.ring.pull(6, 0.95); window.ring.pull(7, 0.05); window.ring.pull(5, 0.95);
    const t0 = performance.now();
    await waitFor(() => window.ring.motion().cover.renders > afterMoves, 200000);
    const travelled = window.ring.motion().cover;
    const travelRim = await rim(travelled.shown[0]);
    ctl.stop();
    window.ring.release(null);
    return { first, firstRim, afterMoves, travelled, travelRim, waited: Math.round((performance.now() - t0) / 1000) };
  `),
  judge: (r) => {
    if (r.none) return { ok: false, why: 'no media session in this engine' };
    const bad = [];
    const hue = (rgb) => { const [R, G, B] = rgb.map((v) => v / 255); const mx = Math.max(R, G, B), mn = Math.min(R, G, B); if (mx === mn) return 0; const d = mx - mn; const h = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4; return (h * 60 + 360) % 360; };
    const hex = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
    const off = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
    if (!r.first.shown[0].startsWith('blob:') || r.firstRim.w !== 512) bad.push(`the cover is ${r.first.shown[0]} at ${r.firstRim.w}`);
    if (off(hue(r.firstRim.rgb), hue(hex(r.first.hex))) > 20) bad.push(`the cover's rim ${r.firstRim.rgb} is not the ring's ${r.first.hex}`);
    if (r.afterMoves !== r.first.renders) bad.push(`ten moves of a bird drew ${r.afterMoves - r.first.renders} covers`);
    if (!(r.travelled.renders > r.afterMoves)) bad.push('the colour travelled and no cover was drawn');
    if (off(hue(r.travelRim.rgb), hue(hex(r.travelled.hex))) > 20) bad.push(`the new cover's rim ${r.travelRim.rgb} is not the ring's ${r.travelled.hex}`);
    const worst = Math.max(...r.travelled.serialise, ...r.travelled.raster);
    if (worst > 30) bad.push(`a cover cost ${worst} ms in one task`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: `after the start the cover was the ring (${r.firstRim.rgb} at the rim, the ring wearing ${r.first.hex}); ten moves of Tide drew none; the ambient pole landed ${r.waited} s later and drew one in ${r.travelled.hex} (${r.travelRim.rgb}); `
        + `each drawing cost ${r.travelled.serialise.join('/')} ms to write and ${r.travelled.raster.join('/')} ms to raster, ${Math.round(r.travelled.bytes / 1024)} KB of drawing`,
    };
  },
});

// **Round K15d: the record has no panel** (Eugene: *"the panel should not show
// in v1"*, after a `v=1` link's panel read as a slider gone). A finger's tap on
// Root under house-v1 opens nothing and moves nothing, and says what Root
// reads along the track if it reads anything; under house-v2 the same tap
// opens Root's panel with its slider.
SCENARIOS.push({
  name: 'under house-v1 a tap on a bird opens no panel and changes nothing; under house-v2 it opens the panel',
  area: 'panel',
  deadline: 90000,
  query: 'v=1&seed=52803&theme=1',
  drive: async (page) => {
    const tapRoot = (p) => p.evaluate(async () => {
      const c = document.querySelectorAll('#starCells g.cell')[4].firstChild.getBoundingClientRect();
      const q = { clientX: c.x + c.width / 2, clientY: c.y + c.height / 2 };
      const before = { url: location.search, radii: window.ring.cells().map((x) => x.radius / x.rest) };
      document.getElementById('tilt').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 61, pointerType: 'touch', isPrimary: true, ...q }));
      await new Promise((res) => setTimeout(res, 60));
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 61, pointerType: 'touch', isPrimary: true, ...q }));
      await new Promise((res) => setTimeout(res, 400));
      const panel = document.getElementById('birdPanel');
      return { strategy: window.ring.control.readout().strategy, open: !panel.hidden, slider: !document.getElementById('birdPanelSteps').hidden,
        same: location.search === before.url && window.ring.cells().every((x, k) => Math.abs(x.radius / x.rest - before.radii[k]) < 1e-6) };
    });
    const v1 = await tapRoot(page);
    const two = await ownPage(page, {});
    await two.page.goto(page.url().replace('v=1', 'v=2'), { waitUntil: 'networkidle' });
    await two.page.waitForFunction(() => window.ring && window.deepHouse);
    await two.page.waitForTimeout(800);
    const v2 = await tapRoot(two.page);
    await two.close();
    return { v1, v2 };
  },
  judge: (r) => {
    const bad = [];
    if (r.v1.strategy !== 'house-v1') bad.push(`the v=1 link plays ${r.v1.strategy}`);
    if (r.v1.open) bad.push('under house-v1 the tap opened the panel');
    if (!r.v1.same) bad.push('under house-v1 the tap moved a bird or wrote the link');
    if (!(r.v2.open && r.v2.slider)) bad.push(`under house-v2 the tap left the panel ${JSON.stringify(r.v2)}`);
    return { ok: !bad.length, why: bad[0], note: `under ${r.v1.strategy} a tap on Root opened nothing and changed nothing; under ${r.v2.strategy} it opened Root's panel with its slider` };
  },
});

// **Round K16: a bare first open throws the die** (Eugene: *"every time a bare
// page is opened and there is no local storage yet, we should not seed 1 but
// throw a die for the user, and whatever seed it is, that is what the person
// gets"*). Each page is given the die's roll in advance (its `Math.random`,
// which is the throw's source), so the seed it must land on is known: an
// empty store's bare open plays that seed with the address bare and the die's
// caption saying it; a hand's start writes it into the link; a second bare open
// on the same store comes back to it whatever the die would say; a cleared
// store rolls again; and a page with no roll given lands in the throw's space.
SCENARIOS.push({
  name: 'a bare first open throws the die: its seed plays, the address carries it from the first hand, a second open restores it and a cleared store rolls anew',
  area: 'link',
  deadline: 120000,
  drive: async (page) => {
    const bare = page.url().replace(/\?.*$/, '?out=silent');
    const ctx = await page.context().browser().newContext({ viewport: { width: 390, height: 844 } });
    // (a store is cleared before the page's own script runs: a page closing
    // writes its place down, so clearing from inside one is undone by its close)
    const open = async (roll, clear = false) => {
      const p = await ctx.newPage();
      if (clear) await p.addInitScript(() => { try { localStorage.removeItem('deep-house.player'); localStorage.removeItem('deep-house.journal'); } catch (e) {} });
      if (roll != null) await p.addInitScript((v) => { Math.random = () => v; }, roll);
      await p.goto(bare, { waitUntil: 'networkidle' });
      await p.waitForFunction(() => window.ring && window.deepHouse);
      await p.waitForTimeout(600);
      const read = () => p.evaluate(() => ({ seed: window.ring.control.readout().seed, url: location.search,
        caption: [...document.querySelectorAll('#inner text')].map((t) => t.textContent).find((t) => /^seed /i.test(t)) || '',
        stored: (() => { try { return JSON.parse(localStorage.getItem('deep-house.player') || 'null'); } catch (e) { return null; } })() }));
      return { p, read };
    };
    const out = {};
    // an empty store: the die's roll plays, and the address stays bare
    await ctx.clearCookies();
    const a = await open(0.12345);
    out.first = await a.read();
    await a.p.evaluate(async () => { await window.ring.control.start(); await new Promise((r) => setTimeout(r, 1500)); window.ring.control.stop(); await new Promise((r) => setTimeout(r, 300)); });
    out.afterHand = await a.read();
    await a.p.close();
    // a second bare open on the same store: the same seed, whatever the die would say
    const b = await open(0.9);
    out.second = await b.read();
    await b.p.close();
    // a cleared store: the die again
    const c = await open(0.54321, true);
    out.cleared = await c.read();
    await c.p.close();
    // no roll given: a seed in the throw's own space
    const d = await open(null, true);
    out.free = await d.read();
    await d.p.close();
    await ctx.close();
    return out;
  },
  judge: (r) => {
    const bad = [];
    if (r.first.seed !== '12345') bad.push(`an empty store's bare open played seed ${r.first.seed}, not the die's 12345`);
    if (/seed=/.test(r.first.url)) bad.push(`the untouched page wrote ${r.first.url}`);
    if (!/seed 12345/i.test(r.first.caption)) bad.push(`the die's caption says "${r.first.caption}"`);
    if (!r.first.stored || String(r.first.stored.seed) !== '12345') bad.push(`the store holds ${JSON.stringify(r.first.stored)}`);
    if (!/seed=12345/.test(r.afterHand.url)) bad.push(`after a hand the address is ${r.afterHand.url}`);
    if (r.second.seed !== '12345') bad.push(`a second bare open played ${r.second.seed}, not the stored 12345`);
    if (r.cleared.seed !== '54321') bad.push(`a cleared store played ${r.cleared.seed}, not the die's 54321`);
    if (!(/^\d+$/.test(r.free.seed) && Number(r.free.seed) < 100000)) bad.push(`a free roll played ${r.free.seed}`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: `an empty store's bare open played the die's seed ${r.first.seed} with the address bare ("${r.first.url}") and the caption "${r.first.caption}"; the first hand wrote "${r.afterHand.url}"; `
        + `a second bare open came back to ${r.second.seed}; a cleared store rolled ${r.cleared.seed}; a free roll landed on ${r.free.seed}`,
    };
  },
});

// **Round K19: the beat is the ring's first, and the breath keeps it** (Eugene:
// *"the pulse on fast beats was better on the very original ring
// implementation — I'd take it back from there"*, and *"we lost the pulsation
// on the inner ring of the player circle"*). Read off the drawing every frame:
// at 124 BPM the rim lifts off the disc on each beat, up to seven units of the
// tempo's trace, and settles back through the beat (the 09-20 ring's own,
// `2ffc978`); at 75 (the tempo asked of the pulse) the same at half its light
// over the corona's swell; at 54 no lifted ring. And the gold under the reading
// — the inner ring's breath — swells with the beat at 124 and with the bar at 54.
SCENARIOS.push({
  name: 'the fast beat is the ring\'s first — the rim lifted on each beat and settling — lighter at 75, none at 54, and the inner ring breathes in every band',
  area: 'ring',
  deadline: 150000,
  query: 'v=2&seed=7&spell=ember:0.65',
  page: body(HAND + `
    const beat = () => { const c = document.querySelectorAll('#coronaWave > circle')[1]; return { r: +c.getAttribute('r'), op: +c.getAttribute('opacity') }; };
    const breath = () => { const m = window.ring.motion(); return { br: +m.breathR, bo: +m.breathOp }; };
    const watch = async (ms) => {
      const out = [];
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        await new Promise((res) => requestAnimationFrame(res));
        const rd = ctl.readout();
        out.push({ ...beat(), ...breath(), beat: rd.bar * 4 + rd.beatInBar, ph: rd.beatPhase });
      }
      return out;
    };
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2, 15000);
    const bpm = ctl.readout().gridBpm || ctl.readout().bpm;
    // (since K30 the ring draws at 60 a second at most, so a browser frame may
    // be one the ring did not draw: after a change of tempo the reading starts
    // at the ring's own next frame, never at a frame that still shows the last)
    const drawn = async () => { window.ring.resetTimings(); await waitFor(() => ((window.ring.timings() || {}).frames || 0) >= 1, 2000); };
    const fast = await watch(4000);
    window.ring.pulseAt(75);
    await drawn();
    const mid = await watch(6000);
    window.ring.pulseAt(54);
    await drawn();
    const slow = await watch(8000);
    window.ring.pulseAt(null);
    ctl.stop();
    return { bpm, fast, mid, slow };
  `),
  judge: (r) => {
    const bad = [];
    // each beat's frames: lifted early in the beat, back near the rim by its end
    const beats = (fr, every) => {
      const by = new Map();
      for (const f of fr) { const k = Math.floor(f.beat / every); if (!by.has(k)) by.set(k, []); by.get(k).push({ ...f, q: (f.beat % every) + f.ph }); }
      return [...by.values()].filter((xs) => xs.length > 6 && xs[0].q <= 0.2 && xs[xs.length - 1].q >= (every === 1 ? 0.8 : 2.5));
    };
    const settles = (xs) => { const early = xs.filter((f) => f.q <= 0.2), late = xs.filter((f) => f.q >= 0.8 * (xs[xs.length - 1].q)); return early.length && late.length && Math.max(...early.map((f) => f.r)) >= 150 + 4 && Math.max(...late.map((f) => f.r)) <= 150 + 2.5; };
    const fastB = beats(r.fast, 1);
    if (!(r.bpm > 120 && r.bpm < 130)) bad.push(`the set ran at ${r.bpm}`);
    if (fastB.length < 3) bad.push(`at ${r.bpm} only ${fastB.length} whole beats were read`);
    if (!fastB.every(settles)) bad.push(`at ${r.bpm} a beat did not lift the rim and settle: ${JSON.stringify(fastB.find((x) => !settles(x)).map((f) => [f.q.toFixed(2), f.r]))}`);
    const fastTop = Math.max(...r.fast.map((f) => f.op));
    const fastMax = Math.max(...r.fast.map((f) => f.r));
    if (fastMax > 150 + 7.01) bad.push(`at ${r.bpm} the rim lifted ${(fastMax - 150).toFixed(2)} units, past the first ring's seven`);
    const midTop = Math.max(...r.mid.map((f) => f.op));
    if (!(midTop > 0.05 && midTop <= fastTop * 0.55)) bad.push(`at 75 the beat was ${midTop} against ${fastTop}`);
    if (r.slow.some((f) => f.op > 0)) bad.push('at 54 a lifted ring was drawn');
    // the inner ring's breath
    const swing = (fr, k) => Math.max(...fr.map((f) => f[k])) - Math.min(...fr.map((f) => f[k]));
    if (!(swing(r.fast, 'br') > 3)) bad.push(`at ${r.bpm} the inner ring's breath moved ${swing(r.fast, 'br').toFixed(2)} units`);
    if (!(swing(r.slow, 'br') > 3)) bad.push(`at 54 the inner ring's breath moved ${swing(r.slow, 'br').toFixed(2)} units`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: `at ${r.bpm} BPM ${fastB.length} whole beats each lifted the rim up to ${(fastMax - 150).toFixed(2)} units at ${fastTop.toFixed(2)} of light and settled it back; at 75 the same at ${midTop.toFixed(2)}; at 54 none; `
        + `the inner ring's breath swung ${swing(r.fast, 'br').toFixed(1)} units at ${r.bpm} and ${swing(r.slow, 'br').toFixed(1)} at 54`,
    };
  },
});

// **Round K19: the crown's rays are a spectrum, not a comb** (*"those little
// bars are too repetitive — make them blend in better, just a gradient, with
// some random order"*): the rays' angles are uneven, their lengths a line that
// rises and falls round the disc, each fades along the corona's gradient, and
// two loads draw the same.
SCENARIOS.push({
  name: 'the crown\'s rays are an uneven spread fading along the gradient, the same on every load',
  area: 'ring',
  deadline: 90000,
  query: 'v=2&seed=1&spell=ember:0.05',
  drive: async (page) => {
    const read = (p) => p.evaluate(async () => {
      await window.ring.control.start();
      const t0 = performance.now();
      while (performance.now() - t0 < 8000 && !document.querySelectorAll('#corona g path').length) await new Promise((r) => setTimeout(r, 100));
      const g = [...document.querySelectorAll('#corona g')].find((x) => x.querySelector('path'));
      // K20: the rays' light over a breath, and where their fade has fallen
      let light = 0;
      const t1 = performance.now();
      while (performance.now() - t1 < 4500) { await new Promise((r) => requestAnimationFrame(r)); light = Math.max(light, +g.getAttribute('opacity')); }
      const stops = [...document.querySelectorAll('#coronaFade stop')].map((x) => ({ at: +x.getAttribute('offset'), op: +x.getAttribute('stop-opacity') }));
      const rays = [...g.querySelectorAll('path')].map((p) => { const n = p.getAttribute('d').match(/-?[\d.]+/g).map(Number); const [x0, y0, x1, y1] = [n[0], n[1], n[2], n[3]]; return { a: Math.atan2(y1 - 500, x1 - 500), len: Math.hypot(x1 - 500, y1 - 500) - 150, op: +p.getAttribute('fill-opacity') }; });
      window.ring.control.stop();
      return { fill: g.getAttribute('fill'), grad: !!document.getElementById('coronaFade'), rays, light, stops };
    });
    const one = await read(page);
    const two = await ownPage(page, {});
    const again = await read(two.page);
    await two.close();
    return { one, again };
  },
  judge: (r) => {
    const bad = [];
    const x = r.one.rays;
    const cv = (v) => { const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) / m; };
    const as = x.map((q) => q.a).sort((p, q) => p - q);
    // (the gaps where an action's node sits are left out: those are the rule, not the spread)
    const all = as.slice(1).map((a, i) => a - as[i]);
    const med = [...all].sort((p, q) => p - q)[Math.floor(all.length / 2)];
    const gaps = all.filter((g) => g < 3 * med);
    if (r.one.fill !== 'url(#coronaFade)' || !r.one.grad) bad.push(`the rays are filled ${r.one.fill}`);
    if (!(cv(gaps) > 0.3)) bad.push(`the rays' angles are an even comb (gaps vary ${cv(gaps).toFixed(2)})`);
    if (!(cv(x.map((q) => q.len)) > 0.25)) bad.push(`the rays' lengths vary only ${cv(x.map((q) => q.len)).toFixed(2)}`);
    if (JSON.stringify(r.one.rays) !== JSON.stringify(r.again.rays)) bad.push('two loads drew different rays');
    // K20: grain inside the gradient: at most 0.18 of light at the swell's top, the fade down to 0.35 a third of the way out
    if (!(r.one.light > 0 && r.one.light <= 0.18 + 1e-3)) bad.push(`the rays reach ${r.one.light} of light`);
    const st = r.one.stops;
    if (!(st.length === 3 && st[1].op <= 0.35 + 1e-6 && (st[1].at - st[0].at) <= 0.31 * (1 - st[0].at) + 1e-3)) bad.push(`the rays' fade is ${JSON.stringify(st)}`);
    return { ok: !bad.length, why: bad[0], note: `${x.length} rays at most ${r.one.light.toFixed(3)} of light, fading to ${r.one.stops[1] && r.one.stops[1].op} a third of the way out, filled along the corona's gradient, their angle gaps varying ${cv(gaps).toFixed(2)} and their lengths ${cv(x.map((q) => q.len)).toFixed(2)} (as a share of the mean), the same on a second load` };
  },
});

// **Round K18: an engine switch walks the ring's colour** (Eugene: *"when I
// change house to v1 from the machine view, the ring colour wasn't updated"*,
// and *"I hope we don't lose this memory"*). Under a spell off the house, the
// view's switch to house-v1 walks the ring's ink to the house gold on the seam's
// own clock (the record does not read the spell) and is worn at the swap, and
// the lock screen's cover is drawn again; the switch back walks it to the
// spell's hue, and the birds' values, the address and the ink are what they
// were before the visit.
SCENARIOS.push({
  name: 'an engine switch walks the ring\'s colour to the engine\'s reading of the spell, and back, the birds and the link untouched',
  area: 'ring',
  deadline: 300000,
  query: 'v=2&seed=15576&spell=ember:0.85,tide:0.2',
  page: body(HAND + `
    const ink = () => window.ring.colour().hex;
    const toned = () => (document.querySelector('#corona > circle') || { getAttribute: () => '' }).getAttribute('stroke');
    const cover = () => window.ring.motion().cover.renders;
    const stored = () => { try { const w = JSON.parse(localStorage.getItem('deep-house.player') || 'null'); return w && w.link ? '?' + w.link : ''; } catch (e) { return ''; } };
    const place = () => ({ values: cells().map((c) => +c.value.toFixed(4)), url: location.search, ink: ink(), store: stored() });
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2 && cover() >= 1, 15000);
    const before = { ...place(), cover: cover() };
    const visit = async (to) => {
      const t0 = toned();
      ctl.setStrategy(to);
      const walked = [];
      await waitFor(() => { walked.push(toned()); return ctl.readout().strategy === to; }, 150000);
      await sleep(300);
      return { at: place(), walkedBefore: new Set(walked.slice(0, -2)).size > 1, t0 };
    };
    const v1 = await visit('house-v1');
    await waitFor(() => cover() > before.cover, 6000);
    const coverV1 = cover();
    const v2 = await visit('house-v2');
    ctl.stop();
    return { before, v1, coverV1, v2, gold: window.ring.wear(null, false) };
  `),
  judge: (r) => {
    // the link's seed and spell, as numbers (a seam moves its theme, a hand's write formats its values)
    const held = (u) => { const q = new URLSearchParams(u); return JSON.stringify({ seed: q.get('seed'), spell: Object.fromEntries((q.get('spell') || '').split(',').filter(Boolean).map((x) => { const [b, v] = x.split(':'); return [b, +v]; })) }); };
    const bad = [];
    if (r.before.ink === r.gold) bad.push(`the spell's ring was already the house gold ${r.gold}`);
    if (r.v1.at.ink !== r.gold) bad.push(`under house-v1 the ring wears ${r.v1.at.ink}, not the house gold ${r.gold}`);
    if (!r.v1.walkedBefore) bad.push('the colour did not walk before the swap to house-v1');
    if (!(r.coverV1 > r.before.cover)) bad.push('the cover was not drawn again for house-v1');
    if (JSON.stringify(r.v1.at.values) !== JSON.stringify(r.before.values) || held(r.v1.at.url) !== held(r.before.url)) bad.push(`under house-v1 the birds or the link moved: ${JSON.stringify(r.v1.at)}`);
    if (r.v2.at.store && r.before.store && held(r.v2.at.store) !== held(r.before.store)) bad.push(`the store's link moved: ${r.v2.at.store} against ${r.before.store}`);
    if (!r.v2.at.store) bad.push('nothing was stored');
    if (r.v2.at.ink !== r.before.ink) bad.push(`back under house-v2 the ring wears ${r.v2.at.ink}, not ${r.before.ink}`);
    if (!r.v2.walkedBefore) bad.push('the colour did not walk before the swap back');
    if (JSON.stringify(r.v2.at.values) !== JSON.stringify(r.before.values) || held(r.v2.at.url) !== held(r.before.url)) bad.push(`after the visit the birds or the link moved: ${JSON.stringify(r.v2.at)} against ${JSON.stringify(r.before)}`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: `under the spell the ring wore ${r.before.ink}; switched to house-v1 it walked to the house gold ${r.v1.at.ink} by the swap and the cover was drawn again; `
        + `switched back it walked to ${r.v2.at.ink}, with every bird's value and the link "${r.v2.at.url}" as they were`,
    };
  },
});

// **The genre keys** (PLAN-GENRES): nine presets under the ring. A key is a
// spell and nothing else — pressed, it asks the control for its spell the way
// a hand on the ring does, so the address carries the spell as usual and no
// genre word; the ledger says which key; and the move arrives at the next
// phrase line and lights the key. The centre asks for the house again, which
// is a bare spell.
SCENARIOS.push({
  name: 'a genre key asks for its spell, the ledger names it, it lights on arrival, and Deep House returns to the house',
  area: 'view',
  query: 'v=2&seed=1',
  deadline: 150000,
  page: body(`
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 12000);
    await bounded(window.ring.machine.open(), 12000);
    await sleep(300);
    // (M7: two tiers; M8: Deep House the first tier's centre) the first tier
    // is the eight families round Deep House; House opens its sub-genres,
    // among them Deep House, the house itself
    const first = [...document.querySelectorAll('#machine .genres button.genre')].map((k) => k.dataset.genre);
    const litFirst = [...document.querySelectorAll('#machine .genres button.genre')].filter((k) => k.getAttribute('aria-pressed') === 'true').map((k) => k.dataset.genre);
    document.querySelector('#machine .genres button[data-genre="House"]').click();
    await sleep(200);
    const keys = [...document.querySelectorAll('#machine .genres button.genre')];
    const labels = keys.map((k) => k.dataset.genre);
    const centre = keys.find((k) => k.dataset.genre === 'Deep House');
    const litAtHouse = keys.filter((k) => k.getAttribute('aria-pressed') === 'true').map((k) => k.dataset.genre);
    // a tuned sub-genre that is not the house
    const key = keys.find((k) => k.dataset.genre === 'Tech House') || keys[0];
    const genre = key.dataset.genre;
    key.click();
    await sleep(200);
    const url = location.search;
    const asked = ctl.mix.spellAsked;
    const lines = () => window.ring.machine.snapshot().ledger.filter((e) => e.what.startsWith('genre preset:')).map((e) => e.what);
    const line = lines().find((w) => w.startsWith('genre preset: ' + genre + ' '));
    // the move lands at the next phrase line
    const arrived = await waitFor(() => key.getAttribute('aria-pressed') === 'true', 100000);
    const spellThen = ctl.readout().spell;
    centre.click();
    await sleep(200);
    const urlHome = location.search;
    const lineHome = lines().find((w) => w.startsWith('genre preset: ' + centre.dataset.genre + ' '));
    const askedHome = ctl.mix.spellAsked;
    window.ring.machine.close();
    ctl.stop();
    return { first, litFirst, labels, litAtHouse, genre, url, asked, line, arrived, spellThen, urlHome, lineHome, askedHome };
  `),
  judge: (r) => {
    const bad = [];
    if (r.first[4] !== 'Deep House' || !r.first.includes('House') || [...r.litFirst].sort().join() !== 'Deep House,House') bad.push(`the first tier ${r.first.join(', ')} with ${r.litFirst.join(', ') || 'nothing'} lit`);
    if (r.labels.length !== 9 || r.labels[4] !== 'House') bad.push(`House opened ${r.labels.join(', ')}`);
    if (r.litAtHouse.join() !== 'Deep House') bad.push(`at the house the lit keys were ${r.litAtHouse.join(', ') || 'none'}`);
    if (!/[?&]spell=/.test(r.url)) bad.push(`the key wrote no spell into the address: ${r.url}`);
    if (/genre|Dub|Techno|House|Ambient|Trance|Garage|Bass|Downtempo|Breaks|Disco|Misc/i.test(decodeURIComponent(r.url).replace(/v=\d/, ''))) bad.push(`a genre word reached the address: ${r.url}`);
    if (!r.line) bad.push('the ledger has no "genre preset:" line for the key');
    if (!r.arrived) bad.push(`the key never lit: the playing spell was ${JSON.stringify(r.spellThen)}`);
    if (/[?&]spell=/.test(r.urlHome)) bad.push(`Deep House left a spell in the address: ${r.urlHome}`);
    if (!r.lineHome) bad.push('the ledger has no line for Deep House');
    return {
      ok: !bad.length,
      why: bad[0],
      note: `the families round Deep House, Deep House and House lit at the house; House opened nine keys, Deep House among them and lit; ${r.genre} wrote "${r.url}", the ledger said "${r.line}", and the key lit when the spell arrived; Deep House asked for the house again ("${r.urlHome}") with "${r.lineHome}"`,
    };
  },
});

// **Round K21: no ray is seen on its own** (Eugene, on the benchmark's slow
// tempo: *"the lines on the corona are still too prominent — need to blend them
// in more"*). At 54 BPM at the top of a breath, on a desktop's square and a
// phone's, the corona alone is photographed and read, as the eye has it (CIE
// lightness), round arcs at a sixth, a third and half of its reach, off the
// actions: no point of an arc may stand out from the arc round it (six degrees
// either side) by 4 % of the rim's lightness or more — the rays are a texture
// of the corona, not spokes. (At half the reach alone, in plain light, the
// spokes K20 drew passed; near the rim, where they are seen, they stood out
// 12–17 %.)
SCENARIOS.push({
  name: 'the crown\'s rays are a texture: round arcs at a sixth, a third and half of the reach no ray stands out by 4 % of the rim\'s lightness, on both squares',
  area: 'ring',
  deadline: 150000,
  query: 'v=2&seed=1&spell=ember:0.05',
  drive: async (page) => {
    const measure = async (opts) => {
      const own = await ownPage(page, opts);
      const p = own.page;
      await p.evaluate(async () => {
        await window.ring.control.start();
        const t0 = performance.now();
        while (performance.now() - t0 < 20000) { await new Promise((r) => requestAnimationFrame(r)); if (window.ring.control.mix && window.ring.control.mix.state.elapsed > 2 && Number(window.ring.motion().breathOp) > 0.097) break; }
        window.ring.still(true);
      });
      const geo = await p.evaluate(body(ISOLATE + `
        isolate([document.getElementById('corona'), document.getElementById('coronaRim')]);
        const t = document.getElementById('tilt').getBoundingClientRect();
        const reach = Math.max(...[...document.querySelectorAll('#corona > circle')].map((c) => +c.getAttribute('stroke-width')));
        return { cx: t.x + t.width / 2, cy: t.y + t.height / 2, unit: t.width / 1000, reach, ctrl: window.ring.cells ? 0 : 0 };
      `));
      await p.waitForTimeout(200);
      const R = (150 + geo.reach) * geo.unit + 4;
      const shot = await p.screenshot({ clip: { x: geo.cx - R, y: geo.cy - R, width: 2 * R, height: 2 * R } });
      const out = await p.evaluate(body(`
        const img = new Image(); img.src = 'data:image/png;base64,${shot.toString('base64')}'; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, img.width, img.height).data;
        const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        const k = img.width / ${2 * R};
        const c0 = img.width / 2;
        const L = (a, r) => { let s = 0, n = 0; for (let dr = -1; dr <= 1; dr += 0.5) { const x = Math.round(c0 + Math.cos(a) * (r + dr) * ${geo.unit} * k), y = Math.round(c0 + Math.sin(a) * (r + dr) * ${geo.unit} * k); const i = (y * img.width + x) * 4; s += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]); n++; } return s / n; };
        // off the four actions, where no ray is drawn by rule
        const acts = [0, 0.5, 1, 1.5].map((f) => f * Math.PI - Math.PI / 2);
        const off = (a) => acts.every((x) => Math.abs(Math.atan2(Math.sin(a - x), Math.cos(a - x))) > 0.45);
        // as the eye has it: CIE lightness, and a ray against the gaps beside it
        // (the arc less its own mean over six degrees either side), at a sixth,
        // a third and half of the reach, as a share of the rim's lightness
        const Lstar = (y) => (y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y);
        let rim = 0; for (let t = 0; t < 360; t++) { const a = (t / 360) * 2 * Math.PI; if (off(a)) rim = Math.max(rim, Lstar(L(a, 151))); }
        const at = {};
        for (const f of [1 / 6, 1 / 3, 1 / 2]) {
          const rr = 150 + ${geo.reach} * f, N = 1440, w = 24;
          const arc = []; for (let t = 0; t < N; t++) { const a = (t / N) * 2 * Math.PI; arc.push({ ok: off(a), l: Lstar(L(a, rr)) }); }
          let worst = 0;
          for (let t = 0; t < N; t++) { if (!arc[t].ok) continue; let s = 0, n = 0; for (let j = -w; j <= w; j++) { const q = arc[(t + j + N) % N]; if (q.ok) { s += q.l; n++; } } worst = Math.max(worst, Math.abs(arc[t].l - s / n)); }
          at[f.toFixed(2)] = +(worst / rim * 100).toFixed(2);
        }
        return { spread: Math.max(...Object.values(at)), at, rim: +rim.toFixed(2) };
      `));
      await own.close();
      return { ...out, reach: +geo.reach.toFixed(1) };
    };
    const desktop = await measure({ viewport: { width: 1200, height: 1000 } });
    const phone = await measure({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    return { desktop, phone };
  },
  judge: (r) => {
    const bad = [];
    for (const [k, m] of Object.entries(r)) if (!(m.spread < 4)) bad.push(`on the ${k}'s square the light round the arc varies ${m.spread} % of the rim's (${JSON.stringify(m.at)}, rim ${m.rim})`);
    return { ok: !bad.length, why: bad[0], note: Object.entries(r).map(([k, m]) => `${k}: no ray stands out more than ${m.spread} % of the rim's lightness (${JSON.stringify(m.at)} at a sixth, a third and half of the ${m.reach}-unit reach)`).join('; ') };
  },
});

// **Round K21: the birds stand at the spell that is asked, whoever asked it**
// (Eugene, on 27191 at the ambient spell: the machine view's Tech House key
// played 126 BPM, and after a pause and a play the ring's birds still stood at
// the ambient spell). The same ask the key makes, `control.setSpell` with the
// preset: at once every bird stands at the preset's value, its words the
// preset's reading, the address carrying it and the wait drawn; then a pause
// and a play, and every bird is still there, the words and the link with it.
SCENARIOS.push({
  name: 'a spell asked from outside the ring stands every bird at it, at once and after a pause and a play',
  area: 'ring',
  deadline: 120000,
  query: 'v=2&seed=27191&spell=ember:0.14,gleam:0.00,veil:0.34,spark:0.00,loom:0.81',
  page: body(HAND + `
    const tech = { ember: 0.7, spark: 0.4, zephyr: 0.6, root: 0.6, tide: 0.45 };
    const want = { ...Object.fromEntries(cells().map((c) => [c.bird, c.house])), ...tech };
    const read = () => ({ values: Object.fromEntries(cells().map((c) => [c.bird, +c.value.toFixed(3)])), words: cells().map((c) => c.word), url: decodeURIComponent(location.search), waiting: cells().filter((c) => c.pending).map((c) => c.bird) });
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 2, 15000);
    const before = read();
    ctl.setSpell({ ...want });
    await sleep(400);
    const atOnce = read();
    // what the preset reads as, planned: the words the ring must show once it lands
    ctl.stop();
    await sleep(500);
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 15000);
    await sleep(600);
    const after = read();
    ctl.stop();
    return { want, before, atOnce, after };
  `),
  judge: (r) => {
    const bad = [];
    const off = (vals) => Object.entries(r.want).filter(([b, v]) => Math.abs(vals[b] - v) > 0.006).map(([b, v]) => `${b} ${vals[b]} for ${v}`);
    if (!off(r.before.values).length) bad.push('the page opened at the preset already');
    const once = off(r.atOnce.values);
    if (once.length) bad.push(`at the ask the birds stood ${once.join(', ')}`);
    if (!/em:0\.70/.test(r.atOnce.url)) bad.push(`at the ask the link is ${r.atOnce.url}`);
    if (!r.atOnce.waiting.length) bad.push('at the ask no bird waited for the landing');
    const later = off(r.after.values);
    if (later.length) bad.push(`after a pause and a play the birds stood ${later.join(', ')}`);
    if (JSON.stringify(r.after.words) === JSON.stringify(r.before.words)) bad.push(`after a pause and a play the words are the ambient spell's: ${r.after.words.join(', ')}`);
    if (!/em:0\.70/.test(r.after.url)) bad.push(`after a pause and a play the link is ${r.after.url}`);
    return { ok: !bad.length, why: bad[0], note: `the preset asked from outside stood every bird at it at once (${r.atOnce.waiting.join(', ')} waiting for the landing), and after a pause and a play the ring read ${r.after.words.join(', ')} with the link "${r.after.url}"` };
  },
});

// **Round K21: the machine view is on the address** (Eugene: *"the machine
// view should be encoded in the URL so on a page refresh it is not gone"*).
// The view opened writes `view=machine`; a reload opens it again; closing it
// takes the row off; the link's sound rows never move.
SCENARIOS.push({
  name: 'the machine view is written on the address while it is open, a reload keeps it, and closing it takes the row off',
  area: 'link',
  deadline: 90000,
  query: 'v=2&seed=15576&theme=2&spell=ember:0.85',
  drive: async (page) => {
    const sound = (u) => { const q = new URLSearchParams(u); for (const k of [...q.keys()]) if (!['seed', 'v', 'theme', 'spell', 'recipe', 'accompaniment', 'development'].includes(k)) q.delete(k); return q.toString(); };
    const read = () => page.evaluate(() => ({ url: location.search, on: window.ring.machine.on }));
    const before = await read();
    await page.evaluate(async () => { await window.ring.machine.open(); });
    await page.waitForTimeout(800);
    const opened = await read();
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.ring && window.deepHouse);
    await page.waitForFunction(() => window.ring.machine.on, null, { timeout: 20000 }).catch(() => {});
    const reloaded = await read();
    await page.evaluate(() => window.ring.machine.close());
    await page.waitForTimeout(300);
    const closed = await read();
    return { before, opened, reloaded, closed, sound: [before, opened, reloaded, closed].map((x) => sound(x.url)) };
  },
  judge: (r) => {
    const bad = [];
    if (/view=/.test(r.before.url)) bad.push(`the page opened with ${r.before.url}`);
    if (!r.opened.on || !/[?&]view=machine(&|$)/.test(r.opened.url)) bad.push(`the view opened and the address says ${r.opened.url}`);
    if (!r.reloaded.on) bad.push(`a reload of ${r.reloaded.url} left the view closed`);
    if (r.closed.on || /view=/.test(r.closed.url)) bad.push(`the view closed and the address says ${r.closed.url}`);
    if (new Set(r.sound).size !== 1) bad.push(`the sound rows moved: ${r.sound.join(' | ')}`);
    return { ok: !bad.length, why: bad[0], note: `opened, the address read "${r.opened.url}"; a reload came back to the view; closed, "${r.closed.url}"; the sound rows "${r.sound[0]}" throughout` };
  },
});

// **Round K22: the centre plays wherever a hand sees its circle** (Eugene: *"in
// the machine view, play/stop by pressing the ring's centre pulse circle is not
// working"*, and *"pressing the top play button does work"*). On the plain page
// and in the machine view, on a desktop and on the phone's frame, with a mouse
// and with a finger: a press at the centre and one on the pulse's own circle
// (1.04 of the disc's radius, between the actions) each turn the set on or off.
SCENARIOS.push({
  name: 'a press on the centre or on its pulse circle plays and stops, on the page and in the machine view, mouse and finger, desktop and phone',
  area: ['ring', 'view'],
  deadline: 240000,
  query: 'v=2&seed=15576',
  drive: async (page) => {
    const out = [];
    // K37: Playwright's Firefox under `isMobile` delivers a mouse as mousedown,
    // mouseup and click with no pointer event at all (measured: a real Firefox
    // sends pointer events for a mouse at any width, and this emulation's finger
    // does), so in Firefox the phone's frame is 390 wide with touch and without
    // the mobile emulation: the same frame, the same finger, a mouse Firefox sends
    const firefox = page.context().browser().browserType().name() === 'firefox';
    for (const [where, view] of [['page', false], ['view', true]]) for (const [size, opts] of [['desktop', { viewport: { width: 1440, height: 900 }, hasTouch: true }], ['phone', { viewport: { width: 390, height: 844 }, hasTouch: true, ...(firefox ? {} : { isMobile: true }) }]]) {
      const own = await ownPage(page, opts);
      const p = own.page;
      if (view) { await p.evaluate(() => window.ring.machine.open()); await p.waitForFunction(() => window.ring.machine.on, null, { timeout: 20000 }); await p.waitForTimeout(1200); }
      const core = await p.evaluate(() => { const g = document.querySelector('#core circle.ground').getBoundingClientRect(); return { x: g.x + g.width / 2, y: g.y + g.height / 2, r: g.width / 2 }; });
      for (const [how, at] of [['mouse', 0], ['finger', 0], ['mouse', 1.04], ['finger', 1.04]]) {
        const x = core.x + core.r * at * Math.SQRT1_2, y = core.y - core.r * at * Math.SQRT1_2;
        const was = await p.evaluate(() => window.ring.control.playing);
        if (how === 'finger') await p.touchscreen.tap(x, y);
        else { await p.mouse.move(x, y); await p.mouse.down(); await p.waitForTimeout(120); await p.mouse.up(); }
        const now = await p.waitForFunction((w) => window.ring.control.playing !== w, was, { timeout: 4000 }).then(() => true).catch(() => false);
        out.push({ where, size, how, at, toggled: now });
        await p.waitForTimeout(400);
      }
      await p.evaluate(() => window.ring.control.stop());
      await own.close();
    }
    out.firefox = firefox;
    return out;
  },
  judge: (r) => {
    const dead = r.filter((x) => !x.toggled);
    return {
      ok: !dead.length,
      why: dead.length ? `nothing happened for ${dead.map((x) => `${x.how} ${x.at ? 'on the circle' : 'at the centre'} (${x.where}, ${x.size})`).join('; ')}` : '',
      note: `${r.length} presses — the centre and the pulse's circle, mouse and finger, on the page and in the machine view, desktop and phone — each turned the set on or off${r.firefox ? ' (Firefox: the phone frame without the mobile emulation, whose mouse sends no pointer events)' : ''}`,
    };
  },
});

// **Round K23: the die is a line drawing, and the machine mark a gear on the
// footer's line.** Eugene on a zoom of the die: *"the line connections are not
// clean"* — each face was its own rounded quad, so an edge two faces share was
// drawn twice and rounded differently at each end, and the near die's face
// knocked out half the line of its own top. Now each die is one silhouette and
// the edges inside it are open lines that end on it; read back off the drawn
// page, an edge's two ends lie on a silhouette's stroke centre within a tenth
// of a unit, and the near die's knock-out is its own silhouette.
SCENARIOS.push({
  name: 'the die is two outlines and the edges inside them, every edge ending on an outline, the far one stopped by the near, the pair turned 5.5° to the left',
  area: 'ring',
  query: 'v=2&seed=1',
  page: body(`
    await frame();
    const cut = [...document.querySelectorAll('#actions path[fill="#000000"]')];
    const g = cut.length ? cut[0].parentNode : null;
    if (!g) return { found: false };
    const lines = [...g.querySelectorAll('path.ln')];
    const closed = lines.filter((p) => /Z\\s*$/.test(p.getAttribute('d')));
    const open = lines.filter((p) => !/Z\\s*$/.test(p.getAttribute('d')));
    // every subpath's two ends, in the group's own units
    const ends = [];
    const inner = [];
    for (const p of open) {
      for (const sub of p.getAttribute('d').split('M').filter(Boolean)) {
        const n = sub.match(/-?[\\d.]+/g).map(Number);
        ends.push([n[0], n[1]], [n[n.length - 2], n[n.length - 1]]);
        for (let i = 2; i < n.length - 2; i += 2) inner.push([n[i], n[i + 1]]);
      }
    }
    // an end is on an outline when it lies in that outline's stroke at a tenth
    // of a unit, or it is an end where edges meet each other (the far die's apex)
    const was = closed.map((p) => p.getAttribute('stroke-width'));
    for (const p of closed) { p.style.strokeWidth = '0.2'; }
    const svg = g.ownerSVGElement;
    const onOutline = ends.map(([x, y]) => closed.some((p) => { const q = svg.createSVGPoint(); q.x = x; q.y = y; return p.isPointInStroke(q); }));
    for (const p of closed) p.style.strokeWidth = '';
    void was;
    const key = (e) => e[0].toFixed(2) + ',' + e[1].toFixed(2);
    const meets = ends.map((e) => ends.filter((f) => key(f) === key(e)).length > 1 || inner.some((f) => key(f) === key(e)));
    const loose = ends.filter((e, i) => !onOutline[i] && !meets[i]).map(key);
    const node = g.closest('g[tabindex]') || g.parentNode;
    const circle = node.querySelector('circle');
    const R = circle ? +circle.getAttribute('r') : null;
    const bb = g.getBBox();
    // K26: the pair is one turn to the left about the middle of its turned
    // corners — on the page, its drawn middle on the node's and every point of
    // its outlines well inside the node's circle
    const turn = (g.getAttribute('transform') || '').match(/rotate\\((-?[\\d.]+)\\)/);
    // the node's middle and radius by the same matrix the outlines are read by
    const cm = circle.getScreenCTM();
    const ncx = cm.e, ncy = cm.f, nr = +circle.getAttribute('r') * Math.hypot(cm.a, cm.b);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, reach = 0;
    for (const p of closed) {
      const m = p.getScreenCTM(); const L = p.getTotalLength();
      for (let k = 0; k <= 200; k++) {
        const q = p.getPointAtLength(L * k / 200); const sx = m.a * q.x + m.c * q.y + m.e, sy = m.b * q.x + m.d * q.y + m.f;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
        reach = Math.max(reach, Math.hypot(sx - ncx, sy - ncy) / nr);
      }
    }
    const off = Math.hypot((x0 + x1) / 2 - ncx, (y0 + y1) / 2 - ncy) / nr;
    return { found: true, closed: closed.length, open: open.length, knocks: cut.length, turn: turn ? +turn[1] : 0, off: +off.toFixed(3), reach: +reach.toFixed(3),
      knockIsOutline: cut.length === 1 && closed.some((p) => p.getAttribute('d') === cut[0].getAttribute('d')),
      ends: ends.length, loose, R, wide: +(bb.width / (R || 1)).toFixed(3), pips: g.querySelectorAll('circle').length };
  `),
  judge: (r) => {
    const ok = r.found && r.closed === 2 && r.open >= 2 && r.knocks === 1 && r.knockIsOutline && !r.loose.length && r.pips === 6 && r.turn === -5.5 && r.off <= 0.02 && r.reach <= 0.9;
    return {
      ok,
      why: !r.found ? 'no die on the ring'
        : r.closed !== 2 ? `the die is ${r.closed} closed outlines (one per face drawn separately), where it is two silhouettes`
        : r.knocks !== 1 || !r.knockIsOutline ? `${r.knocks} knock-outs, the near die's ${r.knockIsOutline ? '' : 'not '}its own silhouette`
        : r.loose.length ? `${r.loose.length} edge ends stop short of or past an outline (${r.loose.slice(0, 3).join('; ')})`
        : r.pips !== 6 ? `${r.pips} pips`
        : r.turn !== -5.5 ? `the pair is turned ${r.turn}°, where it is 5.5° to the left`
        : r.off > 0.02 ? `the pair's drawn middle is ${r.off} of the node's radius off its centre`
        : `the pair reaches ${r.reach} of the node's radius`,
      note: `the pair is two silhouettes, each corner rounded once, and ${r.open} open edge paths whose ${r.ends} ends all lie on an outline's line (or meet another edge at the far die's apex); `
        + `the near die's knock-out is its silhouette, so the far die's edges stop at its line; six pips; the pair ${r.wide} of the node's radius across, turned ${r.turn}° as one, its drawn middle ${r.off} of the radius off the node's and its outlines reaching ${r.reach} of it`,
    };
  },
});

// The gear: on the footer's line at its right end, level with the name, in
// the ring's worn colour at half strength — on a desktop and on a phone, where
// the name is centred and the gear still ends the line — and the name in
// title case, Jost 500. Its contrast on the black is read off the phone's
// picture: noticeable, and under the ring's own lines.
SCENARIOS.push({
  name: 'the machine mark is a gear at the right end of the footer line, level with the title-case name, in the worn colour at half strength',
  area: 'ring',
  query: 'v=2&seed=1',
  drive: async (page) => {
    const out = {};
    for (const [name, opts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }]]) {
      const own = await ownPage(page, opts);
      try {
        out[name] = await own.page.evaluate(() => {
          const m = document.getElementById('mark');
          const b = document.getElementById('panel');
          const svg = b.querySelector('svg');
          const rng = document.createRange(); rng.selectNodeContents(m);
          const t = rng.getBoundingClientRect();
          const mb = m.getBoundingClientRect();
          const g = svg.getBoundingClientRect();
          const ms = getComputedStyle(m);
          const bs = getComputedStyle(b);
          const gold = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim();
          const probe = document.createElement('span'); probe.style.color = gold; document.body.appendChild(probe);
          const goldRgb = getComputedStyle(probe).color; probe.remove();
          return {
            vw: innerWidth, vh: innerHeight,
            text: m.textContent.trim(), transform: ms.textTransform, weight: ms.fontWeight, family: ms.fontFamily.split(',')[0].replace(/['"]/g, ''),
            nameMid: (mb.top + mb.bottom) / 2, nameLeft: t.left, nameRight: t.right, nameCentre: (t.left + t.right) / 2,
            gearMid: (g.top + g.bottom) / 2, gearLeft: g.left, gearRight: g.right, gearCx: (g.left + g.right) / 2, gearCy: (g.top + g.bottom) / 2,
            parts: [...svg.children].map((n) => n.tagName).join('+'),
            teeth: ((svg.querySelector('path') || { getAttribute: () => '' }).getAttribute('d').match(/Q/g) || []).length / 4,
            colour: bs.color, goldRgb, opacity: bs.opacity,
            // K28: a fifth larger — the gear drawn 21.6 px in a 44 px target, the name 12.24 px — and on a
            // phone the name clears the ring's outermost circle (the section ring, 0.862 of its box)
            gearPx: g.width, target: [b.getBoundingClientRect().width, b.getBoundingClientRect().height], nameSize: ms.fontSize,
            clearsRing: (() => { const tb = document.getElementById('tilt').getBoundingClientRect(); const rr = Math.min(tb.width, tb.height) / 2 * 0.862; const cx = tb.x + tb.width / 2, cy = tb.y + tb.height / 2;
              const dx = Math.max(t.left - cx, 0, cx - t.right), dy = Math.max(t.top - cy, 0, cy - t.bottom); return Math.round(Math.hypot(dx, dy) - rr); })(),
          };
        });
        if (name === 'phone') out[name].px = await pixelAt(own.page, out[name].gearCx, out[name].gearCy, 11);
      } finally { await own.close(); }
    }
    return out;
  },
  judge: (r) => {
    const bad = [];
    for (const [k, x] of Object.entries(r)) {
      if (x.text !== 'Excelsior Arts' || x.transform !== 'none') bad.push(`${k}: the name reads ${x.text} under text-transform ${x.transform}`);
      if (+x.weight !== 500 || x.family !== 'Jost') bad.push(`${k}: the name is ${x.family} ${x.weight}`);
      if (x.parts !== 'path+circle' || x.teeth !== 8) bad.push(`${k}: the mark is ${x.parts} with ${x.teeth} teeth`);
      if (Math.abs(x.gearMid - x.nameMid) > 1) bad.push(`${k}: the gear's middle is ${(x.gearMid - x.nameMid).toFixed(1)} px off the name's line`);
      if (x.vw - x.gearRight > 24) bad.push(`${k}: the gear ends ${(x.vw - x.gearRight).toFixed(0)} px short of the right edge`);
      if (x.gearLeft < x.nameRight + 6) bad.push(`${k}: the gear is ${(x.gearLeft - x.nameRight).toFixed(1)} px from the name`);
      if (x.colour !== x.goldRgb || +x.opacity !== 0.5) bad.push(`${k}: the gear is ${x.colour} at ${x.opacity}, where the worn colour is ${x.goldRgb} at 0.5`);
      if (Math.abs(x.gearPx - 21.6) > 0.5 || parseFloat(x.nameSize) < 12 || x.target[0] < 44 || x.target[1] < 44) bad.push(`${k}: the gear is ${x.gearPx} px in a ${x.target.join('x')} target and the name ${x.nameSize}, where they are 21.6 in 44 and 12.24`);
      if (x.clearsRing <= 0) bad.push(`${k}: the name overlaps the ring's outer circle by ${-x.clearsRing} px`);
    }
    if (Math.abs(r.phone.nameCentre - r.phone.vw / 2) > 1.5) bad.push(`phone: the name is ${(r.phone.nameCentre - r.phone.vw / 2).toFixed(1)} px off the centre`);
    const ratio = r.phone.px ? r.phone.px.ratio : 0;
    if (!(ratio >= 2.5 && ratio <= 5)) bad.push(`phone: the gear's contrast on the black is ${ratio}:1, outside 2.5–5`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: `the name reads "Excelsior Arts" in Jost 500 as written; the mark is an eight-tooth gear (a path and its hole) ending the footer's line ${(r.desktop.vw - r.desktop.gearRight).toFixed(0)} px from the right, `
        + `its middle ${(r.desktop.gearMid - r.desktop.nameMid).toFixed(1)} px off the name's on a desktop and ${(r.phone.gearMid - r.phone.nameMid).toFixed(1)} on a phone, where the name is centred; `
        + `in the worn colour ${r.desktop.goldRgb} at 0.5, ${ratio}:1 on the black at phone size; since K28 the gear ${r.phone.gearPx} px in a ${r.phone.target.join('x')} target and the name ${r.phone.nameSize}, clearing the ring by ${r.phone.clearsRing} px at 390 and ${r.desktop.clearsRing} at 1440`,
    };
  },
});

// **Round K24: focus is drawn, and only for a key.** Eugene on the preview:
// *"when coming back from the machine view to the ring view, the play button
// has this annoying system focus line"* — the browser's own ring, a blue box
// round the play key's bounds, because the close put the focus back on play
// and nothing turned the browser's outline off. What is held: a round key
// never wears the browser's outline in any state; a key's focus draws the
// ring's dashed circle round it (or, on an HTML key, a dashed outline on its
// own corner); a click draws nothing; and the close gives play its focus
// marked when a key closed the view and unmarked when a pointer did.
const FOCUS_READ = `
  const a = document.activeElement;
  if (!a || a === document.body) return null;
  const cs = getComputedStyle(a);
  const rings = [...document.querySelectorAll('.focusRing')].filter((c) => +c.getAttribute('opacity') > 0);
  return { id: a.id || a.getAttribute('data-action') || a.getAttribute('data-id') || a.tagName, svg: a instanceof SVGElement,
    outline: cs.outlineStyle, rings: rings.length, dashed: rings.every((c) => !!c.getAttribute('stroke-dasharray')) };
`;
const focusRead = (page) => page.evaluate(new Function(FOCUS_READ));
const tabKey = (page) => (page.context().browser().browserType().name() === 'webkit' ? 'Alt+Tab' : 'Tab');

SCENARIOS.push({
  name: 'the machine view closed by a pointer gives play its focus unmarked, and closed by a key gives it marked',
  area: 'ring',
  query: 'v=2&seed=1',
  deadline: 120000,
  drive: async (page) => {
    const out = {};
    for (const how of ['pointer', 'key']) {
      await page.evaluate(() => window.ring.machine.open());
      await page.waitForFunction(() => window.ring.machine.on && document.querySelector('#machine [data-exit]'), null, { timeout: 25000 });
      await page.waitForTimeout(500);
      if (how === 'pointer') await page.click('#machine [data-exit]');
      else { await page.focus('#machine [data-exit]'); await page.keyboard.press('Enter'); }
      await page.waitForFunction(() => !window.ring.machine.on, null, { timeout: 15000 });
      await page.waitForTimeout(400);
      out[how] = await focusRead(page);
      if (how === 'pointer') {
        // and the next key marks where the focus goes
        await page.keyboard.press(tabKey(page));
        await page.waitForTimeout(200);
        out.next = await focusRead(page);
        await page.keyboard.press(`Shift+${tabKey(page)}`);
        await page.waitForTimeout(200);
      }
    }
    return out;
  },
  judge: (r) => {
    const bad = [];
    if (!r.pointer || r.pointer.id !== 'play') bad.push(`after a pointer's close the focus is on ${r.pointer ? r.pointer.id : 'nothing'}, not play`);
    else if (r.pointer.outline !== 'none' || r.pointer.rings) bad.push(`after a pointer's close play wears ${r.pointer.outline === 'none' ? '' : `the browser's ${r.pointer.outline} outline`}${r.pointer.rings ? ` ${r.pointer.rings} focus rings` : ''}`);
    if (!r.next || !r.next.rings) bad.push(`the next key moved the focus to ${r.next ? r.next.id : 'nothing'} and drew no mark`);
    if (!r.key || r.key.id !== 'play') bad.push(`after a key's close the focus is on ${r.key ? r.key.id : 'nothing'}, not play`);
    else if (r.key.rings !== 1 || !r.key.dashed || r.key.outline !== 'none') bad.push(`after a key's close play shows ${r.key.rings} dashed rings and the ${r.key.outline} outline, where it is one ring and no outline`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: `closed by a pointer the view gives play the focus with no outline and no ring, and the next key (to ${r.next && r.next.id}) draws the dashed ring; closed by Enter on BACK, play has the focus and its one dashed ring, the browser's outline off`,
    };
  },
});

SCENARIOS.push({
  name: 'every stop the keyboard reaches on the ring page wears the dashed focus mark and never the browser\'s ring, and a click marks nothing',
  area: 'ring',
  query: 'v=2&seed=1',
  deadline: 120000,
  drive: async (page) => {
    const stops = [];
    const seen = new Set();
    for (let k = 0; k < 24; k++) {
      await page.keyboard.press(tabKey(page));
      await page.waitForTimeout(120);
      const d = await focusRead(page);
      if (!d) continue;
      if (seen.has(d.id)) break;
      seen.add(d.id);
      if (!d.svg) d.html = await page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return { style: cs.outlineStyle, radius: cs.borderTopLeftRadius }; });
      stops.push(d);
    }
    // a click on each round key and on the two corner marks: focus without a mark
    await page.mouse.click(4, 4);
    const clicks = [];
    const keys = await page.evaluate(() => [...document.querySelectorAll('#starCells g.cell, #actions g[tabindex], #panel, #mark')]
      .map((e) => { const b = e.getBoundingClientRect(); return { id: e.id || e.getAttribute('data-action') || e.getAttribute('data-id'), x: b.x + b.width / 2, y: b.y + b.height / 2 }; }));
    for (const k of keys) {
      if (k.id === 'mark' || k.id === 'panel') await page.evaluate((id) => document.getElementById(id).addEventListener('click', (e) => { e.preventDefault(); e.stopImmediatePropagation(); }, { once: true, capture: true }), k.id);
      if (k.id === 'play') continue;   // a press on play starts the set; its focus is the close's row above
      await page.mouse.click(k.x, k.y);
      await page.waitForTimeout(150);
      const d = await focusRead(page);
      clicks.push({ id: k.id, focused: d ? d.id : null, outline: d ? d.outline : 'none', rings: d ? d.rings : 0 });
      if (k.id === 'cast' || k.id === 'skip' || k.id === 'back') await page.evaluate(() => window.ring.control.stop && window.ring.control.stop());
    }
    return { stops, clicks };
  },
  judge: (r) => {
    const bad = [];
    if (r.stops.length < 14) bad.push(`the keyboard reached ${r.stops.length} stops (${r.stops.map((s) => s.id).join(', ')}), where the page has 14`);
    for (const s of r.stops) {
      if (s.svg && (s.outline !== 'none' || s.rings !== 1 || !s.dashed)) bad.push(`${s.id}: the ${s.outline} outline and ${s.rings} dashed rings, where it is no outline and one ring`);
      if (!s.svg && (!s.html || s.html.style !== 'dashed')) bad.push(`${s.id}: a ${s.html ? s.html.style : '?'} outline, where it is dashed on its own corner`);
    }
    for (const c of r.clicks) if (c.outline !== 'none' || c.rings) bad.push(`a click on ${c.id} left ${c.focused} with the ${c.outline} outline and ${c.rings} rings`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: `${r.stops.length} stops by the keyboard (${r.stops.map((s) => s.id).join(', ')}): the round SVG keys each one dashed ring and no outline, the HTML keys a dashed outline on their own corner (${r.stops.filter((s) => !s.svg).map((s) => `${s.id} ${s.html.radius}`).join(', ')}); ${r.clicks.length} clicks, none marked`,
    };
  },
});

// **Round K25: the About, and the top key's first role.** Eugene: *"click on
// Excelsior Arts should show a large popup centred in the page, aka the About
// page"*, and *"the central giant Play and the top player button both show
// play on first open — reuse the top button as informational: a giant (?)
// that opens the same About; once play has started, the top button is
// Play/Pause"*. What is held: the sheet's title carries the build's version,
// its four links go where they say in a new tab; it opens by a pointer and by
// a key, from the name and from the question, and closes by its key, a press
// outside and Escape, the focus back on the key that opened it (unmarked after
// a pointer, marked after a key); the page behind it never scrolls and the
// address never changes.
const APP_VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const ABOUT_READ = `
  const d = document.getElementById('about');
  const a = document.activeElement;
  return { open: d.open, title: document.getElementById('aboutTitle').textContent.replace(/\\s+/g, ' ').trim(),
    sub: d.querySelector('.aboutSub').textContent.trim(), lines: [...d.querySelectorAll('.aboutWhat span')].map((x) => x.textContent.replace(/\\s+/g, ' ').trim()),
    reportsLine: d.querySelector('.aboutReportsWhat').textContent.replace(/\\s+/g, ' ').trim(),
    links: [...d.querySelectorAll('.aboutLinks a')].map((x) => ({ text: x.textContent.trim(), href: x.getAttribute('href'), target: x.target, rel: x.rel })),
    active: a ? (a.id || a.getAttribute('data-action') || a.tagName) : null, marked: !!a && a !== document.body && a.matches(':focus-visible') && !document.documentElement.hasAttribute('data-quiet-focus'),
    scroll: [scrollX, scrollY, document.scrollingElement.scrollTop], url: location.search, locked: document.documentElement.classList.contains('about-open'),
    sheet: (() => { const b = d.getBoundingClientRect(); return { l: b.left, r: innerWidth - b.right, w: b.width, vw: innerWidth }; })(),
    key: document.querySelector('#actions g[data-action="play"]').getAttribute('aria-label') };
`;
const aboutRead = (page) => page.evaluate(new Function(ABOUT_READ));
// K35: Eugene's four lines, one span each, as he wrote them
const ABOUT_LINES = [
  'A helpful music companion. No distracting vocals. No agenda. Just vibes.',
  'The default sound is tuned to deep house. Other genres are being built and coming soon…',
  'Right now the player is at its best on its default lightweight deep house themes and on slow-beat ambient soundscapes (turn Ember down).',
  'The link is always the track that plays. Share it, and it plays the same anywhere.',
];
const ABOUT_LINKS = [
  ['Follow on X for news', 'https://x.com/DeepHouseAudio'],
  ['Composer Eugene T · Follow', 'https://x.com/eugene_tea'],
  ['Source', 'https://github.com/excelsior-arts/deep-house'],
  ['License: PolyForm Noncommercial 1.0.0', 'https://github.com/excelsior-arts/deep-house/blob/master/LICENSE'],
];

SCENARIOS.push({
  name: 'the About opens from the name and from the question by a pointer and by a key, says the version and its four links, and closes three ways with the focus back',
  area: 'ring',
  query: 'v=2&seed=1',
  deadline: 180000,
  drive: async (page) => {
    const out = {};
    for (const [name, opts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['phone', { viewport: { width: 390, height: 844 }, hasTouch: true }]]) {
      const own = await ownPage(page, opts);
      const p = own.page;
      try {
        const r = { url0: await p.evaluate(() => location.search) };
        const tab = tabKey(p);
        // the name, by a pointer; closed by its key
        await p.click('#mark');
        await p.waitForTimeout(250);
        r.byPointer = await aboutRead(p);
        await p.click('#aboutClose');
        await p.waitForTimeout(250);
        r.closedByKeyPointer = await aboutRead(p);
        // the name, by a key; closed by Escape
        await p.focus('#mark');
        await p.keyboard.press('Enter');
        await p.waitForTimeout(250);
        r.byKey = await aboutRead(p);
        await p.keyboard.press(tab);
        await p.waitForTimeout(120);
        r.tabbed = await aboutRead(p);
        await p.keyboard.press('Escape');
        await p.waitForTimeout(250);
        r.closedByEscape = await aboutRead(p);
        // the question at twelve, by a pointer; closed by a press outside
        const q = await p.evaluate(() => { const b = document.querySelector('#actions g[data-action="play"]').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
        await p.mouse.click(q.x, q.y);
        await p.waitForTimeout(250);
        r.byQuestion = await aboutRead(p);
        await p.mouse.click(3, 3);
        await p.waitForTimeout(250);
        r.closedOutside = await aboutRead(p);
        r.playing = await p.evaluate(() => window.ring.control.playing);
        out[name] = r;
      } finally { await own.close(); }
    }
    return out;
  },
  judge: (r) => {
    const want = `Deep House v${APP_VERSION.split('.').slice(0, 2).join('.')}${APP_VERSION.split('.')[2] !== '0' ? `.${APP_VERSION.split('.')[2]}` : ''}`;
    const bad = [];
    for (const [k, x] of Object.entries(r)) {
      for (const [how, o] of [['the name by a pointer', x.byPointer], ['the name by a key', x.byKey], ['the question by a pointer', x.byQuestion]]) {
        if (!o.open) { bad.push(`${k}: ${how} did not open the About`); continue; }
        if (o.title !== want) bad.push(`${k}: the title reads "${o.title}", not "${want}"`);
        if (o.sub !== 'Offline Electronic Music Generator' || JSON.stringify(o.lines) !== JSON.stringify(ABOUT_LINES)) bad.push(`${k}: the subtitle "${o.sub}" and the lines ${JSON.stringify(o.lines)}`);
        // K27: the switch's line is one short plain line, and says nothing of the service behind it
        // (K33: two short clauses since a sound fault sends the track's link and where in it)
        if (o.reportsLine.length > 140 || o.reportsLine.split(/[.;]/).filter((x) => x.trim()).length > 3 || /sentry|address|account|connection/i.test(o.reportsLine)) bad.push(`${k}: the switch's line reads "${o.reportsLine}"`);
        const links = o.links.map((l) => [l.text, l.href]);
        if (JSON.stringify(links) !== JSON.stringify(ABOUT_LINKS)) bad.push(`${k}: the links are ${JSON.stringify(links)}`);
        if (o.links.some((l) => l.target !== '_blank' || !/noopener/.test(l.rel))) bad.push(`${k}: a link does not open in a new tab with noopener`);
        if (o.scroll.some((v) => v !== 0) || !o.locked) bad.push(`${k}: the page behind it scrolled (${o.scroll}) or is not held (${o.locked})`);
        if (o.url !== x.url0) bad.push(`${k}: the address became ${o.url}`);
        if (Math.abs(o.sheet.l - o.sheet.r) > 1.5 || (k === 'phone' && Math.abs(o.sheet.l - 16) > 1.5)) bad.push(`${k}: the sheet stands ${o.sheet.l.toFixed(1)} from the left and ${o.sheet.r.toFixed(1)} from the right`);
      }
      if (x.byKey.active !== 'aboutClose' || !x.byKey.marked) bad.push(`${k}: opened by a key, the focus is on ${x.byKey.active} (marked ${x.byKey.marked}), not the close key marked`);
      if (x.byPointer.active !== 'about' || x.byPointer.marked) bad.push(`${k}: opened by a pointer, the focus is on ${x.byPointer.active} (marked ${x.byPointer.marked}), not the sheet unmarked`);
      if (!x.tabbed.open || !/^A$/.test(x.tabbed.active)) bad.push(`${k}: a Tab in the sheet went to ${x.tabbed.active}`);
      if (x.closedByKeyPointer.open || x.closedByKeyPointer.active !== 'mark' || x.closedByKeyPointer.marked) bad.push(`${k}: the close key left the sheet ${x.closedByKeyPointer.open ? 'open' : 'shut'} and the focus on ${x.closedByKeyPointer.active} (marked ${x.closedByKeyPointer.marked})`);
      if (x.closedByEscape.open || x.closedByEscape.active !== 'mark' || !x.closedByEscape.marked) bad.push(`${k}: Escape left the sheet ${x.closedByEscape.open ? 'open' : 'shut'} and the focus on ${x.closedByEscape.active} (marked ${x.closedByEscape.marked})`);
      if (x.closedOutside.open || x.closedOutside.active !== 'play' || x.closedOutside.marked) bad.push(`${k}: a press outside left the sheet ${x.closedOutside.open ? 'open' : 'shut'} and the focus on ${x.closedOutside.active} (marked ${x.closedOutside.marked})`);
      if (x.closedOutside.locked) bad.push(`${k}: the page is still held after the close`);
      if (x.playing) bad.push(`${k}: the question started the set`);
    }
    return {
      ok: !bad.length,
      why: bad[0],
      note: `at 1440 and 390 the About opens from the name (pointer and Enter) and from the question at twelve, titled "${want}", his four lines, the four links to x.com/DeepHouseAudio, x.com/eugene_tea, the source and the licence in a new tab with noopener; `
        + `the sheet centred (${r.phone.byPointer.sheet.l.toFixed(0)} px each side on the phone), the page behind it held at 0 and the address unchanged; closed by its key, Escape and a press outside, the focus back on the name or the question — unmarked after a pointer, marked after Escape — and the set not started`,
    };
  },
});

SCENARIOS.push({
  name: 'the top key is the question until the first play, then play and pause for good, on a bare page and a link alike',
  area: 'ring',
  query: 'v=2&seed=1',
  deadline: 120000,
  drive: async (page) => {
    const out = {};
    const at = new URL(page.url());
    for (const [name, query] of [['bare', 'out=silent'], ['link', 'out=silent&v=2&seed=27191&theme=2']]) {
      await page.goto(`${at.origin}${at.pathname}?${query}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.ring && window.deepHouse, null, { timeout: 25000 });
      await page.waitForTimeout(700);
      const look = () => page.evaluate(() => {
        const g = document.querySelector('#actions g[data-action="play"]');
        const kids = [...g.children].filter((c) => c.tagName === 'g');
        const shown = kids.filter((k) => +(k.getAttribute('opacity') ?? 1) > 0.5);
        return { label: g.getAttribute('aria-label'), question: shown.some((k) => !!k.querySelector('circle[fill]') && !k.querySelector('path[d*="Z"]')), drawings: kids.length, playing: window.ring.control.playing };
      });
      const r = { open: await look() };
      // the centre plays (the control the page's centre calls)
      await page.evaluate(() => Promise.race([window.ring.control.start(), new Promise((res) => setTimeout(res, 15000))]));
      await page.waitForTimeout(900);
      r.played = await look();
      // the top key, by a key, pauses and plays
      await page.focus('#actions g[data-action="play"]');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(900);
      r.paused = await look();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1200);
      r.again = await look();
      await page.evaluate(() => window.ring.control.stop());
      await page.waitForTimeout(700);
      r.stopped = await look();
      r.aboutOpen = await page.evaluate(() => document.getElementById('about').open);
      out[name] = r;
    }
    return out;
  },
  judge: (r) => {
    const bad = [];
    for (const [k, x] of Object.entries(r)) {
      if (x.open.label !== 'About' || !x.open.question || x.open.playing) bad.push(`${k}: on open the top key is "${x.open.label}" (the question ${x.open.question})`);
      if (x.played.label !== 'pause' || !x.played.playing || x.played.question || x.played.drawings !== 1) bad.push(`${k}: playing, the top key is "${x.played.label}" with ${x.played.drawings} drawings (the question ${x.played.question})`);
      if (x.paused.label !== 'play' || x.paused.playing) bad.push(`${k}: the top key did not pause (${x.paused.label}, playing ${x.paused.playing})`);
      if (x.again.label !== 'pause' || !x.again.playing) bad.push(`${k}: the top key did not play again (${x.again.label}, playing ${x.again.playing})`);
      if (x.stopped.label !== 'play' || x.stopped.question) bad.push(`${k}: stopped, the top key is "${x.stopped.label}" (the question ${x.stopped.question})`);
      if (x.aboutOpen) bad.push(`${k}: the About opened while the key was play and pause`);
    }
    return {
      ok: !bad.length,
      why: bad[0],
      note: 'on a bare page and on a link (27191, theme 2) the top key opens as the question, named About; from the first play it is pause, Enter on it pauses and plays, the question gone by its cross-fade, and a stop draws play and never the question again',
    };
  },
});

// **Round K25: the error reports' switch** (Eugene: *"in About add a switch to
// turn anonymous error recording on/off, and respect it when the app starts,
// cancelling the Sentry init"*). Sentry reports only from a production build on
// a real host, so this row serves the build under a host that is not local —
// `deephouse.test`, answered by the runner's own server through a route, in any
// engine — and answers the SDK's ingest host itself: every request to
// `*.sentry.io` is caught, counted and answered 200 here, and none leaves the
// machine. What is held: on by default, a thrown error is one request; off in
// the About, the next is none; off and reloaded, the client is never started
// and nothing is sent; on again in the sheet, the next error is sent without a
// reload; and the choice survives a reload.
SCENARIOS.push({
  name: 'the About\'s error reports switch: on by default, off stops every send at once and at the next start, on sends again without a reload',
  area: 'ring',
  query: 'v=2&seed=1',
  deadline: 180000,
  drive: async (page) => {
    const origin = new URL(page.url()).origin;
    const ctx = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } });
    const hits = [];
    try {
      await ctx.route(/sentry\.io/, (r) => { hits.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'application/json', body: '{}', headers: { 'access-control-allow-origin': '*' } }); });
      await ctx.route('http://deephouse.test/**', async (r) => { const u = new URL(r.request().url()); const resp = await r.fetch({ url: `${origin}${u.pathname}${u.search}` }); return r.fulfill({ response: resp }); });
      const p = await ctx.newPage();
      const load = async () => {
        await p.goto('http://deephouse.test/index.html?out=silent&v=2&seed=1', { waitUntil: 'networkidle', timeout: 30000 });
        await p.waitForFunction(() => window.ring && window.deepHouse, null, { timeout: 25000 });
        await p.waitForTimeout(600);
      };
      // (the SDK's global is read before `reports()`, which asks the SDK for its client and so sets it up)
      const state = () => p.evaluate(() => { const carrier = !!window.__SENTRY__; return { carrier, ...window.ring.reports(), key: document.getElementById('aboutReports').getAttribute('aria-checked') }; });
      const probe = async (ms) => { const n = hits.length; await p.evaluate(() => setTimeout(() => { throw new Error('k25 switch probe'); }, 0)); const t0 = Date.now(); while (Date.now() - t0 < ms && hits.length === n) await p.waitForTimeout(100); await p.waitForTimeout(300); return hits.length - n; };
      const flip = async () => { await p.click('#mark'); await p.waitForTimeout(200); await p.click('#aboutReports'); await p.waitForTimeout(300); await p.click('#aboutClose'); await p.waitForTimeout(200); };
      const out = {};
      await load();
      out.fresh = { ...(await state()), sent: await probe(8000) };
      await flip();
      out.offLive = { ...(await state()), sent: await probe(3000) };
      await load();
      out.offLoaded = { ...(await state()), sent: await probe(3000) };
      await flip();
      out.onLive = { ...(await state()), sent: await probe(8000) };
      await load();
      out.onLoaded = await state();
      out.hosts = [...new Set(hits.map((h) => new URL(h).host))];
      return out;
    } finally { await ctx.close(); }
  },
  judge: (r) => {
    const bad = [];
    if (!r.fresh.wanted || !r.fresh.running || r.fresh.key !== 'true' || r.fresh.sent < 1) bad.push(`on a first load the switch is ${r.fresh.key}, the client ${r.fresh.running ? 'running' : 'not running'}, and an error sent ${r.fresh.sent} requests`);
    if (r.offLive.wanted || r.offLive.running || r.offLive.key !== 'false' || r.offLive.sent) bad.push(`switched off, the client is ${r.offLive.running ? 'still running' : 'stopped'} and an error sent ${r.offLive.sent}`);
    if (r.offLoaded.wanted || r.offLoaded.running || r.offLoaded.key !== 'false' || r.offLoaded.sent || r.offLoaded.carrier) bad.push(`off and reloaded, the client ${r.offLoaded.running ? 'started' : 'did not start'}, the SDK ${r.offLoaded.carrier ? 'set up its global' : 'stayed out'}, and an error sent ${r.offLoaded.sent}`);
    if (!r.onLive.wanted || !r.onLive.running || r.onLive.key !== 'true' || r.onLive.sent < 1) bad.push(`switched on without a reload, the client is ${r.onLive.running ? 'running' : 'not running'} and an error sent ${r.onLive.sent}`);
    if (!r.onLoaded.wanted || !r.onLoaded.running || r.onLoaded.key !== 'true') bad.push('the choice did not survive a reload');
    return {
      ok: !bad.length,
      why: bad[0],
      note: `under deephouse.test (routed to the runner, the ingest host answered here): on by default, an error ${r.fresh.sent} request(s); off in the About, the next none and the client stopped; off and reloaded, the client never started, no SDK global, nothing sent; on again in the sheet, the next error ${r.onLive.sent} request(s) with no reload; on survives a reload; hosts asked (every one answered here): ${r.hosts.join(', ')}`,
    };
  },
});

// **Round K28: Spark's words are what the hats play.** The hat analysis:
// 26925 theme 3 at ember 0.49, gleam and spark at the rim said "the hats play
// eighths, 6 hits" off the mask the dice rolled, while the offbeat lane played
// four a bar. The page's Spark cell, at load and once the set plays, is read
// against the playing program's own hats: over the main section's bars, the
// distinct steps of the hats layer, the count most bars share.
SCENARIOS.push({
  name: 'Spark\'s subtitle is the hats the program plays, not the mask the dice rolled',
  area: 'ring',
  query: 'v=2&seed=26925&theme=3&spell=ember:0.49,gleam:1.00,spark:1.00',
  deadline: 90000,
  page: body(`
    await frame();
    const read = () => {
      const t = ctl.state.track;
      const per = new Map();
      for (const e of t.events) if (e.layer === 'hats' && e.step != null) { if (!per.has(e.bar)) per.set(e.bar, new Set()); per.get(e.bar).add(e.step); }
      const main = t.timeline.filter((r) => /main/i.test(r.section) && per.has(r.bar)).map((r) => r.bar);
      const pool = main.length ? main : [...per.keys()];
      const tally = new Map();
      for (const b of pool) { const k = [...per.get(b)].sort((x, y) => x - y).join(','); tally.set(k, (tally.get(k) || 0) + 1); }
      const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
      const spark = window.ring.cells().find((c) => c.bird === 'spark');
      return { steps: top ? top[0] : '', playing: top ? top[0].split(',').filter(Boolean).length : 0, sub: spark.sub, reading: spark.reading, mask: t.dice.hatMask, theme: ctl.state.themeIndex };
    };
    const atLoad = read();
    await started();
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 1, 15000);
    await sleep(500);
    const playing = read();
    ctl.stop();
    return { atLoad, playing };
  `),
  judge: (r) => {
    const bad = [];
    for (const [k, x] of Object.entries(r)) {
      const n = Number((String(x.sub).match(/(\d+) hits?/i) || [])[1]);
      if (n !== x.playing) bad.push(`${k}: Spark says "${x.sub}" where the hats play ${x.playing} a bar in the main (steps ${x.steps}; the rolled mask ${x.mask})`);
      if (x.steps === '2,6,10,14' && !/offbeat/i.test(x.sub)) bad.push(`${k}: the hats play the four offbeats and Spark says "${x.sub}"`);
    }
    return {
      ok: !bad.length,
      why: bad[0],
      note: `26925 theme ${r.atLoad.theme + 1} at ember 0.49, gleam and spark at the rim: the hats play steps ${r.atLoad.steps} a bar in the main (the rolled mask ${r.atLoad.mask}), and Spark says "${r.atLoad.sub}" at load and "${r.playing.sub}" playing`,
    };
  },
});

// **Round K29: every link the page writes names the birds by their two
// letters.** The writer is one place (`linkWrite`, `spellQuery`), so the
// address, the stored place, the view's Copy Link and its ledger line, and the
// record tools' link all follow it; each is read here off the page. The page is
// opened on a link written with the full names, which reads as it always did.
SCENARIOS.push({
  name: 'every link the page writes names the birds by two letters, and a full-name link opens the same set',
  area: 'ring',
  query: 'v=2&seed=1&spell=ember:0.62,tide:0.30',
  deadline: 120000,
  drive: async (page) => {
    const eng = page.context().browser().browserType().name();
    const own = await ownPage(page, { viewport: { width: 1440, height: 900 } });
    try {
      if (eng === 'chromium') await own.page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
      return await own.page.evaluate(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const ctl = window.ring.control;
        const out = { opened: { ...(ctl.readout().spell || {}) } };
        // a hand's pull of a third bird: the address is written
        ctl.setSpell({ ...ctl.readout().spell, veil: 0.7 });
        for (let k = 0; k < 40 && !/ve:/.test(location.search); k++) await sleep(100);
        out.address = location.search;
        let stored = null;
        try { stored = JSON.parse(localStorage.getItem('deep-house.player') || 'null'); } catch (e) { /* none */ }
        ctl.stop();
        await sleep(300);
        try { stored = JSON.parse(localStorage.getItem('deep-house.player') || 'null'); } catch (e) { /* none */ }
        out.stored = stored && stored.link ? stored.link : null;
        // the view's Copy Link, and the ledger line it writes
        await window.ring.machine.open();
        for (let k = 0; k < 100 && !document.querySelector('[data-tool="copy"]'); k++) await sleep(100);
        const key = document.querySelector('[data-tool="copy"]');
        if (key) key.click();
        await sleep(600);
        const led = window.ring.machine.snapshot().ledger.filter((e) => e.what === 'link copied');
        out.copied = led.length ? String(led[led.length - 1].fields && led[led.length - 1].fields.link || '') : null;
        out.record = window.deepHouseRecord && window.deepHouseRecord.place ? window.deepHouseRecord.place().link : null;
        window.ring.machine.close();
        // the About's links name no set, and the lock screen's cover is a picture: neither carries a spell
        out.about = [...document.querySelectorAll('#about a')].map((a) => a.getAttribute('href')).filter((h) => /spell=/.test(h));
        out.spell = { ...(ctl.readout().spell || {}) };
        return out;
      });
    } finally { await own.close(); }
  },
  judge: (r) => {
    const bad = [];
    const full = /\b(ember|tide|zephyr|root|gleam|veil|spark|loom)[:=]/;
    if (Math.abs(r.opened.ember - 0.62) > 1e-9 || Math.abs(r.opened.tide - 0.3) > 1e-9) bad.push(`the full-name link opened ${JSON.stringify(r.opened)}`);
    for (const [where, link] of [['the address', r.address], ['the stored place', r.stored], ['Copy Link\'s ledger line', r.copied], ['the record tools\' link', r.record]]) {
      if (link == null) { if (where === 'the record tools\' link') continue; bad.push(`${where} wrote nothing`); continue; }
      const q = decodeURIComponent(String(link));
      if (full.test(q)) bad.push(`${where} names a bird in full: ${q}`);
      if (!/spell=[^&]*em:0\.62/.test(q) || !/ti:0\.30/.test(q) || !/ve:0\.70/.test(q)) bad.push(`${where} is ${q}, not the two-letter spell of the set`);
    }
    if (r.about.length) bad.push(`the About carries a spell: ${r.about.join(', ')}`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: `opened on spell=ember:0.62,tide:0.30 it plays that spell; after a pull the address is ${r.address}, the stored place ${String(r.stored).replace(/^.*\?/, '')}, Copy Link's ledger line ${String(r.copied).replace(/^.*\?/, '')}${r.record ? `, the record tools' link ${String(r.record).replace(/^.*\?/, '')}` : ' (no record tools in this build)'} — every one by two letters`,
    };
  },
});

// ============================================================================
// **Round K30: the reviews of 09-26, the ring's findings.**
// ============================================================================

// (7) A phone held sideways: the name and the credit stand outside the ring.
SCENARIOS.push({
  name: 'on a phone held sideways the name, the credit and the gear stand outside the ring, as they do upright and on a desktop',
  area: 'ring',
  query: 'v=2&seed=1',
  deadline: 120000,
  drive: async (page) => {
    const out = {};
    for (const [w, h] of [[568, 320], [640, 360], [844, 390], [390, 844], [1440, 900]]) {
      const own = await ownPage(page, { viewport: { width: w, height: h }, hasTouch: w < 900, isMobile: false });
      try {
        out[`${w}x${h}`] = await own.page.evaluate(() => {
          const t = document.getElementById('tilt').getBoundingClientRect();
          const rr = (Math.min(t.width, t.height) / 2) * 0.862, cx = t.x + t.width / 2, cy = t.y + t.height / 2;
          const clear = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); if (!b.width) return null;
            const dx = Math.max(b.left - cx, 0, cx - b.right), dy = Math.max(b.top - cy, 0, cy - b.bottom); return Math.round(Math.hypot(dx, dy) - rr); };
          const g = document.querySelector('#panel svg');
          return { name: clear(document.getElementById('name')), mark: clear(document.getElementById('mark')), gear: clear(g), vw: innerWidth, vh: innerHeight };
        });
      } finally { await own.close(); }
    }
    return out;
  },
  judge: (r) => {
    const bad = [];
    for (const [k, x] of Object.entries(r)) for (const what of ['name', 'mark', 'gear']) if (x[what] != null && x[what] < 0) bad.push(`${k}: the ${what === 'mark' ? 'credit' : what} stands ${-x[what]} px inside the ring`);
    return { ok: !bad.length, why: bad[0], note: Object.entries(r).map(([k, x]) => `${k} name ${x.name}, credit ${x.mark}, gear ${x.gear}`).join('; ') + ' px clear of the ring' };
  },
});

// (1) An outside ask while a hand is on a bird is not overwritten at the drop.
const TECH = { ember: 0.7, spark: 0.4, zephyr: 0.6, root: 0.6, tide: 0.45 };
SCENARIOS.push({
  name: 'a spell asked from outside while a hand holds a bird, or inside an arrow\'s commit, stays under the drop',
  area: 'ring',
  query: 'v=2&seed=1',
  deadline: 120000,
  drive: async (page) => {
    const own = await ownPage(page, { viewport: { width: 1440, height: 900 } });
    try {
      const p = own.page;
      // what was asked, off the address (the set lands on it at the next phrase line)
      const read = () => p.evaluate(() => { const l = window.ring.control.link.read(); const spell = { ...(l.spell || {}) }; const q = Object.entries(spell).filter(([b, v]) => typeof v === 'number').map(([b, v]) => `${b.slice(0, 2)}:${v.toFixed(2)}`).join(','); return { q, spell }; });
      await p.evaluate(() => Promise.race([window.ring.control.start(), new Promise((r) => setTimeout(r, 15000))]));
      await p.waitForTimeout(800);
      // a pointer on Ember, out along its spoke, the key pressed mid-pull, then the drop
      const at = await p.evaluate(() => { const i = window.ring.cells().findIndex((c) => c.bird === 'ember'); const c = window.ring.cells()[i]; return { x: c.x, y: c.y, cx: window.innerWidth / 2 }; });
      const ember = await p.evaluate(() => { const g = [...document.querySelectorAll('#starCells g.cell')].find((x) => x.getAttribute('data-id') === 'bpm'); const b = g.querySelector('circle').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
      void at;
      await p.mouse.move(ember.x, ember.y);
      await p.mouse.down();
      for (let k = 1; k <= 12; k++) { await p.mouse.move(ember.x, ember.y - k * 4); await p.waitForTimeout(30); }
      await p.evaluate((t) => window.ring.control.setSpell(t), TECH);
      await p.waitForTimeout(300);
      const asked = await read();
      await p.mouse.up();
      await p.waitForTimeout(700);
      const dropped = await read();
      // an arrow on Ember, the key inside its 300 ms commit
      await p.evaluate(() => window.ring.release(null));
      await p.waitForTimeout(500);
      await p.focus('#starCells g.cell[data-id="bpm"]');
      await p.keyboard.press('ArrowUp');
      await p.evaluate((t) => window.ring.control.setSpell(t), TECH);
      await p.waitForTimeout(800);
      const keyed = await read();
      await p.evaluate(() => window.ring.control.stop());
      return { asked, dropped, keyed };
    } finally { await own.close(); }
  },
  judge: (r) => {
    const bad = [];
    const others = ['spark', 'zephyr', 'root', 'tide'];
    for (const [k, x] of [['the drop', r.dropped], ['the arrow\'s commit', r.keyed]]) {
      const kept = others.every((b) => Math.abs((x.spell[b] ?? -1) - TECH[b]) < 0.006);
      if (!kept) bad.push(`after ${k} the spell is ${x.q}: the asked preset's other birds are gone`);
      if (Math.abs((x.spell.ember ?? -1) - TECH.ember) < 0.006) bad.push(`after ${k} Ember is the preset's ${TECH.ember}, not the hand's`);
    }
    return { ok: !bad.length, why: bad[0], note: `the preset asked mid-pull read ${r.asked.q}; the drop left ${r.dropped.q} and the arrow's commit ${r.keyed.q}: the preset's other birds kept, Ember the hand's` };
  },
});

// (2) Space plays wherever the focus is, the question key's included.
SCENARIOS.push({
  name: 'before the first play the page\'s one key plays with the focus on the question, after the view closes',
  area: 'ring',
  query: 'v=2&seed=1&view=machine',
  deadline: 90000,
  drive: async (page) => {
    await page.waitForFunction(() => window.ring.machine.on && document.querySelector('#machine [data-exit]'), null, { timeout: 25000 });
    await page.waitForTimeout(500);
    await page.click('#machine [data-exit]');
    await page.waitForFunction(() => !window.ring.machine.on, null, { timeout: 15000 });
    await page.waitForTimeout(400);
    const focused = await page.evaluate(() => { const a = document.activeElement; return a && (a.getAttribute('data-action') || a.id || a.tagName); });
    await page.keyboard.press(' ');
    const played = await page.waitForFunction(() => window.ring.control.playing, null, { timeout: 15000 }).then(() => true, () => false);
    const about = await page.evaluate(() => document.getElementById('about').open);
    await page.evaluate(() => window.ring.control.stop());
    // and Enter on the key before any play still opens the About (a fresh page)
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.ring && window.deepHouse && !window.ring.machine.on, null, { timeout: 25000 });
    await page.evaluate(() => { if (window.ring.machine.on) window.ring.machine.close(); history.replaceState(null, '', location.pathname + '?v=2&seed=1&out=silent'); });
    await page.focus('#actions g[data-action="play"]');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const enter = await page.evaluate(() => ({ about: document.getElementById('about').open, playing: window.ring.control.playing }));
    return { focused, played, about, enter };
  },
  judge: (r) => ({
    ok: r.focused === 'play' && r.played && !r.about && r.enter.about && !r.enter.playing,
    why: r.focused !== 'play' ? `the close left the focus on ${r.focused}` : !r.played ? `Space did not play (the About ${r.about ? 'opened' : 'stayed shut'})` : r.about ? 'Space played and opened the About' : `Enter on the question: About ${r.enter.about}, playing ${r.enter.playing}`,
    note: 'closed from the view before any play, the focus is on the question at twelve and Space plays the set with no About; Enter on the question still opens the About',
  }),
});

// (3)(4)(5)(6) The cells say what the program plays.
SCENARIOS.push({
  name: 'the cells say what the program plays: no beat with the drums off, the keys that sound, and parts only where they play',
  area: 'ring',
  query: 'v=2&seed=27191&spell=em:0.14,gl:0.00,ve:0.34,sp:0.00,lo:0.81',
  deadline: 120000,
  drive: async (page) => {
    const at = new URL(page.url());
    const out = {};
    for (const [name, q] of [['benchmark', 'v=2&seed=27191&spell=em:0.14,gl:0.00,ve:0.34,sp:0.00,lo:0.81'], ['ambient', 'v=2&seed=1&spell=em:0.10,ti:0.85,ze:0.10,ro:0.50,ve:0.30,sp:0.00,lo:0.80'], ['keys', 'v=2&seed=3'], ['house', 'v=2&seed=1']]) {
      await page.goto(`${at.origin}${at.pathname}?${q}&out=silent`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.ring && window.deepHouse, null, { timeout: 25000 });
      await page.waitForTimeout(600);
      out[name] = await page.evaluate(() => {
        const t = window.ring.control.state.track;
        const cells = Object.fromEntries(window.ring.cells().map((c) => [c.bird, { word: c.word, sub: c.sub }]));
        const says = Object.fromEntries([...document.querySelectorAll('#starCells g.cell')].map((g) => [g.getAttribute('data-id'), g.getAttribute('aria-label') || '']));
        const drums = t.events.some((e) => e.layer === 'kick' || e.layer === 'hats' || e.layer === 'clap');
        const keys = [...new Set(t.events.filter((e) => e.layer === 'keys').map((e) => (e.p && typeof e.p.preset === 'string' ? e.p.preset : e.voice)))];
        const trace = t.dice.composition ? JSON.parse(t.dice.composition) : { selected: {} };
        return { cells, says, drums, keys, selected: trace.selected, scene: trace.scene, rolled: t.dice.keysPreset };
      });
    }
    return out;
  },
  judge: (r) => {
    const bad = [];
    for (const [k, x] of Object.entries(r)) {
      const all = Object.values(x.says).join(' | ');
      if (!x.drums) {
        if (!/no beat/i.test(x.cells.spark.word)) bad.push(`${k}: no drum plays and Spark reads ${x.cells.spark.word}`);
        if (/backbeat|rolling hands|hand percussion|four on the floor|breaks kit/i.test(all)) bad.push(`${k}: no drum plays and a cell says "${all.match(/[^|]*(backbeat|rolling hands|hand percussion|four on the floor|breaks kit)[^|]*/i)[0].trim()}"`);
      }
      if (/rolling hands/i.test(all) && x.selected.percussion !== 'rolling') bad.push(`${k}: a cell says rolling hands and no rolling part plays`);
      if (/on a pedal|(?<!no )\ba pedal/i.test(all) && !(x.selected.harmony === 'pedal' || /pedal/.test(x.selected.bass || ''))) bad.push(`${k}: a cell says a pedal and none plays`);
      if (/drone up front/i.test(all) && x.scene !== 'drone-forward') bad.push(`${k}: a cell says the drone up front and the scene is ${x.scene}`);
      const zw = String(x.cells.zephyr.word).toLowerCase();
      if (x.keys.length && !x.keys.some((v) => zw && zw.replace(/\s+/g, '') === String(v).toLowerCase())) bad.push(`${k}: Zephyr reads ${x.cells.zephyr.word} where the keys play ${x.keys.join(', ')} (the roll was ${x.rolled})`);
    }
    return { ok: !bad.length, why: bad[0], note: Object.entries(r).map(([k, x]) => `${k}: Spark ${x.cells.spark.word}, Zephyr ${x.cells.zephyr.word} over ${x.keys.join('+') || 'no keys'}${x.drums ? '' : ', no drums'}`).join('; ') };
  },
});

// (9) The question's fade is drawn outside the bloom.
SCENARIOS.push({
  name: 'the question\'s fade into pause writes nothing inside the bloomed group while it runs',
  area: 'ring',
  query: 'v=2&seed=1',
  deadline: 60000,
  page: body(`
    const glow = document.getElementById('innerGlow');
    let writes = 0;
    const mo = new MutationObserver((list) => { for (const m of list) if (m.type === 'attributes' && m.attributeName === 'opacity') writes++; });
    mo.observe(glow, { attributes: true, subtree: true, attributeFilter: ['opacity'] });
    await started();
    const t0 = performance.now();
    let overlay = 0;
    while (performance.now() - t0 < 900) { overlay = Math.max(overlay, document.querySelectorAll('#actionLabels > g[aria-hidden="true"]').length); await sleep(40); }
    mo.disconnect();
    const key = document.querySelector('#actions g[data-action="play"]').getAttribute('aria-label');
    ctl.stop();
    return { writes, overlay, key };
  `),
  judge: (r) => ({
    // (the key's own drawing hidden and shown, once each: a handful at most, never one a frame)
    ok: r.writes <= 4 && r.key === 'pause',
    why: `${r.writes} opacity writes inside the bloom over the fade (the key reads ${r.key})`,
    note: `the fade ran on the words' sheet (${r.overlay} overlay), ${r.writes} opacity writes inside #innerGlow — the key's own drawing hidden and shown once — and the key reads ${r.key}`,
  }),
});

// (10) The loop's pace: 60 at most, 30 at rest.
SCENARIOS.push({
  name: 'the ring\'s loop runs at 60 a second at most, and at 30 while the set is stopped and nothing moves',
  area: 'ring',
  query: 'v=2&seed=1',
  deadline: 60000,
  page: body(`
    const measure = async () => { window.ring.resetTimings(); await sleep(2500); return window.ring.timings(); };
    await sleep(2000);
    const stopped = await measure();
    await started();
    await sleep(1500);
    const playing = await measure();
    ctl.stop();
    return { stopped, playing };
  `),
  judge: (r) => ({
    ok: r.stopped && r.playing && r.stopped.fps <= 33 && r.playing.fps <= 63 && r.stopped.fps >= 20,
    why: `stopped ${r.stopped && r.stopped.fps} and playing ${r.playing && r.playing.fps} loop frames a second`,
    note: `stopped and still the loop ran ${r.stopped.fps} frames a second, playing ${r.playing.fps}`,
  }),
});

// (12) The phone's panel names the control it moves.
SCENARIOS.push({
  name: 'the phone\'s panel names the control it moves, to a screen reader',
  area: 'panel',
  query: 'v=2&seed=1',
  deadline: 60000,
  drive: async (page) => {
    const own = await ownPage(page, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const p = own.page;
      const at = await p.evaluate(() => { const g = [...document.querySelectorAll('#starCells g.cell')].find((x) => x.getAttribute('data-id') === 'preset'); const b = g.querySelector('circle').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
      await p.touchscreen.tap(at.x, at.y);
      await p.waitForTimeout(500);
      return await p.evaluate(() => ({ open: !document.getElementById('birdPanel').hidden,
        group: document.getElementById('birdPanel').getAttribute('aria-label'), less: document.getElementById('birdPanelLess').getAttribute('aria-label'),
        more: document.getElementById('birdPanelMore').getAttribute('aria-label'), slider: document.getElementById('birdPanelSlider').getAttribute('aria-label'),
        star: document.getElementById('star').getAttribute('aria-label') }));
    } finally { await own.close(); }
  },
  judge: (r) => ({
    ok: r.open && /Root/.test(r.group) && /Root/.test(r.less) && /Root/.test(r.more) && /Root/.test(r.slider) && !/dice/.test(r.star),
    why: JSON.stringify(r),
    note: `a finger on Root opens the panel named "${r.group}", its keys "${r.less}" and "${r.more}", its slider "${r.slider}"; the star is "${r.star}"`,
  }),
});

// **Round K32: the link with the time** (Eugene: *"another Copy Link with
// time"*). A page opened with `t` starts the theme at the bar line at or before
// that second, says so in the ledger, drops `t` from its address at once, and a
// `t` past where the theme plays starts at its last phrase line; the view's
// writer (`control.link.withTime`) is the canonical link plus the second.
SCENARIOS.push({
  name: 'a link with the time starts the theme at that bar, says where it started, and leaves no time in the address',
  area: 'link',
  query: 'v=2&seed=1',
  deadline: 120000,
  drive: async (page) => {
    const at = new URL(page.url());
    const out = {};
    for (const [name, t] of [['at 252', 252], ['past the end', 99999]]) {
      await page.goto(`${at.origin}${at.pathname}?seed=1&v=2&theme=1&t=${t}&out=silent`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.ring && window.deepHouse, null, { timeout: 25000 });
      await page.waitForTimeout(500);
      out[name] = await page.evaluate(async (tAsked) => {
        const ctl = window.ring.control;
        const before = { search: location.search, seconds: ctl.readout().seconds, bar: ctl.readout().bar, barSeconds: ctl.readout().barSeconds, bars: ctl.readout().bars, duration: ctl.readout().duration };
        await Promise.race([ctl.start(), new Promise((r) => setTimeout(r, 15000))]);
        await new Promise((r) => setTimeout(r, 1500));
        const r = ctl.readout();
        await window.ring.machine.open();
        const snap = window.ring.machine.snapshot();
        const lines = snap && snap.ledger ? snap.ledger.map((e) => e.what) : [];
        window.ring.machine.close();
        const writer = ctl.link.withTime();
        const readBack = ctl.link.read(new URL(writer).search);
        const canon = ctl.link.read(location.search);
        ctl.stop();
        return { tAsked, before, after: { search: location.search, bar: r.bar, seconds: r.seconds }, lines, writer, readBack: { t: readBack.t, seed: readBack.seed, theme: readBack.theme, strategy: readBack.strategy }, canon: { seed: canon.seed, theme: canon.theme, strategy: canon.strategy } };
      }, t);
    }
    return out;
  },
  judge: (r) => {
    const bad = [];
    const a = r['at 252'], p = r['past the end'];
    const want = Math.floor(252 / a.before.barSeconds);
    if (Math.abs(a.before.bar - want) > 0 || Math.abs(a.after.bar - want) > 1) bad.push(`t=252 opened at bar ${a.before.bar + 1} and played at ${a.after.bar + 1}, where the bar at 252 s is ${want + 1}`);
    for (const [k, x] of Object.entries(r)) if (/(^|[?&])t=/.test(x.before.search) || /(^|[?&])t=/.test(x.after.search)) bad.push(`${k}: the address kept the time: ${x.after.search}`);
    if (!a.lines.some((l) => /^started at \d+:\d\d/.test(l))) bad.push(`the ledger said nothing of the start (${a.lines.slice(-3).join(' | ')})`);
    const lastBar = Math.max(0, Math.floor(p.before.duration / p.before.barSeconds) - 1);
    if (p.before.bar !== Math.floor(lastBar / 4) * 4) bad.push(`a time past the end opened at bar ${p.before.bar + 1}, not the last phrase line ${Math.floor(lastBar / 4) * 4 + 1}`);
    if (!(a.readBack.t != null && Math.abs(a.readBack.t - Math.floor(a.after.seconds)) <= 2 && a.readBack.seed === a.canon.seed && a.readBack.theme === a.canon.theme && a.readBack.strategy === a.canon.strategy)) bad.push(`the view's writer wrote ${a.writer}`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: `t=252 opened at bar ${a.before.bar + 1} (${(a.before.bar * a.before.barSeconds).toFixed(1)} s) and played on from there, the ledger saying "${a.lines.find((l) => /^started at/.test(l))}", the address then ${a.after.search}; t=99999 opened at bar ${p.before.bar + 1}, the last phrase line; the view's writer: ${a.writer.replace(/^.*\?/, '')}`,
    };
  },
});

// **Round K33: a sound fault is reported, once per theme, with the track's
// link.** On the non-localhost route K25 built (`deephouse.test`, the runner's
// own server behind it; every request to `*.sentry.io` answered here, none
// leaving the machine): a tone past the ceiling on the master's output (the
// view's taps see the output reach full scale, which the limiter should never
// let happen) makes exactly one report, carrying the whole canonical link with
// `t`, the theme and bar, the engine, the ledger's own line and the browser —
// and no page address and no person; a second clip on the same theme none; a
// clip on the next theme one; with the switch off, none. The About's line says
// exactly that.
SCENARIOS.push({
  name: 'an output clip is reported once a session with the track\'s link and where, nothing about the listener, and nothing with the switch off',
  area: 'ring',
  query: 'v=2&seed=1',
  serial: true,
  deadline: 240000,
  drive: async (page) => {
    const origin = new URL(page.url()).origin;
    const ctx = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } });
    const sent = [];
    try {
      await ctx.route(/sentry\.io/, (r) => { sent.push(r.request().postData() || ''); return r.fulfill({ status: 200, contentType: 'application/json', body: '{}', headers: { 'access-control-allow-origin': '*' } }); });
      await ctx.route('http://deephouse.test/**', async (r) => { const u = new URL(r.request().url()); const resp = await r.fetch({ url: `${origin}${u.pathname}${u.search}` }); return r.fulfill({ response: resp }); });
      const p = await ctx.newPage();
      const load = async () => {
        await p.goto('http://deephouse.test/index.html?out=silent&v=2&seed=1&theme=1', { waitUntil: 'networkidle', timeout: 30000 });
        await p.waitForFunction(() => window.ring && window.deepHouse, null, { timeout: 25000 });
        await p.evaluate(async () => {
          await Promise.race([window.ring.control.start(), new Promise((r) => setTimeout(r, 15000))]);
          await window.ring.machine.open();
        });
        await p.waitForTimeout(1500);
      };
      // a tone past the ceiling on the master's output, for a moment
      const clip = () => p.evaluate(async () => {
        const c = window.ring.control.state.ctx, out = window.ring.control.mix.master.out;
        const osc = c.createOscillator(), g = c.createGain();
        osc.frequency.value = 220; g.gain.value = 1.6;
        osc.connect(g); g.connect(out); osc.start();
        await new Promise((r) => setTimeout(r, 900));
        osc.stop(); osc.disconnect(); g.disconnect();
        await new Promise((r) => setTimeout(r, 1500));
        return { theme: window.ring.control.readout().mix.themeNumber, clips: window.ring.machine.snapshot().ledger.filter((e) => e.kind === 'clip').length, lines: window.ring.machine.snapshot().ledger.filter((e) => e.kind === 'clip').map((e) => `${e.theme}·${e.bar} ${e.what}`) };
      });
      // (the clip's reports: a late note on a loaded machine is reported too, by its own kind)
      const faults = () => sent.map((b) => b.split('\n').map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).find((o) => o && o.tags && o.tags.fault === 'clip')).filter(Boolean);
      await load();
      const one = await clip();
      const afterOne = faults();
      const two = await clip();
      const afterTwo = faults();
      // the next theme: a skip, then its seam lands
      const was = await p.evaluate(() => window.ring.control.readout().mix.themeNumber);
      await p.evaluate(() => window.ring.control.skip());
      await p.waitForFunction((w) => window.ring.control.readout().mix.themeNumber !== w && !window.ring.control.mix.state.transition, was, { timeout: 60000 });
      await p.waitForTimeout(800);
      const three = await clip();
      const afterThree = faults();
      // the switch off, and the page opened again: nothing
      await p.evaluate(() => { window.ring.machine.close(); });
      await p.click('#mark'); await p.waitForTimeout(200); await p.click('#aboutReports'); await p.waitForTimeout(300); await p.click('#aboutClose');
      const line = await p.evaluate(() => document.getElementById('aboutReportsWhat').textContent.trim());
      const n = faults().length;
      await load();
      const four = await clip();
      const afterFour = faults();
      const location = await p.evaluate(() => ({ seconds: window.ring.control.readout().barSeconds }));
      return { one, two, three, four, counts: [afterOne.length, afterTwo.length, afterThree.length, n, afterFour.length], events: afterThree, line, location };
    } finally { await ctx.close(); }
  },
  judge: (r) => {
    const bad = [];
    const [a, b, c, n, d] = r.counts;
    if (!(r.one.clips >= 1)) bad.push('the tone did not make the output clip line');
    if (a !== 1) bad.push(`the first clip made ${a} reports`);
    if (b !== 1) bad.push(`a second clip on the same theme made ${b - a} more`);
    // (the held-errors audit's caps, adopted in K33: each kind once a session)
    if (c !== 1) bad.push(`a clip on the next theme (${r.three.theme}) made ${c - b} reports, where a kind is reported once a session (its lines ${JSON.stringify(r.three.lines)})`);
    if (d !== n) bad.push(`with the switch off a clip made ${d - n} reports`);
    for (const e of r.events) {
      const link = e.tags.link || '';
      const q = new URL(link).searchParams;
      // K34: theme one is left out of a link, and any other theme is written one-based
      if (!(q.get('seed') && q.get('v') && (!q.has('theme') || Number(q.get('theme')) > 1) && q.get('t') !== null)) bad.push(`the report's link is ${link}`);
      if (e.request && e.request.url) bad.push(`the report carries the page's address ${e.request.url}`);
      if (e.user) bad.push('the report names a user');
      const tagKeys = Object.keys(e.tags).sort().join(',');
      if (tagKeys !== 'engine,fault,link') bad.push(`the report's tags are ${tagKeys}`);
      const extraKeys = Object.keys(e.extra || {}).sort().join(',');
      if (extraKeys !== 'bar,theme') bad.push(`the report's extra fields are ${extraKeys}`);
      const headers = e.request && e.request.headers ? Object.keys(e.request.headers) : [];
      if (headers.some((h) => h !== 'User-Agent')) bad.push(`the report's headers are ${headers.join(', ')}`);
      if (!/reached full scale/.test(e.message || (e.logentry && e.logentry.message) || '')) bad.push(`the report says "${e.message}"`);
      if (e.level !== 'warning') bad.push(`the report is at ${e.level}`);
      // and nothing else at the top of the event than the SDK's own bookkeeping
      const allowed = new Set(['event_id', 'timestamp', 'platform', 'level', 'environment', 'release', 'sdk', 'message', 'tags', 'extra', 'fingerprint', 'request', 'contexts']);
      const extraTop = Object.keys(e).filter((k) => !allowed.has(k));
      if (extraTop.length) bad.push(`the report also carries ${extraTop.join(', ')}`);
      const ctxKeys = Object.keys(e.contexts || {});
      if (ctxKeys.some((k) => !['browser', 'os', 'device'].includes(k))) bad.push(`the report's contexts are ${ctxKeys.join(', ')}`);
    }
    if (!/a caught fault also sends the track's link and where in it/.test(r.line)) bad.push(`the About says "${r.line}"`);
    return {
      ok: !bad.length,
      why: bad.join('; '),
      note: `under deephouse.test: an output clip on theme ${r.one.theme} made one report, a second none, a clip on theme ${r.three.theme} none (each kind once a session), and with the switch off none; each at the warning level with the ledger's line, the tags engine, fault and link (${r.events[0] && r.events[0].tags.link.replace(/^https?:\/\/[^?]*/, '')}), the bar and theme, the browser's User-Agent and nothing else — no page address, no user (top-level ${r.events[0] ? Object.keys(r.events[0]).sort().join(' ') : ''}; contexts ${r.events[0] ? Object.keys(r.events[0].contexts || {}).join(' ') || 'none' : ''}); the About says "${r.line}"`,
    };
  },
});

// **Round S16: the output's clip line is written by the limiter's processor,
// with the view closed.** K33 reports the ledger's output `clip` line, and the
// view's taps wrote it only while the view was open. The processor sees every
// sample and measures it past the clipper and the trim; here a tone past the
// ceiling goes into the master with the trim raised to 1.6 and the processor
// told so, as a retune tells it, with the machine view never opened: one clip
// line appears for the passage (the processor posts once a second, the ledger
// writes when the passage begins), and the view, opened afterwards, finds it.
// With the trim back at the room's, a tone past the ceiling writes none: the
// limiter holds it, which is what it is for.
SCENARIOS.push({
  name: 'the output reaching full scale is written to the ledger by the limiter\'s processor with the view closed, once a passage, and a tone the limiter holds writes nothing',
  area: 'view',
  query: 'v=2&seed=1&out=silent',
  deadline: 120000,
  page: body(`
    const ctl = window.ring.control;
    await Promise.race([ctl.start(), new Promise((r) => setTimeout(r, 15000))]);
    await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 0.5, 12000);
    const c = ctl.state.ctx, n = ctl.mix.master.nodes;
    const viewOpen = window.ring.machine.on;
    const tone = async (trimTo, ms) => {
      const trim = n.trim.gain, was = trim.value;
      const set = (v) => { trim.cancelScheduledValues(c.currentTime); trim.setValueAtTime(v, c.currentTime); n.limiterPort.postMessage({ post: { gain: v } }); };
      const osc = c.createOscillator(), g = c.createGain();
      osc.frequency.value = 220; g.gain.value = 1.6;
      osc.connect(g); g.connect(n.master);
      if (trimTo !== null) set(trimTo);
      osc.start();
      await sleep(ms);
      osc.stop(); osc.disconnect(); g.disconnect();
      if (trimTo !== null) set(was);
      await sleep(1600);
    };
    const t0 = performance.now();
    await tone(null, 2300);           // held by the limiter: nothing
    const t1 = performance.now();
    const openDuring = window.ring.machine.on;
    await tone(1.6, 2300);            // past full scale for two seconds and more: one line
    const t2 = performance.now();
    await window.ring.machine.open();
    await sleep(300);
    const clips = window.ring.machine.snapshot().ledger.filter((e) => e.kind === 'clip');
    window.ring.machine.close();
    ctl.stop();
    return { worklet: n.limiterIsWorklet, viewOpen: viewOpen || openDuring || false, held: clips.filter((e) => e.at >= t0 && e.at < t1).length,
      hot: clips.filter((e) => e.at >= t1 && e.at < t2).map((e) => ({ what: e.what, fields: e.fields })) };
  `),
  judge: (r) => {
    const bad = [];
    if (!r.worklet) bad.push('the master has no limiter\'s processor here');
    if (r.viewOpen) bad.push('the view was open during the tones');
    if (r.held) bad.push(`a tone the limiter held wrote ${r.held} clip line(s)`);
    if (r.hot.length !== 1) bad.push(`two seconds past full scale wrote ${r.hot.length} clip lines`);
    const f = r.hot[0] ? r.hot[0].fields : {};
    if (r.hot[0] && r.hot[0].what !== 'out reached full scale') bad.push(`the line says "${r.hot[0].what}"`);
    if (r.hot[0] && !(f.peak > 0 && f.over > 0 && f.gr > 0)) bad.push(`the line's fields are ${JSON.stringify(f)}`);
    return {
      ok: !bad.length,
      why: bad[0],
      note: `with the view closed: a tone at 1.6 into the master under the room's trim wrote no clip line (the limiter held it); under a trim of 1.6 it wrote one, "${r.hot[0] && r.hot[0].what}" with ${JSON.stringify(f)}, found when the view was opened afterwards`,
    };
  },
});

// **Round R1 of the reports: what the page catches and the audit calls ours is
// reported, once a kind, with the track's link.** On K25's non-localhost route
// (`deephouse.test`, here over https so the page is a secure context with
// worklets, the runner's own server behind it, every request to
// `*.sentry.io` answered here): each kind of the audit's Report bucket forced
// once, at a site of its own, makes exactly one warning event carrying the kind,
// the ledger's line, the error's own words, the engine and the link; forced a
// second time it makes none; and with the switch off none at all. A session
// sends six at most, so the kinds are forced over four pages (a page is a
// session): the limiter's module refused, a listener that throws, a candidate
// of a throw that cannot be planned and a hand-over the transport cannot
// build; then a start that throws, a view that throws while it opens and the
// address refused for writing too often; then a link the page cannot write;
// then the switch off.
SCENARIOS.push({
  name: 'what the page catches and holds is reported once a kind with the kind, the words and the track\'s link, a second time not, and nothing with the switch off',
  area: 'ring',
  query: 'v=2&seed=1',
  serial: true,
  deadline: 300000,
  drive: async (page) => {
    const origin = new URL(page.url()).origin;
    // https, so the page is a secure context and has worklets to refuse
    const ctx = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
    const sent = [];
    const pages = [];
    try {
      await ctx.route(/sentry\.io/, (r) => { sent.push(r.request().postData() || ''); return r.fulfill({ status: 200, contentType: 'application/json', body: '{}', headers: { 'access-control-allow-origin': '*' } }); });
      await ctx.route('https://deephouse.test/**', async (r) => { const u = new URL(r.request().url()); const resp = await r.fetch({ url: `${origin}${u.pathname}${u.search}` }); return r.fulfill({ response: resp }); });
      const events = () => sent.flatMap((b) => b.split('\n').map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }))
        .filter((o) => o && o.tags && o.tags.fault);
      const count = (kind) => events().filter((e) => e.tags.fault === kind).length;
      const open = async (init = null, start = true) => {
        const p = await ctx.newPage();
        pages.push(p);
        if (init) await p.addInitScript(init);
        await p.goto('https://deephouse.test/index.html?out=silent&v=2&seed=1&theme=1', { waitUntil: 'networkidle', timeout: 30000 });
        await p.waitForFunction(() => window.ring && window.deepHouse, null, { timeout: 25000 });
        if (start) await p.evaluate(async () => { await Promise.race([window.ring.control.start(), new Promise((r) => setTimeout(r, 15000))]); });
        await p.waitForTimeout(800);
        return p;
      };
      const settle = (p) => p.waitForTimeout(700);
      const seen = {};
      const twice = async (kind, p, force) => {
        await force(p); await settle(p);
        const one = count(kind);
        await force(p); await settle(p);
        seen[kind] = [one, count(kind)];
      };
      // --- page one: limiter, page, plan, transport
      const refuseWorklet = () => { if (window.AudioWorklet) AudioWorklet.prototype.addModule = function () { return Promise.reject(new DOMException('the module was refused', 'AbortError')); }; };
      const a = await open(refuseWorklet);
      // the limiter: the first start asked, a second context asks again
      seen.limiter = [count('limiter')];
      await a.evaluate(async () => { window.ring.control.stop(); await new Promise((r) => setTimeout(r, 300)); await window.ring.control.start(); });
      await settle(a);
      seen.limiter.push(count('limiter'));
      await twice('page', a, (p) => p.evaluate(() => {
        // (a listener is called once as it subscribes; the second call is the set's)
        let n = 0, off = null;
        off = window.ring.control.subscribe(() => { n += 1; if (n === 2) { setTimeout(() => off && off(), 0); throw new TypeError('a listener forced to throw'); } });
        return new Promise((r) => setTimeout(r, 600));
      }));
      await twice('plan', a, (p) => p.evaluate(async () => {
        const c = window.ring.control, was = c.planned;
        c.planned = () => { throw new TypeError('a plan forced to throw'); };
        // a tap's pool, scored without touching the set: every candidate planned
        try { window.deepHouse.cast.look(0); } finally { c.planned = was; }
      }));
      await twice('transport', a, (p) => p.evaluate(async () => {
        const m = window.ring.control.state.mix, was = m.skip;
        m.skip = () => Promise.reject(new TypeError('a hand-over forced to fail'));
        try { window.ring.control.skip(); await new Promise((r) => setTimeout(r, 200)); } finally { m.skip = was; }
      }));
      // --- page two: start, view, address
      const b = await open(null, false);
      await twice('start', b, (p) => p.evaluate(async () => {
        const was = AudioContext.prototype.createBiquadFilter;
        AudioContext.prototype.createBiquadFilter = function () { throw new TypeError('a start forced to throw'); };
        try { await window.ring.control.start(); } finally { AudioContext.prototype.createBiquadFilter = was; }
      }));
      await twice('view', b, (p) => p.evaluate(async () => {
        const c = window.ring.control, was = c.readout;
        c.readout = () => null;
        try { await window.ring.machine.open(); } finally { c.readout = was; }
      }));
      await twice('address', b, (p) => p.evaluate(async () => {
        const was = history.replaceState;
        history.replaceState = function () { throw new DOMException('too many calls', 'SecurityError'); };
        try { await window.ring.machine.open(); window.ring.machine.close(); } finally { history.replaceState = was; }
      }));
      // --- page three: link
      const c3 = await open();
      await twice('link', c3, (p) => p.evaluate(async () => {
        const was = URLSearchParams.prototype.toString;
        URLSearchParams.prototype.toString = function () { throw new TypeError('a link forced to throw'); };
        try { try { window.ring.control.stop(); } catch (e) { /* the page's own */ } } finally { URLSearchParams.prototype.toString = was; }
        await window.ring.control.start();
      }));
      // --- page four: the switch off, and three kinds forced again
      const before = events().length;
      await a.click('#mark'); await a.waitForTimeout(200); await a.click('#aboutReports'); await a.waitForTimeout(300);
      const line = await a.evaluate(() => document.getElementById('aboutReportsWhat').textContent.trim());
      const d = await open(refuseWorklet);
      await d.evaluate(async () => {
        let n = 0;
        window.ring.control.subscribe(() => { n += 1; if (n === 2) throw new TypeError('a listener forced to throw'); });
        const m = window.ring.control.state.mix;
        m.skip = () => Promise.reject(new TypeError('a hand-over forced to fail'));
        window.ring.control.skip();
        await new Promise((r) => setTimeout(r, 1500));
      });
      const off = { reports: await d.evaluate(() => window.ring.reports()), sent: events().length - before };
      return { seen, off, line, events: events().filter((e) => e.extra && e.extra.error) };
    } finally { for (const p of pages) await p.close().catch(() => {}); await ctx.close(); }
  },
  judge: (r) => {
    const bad = [];
    const kinds = ['limiter', 'page', 'plan', 'transport', 'start', 'view', 'address', 'link'];
    for (const k of kinds) {
      const got = r.seen[k] || [];
      if (got[0] !== 1) bad.push(`${k} forced once made ${got[0]} reports`);
      else if (got[1] !== 1) bad.push(`${k} forced a second time made ${got[1] - got[0]} more`);
    }
    for (const k of kinds) {
      const e = r.events.find((x) => x.tags.fault === k);
      if (!e) continue;
      if (e.level !== 'warning') bad.push(`${k} is at ${e.level}`);
      if (Object.keys(e.tags).sort().join(',') !== 'engine,fault,link') bad.push(`${k}'s tags are ${Object.keys(e.tags).join(',')}`);
      if (Object.keys(e.extra).sort().join(',') !== 'bar,error,theme') bad.push(`${k}'s extra fields are ${Object.keys(e.extra).join(',')}`);
      if (!/forced|refused|too many|nothing to describe/.test(e.extra.error)) bad.push(`${k} carries the error "${e.extra.error}"`);
      if (k !== 'link') {
        try { const q = new URL(e.tags.link).searchParams; if (!(q.get('seed') && q.get('v') && q.get('t') !== null)) bad.push(`${k}'s link is ${e.tags.link}`); } catch (x) { bad.push(`${k}'s link is "${e.tags.link}"`); }
      }
      if (!e.tags.engine) bad.push(`${k} names no engine`);
      if (e.request && e.request.url) bad.push(`${k} carries the page's address`);
      if (e.user) bad.push(`${k} names a user`);
      const fp = (e.fingerprint || []).join('|');
      if (!fp.startsWith(`caught-fault|${k}|`)) bad.push(`${k}'s fingerprint is ${fp}`);
    }
    if (r.off.reports.running || r.off.sent) bad.push(`with the switch off the page ${r.off.reports.running ? 'ran a client' : ''} and sent ${r.off.sent}`);
    if (!/a caught fault also sends the track's link and where in it/.test(r.line)) bad.push(`the About says "${r.line}"`);
    return {
      ok: !bad.length,
      why: bad.join('; '),
      note: `under deephouse.test each of ${kinds.join(', ')} forced once made one warning event with the kind, the line, the error's words, the engine and the link, and a second time none; with the switch off nothing; the About says "${r.line}"`,
    };
  },
});

export default SCENARIOS;
