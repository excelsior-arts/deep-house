// ring-type (11-05): the ring's centre at a few moments, headless and silent, cropped to the centre, with each line's
// size, ink and place read off the drawing.
//   node tools/ring-type-shots.ts <site> <port> <out dir> <name> [<extra query>] [--only <case>,…] [--sizes phone,…]
// Writes <out>/<name>-<size>-<case>.png and <out>/<name>.json (the lines per shot).
import fs from 'node:fs';
import { serveSite } from '../packages/deep-house/tools/imprint/render.ts';
import { playwright, launchOptions, renice } from '@deep-house/engine/harness';

const args = process.argv.slice(2);
const flag = (k: string) => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const only = flag('--only')?.split(',') ?? null;
const sizesWanted = flag('--sizes')?.split(',') ?? null;
const [site, port, out, name, extra = ''] = args;

// his track (Drive's first, theme 16 of seed 1): its main groove under "the hats grow: the pickups" and under "a
// breather"; the longest line there is ("the hats grow: a tick on the beat", seed 3); a one-line section (the
// intro); each in Japanese
const SPELL = 'v=2&seed=1&theme=16&spell=ro:0.53,gl:0.20,sp:1.00';
const MOMENTS: Record<string, string> = {
  his: `${SPELL}&t=136`,
  breather: `${SPELL}&t=40`,
  long: 'v=2&seed=3&t=108',
  one: `${SPELL}&t=4`,
};
const CASES = Object.entries(MOMENTS).flatMap(([k, q]) => [{ k: `${k}-en`, q: `${q}&lang=en` }, { k: `${k}-ja`, q: `${q}&lang=ja` }])
  .filter((c) => !only || only.some((o) => c.k.startsWith(o)));
const SIZES = [
  { k: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { k: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  { k: 'mini', viewport: { width: 320, height: 320 }, deviceScaleFactor: 2 },
].filter((s) => !sizesWanted || sizesWanted.includes(s.k));

fs.mkdirSync(out, { recursive: true });
const server = await serveSite(+port, site) as { close: () => void };
const { pw } = await playwright();
const opts = launchOptions('chromium') as Record<string, unknown>;
opts.channel = 'chrome';
const browser = await pw.chromium.launch(opts);
renice(browser);
const report: Record<string, unknown> = {};
try {
  for (const size of SIZES) {
    const { k: sk, ...ctxOpts } = size;
    for (const c of CASES) {
      const ctx = await browser.newContext(ctxOpts);
      const page = await ctx.newPage();
      page.on('pageerror', (e: Error) => console.log('pageerror', String(e).slice(0, 300)));
      const url = `http://127.0.0.1:${port}/index.html?${c.q}${extra ? `&${extra}` : ''}&out=silent`;
      await page.goto(url, { waitUntil: 'load' });
      // the set ready and the fonts in, then played (the centre's reading shows once it has started), then a second
      // for the fit
      await page.waitForFunction(`(() => { try { const r = ring.control.readout(); return document.fonts.status === 'loaded' && r && r.section; } catch (e) { return false; } })()`, null, { timeout: 30000 }).catch(() => {});
      await page.keyboard.press('Space');
      await page.waitForFunction(`(() => { try { return ring.control.readout().playing && !!document.querySelector('#core g[opacity="1"]'); } catch (e) { return false; } })()`, null, { timeout: 30000 }).catch(() => console.log('not playing', c.k));
      await page.waitForTimeout(1500);
      const got = await page.evaluate(`(() => {
        const svg = document.querySelector('#core').ownerSVGElement;
        const r = ring.control.readout();
        const ground = document.querySelector('#core circle.ground').getBoundingClientRect();
        const lines = [...document.querySelectorAll('#core text')].filter((t) => t.textContent && getComputedStyle(t).visibility !== 'hidden').map((t) => {
          const b = t.getBBox();
          return { text: t.textContent, cls: t.getAttribute('class') || '', size: +t.getAttribute('font-size'), y: +(+t.getAttribute('y') - 500).toFixed(2),
            op: +t.getAttribute('opacity'), ls: +t.getAttribute('letter-spacing'), w: +b.width.toFixed(1), x0: +(b.x - 500).toFixed(1) };
        });
        const cv = document.createElement('canvas').getContext('2d');
        cv.font = '100px Jost'; const capJost = cv.measureText('H').actualBoundingBoxAscent / 100;
        return { section: r.section, sub: r.sub, chord: r.chord, seconds: r.seconds, bar: r.bar, unitPx: ground.width / 300,
          crop: { x: ground.left + ground.width / 2, y: ground.top + ground.height / 2, r: ground.width / 2 }, lines, capJost };
      })()`) as { crop: { x: number; y: number; r: number }; [k: string]: unknown };
      const k = 1.42;
      const vw = ctxOpts.viewport.width, vh = ctxOpts.viewport.height;
      const half = got.crop.r * k;
      const x = Math.max(0, got.crop.x - half), y = Math.max(0, got.crop.y - half);
      const clip = { x, y, width: Math.min(vw - x, 2 * half), height: Math.min(vh - y, 2 * half) };
      await page.screenshot({ path: `${out}/${name}-${sk}-${c.k}.png`, clip });
      if (c.k === 'his-en') await page.screenshot({ path: `${out}/${name}-${sk}-${c.k}-full.png` });
      report[`${sk}-${c.k}`] = got;
      const ls = (got.lines as { text: string; size: number; y: number; op: number }[]).map((l) => `${l.text}@${l.size}/${l.y}`).join(' | ');
      console.log(`${name} ${sk} ${c.k}: ${ls}`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
fs.writeFileSync(`${out}/${name}.json`, JSON.stringify(report, null, 1));
