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
// '/src/mix.js'` to reach for, so everything is asked of `window.ring.control`
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
//   the live parameter table is not reachable. `tmp/check/transport.mjs` read
//   `PARAMS.kick.startHz` inside a patched voice. From the built page the
//   nearest thing is the playing theme's own `paramOverrides`, which carries
//   both numbers the fault moved, plus the live evidence that nothing was
//   disturbed: no late note, no deck event failed, no tick threw.
//
// Every scenario returns `{ ok, why }` and, when it passes, a short `note`
// worth printing. Nothing here opens a browser or decides what to do about a
// failure: that is tools/test-browsers.mjs.

import { setLayout } from './setplan.mjs';

// What a page-side scenario is handed, and what it is allowed to use. Written
// as one string injected into the page rather than as functions per scenario,
// because Playwright serialises a function without its closure.
const HELPERS = `
  const ctl = window.ring.control;
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
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
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
const body = (src) => `(async () => { ${HELPERS} ${src} })()`;

// Each scenario: a name, the source of an async function evaluated in the page,
// and a judge that turns what comes back into a pass or a failure. `setup` is
// what the node side works out first and hands over.
export const SCENARIOS = [
  {
    name: 'a stop inside a start leaves nothing playing',
    // Finding 01. Every startup takes a generation token and every
    // continuation after an await asks whether it is still the one that was
    // asked for; a superseded mix is stopped rather than left playing with
    // nobody holding it.
    page: body(`
      const starting = ctl.start();
      await sleep(30);
      ctl.stop();
      const atStop = { playing: ctl.playing, mix: !!ctl.mix };
      await starting.catch(() => {});
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
    // Finding 02. `generate()` applies a preset's params and then puts the
    // table back exactly as it found it, and every deck re-applies its own
    // before it builds, starts or schedules. What a built page can see is the
    // playing theme's own overrides — which carry both numbers the fault
    // moved, the kick's start pitch and the hat's lid — and the live evidence
    // that nothing was dropped while twelve other rooms were planned.
    page: body(`
      await ctl.start();
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
    name: 'a seek inside a hand-over keeps the theme and the clock running',
    // Finding 03. A seek cancels the hand-over in flight, lets the arriving
    // and retiring decks go, brings the sum out of its dip and lands one fresh
    // deck. What must not happen is the theme index turning over on its own or
    // the clock stopping.
    page: body(`
      await ctl.start();
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
    // The rule the "the track cleared up to a simpler sound" report turned
    // into: a pause, a play or a reload inside a hand-over rebuilds that
    // hand-over at the stage it had reached, rather than dropping it and
    // re-arming it a dozen bars later. Two decks, the arriving one at its own
    // offset, and every curve joined at the value it had got to.
    setup: () => {
      // One minute of set is 32-bar themes, which puts the first hand-over
      // just under a minute in; the scenario seeks to the bar before it rather
      // than waiting for it.
      const L = setLayout(1, 2, { themeBars: 32 });
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
      await ctl.start();
      await waitFor(() => ctl.mix && ctl.mix.state.elapsed > 0.5, 8000);
      ctl.seekTo((S.seamAt - 3) / themeSeconds, true);
      const reached = await waitFor(() => ctl.mix.state.transition > 0.02, 20000);
      await sleep(1200);
      const stage = ctl.mix.state.elapsed - S.seamAt;
      ctl.stop();
      await sleep(700);
      const saved = JSON.parse(localStorage.getItem('deep-house.player') || 'null');
      await ctl.start();
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
      // to have a bar 40, since the scenario before this one leaves the set on
      // one-minute themes.
      ctl.setSeed('99895');
      ctl.setMinutes(4);
      await sleep(250);
      for (let i = 0; i < 3; i++) ctl.skip();
      const before = late().count;
      await ctl.start();
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
        await ctl.start();
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
    // The same rule where two decks are up. A resume inside a hand-over lays
    // the arriving deck out from the same instant as the record it is
    // arriving over — `beginTransition(seam.bars, at - stage, false, stage)` —
    // so both of them are aimed at the head plus the lead, or neither is.
    setup: () => {
      const L = setLayout(1, 2, { themeBars: 32 });
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
      await ctl.start();
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
        await ctl.start();
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
    name: 'a cut is answered inside a beat and a bit',
    // A skip begins on the *next beat* of the record that is playing, not the
    // next bar: a press used to be answered three seconds later, which is long
    // enough that pressing NEXT read as pressing nothing and the hand pressed
    // again. What is measured is press to the instant the arriving theme is
    // first scheduled to sound.
    //
    // The bound is a beat plus the scheduler's own reach, and not a beat plus
    // a flat 150 ms. `cutAt()` takes the first beat line at or after
    // `max(now + 0.15, pumpedTo)`, and `pumpedTo` is how far the deck has
    // already been written: `liveLookahead` in clock.js, which clears the
    // device's own block twice over — twice the output latency plus the base
    // block plus a tick and 50 ms — and never reaches less far than the
    // player asked for. A headless engine is handed a large output buffer, so
    // that is comfortably more than 150 ms and the flat number would be a
    // gate on the machine rather than on the transport. The page is asked
    // what its own latencies are and the floor is worked out from them.
    page: body(`
      await ctl.start();
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
        // takes to be answered, so the second waits for the first to be over.
        if (i) await sleep(12000);
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

  {
    name: 'a stopped set stops being processed',
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
        await ctl.start();
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
      await ctl.start();
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
    name: 'a drag along the band does not turn the star',
    // The star holds the turn the record had reached instead of following the
    // previewed position: a scrub used to repeat the dice swipe's own
    // feedback, running 1.8 to 184.9 degrees under a band drag. A drag across
    // the star itself still turns it.
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
      // and the star's own gesture, which does turn it
      const spin = [];
      const s0 = onRing(0.25, 0.2);
      el('tilt').dispatchEvent(pev('pointerdown', s0.x, s0.y, 72));
      await frame();
      spin.push(starAngle());
      const s1 = onRing(0.25, 0.9);
      window.dispatchEvent(pev('pointermove', s1.x, s1.y, 72));
      await sleep(140);
      await frame();
      spin.push(starAngle());
      window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 72 }));
      await sleep(200);
      return { before, band, afterBand, cursor, spin };
    `),
    judge: (r) => {
      if (r.noStar) return { ok: false, why: 'the page draws no star to watch' };
      const moved = Math.max(...r.band.map((a) => Math.abs(a - r.before)), Math.abs(r.afterBand - r.before));
      const spun = Math.abs(r.spin[1] - r.spin[0]);
      return {
        ok: moved < 2 && spun > 5,
        why: `the band drag turned the star ${moved.toFixed(1)} degrees and the star's own drag turned it ${spun.toFixed(1)}`,
        note: `a drag right across the band moved the star ${moved.toFixed(2)} degrees and the cursor to ${r.cursor.toFixed(1)} s; the same drag on the star turned it ${spun.toFixed(1)}`,
      };
    },
  },
];

export default SCENARIOS;
