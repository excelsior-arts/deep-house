// Round crash-resume (11-03): what a playing set makes and lets go of, a second. WebKit's content process aborted on
// its audio thread twice in five minutes of Vibe in his Mac app (`AudioSummingJunction::updateRenderingState` from
// `handleDirtyAudioSummingJunctions`): a node's input or AudioParam marked dirty by a connection change and destroyed
// before the render thread had read it. What feeds that race is churn: nodes made, wired and let go while one theme
// plays. This counts it on a built site, silent (`?out=silent`, the browser muted):
//
// - **made**: nodes the page's contexts make a second, by kind (the live context and any offline render's);
// - **wires**: connections into a node and into an AudioParam a second, and `disconnect` calls a second;
// - **gone wired**: nodes the collector took that still had an output connected when it took them, a second — a
//   node let go still wired is torn apart by the browser, its neighbours' junctions dirtied at a moment nothing
//   in the page chose; the engine's own disconnects (held ~2 s after, `graph-scope.ts`) are the other way;
// - **offline**: OfflineAudioContexts made and rendered.
//
// Chromium is asked to collect before each reading (`--js-flags=--expose-gc`), so "gone wired" is the whole of it;
// WebKit collects when it will, so its count is a floor.
//
// `--level` plays the direct path instead (the browser still muted) and reads the mix's level at the destination, a
// reading per second of the theme's own clock, so two builds can be held side by side: a change that cut a node
// still in use would show as a lane gone.
//
//   node tools/node-churn.ts <port> --site <built site> [--seconds 60] [--warm 8] [--engine chromium|webkit] [--level] <link>...

import { playwright, launchOptions, renice } from '../../engine/tools/harness.ts';
import { serveSite } from './imprint/render.ts';

const argv = process.argv.slice(2);
const take = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const SITE = take('site', '');
const SECONDS = +take('seconds', '60');
const WARM = +take('warm', '8');
const ENGINE = take('engine', 'chromium');
const LEVEL = argv.includes('--level');
if (LEVEL) argv.splice(argv.indexOf('--level'), 1);
take('nice', '18');
const [port, ...links] = [+argv[0], ...argv.slice(1)];
if (!SITE || !port || !links.length) throw new Error('usage: node tools/node-churn.ts <port> --site <dir> [--seconds 60] <link>...');

const COUNTER = `
(() => {
  const c = window.__churn = { made: {}, connectNode: 0, connectParam: 0, disconnect: 0, goneWired: 0, gone: 0,
    offlineMade: 0, offlineRendered: 0, live: 0 };
  const wired = new Map();   // id -> outputs connected (not the node: it must be free to go)
  let next = 0;
  const ids = new WeakMap();
  const reg = new FinalizationRegistry((id) => { c.gone++; if (wired.get(id) > 0) c.goneWired++; wired.delete(id); });
  const note = (node, kind) => {
    const id = ++next; ids.set(node, id); wired.set(id, 0); reg.register(node, id);
    c.made[kind] = (c.made[kind] || 0) + 1;
  };
  const P = BaseAudioContext.prototype;
  for (const name of Object.getOwnPropertyNames(P)) {
    if (!name.startsWith('create') || name === 'createBuffer' || name === 'createPeriodicWave') continue;
    const make = P[name];
    if (typeof make !== 'function') continue;
    P[name] = function (...a) { const n = make.apply(this, a); if (n instanceof AudioNode) note(n, name.slice(6)); return n; };
  }
  const W = window.AudioWorkletNode;
  if (W) window.AudioWorkletNode = class extends W { constructor(...a) { super(...a); note(this, 'Worklet'); } };
  const connect = AudioNode.prototype.connect, disconnect = AudioNode.prototype.disconnect;
  AudioNode.prototype.connect = function (d, ...r) {
    const id = ids.get(this);
    if (id) wired.set(id, (wired.get(id) || 0) + 1);
    if (d instanceof AudioParam) c.connectParam++; else c.connectNode++;
    return connect.call(this, d, ...r);
  };
  AudioNode.prototype.disconnect = function (...a) {
    const id = ids.get(this);
    if (id) wired.set(id, a.length ? Math.max(0, (wired.get(id) || 0) - 1) : 0);
    c.disconnect++;
    return disconnect.apply(this, a);
  };
  const O = window.OfflineAudioContext;
  if (O) {
    window.OfflineAudioContext = class extends O { constructor(...a) { super(...a); c.offlineMade++; } };
    const render = O.prototype.startRendering;
    O.prototype.startRendering = function (...a) { c.offlineRendered++; return render.apply(this, a); };
  }
  setInterval(() => { c.live = wired.size; }, 1000);
  // --level: the mix's level where it meets the destination, a reading every quarter second against the set's clock
  c.levels = [];
  if (window.__churnLevel) {
    const taps = new WeakSet();
    AudioNode.prototype.connect = (function (inner) {
      return function (d, ...r) {
        const out = inner.call(this, d, ...r);
        const ctx = this.context;
        if (d && ctx && d === ctx.destination && !taps.has(ctx) && !(ctx instanceof OfflineAudioContext)) {
          taps.add(ctx);
          const a = ctx.createAnalyser(); a.fftSize = 2048;
          inner.call(this, a);
          const buf = new Float32Array(a.fftSize);
          setInterval(() => {
            a.getFloatTimeDomainData(buf);
            let e = 0; for (const x of buf) e += x * x;
            const ctl = window.ring && window.ring.control;
            const at = ctl ? ctl.readout().seconds : -1;
            c.levels.push([+at.toFixed(2), 10 * Math.log10(e / buf.length + 1e-12)]);
          }, 250);
        }
        return out;
      };
    })(AudioNode.prototype.connect);
  }
})();
`;

const server = await serveSite(port, SITE) as { close: () => void };
const { pw, label } = await playwright();
const opts = launchOptions(ENGINE);
if (ENGINE === 'chromium') opts.args = [...(opts.args || []), '--js-flags=--expose-gc', '--disable-gpu'];
const browser = await pw[ENGINE].launch(opts);
renice(browser);
console.log(`${label}, ${ENGINE}; ${SECONDS} s a link after ${WARM} s of warming`);
const snap = (page) => page.evaluate(() => { if (typeof gc === 'function') { gc(); gc(); } return JSON.parse(JSON.stringify(window.__churn)); });
try {
  for (const link of links) {
    const page = await browser.newPage();
    if (LEVEL) await page.addInitScript('window.__churnLevel = true;');
    await page.addInitScript(COUNTER);
    await page.goto(`http://127.0.0.1:${port}/index.html?out=${LEVEL ? 'direct' : 'silent'}&${link}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.ring && window.ring.control, { timeout: 30000 });
    await page.evaluate(() => { window.requestAnimationFrame = () => 0; window.ring.control.start(); });
    await page.waitForFunction(() => window.ring.control.state.playing, { timeout: 30000 });
    await page.waitForTimeout(WARM * 1000);
    // the collector's finalizers are tasks: a moment for them after each collection
    const a = await snap(page); await page.waitForTimeout(500);
    const a2 = await snap(page);
    await page.waitForTimeout(SECONDS * 1000);
    await snap(page); await page.waitForTimeout(500);
    const b = await snap(page);
    const where = await page.evaluate(() => ({ playing: window.ring.control.state.playing, seconds: +window.ring.control.readout().seconds.toFixed(1) }));
    const per = (k: string) => ((b[k] - a2[k]) / SECONDS).toFixed(1);
    const made = Object.keys(b.made).map((k) => [k, (b.made[k] - (a2.made[k] || 0)) / SECONDS] as const).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]);
    const total = made.reduce((s, [, v]) => s + v, 0);
    console.log(`\n${link}  (at ${where.seconds} s, ${where.playing ? 'playing' : 'NOT playing'})`);
    console.log(`  made ${total.toFixed(1)}/s: ${made.map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')}`);
    console.log(`  wires: connect ${per('connectNode')}/s into nodes, ${per('connectParam')}/s into params; disconnect ${per('disconnect')}/s`);
    console.log(`  collected ${per('gone')}/s, of them still wired ${per('goneWired')}/s (${b.goneWired - a2.goneWired} in ${SECONDS} s); tracked alive ${b.live}`);
    console.log(`  offline renders: ${b.offlineMade - a.offlineMade} made, ${b.offlineRendered - a.offlineRendered} rendered in the window (${b.offlineMade} since load)`);
    if (LEVEL) {
      // the level a second of the theme, in dB, as a power mean of its readings
      const bins = new Map<number, number[]>();
      for (const [at, db] of b.levels) if (at >= 0) { const k = Math.floor(at); if (!bins.has(k)) bins.set(k, []); bins.get(k)!.push(10 ** (db / 10)); }
      const row = [...bins.keys()].sort((x, y) => x - y).map((k) => `${k}:${(10 * Math.log10(bins.get(k)!.reduce((s, x) => s + x, 0) / bins.get(k)!.length)).toFixed(1)}`);
      console.log(`  level by second: ${row.join(' ')}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
