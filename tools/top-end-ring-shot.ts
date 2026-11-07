// top-end-1 (11-02): the ring headless and silent at a few seconds of a link, a picture each (the breather's mark).
//   node tools/top-end-ring-shot.ts <site> <port> <out dir> <link> <name>:<t> [<name>:<t> …] [--play <s>]
import fs from 'node:fs';
import { serveSite } from '../packages/deep-house/tools/imprint/render.ts';
import { playwright, launchOptions, renice } from '@deep-house/engine/harness';

const [site, port, out, link, ...rest] = process.argv.slice(2);
const playAt = rest.indexOf('--play');
const play = playAt >= 0 ? Number(rest[playAt + 1]) : 0;
const shots = rest.filter((x, i) => !x.startsWith('--') && (playAt < 0 || i !== playAt + 1)).map((x) => { const [n, t] = x.split(':'); return { n, t: Number(t) }; });
fs.mkdirSync(out, { recursive: true });
const server = await serveSite(+port, site) as { close: () => void };
const { pw } = await playwright();
const opts = launchOptions('chromium') as Record<string, unknown>;
opts.channel = 'chrome';
opts.args = [...((opts.args as string[]) ?? []), '--mute-audio', '--autoplay-policy=no-user-gesture-required'];
const browser = await pw.chromium.launch(opts);
renice(browser);
try {
  for (const s of shots) {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('pageerror', (e: Error) => console.log('pageerror', String(e).slice(0, 300)));
    await page.goto(`http://127.0.0.1:${port}/index.html?${link}&t=${s.t}&out=silent`, { waitUntil: 'load' });
    await page.waitForTimeout(4000);
    if (play) { await page.keyboard.press('Space'); await page.waitForTimeout(play * 1000); }
    const r = await page.evaluate(`(() => { try { const r = ring.control.readout(); return { s: r.seconds, bar: r.bar, playing: r.playing, bars: r.bars }; } catch (e) { return String(e); } })()`).catch((e: Error) => String(e));
    await page.screenshot({ path: `${out}/${s.n}.png` });
    console.log(s.n, s.t, JSON.stringify(r));
    await ctx.close();
  }
} finally { await browser.close(); server.close(); }
