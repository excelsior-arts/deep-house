// **The headroom of the windows the front rule moved** (round saw-bed): measured over the grid, fitted, and read back.
//
//   node tools/headroom-front.ts --measure --site <built site> [--from 1 --to 40] [--port 6998] [--pages 6]
//       every house main of the grid (`check-program-guards.ts` `grid()`, theme 0 of each seed) at the window its trim
//       is fitted for, rendered at a trim of nought, each 10 ms block's peak ahead of the limiter kept
//       (tmp/analysis/headroom-front.json)
//   node tools/headroom-front.ts --fit [--share-margin <m> --depth-margin <m> --blend 0.5 --gain 0.03 --split <seed>] [--only depth] [--write]
//       the share's and the depth's models on the moved windows (`fit` of tools/loudness-fit.ts, the same selection,
//       a column taken only where it buys more than `--gain` dB held out), and with `--write` the block in the style's
//       JSON (`headroom.front` of deep-house-v2-loudness.json). The margins default to the ones the JSON holds. The
//       held-out figure is nested: five outer folds by seed (seed mod 5), the selection and the fit run again on the
//       other four and scored on the fold's seeds alone; `--split 30` scores seeds 31 and up by a selection and fit on
//       seeds up to 30 instead
//   node tools/headroom-front.ts --report [--names --from 1 --to 12]
//       today's trims against what was measured: the limiter's share and depth at each trim (a trim moves every block
//       ahead of the limiter by itself), how far under its target each theme sits, by the model and with its measured
//       headroom; `--names` writes the themes held more than `SHORT_LU` under their target, each with why, for the
//       gate in tools/check.ts (tools/loudness-shortfall.json)
//
// Why it exists: the house's headroom model was fitted on 120 windows before the front rule was written, and read
// the grid's moved mains 3 dB off either way (rms). It folds two limits into one number: the level 15 % of the blocks
// reach, which is the kick and the bed under it and what a limiter pumps on, and the loudest block, which is the
// clap's hit far more often than anything else's (a window with no clap has 3.9 dB more of it). They have little to
// do with each other, so they are fitted apart and the trim takes the lower (`src/loudness.ts`, `headroomOf`).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { grid, linkOf, playedWith } from './check-program-guards.ts';
import { loudnessFeatures, loudnessFamily, trimWindow, trimTargetLufs, predictedLufs, headroomDb, headroomLimit } from '../src/loudness.ts';
import { fit } from './loudness-fit.ts';
import { playwright, launchOptions, bodyOf, renice } from '@deep-house/engine/harness';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..');
const BLOCK = path.join(HERE, '..', 'src', 'styles', 'deep-house-v2-loudness.json');
export const NAMES = path.join(HERE, 'loudness-shortfall.json');
const METER = path.dirname(fileURLToPath(import.meta.resolve('@deep-house/engine/meter')));
const arg = (k: string, d: string | null = null) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const has = (k: string) => process.argv.includes(`--${k}`);
// `--out` reads or writes a measurement elsewhere (a trial run must not write over the one the block was fitted on)
const OUT = path.resolve(arg('out', path.join(ROOT, 'tmp', 'analysis', 'headroom-front.json'))!);
/** The lines (tools/loudness-fit.ts): the share a trim may use and the depth, and the pumping lines past them. */
const SHARE = 15, DEPTH = 8, SHARE_LINE = 20, DEPTH_LINE = 10;
/** How far under its target a theme may sit before it has to be named (the gate in tools/check.ts). */
export const SHORT_LU = 2;
/** ...about: a theme its own measured headroom would leave within this of the line is one its headroom cannot give back. */
const ABOUT_LU = 0.5;
const quiet = <T,>(fn: () => T): T => { const k = [console.log, console.info, console.warn]; console.log = console.info = console.warn = () => {}; try { return fn(); } finally { [console.log, console.info, console.warn] = k; } };

type Row = { link: string; place: string; seed: string; from: number; bars: number; blocks: number[]; lufs: number };

/** The grid's house mains, planned: the link, the window, the plan. */
function houseMains(from: number, to: number) {
  const out: { link: string; place: string; seed: string; plan: any }[] = [];
  for (const g of grid()) {
    if (g.name === '27191 ambient') continue;
    for (let s = from; s <= to; s++) {
      const link = linkOf(String(s), g.spell, 0);
      const { plan } = quiet(() => playedWith(link));
      if (loudnessFamily(loudnessFeatures(plan, plan.style)) !== 'house') continue;
      out.push({ link, place: g.name, seed: String(s), plan });
    }
  }
  return out;
}

// The window rendered as tools/loudness-fit.ts renders one (two bars of pre-roll, cut out of the compiled program, a
// 1.5 s tail), at a trim of nought, on four channels: the output, and the master ahead of the limiter.
const RENDER = async (job: any) => {
  const meter = await import('/tools/meter.ts' as any);
  const d = (window as any).deepHouse;
  const cast = d.recipesFor({ masterSeed: job.seed, strategy: 'house-v2', search: job.spell ? `?spell=${job.spell}` : '' });
  const track = d.planTheme(job.seed, 0, { masterSeed: job.seed, preset: 'auto', strategy: 'house-v2', spell: cast.spell, recipe: cast.track });
  const bs = track.barSeconds, sr = 48000;
  const tp = Math.max(0, job.from - 2) * bs, t0 = job.from * bs, t1 = (job.from + job.bars) * bs;
  const cut = d.sliceProgram(d.programOf(track), { from: tp, to: t1, tail: 1.5 });
  const slice = { ...cut, trimDb: 0, themeGain: 1 };
  class Quad extends OfflineAudioContext { constructor(_c: number, f: number, s: number) { super(4, f, s); } }
  const buf = await d.renderProgram(slice, { sampleRate: sr, OfflineCtx: Quad, onGraph: (g: any) => {
    const c = g.nodes.chain, ctx = c.ctx as BaseAudioContext;
    ctx.destination.channelCount = 4; ctx.destination.channelCountMode = 'explicit'; ctx.destination.channelInterpretation = 'discrete';
    const m = ctx.createChannelMerger(4), so = ctx.createChannelSplitter(2), sp = ctx.createChannelSplitter(2);
    g.out.disconnect(); g.out.connect(so); so.connect(m, 0, 0); so.connect(m, 1, 1);
    c.master.connect(sp); sp.connect(m, 0, 2); sp.connect(m, 1, 3);
    m.connect(ctx.destination);
  } });
  const from = Math.round((t0 - tp) * sr), to = Math.round((t1 - tp) * sr);
  const ch = [0, 1, 2, 3].map((i) => buf.getChannelData(i));
  const ceiling = slice.settings.master.limiter.ceiling, blk = sr / 100, blocks: number[] = [];
  for (let i = from; i + blk <= to; i += blk) {
    let p = 0;
    for (const c of [ch[2], ch[3]]) for (let j = i; j < i + blk; j++) { const a = Math.abs(c[j]); if (a > p) p = a; }
    blocks.push(+(20 * Math.log10(p / ceiling + 1e-30)).toFixed(2));
  }
  return { planTrim: track.trimDb, lufs: +meter.integratedLoudness([ch[0].slice(from, to), ch[1].slice(from, to)], sr).toFixed(3), blocks };
};

async function measure() {
  const site = path.resolve(arg('site', path.join(ROOT, 'docs'))!);
  const port = +arg('port', '6998')!, pages = +arg('pages', '6')!;
  const mains = houseMains(+arg('from', '1')!, +arg('to', '40')!);
  const jobs = mains.map((m) => { const w = trimWindow(m.plan, m.plan.style); return { link: m.link, place: m.place, seed: m.seed, spell: new URLSearchParams(m.link).get('spell'), from: w.from, bars: w.bars, trim: m.plan.trimDb }; });
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url!, `http://127.0.0.1:${port}`).pathname);
    const file = name.startsWith('/tools/') ? path.join(METER, name.slice(7)) : path.join(site, name === '/' ? '/index.html' : name);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html' : /\.(m?js|ts)$/.test(file) ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : file.endsWith('.css') ? 'text/css' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream' });
    res.end(bodyOf(file));
  });
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', () => r()));
  const { pw } = await playwright();
  const opts = launchOptions('chromium');
  const browser = await pw.chromium.launch({ ...opts, args: [...(opts.args || []), '--disable-gpu', '--mute-audio'] });
  renice(browser);
  const rows: Row[] = new Array(jobs.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(pages, jobs.length) }, async () => {
    let page: any = null, since = 0;
    for (;;) {
      const i = next++;
      if (i >= jobs.length) break;
      if (!page || since >= 20) {
        if (page) await page.close();
        page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${port}/index.html?out=silent`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => (window as any).deepHouse, { timeout: 60000 });
        await page.evaluate(() => { (window as any).requestAnimationFrame = () => 0; });
        renice(browser);
        since = 0;
      }
      const j = jobs[i];
      const r = await page.evaluate(RENDER, j);
      if (r.planTrim !== j.trim) throw new Error(`${j.link}: the page planned a trim of ${r.planTrim} and node ${j.trim}: the site is not this tree`);
      rows[i] = { link: j.link, place: j.place, seed: j.seed, from: j.from, bars: j.bars, blocks: r.blocks, lufs: r.lufs };
      since++;
      process.stdout.write(`\r  ${++done}/${jobs.length}   `);
    }
    if (page) await page.close();
  }));
  await browser.close();
  server.close();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ note: 'The grid\'s house mains at the window each trim is fitted for, at a trim of nought: each 10 ms block\'s peak ahead of the limiter, in dB against its ceiling, and the window\'s integrated loudness at the output.', measuredAt: new Date().toISOString().slice(0, 10), site, rows }) + '\n');
  console.log(`\n${rows.length} windows -> ${path.relative(ROOT, OUT)}`);
}

/** What a measured window allows: the share's line (the block level `SHARE` per cent reach) and the depth's (the loudest block within `DEPTH`). */
function measured(r: Row) {
  const b = [...r.blocks].sort((x, y) => x - y), n = b.length;
  return { share: -b[Math.min(n - 1, Math.floor(n * (100 - SHARE) / 100))], depth: DEPTH - b[n - 1], blocks: b };
}
const activeAt = (b: number[], trim: number) => 100 * b.filter((x) => x + trim > 0).length / b.length;
const quantile = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

/** Every measured row planned again by today's tree, with what the trim reads. */
function readRows() {
  const data = JSON.parse(fs.readFileSync(OUT, 'utf8')) as { rows: Row[] };
  return data.rows.map((r) => {
    const { plan } = quiet(() => playedWith(r.link));
    const style = plan.style, M = style.settings.loudness;
    const w = trimWindow(plan, style);
    if (w.from !== r.from) throw new Error(`${r.link}: the trim is fitted at bar ${w.from} and was measured at ${r.from}: measure again`);
    const f = loudnessFeatures(plan, style);
    const target = trimTargetLufs(plan, style), pred = predictedLufs(plan, style), need = target - pred;
    const s = (need >= 0 ? M.slopeUp : M.slopeDown) || 1;
    return { ...r, f, plan, target, pred, need, s, trim: plan.trimDb as number, m: measured(r), room: headroomDb(plan, style), limit: headroomLimit(plan, style), marginDb: M.headroom.marginDb, clampDb: M.clampDb };
  });
}
const shortOf = (r: { target: number; pred: number }, trim: number, M: { slopeUp: number; slopeDown: number }) => r.target - (r.pred + trim * (trim >= 0 ? M.slopeUp : M.slopeDown));

function doFit() {
  const rows = readRows().filter((r) => r.f.frontLossDb > 0);
  const M = rows[0].plan.style.settings.loudness;
  const block = JSON.parse(fs.readFileSync(BLOCK, 'utf8'));
  // the margins the block carries today, unless asked otherwise (a refit keeps them; a margin is a decision, not a fit)
  const was = block.headroom?.front;
  const shareM = +arg('share-margin', String(was?.share?.marginDb ?? 1.5))!, depthM = +arg('depth-margin', String(was?.depth?.marginDb ?? 0))!;
  const blendDb = +arg('blend', '0.5')!, gain = +arg('gain', '0.03')!;
  const split = arg('split');
  const outer = split != null ? (r: { seed: number }) => (r.seed > +split ? 'held' : null) : (r: { seed: number }) => r.seed % 5;
  const heldOut = split != null ? `seeds ${+split + 1} and up, by a selection and fit on seeds up to ${split}` : 'five outer folds by seed (seed mod 5), the selection and the fit run again on the other four';
  const asRows = (y: 'share' | 'depth') => rows.map((r) => ({ ...r.f, y: r.m[y], seed: +r.seed }));
  // Only the depth line reads the sum clip's columns (`clip: true`; every other fit's pool leaves them out,
  // `loudness-fit.ts` `CLIP_COLUMNS`): the clip reads the share line for the trim it is set for, and its top stands far
  // over the level the share is (round drum-clip). `--only depth` refits the depth line alone and keeps the share the
  // block holds (the clip is planned off it, so a refit share would move what was measured).
  const only = arg('only');
  const share = only === 'depth' ? null : fit(asRows('share'), { max: +arg('max', '12')!, y: 'y', gain, outer });
  const depth = fit(asRows('depth'), { max: +arg('max', '12')!, y: 'y', gain, outer, clip: true });
  console.log(`${rows.length} moved windows; a column buys more than ${gain} dB; held out: ${heldOut}`);
  if (share) console.log(`share (${share.names.length}): ${share.names.join(', ')}; R2 ${share.r2}, in-sample ${share.rmse} dB, held out ${share.cv} dB (the selection's own folds ${share.cvSelection}), margin ${shareM}`);
  else console.log(`share: kept as the block holds it (margin ${was.share.marginDb})`);
  console.log(`depth (${depth.names.length}): ${depth.names.join(', ')}; R2 ${depth.r2}, in-sample ${depth.rmse} dB, held out ${depth.cv} dB (the selection's own folds ${depth.cvSelection}), margin ${depthM}`);
  const model = (m: any, marginDb: number) => ({ marginDb, residual: { r2: m.r2, inSample: m.rmse, crossValidated: m.cv, worstHeldOut: m.cvWorst, selectionCv: m.cvSelection, n: m.n }, intercept: m.intercept, coef: m.coef, centre: m.centre });
  const front = {
    note: 'Written by tools/headroom-front.ts --fit --write: the grid\'s moved house mains rendered at nought, the share line (15 % of the 10 ms blocks) and the depth line (the loudest block 8 dB over) fitted apart, each with its margin; each window rendered with the sum clip its plan sets (round drum-clip), so the depth line reads the room the clip leaves.' + (only === 'depth' ? ' The share line as the block held it (--only depth).' : ''),
    measuredAt: JSON.parse(fs.readFileSync(OUT, 'utf8')).measuredAt,
    sample: { windows: rows.length, seeds: [+arg('from', '1')!, +arg('to', '40')!] },
    selection: { gainDb: gain, heldOut },
    blendDb,
    share: share ? model(share, shareM) : was.share,
    depth: model(depth, depthM),
  };
  if (has('write')) {
    block.headroom = { ...block.headroom, front };
    fs.writeFileSync(BLOCK, JSON.stringify(block, null, 2) + '\n');
    console.log(`wrote headroom.front into ${path.relative(ROOT, BLOCK)}`);
  } else console.log(JSON.stringify(front, null, 1));
  void M;
}

function report() {
  const rows = readRows();
  const M = rows[0].plan.style.settings.loudness;
  const line = (label: string, rs: typeof rows) => {
    const act = rs.map((r) => activeAt(r.m.blocks, r.trim)), deep = rs.map((r) => r.m.blocks[r.m.blocks.length - 1] + r.trim);
    const sh = rs.map((r) => shortOf(r, r.trim, M));
    console.log(`${label} (${rs.length}): under target by more than 2 LU ${sh.filter((x) => x > 2).length}, 3 LU ${sh.filter((x) => x > 3).length}; limiter blocks over p50 ${quantile(act, 0.5).toFixed(1)} % p90 ${quantile(act, 0.9).toFixed(1)} %, past ${SHARE} % ${act.filter((x) => x > SHARE).length}, past ${SHARE_LINE} % ${act.filter((x) => x > SHARE_LINE).length}; deepest p50 ${quantile(deep, 0.5).toFixed(1)} p90 ${quantile(deep, 0.9).toFixed(1)} dB, past ${DEPTH_LINE} dB ${deep.filter((x) => x > DEPTH_LINE).length}`);
  };
  line('every house main', rows);
  line('moved by the front rule', rows.filter((r) => r.f.frontLossDb > 0));
  // ...and each theme more than SHORT_LU under: how far its measured headroom would take it, and what holds it. A
  // window with a sum clip (round drum-clip) was measured with the clip's top where the plan set it, so its loudest
  // block reads that setting and not what the hit allows: the clip could have been set as far as its cap
  // (`catalogue.front.clip.mostDb` past the saw-bed depth line's reading) and the hit follows its top, so the depth it
  // can give is the measured one plus what the cap leaves over the setting.
  const mostDb = (rows[0].plan.style as any).catalogue?.front?.clip?.mostDb ?? 0;
  const depthOf = (r: (typeof rows)[number]) => r.m.depth + (r.f.clipOn ? Math.max(0, r.f.clipDepthDb + mostDb - r.f.clipRoomDb) : 0);
  const named = rows.flatMap((r) => {
    const by = shortOf(r, r.trim, M);
    if (by <= SHORT_LU) return [];
    const depth = depthOf(r);
    const room = Math.min(r.m.share, depth);
    const best = Math.max(-r.clampDb, Math.min(r.clampDb, r.need / r.s, room));
    const truly = shortOf(r, best, M);
    const why = r.trim >= r.clampDb - 1e-9 ? 'clamp' : truly > SHORT_LU - ABOUT_LU ? (depth < r.m.share ? 'depth' : 'share') : 'margin';
    return [{ link: r.link, place: r.place, shortLu: +by.toFixed(2), trimDb: r.trim, heldBy: r.limit, measured: { shareDb: +r.m.share.toFixed(2), depthDb: +depth.toFixed(2), shortAtItLu: +truly.toFixed(2) }, why }];
  });
  const count = (w: string) => named.filter((x) => x.why === w).length;
  console.log(`${named.length} themes more than ${SHORT_LU} LU under: ${count('depth')} held by their loudest block, ${count('share')} by the share, ${count('clamp')} by the clamp, ${count('margin')} by the model's margin only`);
  if (has('names')) {
    const from = +arg('from', '1')!, to = +arg('to', '12')!;
    const keep = named.filter((x) => { const s = +new URLSearchParams(x.link).get('seed')!; return s >= from && s <= to; });
    fs.writeFileSync(NAMES, JSON.stringify({
      note: 'Written by tools/headroom-front.ts --report --names: the grid\'s house mains (seeds ' + `${from}-${to}` + ', theme 0) the trim leaves more than ' + SHORT_LU + ' LU under their target, each with its window measured at nought: how far its own headroom (15 % of the blocks, the loudest 8 dB over; a window with a sum clip, the depth its clip could give at its cap) would take it, and why it stays (depth: its loudest block, the clap\'s hit as a rule, past what the clip may take; share: the kick and the bed; either one when the measured headroom leaves it within ' + ABOUT_LU + ' LU of the line or past it; clamp; margin: the model\'s margin for its own error, its measured headroom would give it back). tools/check.ts fails on a theme past the line that is not named here, and on a name that is no longer past it.',
      measuredAt: JSON.parse(fs.readFileSync(OUT, 'utf8')).measuredAt,
      shortLu: SHORT_LU,
      themes: keep,
    }, null, 1) + '\n');
    console.log(`wrote ${keep.length} names (seeds ${from}-${to}) to ${path.relative(ROOT, NAMES)}`);
  }
}

if (has('measure')) await measure();
else if (has('fit')) doFit();
else if (has('report')) report();
else console.log('one of --measure, --fit, --report');
