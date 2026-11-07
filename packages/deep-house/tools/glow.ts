// **What the ring's glow costs at a change of look** (round glow). Opens the ring stopped on a desktop's square and a
// phone's, and logs every frame's gap round three changes of look:
//   - `wear`: the ring's colour stepped by hand (`ring.wear`, the path a playlist's track and a crossing's swap take),
//     to a far colour and back, three times;
//   - `die`: the die thrown stopped (`ring.newMix`), its fold and its rebuild, three times;
//   - `bare`: the same colour step with the glow's blur taken off the page (every `filter` attribute removed), the
//     cost of the drawing without it;
//   - `steady`: six seconds of the set playing, every frame (the glow's cost when nothing changes look);
//   - `swap`: a playlist's crossing whose colour walks (Vibe's peach track into its teal one), from a bar before the
//     crossing's end to a second and a half past its swap;
//   - `pictures`: the same crossing photographed still at stated seconds (`ring.still`), so two looks are the same
//     instant to compare: at rest before the lead, half way through the colour's walk, a breath before the swap, and
//     four bars into the arriving track; written to --out as `<glow>-<browser>-<square>-<mark>.png`.
// Prints one JSON line per run: for each change the longest frame in the 1.2 s after it, and every frame over 50 ms.
//
//   node tools/glow.ts --site <built site> --port 7371 [--browsers chromium,webkit] [--squares desktop,phone]
//                      [--glows gpu,svg] [--tests wear,die,bare,steady,swap,pictures] [--times 3]
//
// `--glows`: `gpu` is the page as it ships (the glow on the compositor, round glow); `svg` puts the bloom back as the
// SVG filter it was before (the halo sheets hidden, `#bloom` on the bloomed groups), for a before and after.
//
// Headless and silent (`?out=silent`, Chromium muted).
import fs from 'node:fs';
import path from 'node:path';
import { siteDir, serve, playwright, pageUrl, launchOptions } from '@deep-house/engine/harness';

const arg = (k: string, d: string): string => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const BROWSERS = arg('browsers', 'chromium,webkit').split(',');
const SQUARES = arg('squares', 'desktop,phone').split(',');
const TESTS = arg('tests', 'wear,die,bare').split(',');
const GLOWS = arg('glows', 'gpu').split(',');
// the bloom as it was: the SVG filter on its groups, the compositor's halo sheets gone
const AS_SVG = `document.querySelectorAll('#tilt .halo').forEach((n) => n.remove()); document.querySelectorAll('[data-bloom]').forEach((n) => n.setAttribute('filter', n.getAttribute('data-bloom')))`;
const TIMES = Number(arg('times', '3'));
// `--eval <js>`: run in the page once it has opened, before anything is measured (an experiment's switch)
const EVAL = arg('eval', '');
const OUT = path.resolve(arg('out', 'tmp/agents/glow'));
const LINK = arg('link', 'v=2&seed=1');
// Vibe's ninth track into its tenth: peach to teal (round keys-colour's crossing)
const SWAP = 'seed=6&v=2&spell=em:0.95,ti:0.63,ro:0.75,gl:0.36,ve:0.60,sp:0.85,lo:0.85&in=vibe';
const SQ: Record<string, object> = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: false },
};

const LOGGER = `(() => {
  const log = [];
  window.__glowLog = log;
  window.__glowRun = true;
  let last = performance.now();
  const tick = (t) => { log.push([t, t - last]); last = t; if (window.__glowRun) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
})()`;
const FAR = { ember: 0.95, tide: 0.63, root: 0.75, gleam: 0.36, veil: 0.6, spark: 0.85, loom: 0.85 };
const NEAR = { ember: 0.2, tide: 0.3, root: 0.4, gleam: 0.8, veil: 0.2, spark: 0.3, loom: 0.4 };

async function one(browser: any, name: string, sq: string, GLOW: string) {
  const ctx = await browser.newContext({ ...SQ[sq] });
  const page = await ctx.newPage();
  const out: any = { browser: name, square: sq, glow: GLOW };
  try {
    await page.goto(pageUrl(TESTS.includes('swap') || TESTS.includes('pictures') ? SWAP : LINK), { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForFunction(() => (window as any).ring && (window as any).ring.control, null, { timeout: 20000 });
    await page.waitForFunction(() => !((window as any).ring.opening && (window as any).ring.opening()), null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);
    if (GLOW === 'svg') await page.evaluate(AS_SVG);
    if (EVAL) await page.evaluate(EVAL);
    await page.evaluate(LOGGER);
    const change = async (label: string, fn: string) => {
      await page.waitForTimeout(500);
      const t0: number = await page.evaluate(`(() => { const t = performance.now(); ${fn}; return t; })()`);
      await page.waitForTimeout(1200);
      const log: [number, number][] = await page.evaluate('window.__glowLog');
      const after = log.filter(([t]) => t > t0 && t < t0 + 1200);
      const slow = after.filter(([, d]) => d > 50).map(([t, d]) => `${Math.round(t - d - t0)}+${Math.round(d)}`);
      return { label, max: Math.round(Math.max(0, ...after.map(([, d]) => d))), slow };
    };
    const runs: any[] = [];
    for (const test of TESTS) {
      if (test === 'bare') await page.evaluate(`document.querySelectorAll('#tilt [filter]').forEach((n) => n.removeAttribute('filter')); document.querySelectorAll('#tilt .halo').forEach((n) => n.remove())`);
      for (let k = 0; k < TIMES; k++) {
        if (test === 'wear' || test === 'bare') {
          runs.push({ test, ...(await change('far', `window.ring.wear(${JSON.stringify(FAR)})`)) });
          runs.push({ test, ...(await change('near', `window.ring.wear(${JSON.stringify(NEAR)})`)) });
        } else if (test === 'die') {
          runs.push({ test, ...(await change('die', 'window.ring.newMix()')) });
          await page.waitForTimeout(1500);
        }
      }
      if (test === 'steady') {
        await page.evaluate(`(async () => { const c = window.ring.control; if (!c.state.playing) await Promise.race([c.start(), new Promise((r) => setTimeout(r, 15000))]); })()`);
        await page.waitForTimeout(1500);
        const t0: number = await page.evaluate('performance.now()');
        await page.waitForTimeout(6000);
        const log: [number, number][] = await page.evaluate('window.__glowLog');
        const d = log.filter(([t]) => t > t0 && t < t0 + 6000).map(([, x]) => x).sort((a, b) => a - b);
        const q = (p: number) => +d[Math.min(d.length - 1, Math.floor(p * d.length))].toFixed(1);
        runs.push({ test, label: 'playing', frames: d.length, median: q(0.5), p95: q(0.95), max: Math.round(d[d.length - 1]), slow: d.filter((x) => x > 50).map(Math.round) });
      }
      if (test === 'pictures') {
        fs.mkdirSync(OUT, { recursive: true });
        // the star held north and the sway off (reduced motion), so two looks photographed at one stated second are one
        // drawing but for the glow
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.evaluate(`(async () => { const c = window.ring.control; if (!c.state.playing) await Promise.race([c.start(), new Promise((r) => setTimeout(r, 15000))]); })()`);
        await page.waitForFunction(`window.ring.control.seamAt > 0`, null, { timeout: 15000 });
        await page.waitForTimeout(1200);
        const marks = await page.evaluate(`(() => {
          const c = window.ring.control, r = c.readout();
          return { rest: Math.max(0, c.seamAt - 12 * r.barSeconds), bar: r.barSeconds, seam: c.seamAt, theme: r.seed + '/' + r.mix.themeNumber };
        })()`);
        const shoot = async (mark: string, at: string) => {
          await page.evaluate(`window.ring.still(true, ${at})`);
          await page.waitForTimeout(500);
          const b = await page.evaluate(`(() => { const r = document.getElementById('tilt').getBoundingClientRect(); return { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: r.width + 16, height: r.height + 16 }; })()`);
          fs.writeFileSync(path.join(OUT, `${GLOW}-${name}-${sq}-${mark}.png`), await page.screenshot({ clip: b }));
          await page.evaluate('window.ring.still(false)');
        };
        const walkNow = `(() => { const q = window.ring.control.readout(), m = q.mix || {}; return { e: 0.5 * (m.lead || 0) + 0.5 * (m.crossing || 0), crossing: m.crossing || 0, at: q.position ?? window.ring.control.state.position, theme: q.seed + '/' + m.themeNumber }; })()`;
        const until = async (ok: (w: any) => boolean) => { for (let k = 0; k < 2400; k++) { const w = await page.evaluate(walkNow); if (ok(w)) return w; await page.waitForTimeout(25); } return null; };
        await page.evaluate(`(() => { const c = window.ring.control, r = c.readout(); c.seekTo(${marks.rest} / r.duration, true); })()`);
        await page.waitForTimeout(800);
        await shoot('rest', String(marks.rest));
        // live from a bar before the lead: each mark photographed at the second the set stood at when it was reached
        await page.evaluate(`(() => { const c = window.ring.control, r = c.readout(); c.seekTo(Math.max(0, ${marks.seam} - 9 * ${marks.bar}) / r.duration, true); })()`);
        const got: Record<string, number> = {};
        for (const [m, ok] of [['half', (w: any) => w.e >= 0.5], ['pre', (w: any) => w.crossing >= 0.97]] as const) {
          const w = await until((w) => w.theme !== marks.theme || ok(w));
          if (!w || w.theme !== marks.theme) break;
          got[m] = w.e;
          await shoot(m, 'undefined');
        }
        if (await until((w) => w.theme !== marks.theme)) { await page.waitForTimeout(1500); await shoot('after', '4 * window.ring.control.readout().barSeconds'); }
        runs.push({ test, label: 'pictures', marks: { ...marks, ...got }, slow: [] });
      }
      if (test === 'swap') {
        await page.evaluate(`(async () => { const c = window.ring.control; if (!c.state.playing) await Promise.race([c.start(), new Promise((r) => setTimeout(r, 15000))]); })()`);
        await page.waitForTimeout(1200);
        const theme0 = await page.evaluate(`(() => { const q = window.ring.control.readout(); return q.seed + '/' + q.mix.themeNumber; })()`);
        // a bar before the crossing's end: the needle at the record's seam, less the lead's eight bars, then on to the swap
        await page.evaluate(`(() => { const c = window.ring.control, r = c.readout(); c.seekTo(Math.max(0, c.seamAt - 10 * r.barSeconds) / r.duration, true); })()`);
        await page.waitForTimeout(1500);
        const t0: number = await page.evaluate('performance.now()');
        let swapAt = 0;
        for (let k = 0; k < 1500 && !swapAt; k++) {
          await page.waitForTimeout(40);
          swapAt = await page.evaluate(`(() => { const q = window.ring.control.readout(); return q.seed + '/' + q.mix.themeNumber !== ${JSON.stringify(theme0)} ? performance.now() : 0; })()`);
        }
        await page.waitForTimeout(1500);
        const log: [number, number][] = await page.evaluate('window.__glowLog');
        const all = log.filter(([t]) => t > t0 && t < (swapAt || t0) + 1500);
        const d = all.map(([, x]) => x).sort((a, b) => a - b);
        const q = (p: number) => +d[Math.min(d.length - 1, Math.floor(p * d.length))].toFixed(1);
        runs.push({ test, label: swapAt ? 'swapped' : 'no swap', frames: d.length, seconds: +((all.length ? all[all.length - 1][0] - all[0][0] : 0) / 1000).toFixed(1), median: q(0.5), p95: q(0.95), max: Math.round(d[d.length - 1]),
          slow: all.filter(([, x]) => x > 50).map(([t, x]) => `${((t - x - swapAt) / 1000).toFixed(2)}s+${Math.round(x)}`),
          // the three longest frames, and where they stood against the swap
          top: [...all].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, x]) => `${((t - x - swapAt) / 1000).toFixed(2)}s+${Math.round(x)}`) });
      }
    }
    out.runs = runs;
    const by: Record<string, number[]> = {};
    for (const r of runs) (by[r.test] ??= []).push(r.max);
    out.max = Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v]));
  } catch (e) {
    out.error = String((e as Error).stack || e);
  } finally {
    await ctx.close();
  }
  return out;
}

const site = siteDir();
const server = await serve(site);
const { pw } = await playwright();
for (const name of BROWSERS) {
  const browser = await pw[name].launch({ ...launchOptions(name), ...(name === 'chromium' ? { channel: 'chromium' } : {}) });
  try {
    for (const sq of SQUARES) for (const g of GLOWS) console.log(JSON.stringify(await one(browser, name, sq, g)));
  } finally { await browser.close(); }
}
server.close();
process.exit(0);
