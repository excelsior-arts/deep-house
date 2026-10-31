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
//   node tools/headroom-front.ts --measure ... --places "ring gleam,ring gleam+root" --out <file>
//       only those places of the grid, into a file of their own
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
import { FAMILIES, familyPreset, subPreset, presetSpell } from '../src/genres/genre-table.ts';
import type { Spell } from '../src/spell.ts';
import { FEATURED } from '../src/featured.ts';
import { linkRead, linkWrite } from '../src/link.ts';
import { beatOfTrack, allowanceOf, loudnessFeatures, loudnessFamily, trimWindow, trimTargetLufs, predictedLufs, headroomDb, headroomLimit, trimSlope } from '../src/loudness.ts';
import { TIMBRES, levelKeyOfRole } from '@deep-house/engine/voices';
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

type Row = { link: string; place: string; seed: string; theme?: number; solo?: string; atTrim?: number; walk?: string; from: number; bars: number; blocks: number[]; lufs: number };

// `--families house,drumless`: the families of the trim's window a source keeps (the house's alone by default; round
// loudness-place reads the ambient's swells too)
const FAMS = (arg('families') ?? 'house').split(',');
// `--only-beat`: only the themes reading more than nought on the beat-led reading (the density by place moved them)
const keeps = (plan: any) => FAMS.includes(loudnessFamily(loudnessFeatures(plan, plan.style))) && (!has('only-beat') || beatOfTrack(plan).value > 0);

/**
 * **The trance tiles, every theme of a set's first three** (`--extra trance`, round loudness-v24): the Trance tile is a
 * grid place at theme 0 alone, and its two tuned neighbours (Hard Trance, Uplifting Trance) are not grid places at all,
 * so a fit with the saw's runs in it reads them here, by the genre table's own spells.
 */
export function tranceTiles(): { name: string; spell: Partial<Spell> }[] {
  const f = FAMILIES.find((x) => x.label === 'Trance');
  if (!f) throw new Error('the genre table names no Trance family');
  return [familyPreset(f), ...f.subs.filter((x) => x.tuned && x.spell).map((x) => subPreset(f, x))].map((p) => ({ name: `tile ${p.label}`, spell: presetSpell(p) }));
}

/** The grid's house mains, planned: the link, the window, the plan. */
function houseMains(from: number, to: number) {
  const out: { link: string; place: string; seed: string; theme: number; plan: any }[] = [];
  // `--places a,b`: only those grid places (a window or two re-measured where one round moved them)
  const places = arg('places') ? arg('places')!.split(',') : null;
  // `--extra trance`: the trance tiles' themes 0-2 in place of the grid (`tranceTiles`)
  const extra = arg('extra');
  if (extra && extra !== 'trance' && extra !== 'featured') throw new Error(`--extra ${extra}: trance or featured`);
  // `--extra featured`: the featured tracks (`src/featured.json`, the benchmark), each from its own theme and the five
  // after it, the seeds the links name (`--from`/`--to` are not read)
  if (extra === 'featured') {
    for (const pl of FEATURED) pl.links.forEach((at, i) => {
      const read = quiet(() => linkRead(`?${at}`)).link;
      for (let n = 0; n < +arg('featured-themes', '6')!; n++) {
        const link = linkWrite({ ...read, theme: (read.theme ?? 0) + n });
        const { plan } = quiet(() => playedWith(link));
        if (!keeps(plan)) continue;
        out.push({ link, place: `${pl.name} - ${pl.labels?.[i] ?? i}`, seed: String(read.seed), theme: (read.theme ?? 0) + n, plan });
      }
    });
    return out;
  }
  const spells = extra ? tranceTiles().map((t) => ({ ...t, themes: [0, 1, 2] }))
    // `--themes 1,2`: the grid's places at those themes of each seed's set, where theme 0 alone is the gate's
    : grid().filter((g) => g.name !== '27191 ambient').map((g) => ({ name: g.name, spell: g.spell, themes: (arg('themes') ?? '0').split(',').map(Number) }));
  for (const g of spells) {
    if (places && !places.includes(g.name)) continue;
    for (let s = from; s <= to; s++) for (const n of g.themes) {
      const link = linkOf(String(s), g.spell, n);
      const { plan } = quiet(() => playedWith(link));
      if (!keeps(plan)) continue;
      out.push({ link, place: g.name, seed: String(s), theme: n, plan });
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
  const track = d.planTheme(job.seed, job.theme ?? 0, { masterSeed: job.seed, preset: 'auto', strategy: 'house-v2', spell: cast.spell, recipe: cast.track });
  const bs = track.barSeconds, sr = 48000;
  const tp = Math.max(0, job.from - 2) * bs, t0 = job.from * bs, t1 = (job.from + job.bars) * bs;
  // `--solo <layer>`: that layer alone through the whole graph (the voices' loudness facts, `--facts`)
  const cut = d.sliceProgram(d.programOf(track), { from: tp, to: t1, tail: 1.5, layers: job.solo ? [job.solo] : null });
  // `--at-trim`: the window at the trim the app plays it at (the landed loudness, and the limiter's blocks there)
  const trimDb = job.atTrim ? (track.trimDb ?? 0) : 0;
  // (a glue that follows the trim, the density by place's, round loudness-place: its threshold where the app plays it
  // against the theme, at the trim this render plays, so a render at nought hears the glue as the app does)
  const bc = cut.settings.master.busComp;
  const glue = bc && Number.isFinite(bc.followsTrim) ? { ...bc, threshold: bc.threshold - bc.followsTrim + trimDb } : bc;
  const slice = { ...cut, settings: glue === bc ? cut.settings : { ...cut.settings, master: { ...cut.settings.master, busComp: glue } }, trimDb, themeGain: Math.pow(10, trimDb / 20) };
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
  // `--solo <layer>` with `--timbre a,b`: only the windows whose dice drew one of those timbres for the layer's role
  const solo = arg('solo'), timbres = arg('timbre') ? arg('timbre')!.split(',') : null;
  const drew = (m: { plan: any }) => !timbres || timbres.includes(solo === 'pad' ? m.plan.dice?.padTimbre : m.plan.dice?.stabTimbre);
  // `--skip a.json,b.json`: windows those files already rendered (the same link at the same bar) are not rendered again
  const already = new Set((arg('skip') ?? '').split(',').filter(Boolean).flatMap((f) => (JSON.parse(fs.readFileSync(path.resolve(f), 'utf8')) as { rows: Row[] }).rows.filter((r) => !r.solo).map((r) => `${r.link}@${r.from}`)));
  // `--walk [--stride 4]`: in place of the trim's window, the theme's other passages the window walk reads (round
  // loudness-place, `loudness.ts` `walked`): every `stride`-th window of its drops and breakdowns, and of every section
  // of a theme with few drums; each row names its section's kind (`walk`)
  const stride = +arg('stride', '4')!;
  const walkOf = (m: { plan: any }) => {
    const plan = m.plan, bars = plan.style.loudness.windowBars, at = trimWindow(plan, plan.style).from;
    const all = loudnessFeatures(plan, plan.style).drumsShare < 0.5;
    const out: { from: number; bars: number; kind: string }[] = [];
    for (const s of plan.arrangement?.sections ?? []) {
      if (s.bars < bars || (!all && !['drop', 'breakdown'].includes(s.kind))) continue;
      for (let from = Math.max(2, s.startBar); from + bars <= Math.min(plan.bars, s.startBar + s.bars); from += stride) if (from !== at) out.push({ from, bars, kind: s.kind });
    }
    return out;
  };
  const jobs = mains.filter(drew).flatMap((m) => {
    const base = { link: m.link, place: m.place, seed: m.seed, theme: m.theme, spell: new URLSearchParams(m.link).get('spell'), trim: m.plan.trimDb, solo, atTrim: has('at-trim') };
    if (has('walk')) return walkOf(m).filter((w) => !already.has(`${m.link}@${w.from}`)).map((w) => ({ ...base, from: w.from, bars: w.bars, walk: w.kind }));
    const w = trimWindow(m.plan, m.plan.style);
    return already.has(`${m.link}@${w.from}`) ? [] : [{ ...base, from: w.from, bars: w.bars }];
  });
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
      rows[i] = { link: j.link, place: j.place, seed: j.seed, ...(j.theme ? { theme: j.theme } : {}), ...(j.solo ? { solo: j.solo } : {}), ...((j as { walk?: string }).walk ? { walk: (j as { walk?: string }).walk } : {}), ...(j.atTrim ? { atTrim: j.trim } : {}), from: j.from, bars: j.bars, blocks: r.blocks, lufs: r.lufs };
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
    const s = trimSlope(f, style, need);
    return { ...r, f, plan, target, pred, need, s, trim: plan.trimDb as number, m: measured(r), room: headroomDb(plan, style), limit: headroomLimit(plan, style), marginDb: M.headroom.marginDb, clampDb: M.clampDb };
  });
}
// (the house mains: a cut through the house's own measured slope where the block holds one, `trimSlope`)
const shortOf = (r: { target: number; pred: number }, trim: number, M: { slopeUp: number; slopeDown: number; houseSlopeDown?: number }) => r.target - (r.pred + trim * (trim >= 0 ? M.slopeUp : M.houseSlopeDown ?? M.slopeDown));

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
    if (!rs.length) { console.log(`${label}: none`); return; }
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

/** Measured rows (`--rows a.json,b.json`, else `--out`'s), each planned again by today's tree and read at the bars it was rendered at. */
function rowsAt() {
  // (a file may be named `file:deep` or `file:beat`: only its rows of themes reading nought, or more, on the beat-led
  // reading, round loudness-place: the density by place moves the beat-led windows, so an older render of them is not
  // the sound the app plays)
  const files = (arg('rows') ?? OUT).split(',').map((f) => { const m = /^(.*):(deep|beat)$/.exec(f); return m ? { file: path.resolve(m[1]), only: m[2] } : { file: path.resolve(f), only: null }; });
  // a window two files both measured (the Trance tile's first theme is a grid place and a trance tile) is read once
  const seen = new Set<string>();
  // `--weight featured=3`: the rows of a file whose name holds the word count that many times in the fit (the featured
  // tracks are the benchmark, and 90 windows among 1774 teach the selection little)
  const [wName, wTimes] = (arg('weight') ?? '=1').split('=');
  const key = (r: Row) => `${r.solo ?? ''}|${r.walk ? r.from : ''}|${r.link}`;
  return files.flatMap(({ file, only }) => (JSON.parse(fs.readFileSync(file, 'utf8')) as { rows: Row[] }).rows.filter((r) => !seen.has(key(r))).flatMap((r) => {
    const { plan } = quiet(() => playedWith(r.link));
    // (a row the file's filter leaves out is not counted as read: another file may hold it)
    if (only && (beatOfTrack(plan).value > 0) !== (only === 'beat')) return [];
    if (seen.has(key(r))) return [];
    seen.add(key(r));
    const w = { from: r.from, bars: r.bars };
    const row = { r, plan, w, f: loudnessFeatures(plan, plan.style, w) };
    return wName && path.basename(file).includes(wName) ? Array(+wTimes).fill(row) : [row];
  }));
}
const median = (xs: number[]) => quantile(xs, 0.5);
const rms = (xs: number[]) => Math.sqrt(xs.reduce((a, v) => a + v * v, 0) / Math.max(1, xs.length));

/**
 * **A voice's loudness fact as the house plays it** (`--facts`, round loudness-v24): windows rendered with one layer
 * alone (`--measure --solo keys --timbre piano`), each its integrated loudness less the level its room gave the role
 * there (the lane's level with the floors keyed to the bed, as `loudnessFeatures` reads it), the median over the
 * windows: what `tools/loudness-fit.ts --timbres` measured for the registry's facts (`TIMBRES`, "the family alone in an
 * eight-bar main groove, less the level its room gave it"), on the grid's own windows and casts.
 */
function facts() {
  const by = new Map<string, { own: number; energy: number; place: string }[]>();
  for (const { r, plan, f } of rowsAt()) {
    if (!r.solo || !Number.isFinite(r.lufs) || r.lufs < -60) continue;
    const timbre = r.solo === 'pad' ? plan.dice?.padTimbre : (plan.dice?.keysLevelledAs ?? plan.dice?.stabTimbre);
    const key = levelKeyOfRole(r.solo, timbre);
    const level = key === 'piano' ? f.lvPiano : key === 'pad' ? f.lvPad : f.lvKeys;
    const g = by.get(timbre) ?? by.set(timbre, []).get(timbre)!;
    // ...and on the energy's footing: less how much of the window the notes fill at the gain and velocity they were
    // written at (`harmonicEnergyDb` reads the fill itself, so a fact read with it in counts the notes' gain twice)
    const fill = r.solo === 'keys' ? f.frontPeakKeys - f.lvKeys : f.frontPeakPad - f.lvPad;
    g.push({ own: r.lufs - level, energy: r.lufs - level - fill, place: r.place });
  }
  for (const [timbre, g] of by) {
    const xs = g.map((x) => x.own), es = g.map((x) => x.energy);
    console.log(`${timbre}: n ${xs.length}, median ${median(xs).toFixed(2)} dB, quartiles ${quantile(xs, 0.25).toFixed(2)} .. ${quantile(xs, 0.75).toFixed(2)}; on the energy's footing ${median(es).toFixed(2)} (${quantile(es, 0.25).toFixed(2)} .. ${quantile(es, 0.75).toFixed(2)}); declared ${TIMBRES[timbre]?.loudnessDb}`);
  }
}

/**
 * **The house's loudness model refitted on the grid's own windows** (`--fit-main`, round loudness-v24). The model was
 * fitted on 120 windows of the house alone (10-04), before the front rule, the sum clip, the places' casts and the
 * trance corner's saw; the grid's measurement is every house main the app plays at 31 places (theme 0 of seeds 1-40),
 * rendered at nought, and `--extra trance` adds the trance tiles' first three themes. Read as the model reads a window:
 * the notes as written before the front rule, so what the rule took off comes back through the master's slope
 * (`lufsAfter`), and the fitted loudness is the measured one plus that. The same selection as every other fit
 * (`fit` of tools/loudness-fit.ts), held out by seed (seed mod 5, the selection and the fit run again on the other
 * four). `--write` puts the intercept, the coefficients, the centres and the residual into the style's JSON and
 * leaves every other number of the block (the slopes, the headroom lines, the clip's depth, the families) as it was.
 */
function fitMain() {
  const block = JSON.parse(fs.readFileSync(BLOCK, 'utf8'));
  const slopeDown = block.slopeDown;
  // (a window counted more than once by `--weight` keeps one fold in the selection's own folds, `fold`: its copies
  // split across them would score it on itself)
  const ids = new Map<object, number>();
  const rows = rowsAt().filter(({ r, f }) => !r.solo && !r.walk && r.atTrim == null && Number.isFinite(r.lufs) && loudnessFamily(f) === 'house').map((x) => {
    const { r, plan, w, f } = x;
    const fold = ids.get(x) ?? ids.set(x, ids.size).get(x)!;
    return { ...f, seed: +r.seed, place: r.place, featured: /^(Vibe|Drive|Ambient) - /.test(r.place), fold, lufs: r.lufs, y: r.lufs + (f.frontLossDb || 0) * slopeDown, was: predictedLufs(plan, plan.style, w) };
  });
  const err = rows.map((x) => x.was - x.lufs);
  // `--dump <file>`: each window's measured loudness beside what the blessed model reads, for a comparison of two blocks
  if (arg('dump')) fs.writeFileSync(path.resolve(arg('dump')!), JSON.stringify(rows.map((x) => ({ place: x.place, seed: x.seed, lufs: x.lufs, was: x.was }))) + '\n');
  console.log(`${rows.length} house windows; the blessed model reads them ${rms(err).toFixed(3)} LU rms off (mean ${(err.reduce((a, v) => a + v, 0) / err.length).toFixed(2)}, worst ${Math.max(...err.map(Math.abs)).toFixed(2)})`);
  const byPlace = new Map<string, number[]>();
  rows.forEach((x, i) => (byPlace.get(x.place) ?? byPlace.set(x.place, []).get(x.place)!).push(err[i]));
  for (const [k, e] of [...byPlace].sort((a, b) => median(a[1]) - median(b[1]))) console.log(`  ${k.padEnd(24)} n ${String(e.length).padStart(3)}  model - measured median ${median(e).toFixed(2)}`);
  const gain = +arg('gain', '0.005')!;
  const m = fit(rows, { max: +arg('max', '16')!, gain, y: 'y', outer: (x: { seed: number }) => x.seed % 5 });
  console.log(`refit (${m.names.length}): ${m.names.join(', ')}; R2 ${m.r2}, in-sample ${m.rmse} LU, held out by seed ${m.cv} LU (worst ${m.cvWorst}; the selection's own folds ${m.cvSelection})`);
  for (const n of m.names) console.log(`  ${n.padEnd(20)} ${m.coef[n] >= 0 ? '+' : ''}${m.coef[n].toFixed(4)}  centre ${m.centre[n]}`);
  // the featured windows' own figures (the benchmark), each window once however often `--weight` counts it
  const once = (pick: (x: (typeof rows)[number]) => boolean, e: number[]) => { const seen = new Set<number>(); return rows.flatMap((x, i) => (pick(x) && !seen.has(x.fold) && seen.add(x.fold) ? [e[i]] : [])); };
  for (const [label, pick] of [['featured', (x: { featured: boolean }) => x.featured], ['the rest', (x: { featured: boolean }) => !x.featured]] as const) {
    const ins = once(pick, m.errors.inSample), out = once(pick, m.errors.heldOut).filter(Number.isFinite);
    if (ins.length) console.log(`  ${label}: ${ins.length} windows, in-sample ${rms(ins).toFixed(3)} LU, held out by seed ${out.length ? rms(out).toFixed(3) : '-'} LU`);
  }
  if (arg('errors')) fs.writeFileSync(path.resolve(arg('errors')!), JSON.stringify(rows.flatMap((x, i) => (i && rows[i - 1].fold === x.fold ? [] : [{ place: x.place, seed: x.seed, lufs: x.lufs, inSample: +m.errors.inSample[i].toFixed(3), heldOut: +m.errors.heldOut[i].toFixed(3) }]))) + '\n');
  if (!has('write')) return;
  const files = (arg('rows') ?? OUT).split(',');
  block.measuredAt = JSON.parse(fs.readFileSync(path.resolve(files[0]), 'utf8')).measuredAt;
  const windows = new Set(rows.map((x) => x.fold)).size;
  block.sample = { ...block.sample, grid: { windows, seeds: [+arg('from', '1')!, +arg('to', '40')!], files: files.map((f) => path.basename(f)), heldOut: 'by seed, seed mod 5', selection: { gainLu: gain, max: +arg('max', '16')!, ...(arg('without') ? { without: arg('without')!.split(',') } : {}) }, ...(arg('weight') ? { weights: Object.fromEntries([arg('weight')!.split('=').map((v, i) => (i ? +v : v))]), rowsWithWeights: rows.length } : {}) } };
  block.residual = { r2: m.r2, inSample: m.rmse, crossValidated: m.cv, worstHeldOut: m.cvWorst, selectionCv: m.cvSelection, n: m.n };
  block.intercept = m.intercept;
  block.coef = m.coef;
  block.centre = m.centre;
  // `--block-out <file>`: the refitted block into that file, the style's own left as it is (candidates side by side)
  const to = arg('block-out') ? path.resolve(arg('block-out')!) : BLOCK;
  fs.writeFileSync(to, JSON.stringify(block, null, 2) + '\n');
  console.log(`wrote the house's intercept, coefficients and centres into ${path.relative(ROOT, to)}`);
}

/**
 * **What a decibel of trim gives back** (`--slopes`, round loudness-v24): the same windows rendered at nought (`--rows`)
 * and at the trim the app plays (`--at`, renders of `--measure --at-trim`), the loudness moved against the trim, through
 * the origin, each way (a limiter is one-sided). `--write` puts the two into the style's JSON (`slopeUp`, `slopeDown`).
 */
function slopes() {
  const load = (files: string | null) => (files ?? '').split(',').filter(Boolean).flatMap((f) => (JSON.parse(fs.readFileSync(path.resolve(f), 'utf8')) as { rows: Row[] }).rows);
  const nought = new Map<string, Row>();
  for (const r of load(arg('rows'))) if (!r.solo && r.atTrim == null && !nought.has(`${r.link}@${r.from}`)) nought.set(`${r.link}@${r.from}`, r);
  const pts: { t: number; moved: number }[] = [];
  for (const r of load(arg('at'))) {
    const n = nought.get(`${r.link}@${r.from}`);
    if (!n || r.atTrim == null || Math.abs(r.atTrim) < 0.3) continue;
    pts.push({ t: r.atTrim, moved: r.lufs - n.lufs });
  }
  const reg = (g: typeof pts) => {
    const s = g.reduce((a, p) => a + p.t * p.moved, 0) / g.reduce((a, p) => a + p.t * p.t, 0);
    return { s: +s.toFixed(4), n: g.length, rms: +Math.sqrt(g.reduce((a, p) => a + (p.moved - s * p.t) ** 2, 0) / g.length).toFixed(3) };
  };
  const up = reg(pts.filter((p) => p.t > 0)), down = reg(pts.filter((p) => p.t < 0));
  console.log(`up ${up.s} (${up.n} windows, ${up.rms} LU off the line); down ${down.s} (${down.n}, ${down.rms})`);
  if (!has('write')) return;
  const block = JSON.parse(fs.readFileSync(BLOCK, 'utf8'));
  block.slopeUp = up.s;
  block.slopeDown = down.s;
  block.slopes = { note: 'Measured by tools/headroom-front.ts --slopes (round loudness-v24): the windows rendered at nought and at the trim the app plays, the loudness moved against the trim through the origin, each way. The 10-04 ones (0.6638 up, 0.5002 down) were read before the front rule and the sum clip.', measuredAt: new Date().toISOString().slice(0, 10), up, down };
  fs.writeFileSync(BLOCK, JSON.stringify(block, null, 2) + '\n');
  console.log(`wrote slopeUp and slopeDown into ${path.relative(ROOT, BLOCK)}`);
}

/**
 * **The share and depth lines refitted on every house window, at each window's own allowance** (`--fit-lines`, round
 * loudness-place). The lines of round saw-bed were fitted on the windows the front rule moved, at one allowance (15 %
 * of the blocks, the loudest 8 dB over), and with the base model read the fast grooves 1-6 dB short of the room they
 * have. Here: every house window of `--rows` rendered at nought on the build that plays the density and the sum clip
 * by place; the share line's room read at the share the window's place allows (`allowanceOf`: 15 % on a deep groove,
 * 25 % on a beat-led one, sliding), the depth line's at its 8 dB footing (the allowance's depth is added where it is
 * read, `headroomOf`); the selection as every fit's, held out by seed. The margins by band (`--margin-groove`,
 * `--margin-beat`) are decisions, read against each band's own held-out error. `--write` puts both lines into the
 * style's JSON (`headroom.front`).
 */
function fitLines() {
  const ids = new Map<object, number>();
  const rows = rowsAt().filter(({ r, f }) => !r.solo && !r.walk && r.atTrim == null && loudnessFamily(f) === 'house').map((x) => {
    const { r, plan, f } = x;
    const A = allowanceOf(f, plan.style);
    const b = [...r.blocks].sort((p, q) => p - q), n = b.length;
    const fold = ids.get(x) ?? ids.set(x, ids.size).get(x)!;
    return { ...f, seed: +r.seed, place: r.place, fold, featured: /^(Vibe|Drive|Ambient) - /.test(r.place), share: -b[Math.min(n - 1, Math.floor((n * (100 - A.share)) / 100))], depth: DEPTH - b[n - 1] };
  });
  const gain = +arg('gain', '0.03')!, max = +arg('max', '12')!;
  const outer = (x: { seed: number }) => x.seed % 5;
  const share = fit(rows, { max, y: 'share', gain, outer, clip: has('clip-columns') });
  const depth = has('depth') ? fit(rows, { max, y: 'depth', gain, outer, clip: true }) : null;
  const once = (pick: (x: (typeof rows)[number]) => boolean, e: number[]) => { const seen = new Set<number>(); return rows.flatMap((x, i) => (pick(x) && !seen.has(x.fold) && seen.add(x.fold) ? [e[i]] : [])); };
  console.log(`${new Set(rows.map((x) => x.fold)).size} house windows (${rows.length} with weights)`);
  console.log(`share (${share.names.length}): ${share.names.join(', ')}; R2 ${share.r2}, in-sample ${share.rmse} dB, held out ${share.cv} dB`);
  for (const [label, pick] of [['deep groove (b < 0.5)', (x: any) => x.beatLed < 0.5], ['beat-led (b >= 0.75)', (x: any) => x.beatLed >= 0.75], ['featured', (x: any) => x.featured]] as const) {
    const e = once(pick, share.errors.heldOut).filter(Number.isFinite);
    const m = [...e].sort((p, q) => p - q);
    if (e.length) console.log(`  ${label}: ${e.length} windows, held out ${rms(e).toFixed(2)} dB, the line less the room: median ${median(m).toFixed(2)}, p10 ${quantile(m, 0.1).toFixed(2)}, p90 ${quantile(m, 0.9).toFixed(2)}`);
  }
  if (depth) console.log(`depth (${depth.names.length}): ${depth.names.join(', ')}; R2 ${depth.r2}, held out ${depth.cv} dB`);
  if (!has('write')) { console.log(JSON.stringify({ intercept: share.intercept, coef: share.coef, centre: share.centre })); return; }
  const block = JSON.parse(fs.readFileSync(BLOCK, 'utf8'));
  const was = block.headroom.front;
  const model = (m: any, marginDb: number) => ({ marginDb, residual: { r2: m.r2, inSample: m.rmse, crossValidated: m.cv, worstHeldOut: m.cvWorst, selectionCv: m.cvSelection, n: m.n }, intercept: m.intercept, coef: m.coef, centre: m.centre });
  block.headroom.front = {
    ...was,
    note: 'Written by tools/headroom-front.ts --fit-lines (round loudness-place): every house window the app plays (the grid\'s mains of seeds ' + arg('from', '1') + '-' + arg('to', '12') + ', the trance tiles, the featured tracks\' first six themes, counted ' + (arg('weight') ?? 'once') + '), rendered at nought on the build with the density and the sum clip by place; the share line\'s room at each window\'s own allowance (15 % of the 10 ms blocks on a deep groove, 25 % on a beat-led one, sliding with the reading), the depth line at its 8 dB footing (the allowance\'s depth added where it is read). ' + (depth ? '' : 'The depth line as round drum-clip fitted it.'),
    measuredAt: new Date().toISOString().slice(0, 10),
    sample: { windows: new Set(rows.map((x) => x.fold)).size, files: (arg('rows') ?? '').split(',').map((f) => path.basename(f)) },
    share: model(share, +arg('share-margin', String(was.share.marginDb))!),
    ...(depth ? { depth: model(depth, was.depth.marginDb) } : {}),
  };
  fs.writeFileSync(BLOCK, JSON.stringify(block, null, 2) + '\n');
  console.log(`wrote headroom.front.share${depth ? ' and depth' : ''} into ${path.relative(ROOT, BLOCK)}`);
}

if (has('measure')) await measure();
else if (has('fit-lines')) fitLines();
else if (has('slopes')) slopes();
else if (has('fit-main')) fitMain();
else if (has('facts')) facts();
else if (has('fit')) doFit();
else if (has('report')) report();
else console.log('one of --measure, --fit, --fit-main, --facts, --report');
