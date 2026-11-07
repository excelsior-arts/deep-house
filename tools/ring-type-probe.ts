// ring-type (11-05): a link's plan and sub-sections, read off the page (headless, silent).
//   node tools/ring-type-probe.ts <site> <port> <query> [<t> …]: the plan, then the section and sub-section at each t
import { serveSite } from '../packages/deep-house/tools/imprint/render.ts';
import { playwright, launchOptions, renice } from '@deep-house/engine/harness';
const [site, port, q, ...ts] = process.argv.slice(2);
const server = await serveSite(+port, site) as { close: () => void };
const { pw } = await playwright();
const opts = launchOptions('chromium') as Record<string, unknown>;
opts.channel = 'chrome';
const browser = await pw.chromium.launch(opts);
renice(browser);
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/index.html?${q}&out=silent`, { waitUntil: 'load' });
  await page.waitForFunction(`(() => { try { return !!ring.control.readout().section; } catch (e) { return false; } })()`, null, { timeout: 30000 });
  const r = await page.evaluate(`(() => { const r = ring.control.readout(); return { barSeconds: r.barSeconds, bars: r.bars, duration: r.duration, plan: r.plan.map((p) => ({ ...p })), keys: Object.keys(r) }; })()`);
  console.log(JSON.stringify(r).slice(0, 6000));
  for (const t of ts) {
    const p = await browser.newPage();
    await p.goto(`http://127.0.0.1:${port}/index.html?${q}&t=${t}&out=silent`, { waitUntil: 'load' });
    await p.waitForFunction(`(() => { try { return !!ring.control.readout().section; } catch (e) { return false; } })()`, null, { timeout: 30000 });
    await p.waitForTimeout(300);
    console.log(t, await p.evaluate(`(() => { const r = ring.control.readout(); return JSON.stringify([r.seconds.toFixed(1), r.bar, r.section, r.sub, r.chord]); })()`));
    await p.close();
  }
} finally { await browser.close(); server.close(); }
