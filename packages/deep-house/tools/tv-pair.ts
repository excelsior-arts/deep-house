// **The phone and its TV, side by side in a headless browser** (round tv-scene). Two pages of one site in one
// browser context (one storage, as the app's two web views share one data store): the phone's at a phone's size with
// a stand-in for the app's shell (`deepHouseShell`, ShellScript.swift), and the TV's (`view=tv`) at 1920 x 1080 with
// the TV's. Node is the shell between them: what the phone's page sends for the TV is handed to the TV's page, as
// ShellBridge.swift and TVScene.swift do in the app. Then a tour: play, a minute of the two rings read together (the
// second and the beat each draws, at one instant of the clock both read), a bird pulled by a finger on the phone, a
// skip, a seam, a pause, a tilt; each frame rate; a picture of the TV at each step.
//
//   node tools/tv-pair.ts --url http://127.0.0.1:7510/ --out <dir> [--delay 0] [--minute 60] [--link 'seed=1&v=2']
//                         [--tv-size 1920x1080@1]
//
// Silent (`out=silent`, Chrome's `--mute-audio`), headless, and it writes only into `--out`.

import fs from 'node:fs';
import path from 'node:path';
import { playwright, launchOptions, renice } from '@deep-house/engine/harness';

const arg = (k: string, d: string): string => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const URL0 = arg('url', 'http://127.0.0.1:7510/');
const OUT = arg('out', '');
const DELAY = Number(arg('delay', '0'));
const MINUTE = Number(arg('minute', '60'));
const LINK = arg('link', 'seed=1&v=2');
/**
 * `--measure <s>`: no tour; once playing, what each page and the browser's processes spend over that many seconds
 * (the main thread's task time by the page's own metrics, every process's CPU time), and each ring's frame rate.
 * `--phone-fast` takes the phone's screen as a 120 Hz one's (its full rate 60), `--no-rest` keeps the phone at its
 * full rate while the TV is shown, `--tv-half` draws the TV at 30, `--no-tv` leaves the TV's page out.
 */
const MEASURE = Number(arg('measure', '0'));
/**
 * `--tv-size <w>x<h>[@<dpr>]`: the TV's page at that size and pixel ratio (1920x1080@1 when unset). Round tv-4k: a 4K
 * TV as the app drew it before (3840x2160@1, the ring at its cap), magnified (1920x1080@1: the page's work is a 1080
 * TV's; the magnifying is the compositor's) and zoomed (1920x1080@2: the 1080 layout drawn at 4K's pixels).
 */
const TV_SIZE = /^(\d+)x(\d+)(?:@([\d.]+))?$/.exec(arg('tv-size', '1920x1080@1'));
if (!TV_SIZE) { console.error('tv-pair: --tv-size <w>x<h>[@<dpr>]'); process.exit(2); }
const FLAG = (k: string) => process.argv.includes(`--${k}`);
if (!OUT) { console.error('tv-pair: --out <dir> is needed'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const log = fs.createWriteStream(path.join(OUT, 'tv-pair.jsonl'));
const note = (o: Record<string, unknown>) => { const line = JSON.stringify({ t: +(performance.now() / 1000).toFixed(3), ...o }); log.write(line + '\n'); console.log(line.slice(0, 400)); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The app's shell, as ShellScript.swift writes it, with `send` handed to node. */
const shellJs = (tv: boolean) => `(() => {
  const shell = { platform: 'ios'${tv ? ", tv: true" : ''} };
  const handlers = {};
  Object.defineProperty(shell, 'send', { enumerable: false, value: (m) => { if (m && typeof m === 'object' && typeof m.ev === 'string') window.__shellSend(m); } });
  Object.defineProperty(shell, 'on', { enumerable: false, value: (kind, fn) => { if (typeof kind === 'string' && typeof fn === 'function') handlers[kind] = fn; } });
  Object.defineProperty(shell, 'receive', { enumerable: false, value: (m) => { const fn = m && handlers[m.kind]; if (fn) { try { fn(m); } catch (e) { setTimeout(() => { throw e; }); } } return !!fn; } });
  Object.defineProperty(window, 'deepHouseShell', { value: Object.freeze(shell), enumerable: false });
})();`;

/** One reading of a page's ring at one instant of the shared clock. */
const READ = `(() => { const r = ring.control.readout(); const now = performance.timeOrigin + performance.now();
  return { now, s: r.seconds, beat: r.bar * 4 + r.beatInBar + r.beatPhase, theme: r.mix.themeNumber, seed: r.seed, playing: r.playing,
    bars: r.bars, bpm: r.gridBpm, cells: ring.cells().map((c) => +c.radius.toFixed(4)), held: ring.cells().filter((c) => c.held).map((c) => c.bird + ':' + c.value),
    line_s: window.deepHouse && window.deepHouse.tvLine ? window.deepHouse.tvLine() : null,
    dot: [...document.querySelectorAll('#beatDots circle')].findIndex((c) => +c.getAttribute('opacity') > 0.5),
    tilt: document.getElementById('tilt').style.transform, next: ring.nextDrawn().sig, line: document.getElementById('nowList').hidden ? '' : document.getElementById('nowList').textContent }; })()`;

const { pw } = await playwright();
const opts = launchOptions('chromium') as Record<string, unknown>;
opts.channel = 'chrome';
const browser = await pw.chromium.launch(opts);
renice(browser);
// (two contexts, since a touch screen is a context's: the TV's page starts with no storage of its own and waits for
// the phone's word, where the app's one store would have given it the phone's place a moment earlier)
const phoneCtx = await browser.newContext({ viewport: { width: 420, height: 810 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
const tvCtx = await browser.newContext({ viewport: { width: +TV_SIZE[1], height: +TV_SIZE[2] }, deviceScaleFactor: +(TV_SIZE[3] ?? 1) });
const phone = await phoneCtx.newPage();
const tv = await tvCtx.newPage();
for (const [p, name] of [[phone, 'phone'], [tv, 'tv']] as const) {
  p.on('console', (m: { type(): string; text(): string }) => { if (m.type() === 'error' || m.type() === 'warning') note({ ev: 'console', page: name, type: m.type(), text: m.text().slice(0, 300) }); });
  p.on('pageerror', (e: Error) => note({ ev: 'pageerror', page: name, text: String(e).slice(0, 400) }));
}

let bytes = 0, msgs = 0;
const counts: Record<string, number> = {};
await phone.exposeFunction('__shellSend', async (m: Record<string, unknown>) => {
  if (m.ev !== 'tv') return;
  const { ev, ...rest } = m;
  void ev;
  const text = JSON.stringify(rest);
  bytes += text.length; msgs += 1;
  counts[String(rest.t)] = (counts[String(rest.t)] ?? 0) + 1;
  if (rest.t === 'place') note({ ev: 'said-place', theme: rest.theme, seed: rest.seed, change: rest.change, sig: String(rest.sig).slice(-8) });
  await tv.evaluate(`window.deepHouseShell && window.deepHouseShell.receive(${JSON.stringify({ kind: 'tv', ...rest })})`).catch(() => {});
});
await tv.exposeFunction('__shellSend', async (m: Record<string, unknown>) => {
  if (m.ev === 'tv-page' && m.what === 'ready') {
    await tv.evaluate(`window.deepHouseShell.receive(${JSON.stringify({ kind: 'tv', t: 'delay', fixed: DELAY })})`);
    await phone.evaluate(`window.deepHouseShell.receive({ kind: 'tv', on: true, again: true, rest: ${!FLAG('no-rest')} })`);
  }
  if (m.ev === 'tv-page' && m.what === 'plan') note({ ev: 'tv-plan', same: m.same, ms: m.ms, mine: m.mine, phone: m.phone });
});
await phone.addInitScript(shellJs(false) + (FLAG('phone-fast') ? 'window.__deepHouseFastScreen = true;' : ''));
await tv.addInitScript(shellJs(true) + (FLAG('tv-half') ? 'window.__deepHouseTvHalf = true;' : ''));

await phone.goto(`${URL0}?${LINK}&out=silent`);
await phone.waitForFunction('window.ring && window.ring.control');
if (!FLAG('no-tv')) {
  await tv.goto(`${URL0}?view=tv`);
  await tv.waitForFunction('window.ring && window.ring.control');
}
note({ ev: 'loaded', phone: phone.url(), tv: tv.url() });

let shot = 0;
const picture = async (name: string) => {
  shot += 1;
  const file = path.join(OUT, `${String(shot).padStart(2, '0')}-${name}.png`);
  await tv.screenshot({ path: file });
  const pf = path.join(OUT, `${String(shot).padStart(2, '0')}-${name}-phone.png`);
  await phone.screenshot({ path: pf });
  note({ ev: 'picture', name, tv: file, phone: pf });
};
/** Both rings at one instant: the phone read, the TV read, the TV's second carried back to the phone's instant. */
const pair = async (label: string) => {
  if (FLAG('no-tv')) return {} as Record<string, any>;
  const a = await phone.evaluate(READ) as Record<string, any>;
  const b = await tv.evaluate(READ) as Record<string, any>;
  // the TV's reading carried to the phone's instant, at the speed the set plays
  const back = b.playing ? (b.now - a.now) / 1000 : 0;
  // against the phone's ring as drawn (its clock's last step), and against the set's line the anchors carry
  const ds = (b.s - back) - a.s + (a.playing ? DELAY / 1000 : 0);
  const dl = a.line_s == null ? null : (b.s - back) - a.line_s + (a.playing ? DELAY / 1000 : 0);
  const beatErr = ds * (a.bpm / 60);
  const row = { ev: 'pair', label, theme: [a.theme, b.theme], seed: [a.seed, b.seed], playing: [a.playing, b.playing], phoneS: +a.s.toFixed(3), tvS: +b.s.toFixed(3),
    dsMs: +(ds * 1000).toFixed(1), lineMs: dl == null ? null : +(dl * 1000).toFixed(1), beatErr: +beatErr.toFixed(4), cellsSame: JSON.stringify(a.cells) === JSON.stringify(b.cells), held: [a.held, b.held],
    nextSame: a.next === b.next, dot: [a.dot, b.dot], beats: [+a.beat.toFixed(2), +b.beat.toFixed(2)], line: [a.line, b.line], tilt: b.tilt };
  note(row);
  return row;
};
const fps = async (p: typeof phone, ms = 3000) => p.evaluate(`(async () => { ring.resetTimings(); await new Promise((r) => setTimeout(r, ${ms})); return ring.timings(); })()`);

await wait(1500);
await picture('attached-stopped');
await pair('stopped');

// play
await phone.evaluate('ring.control.start()');
await phone.waitForFunction('ring.control.state.playing', null, { timeout: 30000 });
await wait(2500 + DELAY);
await picture('playing');
if (MEASURE > 0) {
  const pages = FLAG('no-tv') ? [['phone', phone]] as const : [['phone', phone], ['tv', tv]] as const;
  const cdp = await Promise.all(pages.map(async ([, p]) => { const s = await p.context().newCDPSession(p); await s.send('Performance.enable'); return s; }));
  const task = async () => Promise.all(cdp.map(async (s) => ((await s.send('Performance.getMetrics')).metrics as Array<{ name: string; value: number }>).find((m) => m.name === 'TaskDuration')!.value));
  const bcdp = await browser.newBrowserCDPSession();
  const procs = async () => ((await bcdp.send('SystemInfo.getProcessInfo')).processInfo as Array<{ type: string; id: number; cpuTime: number }>);
  await wait(4000);
  for (const [, p] of pages) await p.evaluate('ring.resetTimings()');
  const t0 = await task(), p0 = await procs(), w0 = Date.now();
  await wait(MEASURE * 1000);
  const t1 = await task(), p1 = await procs(), span = (Date.now() - w0) / 1000;
  const cpu: Record<string, number> = {};
  for (const q of p1) { const was = p0.find((x) => x.id === q.id); if (was) cpu[q.type] = (cpu[q.type] ?? 0) + (q.cpuTime - was.cpuTime) / span * 100; }
  const fps = await Promise.all(pages.map(async ([, p]) => (await p.evaluate('ring.timings()') as { fps: number }).fps));
  note({ ev: 'measure', flags: process.argv.filter((a) => a.startsWith('--') && !['--url', '--out', '--measure'].includes(a)), seconds: +span.toFixed(1),
    mainThreadPct: Object.fromEntries(pages.map(([n], i) => [n, +((t1[i] - t0[i]) / span * 100).toFixed(1)])),
    fps: Object.fromEntries(pages.map(([n], i) => [n, fps[i]])), processCpuPct: Object.fromEntries(Object.entries(cpu).map(([k, v]) => [k, +v.toFixed(1)])) });
  await browser.close();
  log.end();
  process.exit(0);
}
const rows: Array<Record<string, any>> = [];
const t0 = Date.now();
while (Date.now() - t0 < MINUTE * 1000) { rows.push(await pair('minute')); await wait(2000); }
const same = rows.filter((r) => r.theme[0] === r.theme[1]);
const stat = (xs: number[]) => ({ n: xs.length, mean: +(xs.reduce((x, y) => x + y, 0) / Math.max(1, xs.length)).toFixed(1), maxAbs: Math.max(...xs.map(Math.abs)), first: xs[0], last: xs[xs.length - 1] });
note({ ev: 'drift', againstRing: stat(same.map((r) => r.dsMs)), againstLine: stat(same.filter((r) => r.lineMs != null).map((r) => r.lineMs)) });
note({ ev: 'fps', phone: await fps(phone), tv: await fps(tv) });
note({ ev: 'feed', msgs, bytes, perSecond: +(bytes / ((Date.now() - t0) / 1000 + 5)).toFixed(0), counts });

// a bird pulled by a finger on the phone: down on its node, three moves outwards, held, then up
const drag = async (i: number, steps: number[]) => {
  const at = await phone.evaluate(`(() => { const g = document.querySelectorAll('#starCells > g')[${i}]; const c = g && (g.querySelector('circle') || g); const b = c.getBoundingClientRect();
    const t = document.getElementById('tilt').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, cx: t.left + t.width / 2, cy: t.top + t.height / 2 }; })()`) as { x: number; y: number; cx: number; cy: number };
  const fire = (type: string, x: number, y: number) => phone.evaluate(`(() => { const el = document.elementFromPoint(${x}, ${y}) || document.getElementById('tilt');
    el.dispatchEvent(new PointerEvent('${type}', { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: ${x}, clientY: ${y}, bubbles: true, cancelable: true, composed: true, button: 0, buttons: ${type === 'pointerup' ? 0 : 1} })); })()`);
  await fire('pointerdown', at.x, at.y);
  for (const k of steps) {
    const x = at.cx + (at.x - at.cx) * k, y = at.cy + (at.y - at.cy) * k;
    await fire('pointermove', x, y);
    await wait(120);
  }
  await wait(400);
  await pair(`drag ${i} held`);
  await picture(`drag-${i}-held`);
  const x = at.cx + (at.x - at.cx) * steps[steps.length - 1], y = at.cy + (at.y - at.cy) * steps[steps.length - 1];
  await fire('pointerup', x, y);
};
await drag(0, [1.05, 1.15, 1.25, 1.32]);
await wait(600);
await pair('drag released');
await picture('drag-released');
await wait(10000 + DELAY);
await pair('drag landed?');

// a tilt, through the shell to both pages (the phone's own ring leans too)
for (const g of [[0, -0.82, -0.57], [0.14, -0.81, -0.57], [0.14, -0.81, -0.57]]) {
  for (const p of [phone, tv]) await p.evaluate(`window.deepHouseShell.receive(${JSON.stringify({ kind: 'tilt', g, o: 'portrait' })})`);
  await wait(300);
}
await wait(400);
await pair('tilted');
await picture('tilted');

// a skip
await phone.evaluate('ring.skip()');
await wait(500);
await pair('skip asked');
await picture('skip-asked');
await phone.waitForFunction('ring.control.readout().mix.themeNumber === 2', null, { timeout: 90000 }).catch(() => note({ ev: 'skip-timeout' }));
await wait(1500 + DELAY);
await pair('skip landed');
await picture('skip-landed');
// a seam: the theme's end, by a seek near it
await phone.evaluate('(() => { const r = ring.control.readout(); ring.control.seekTo(Math.max(0, (r.mix.seamAt - 6) / r.duration), true); })()');
await wait(1500 + DELAY);
await pair('before seam');
await phone.waitForFunction('ring.control.readout().mix.themeNumber === 3', null, { timeout: 120000 }).catch(() => note({ ev: 'seam-timeout' }));
await wait(200);
await picture('seam');
await wait(4000 + DELAY);
await pair('after seam');
// a pause
await phone.evaluate('ring.control.stop()');
await wait(1000 + DELAY);
await pair('paused');
await picture('paused');
note({ ev: 'tv-state', state: await tv.evaluate('window.deepHouse && window.deepHouse.tv ? window.deepHouse.tv() : null') });
note({ ev: 'feed-total', msgs, bytes, counts });
await browser.close();
log.end();
