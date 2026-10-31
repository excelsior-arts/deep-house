// **A theme whole, at the trim the app plays, metered** (round loudness-by-place): the integrated loudness, the
// loudness range, the true peak and the crest, the limiter's share and depth, and the level of each section kind, off
// one offline render of the whole theme in headless Chromium, muted. Numbers only: no file is written but the table.
//
//   node tools/loudness-render.ts --site <built site> [--port 7781 --pages 4] --featured [--themes 1] --out tmp/analysis/render-featured.json
//   node tools/loudness-render.ts --site <built site> --grid "tile Drum & Bass;tile Dubstep;ring slow, spark" --seeds 1-3 --out ...
//   node tools/loudness-render.ts --site <built site> --links "seed=40&v=2,seed=6&v=2&spell=..." --out ...
//
// The loudness range is EBU Tech 3342's: short-term loudness (3 s, K-weighted, every 100 ms), the absolute gate at
// -70 LUFS, the relative gate 20 LU under the gated mean, the 10th to the 95th percentile. The limiter's blocks are
// the master's peaks ahead of it in 10 ms, in dB against its ceiling, as `tools/headroom-front.ts` reads them. A
// section's level is the mean power of the momentary blocks inside it.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { grid, linkOf, playedWith } from './check-program-guards.ts';
import { beatLed, isFree } from '../src/performance.ts';
import { loudnessFeatures, loudnessFamily, trimTargetLufs } from '../src/loudness.ts';
import { playwright, launchOptions, bodyOf, renice } from '@deep-house/engine/harness';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const METER = path.dirname(fileURLToPath(import.meta.resolve('@deep-house/engine/meter')));
const arg = (k: string, d: string | null = null) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const has = (k: string) => process.argv.includes(`--${k}`);
const quiet = <T,>(fn: () => T): T => { const k = [console.log, console.info, console.warn]; console.log = console.info = console.warn = () => {}; try { return fn(); } finally { [console.log, console.info, console.warn] = k; } };

type Job = { name: string; group: string; link: string; seed: string; theme: number; spell: string | null };

function jobs(): Job[] {
  const out: Job[] = [];
  const add = (group: string, name: string, link: string) => {
    const q = new URLSearchParams(link);
    out.push({ name, group, link, seed: q.get('seed')!, theme: Math.max(0, Number(q.get('theme') || 1) - 1), spell: q.get('spell') });
  };
  if (has('featured')) {
    const F = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'src', 'featured.json'), 'utf8')) as { playlists: { name: string; links: string[]; labels: string[] }[] };
    const themes = +arg('themes', '1')!;
    for (const p of F.playlists) p.links.forEach((link, i) => {
      const q = new URLSearchParams(link);
      const own = Math.max(0, Number(q.get('theme') || 1) - 1);
      for (let k = 0; k < themes; k++) { const qq = new URLSearchParams(link); if (own + k > 0) qq.set('theme', String(own + k + 1)); else qq.delete('theme'); add(p.name, `${p.name} - ${p.labels[i]}`, qq.toString().replace(/%3A/g, ':').replace(/%2C/g, ',')); }
    });
  }
  if (arg('grid')) {
    // places apart by `;` where one is named with a comma ("ring slow, spark"), else by `,`
    const want = arg('grid')!.split(arg('grid')!.includes(';') ? /\s*;\s*/ : ',');
    const [a, b] = (arg('seeds', '1-3')!).split('-').map(Number);
    for (const g of grid()) if (want.includes(g.name)) for (let s = a; s <= (b ?? a); s++) add('grid', g.name, linkOf(String(s), g.spell, 0));
  }
  if (arg('links')) for (const l of arg('links')!.split(/\s*;\s*/)) add('links', l, l);
  return out;
}

/** Runs in the page: the whole theme rendered on four channels (the output, and the master ahead of the limiter). */
const RENDER = async (job: { seed: string; theme: number; spell: string | null }) => {
  const meter = await import('/tools/meter.ts' as any);
  const d = (window as any).deepHouse;
  const cast = d.recipesFor({ masterSeed: job.seed, strategy: 'house-v2', search: job.spell ? `?spell=${job.spell}` : '' });
  const track = d.planTheme(job.seed, job.theme, { masterSeed: job.seed, preset: 'auto', strategy: 'house-v2', spell: cast.spell, recipe: cast.track });
  const sr = 48000;
  const program = d.programOf(track);
  const trimDb = track.trimDb ?? 0;
  class Quad extends OfflineAudioContext { constructor(_c: number, f: number, s: number) { super(4, f, s); } }
  const buf = await d.renderProgram({ ...program, trimDb, themeGain: Math.pow(10, trimDb / 20) }, { sampleRate: sr, OfflineCtx: Quad, onGraph: (g: any) => {
    const c = g.nodes.chain, ctx = c.ctx as BaseAudioContext;
    ctx.destination.channelCount = 4; ctx.destination.channelCountMode = 'explicit'; ctx.destination.channelInterpretation = 'discrete';
    const m = ctx.createChannelMerger(4), so = ctx.createChannelSplitter(2), sp = ctx.createChannelSplitter(2);
    g.out.disconnect(); g.out.connect(so); so.connect(m, 0, 0); so.connect(m, 1, 1);
    c.master.connect(sp); sp.connect(m, 0, 2); sp.connect(m, 1, 3);
    m.connect(ctx.destination);
  } });
  const L = buf.getChannelData(0), R = buf.getChannelData(1), ML = buf.getChannelData(2), MR = buf.getChannelData(3);
  const n = L.length;
  // K-weighting (BS.1770-4) at 48 kHz: the shelf, then the high-pass.
  const K = [[1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585], [1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621]];
  const blk = Math.round(sr / 10); // 100 ms
  const nb = Math.floor(n / blk);
  const power = new Float64Array(nb); // mean square of the K-weighted sum of channels per 100 ms
  for (const ch of [L, R]) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, u1 = 0, u2 = 0, v1 = 0, v2 = 0;
    const [b0, b1, b2, a1, a2] = K[0], [c0, c1, c2, d1, d2] = K[1];
    for (let i = 0; i < nb * blk; i++) {
      const x = ch[i];
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y;
      const v = c0 * y + c1 * u1 + c2 * u2 - d1 * v1 - d2 * v2; u2 = u1; u1 = y; v2 = v1; v1 = v;
      power[(i / blk) | 0] += v * v;
    }
  }
  for (let i = 0; i < nb; i++) power[i] /= blk;
  const lufsOf = (p: number) => (p > 0 ? -0.691 + 10 * Math.log10(p) : -120);
  const windowed = (len: number) => { const out: number[] = []; for (let i = len - 1; i < nb; i++) { let s = 0; for (let j = i - len + 1; j <= i; j++) s += power[j]; out.push(lufsOf(s / len)); } return out; };
  const momentary = windowed(4), shortTerm = windowed(30);
  // EBU 3342: the absolute gate, the relative gate 20 LU under the gated mean, the 10th to 95th percentile
  const abs = shortTerm.filter((v) => v > -70);
  const meanP = abs.length ? 10 * Math.log10(abs.reduce((a, v) => a + Math.pow(10, (v + 0.691) / 10), 0) / abs.length) - 0.691 : -120;
  const kept = abs.filter((v) => v > meanP - 20).sort((a, b) => a - b);
  const pct = (xs: number[], p: number) => (xs.length ? xs[Math.min(xs.length - 1, Math.floor(xs.length * p))] : NaN);
  const lra = kept.length ? pct(kept, 0.95) - pct(kept, 0.1) : NaN;
  // the limiter's blocks: the master's peak ahead of it per 10 ms, in dB against the ceiling
  const ceiling = program.settings.master.limiter.ceiling, lb = sr / 100, blocks: number[] = [];
  for (let i = 0; i + lb <= n; i += lb) { let p = 0; for (const c of [ML, MR]) for (let j = i; j < i + lb; j++) { const a = Math.abs(c[j]); if (a > p) p = a; } blocks.push(20 * Math.log10(p / ceiling + 1e-30)); }
  const over = blocks.filter((b) => b > 0);
  // each section's level: the mean power of the momentary blocks inside it, and the limiter's share there
  const bs = track.barSeconds;
  const sections = ((track.arrangement && track.arrangement.sections) || []).map((s: any) => {
    const t0 = s.startBar * bs, t1 = (s.startBar + s.bars) * bs;
    const i0 = Math.max(0, Math.floor(t0 * 10)), i1 = Math.min(nb, Math.floor(t1 * 10));
    let sum = 0, k = 0; for (let i = i0; i < i1; i++) { sum += power[i]; k++; }
    const j0 = Math.floor(t0 * 100), j1 = Math.min(blocks.length, Math.floor(t1 * 100));
    let o = 0; for (let j = j0; j < j1; j++) if (blocks[j] > 0) o++;
    return { kind: s.kind, startBar: s.startBar, bars: s.bars, lufs: +lufsOf(k ? sum / k : 0).toFixed(2), limiter: +((100 * o) / Math.max(1, j1 - j0)).toFixed(1) };
  });
  const lufs = meter.integratedLoudness([L, R], sr), tp = meter.truePeak([L, R]);
  const series: number[] = []; for (let i = 0; i < shortTerm.length; i += 10) series.push(+shortTerm[i].toFixed(1));
  return {
    trimDb, bpm: track.bpm, bars: track.bars, seconds: +(n / sr).toFixed(1), clock: track.clock ?? 'bar',
    lufs: +lufs.toFixed(2), truePeak: +tp.toFixed(2), crest: +(tp - lufs).toFixed(2), lra: +lra.toFixed(2),
    shortTerm: { p10: +pct(kept, 0.1).toFixed(2), p50: +pct(kept, 0.5).toFixed(2), p95: +pct(kept, 0.95).toFixed(2), max: +Math.max(...shortTerm).toFixed(2) },
    momentaryMax: +Math.max(...momentary).toFixed(2),
    limiter: { share: +((100 * over.length) / blocks.length).toFixed(1), share1: +((100 * blocks.filter((b) => b > 1).length) / blocks.length).toFixed(1), depth: +Math.max(...blocks).toFixed(2), meanGr: +(over.reduce((a, b) => a + b, 0) / blocks.length).toFixed(3) },
    sections, series,
  };
};

async function main() {
  const site = path.resolve(arg('site')!), port = +arg('port', '7781')!, pages = +arg('pages', '4')!;
  const J = jobs();
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
  const rows: any[] = new Array(J.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(pages, J.length) }, async () => {
    let page: any = null, since = 0;
    for (;;) {
      const i = next++;
      if (i >= J.length) break;
      if (!page || since >= 6) {
        if (page) await page.close();
        page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${port}/index.html?out=silent`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => (window as any).deepHouse, { timeout: 60000 });
        await page.evaluate(() => { (window as any).requestAnimationFrame = () => 0; });
        renice(browser);
        since = 0;
      }
      const j = J[i];
      const { plan } = quiet(() => playedWith(j.link));
      const bl = beatLed(plan);
      const f = loudnessFeatures(plan, plan.style);
      const facts = { beatLed: bl.value, felt: bl.felt, tempoShare: bl.tempo, drumsShare: bl.drums, family: loudnessFamily(f), target: trimTargetLufs(plan, plan.style), planTrim: plan.trimDb ?? 0, free: isFree(plan as { clock?: string }) };
      try {
        const r = await page.evaluate(RENDER, { seed: j.seed, theme: j.theme, spell: j.spell });
        if (Math.abs(r.trimDb - facts.planTrim) > 1e-6) console.warn(`${j.link}: the page planned a trim of ${r.trimDb} and node ${facts.planTrim}: the site is not this tree`);
        rows[i] = { ...j, ...facts, ...r };
        console.log(`${j.name} t${j.theme + 1}: ${r.lufs} LUFS, LRA ${r.lra}, crest ${r.crest}, limiter ${r.limiter.share} % (deepest ${r.limiter.depth}), beat-led ${facts.beatLed}, ${r.seconds} s`);
      } catch (e) {
        rows[i] = { ...j, ...facts, error: String((e as Error).message || e) };
        console.log(`${j.name} t${j.theme + 1}: FAILED ${String((e as Error).message || e).slice(0, 200)}`);
        since = 99;
      }
      since++;
    }
    if (page) await page.close();
  }));
  await browser.close();
  server.close();
  const out = path.resolve(arg('out', path.join(HERE, '..', '..', '..', 'tmp', 'analysis', 'loudness-render.json'))!);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ note: 'tools/loudness-render.ts: whole themes at the trim the app plays, metered (round loudness-by-place)', measuredAt: new Date().toISOString().slice(0, 10), site, rows }, null, 1) + '\n');
  console.log(`wrote ${out}`);
}

/**
 * **The featured render gate** (round loudness-place, part 3; the design's § 3.5): every featured track's own theme
 * rendered whole at the trim the app plays, read against its band. Not in `npm run check` (ten minutes of renders): in
 * the release battery beside the Chromium suite, and after a round that moves a level.
 *
 * - **the level**: a groove's (its mains and drops, the mean power of their momentary blocks) within `NEAR_LU` of its
 *   aim, a theme with few drums whole (it is aimed by its walked mean, `loudness.ts` `walked`); a track off it is named
 *   in tools/loudness-featured.json with what holds it, and may sink no more than `GROW_LU` past its name; a name no
 *   longer off its aim fails, so the list stays the truth;
 * - **the never-happen lines** (the design's § 3.2), whole: the limiter in no more than 35 % of the blocks of a groove, 12 dB
 *   at the deepest; in no more than 5 % of a theme with few drums', 3 dB at the deepest;
 * - **no breakdown over its groove** by more than `OVER_LU` on a groove (a theme with few drums has swells for music);
 * - **the deep groove more dynamic than the beat-led** (his first principle 10-30: *"for deep house and ambient … the
 *   dynamic of the track is more important"*): its median crest over the beat-led's (the world's measure: 13.6 dB on
 *   masters under −14 LUFS, 10.2 over −9); the range (LRA) beside it as a report, the design's "a report first, a gate
 *   once his ear has confirmed the bands" (a beat-led breakdown with its carrier spreads the range as much as a deep
 *   track's dynamics do).
 *
 * A limiter past its line or a breakdown over its groove may also be named (`limits`, `breakdowns`), with what holds it
 * and at its measured size, and held there as the levels are: the gate passes only when every miss is named and none
 * grew, so the list is the round's open work, never a waiver.
 */
const NEAR_LU = 1.5, GROW_LU = 0.5, OVER_LU = 0.5;
export const FEATURED_NAMES = path.join(HERE, 'loudness-featured.json');
type GateRow = { name: string; lufs: number; lra: number; crest: number; target: number; drumsShare: number; beatLed: number; limiter: { share: number; depth: number }; sections: { kind: string; bars: number; lufs: number; limiter: number }[] };
const sectionLevel = (r: GateRow, kinds: string[]): number | null => {
  const s = r.sections.filter((x) => kinds.includes(x.kind) && x.lufs > -60);
  if (!s.length) return null;
  return 10 * Math.log10(s.reduce((a, x) => a + 10 ** (x.lufs / 10) * x.bars, 0) / s.reduce((a, x) => a + x.bars, 0));
};
export function bandOf(r: { drumsShare: number; beatLed: number }): 'ambient' | 'deep' | 'between' | 'beat' {
  return r.drumsShare < 0.5 ? 'ambient' : r.beatLed >= 0.75 ? 'beat' : r.beatLed < 0.5 ? 'deep' : 'between';
}
export function levelOf(r: GateRow): number {
  return bandOf(r) === 'ambient' ? r.lufs : (sectionLevel(r, ['main', 'drop']) ?? r.lufs);
}
type Named = { name: string; why: string };
export function gate(rows: GateRow[], names: { tracks: (Named & { offLu: number })[]; limits?: (Named & { share: number; depth: number })[]; breakdowns?: (Named & { overLu: number })[] }): { fails: string[]; report: string[] } {
  const fails: string[] = [], report: string[] = [];
  const named = new Map(names.tracks.map((x) => [x.name, x]));
  const limits = new Map((names.limits ?? []).map((x) => [x.name, x]));
  const breaks = new Map((names.breakdowns ?? []).map((x) => [x.name, x]));
  const heldLimits: string[] = [], heldBreaks: string[] = [];
  const off: string[] = [];
  for (const r of rows) {
    const band = bandOf(r), level = levelOf(r), by = +(level - r.target).toFixed(2), x = named.get(r.name);
    if (Math.abs(by) > NEAR_LU) {
      off.push(r.name);
      if (!x) fails.push(`${r.name}: ${by > 0 ? '+' : ''}${by} LU off its aim ${r.target} and not named`);
      else if (Math.abs(by) > Math.abs(x.offLu) + GROW_LU) fails.push(`${r.name}: named at ${x.offLu} LU off its aim, now ${by}`);
    } else if (x) fails.push(`${r.name}: named at ${x.offLu} LU off its aim, now ${by}: within ${NEAR_LU}, take the name off`);
    const [share, deepest] = band === 'ambient' ? [5, 3] : [35, 12];
    const L = limits.get(r.name);
    if (r.limiter.share > share || r.limiter.depth > deepest) {
      if (!L) fails.push(`${r.name}: the limiter in ${r.limiter.share} % of its blocks, ${r.limiter.depth} dB at the deepest, past ${share} % / ${deepest} dB, and not named`);
      else if (r.limiter.share > L.share + 1 || r.limiter.depth > L.depth + GROW_LU) fails.push(`${r.name}: the limiter named at ${L.share} % / ${L.depth} dB, now ${r.limiter.share} % / ${r.limiter.depth} dB`);
      else heldLimits.push(r.name);
    } else if (L) fails.push(`${r.name}: its limiter is named, and is within its line now: take the name off`);
    const B = breaks.get(r.name);
    const g = band === 'ambient' ? null : sectionLevel(r, ['main', 'drop']), b = band === 'ambient' ? null : sectionLevel(r, ['breakdown']);
    if (g != null && b != null && b > g + OVER_LU) {
      if (!B) fails.push(`${r.name}: its breakdown ${b.toFixed(1)} LUFS over its groove ${g.toFixed(1)} by ${(b - g).toFixed(1)} LU, and not named`);
      else if (b - g > B.overLu + GROW_LU) fails.push(`${r.name}: its breakdown named at ${B.overLu} LU over its groove, now ${(b - g).toFixed(2)}`);
      else heldBreaks.push(r.name);
    } else if (B) fails.push(`${r.name}: its breakdown is named, and is no longer over its groove: take the name off`);
  }
  const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
  const by = (band: string) => rows.filter((r) => bandOf(r) === band);
  for (const band of ['ambient', 'deep', 'between', 'beat']) {
    const g = by(band);
    if (g.length) report.push(`${band}: ${g.length} tracks, level median ${med(g.map(levelOf)).toFixed(1)} (aim median ${med(g.map((r) => r.target)).toFixed(1)}), crest median ${med(g.map((r) => r.crest)).toFixed(1)} dB, range median ${med(g.map((r) => r.lra)).toFixed(1)} LU, limiter mean ${(g.reduce((a, r) => a + r.limiter.share, 0) / g.length).toFixed(1)} %`);
  }
  const [deep, beat] = [by('deep'), by('beat')];
  if (deep.length && beat.length) {
    if (!(med(deep.map((r) => r.crest)) > med(beat.map((r) => r.crest)))) fails.push(`the deep groove's median crest ${med(deep.map((r) => r.crest)).toFixed(1)} dB is not over the beat-led's ${med(beat.map((r) => r.crest)).toFixed(1)}`);
    report.push(`the deep groove's median crest ${med(deep.map((r) => r.crest)).toFixed(1)} dB against the beat-led's ${med(beat.map((r) => r.crest)).toFixed(1)}; its median range ${med(deep.map((r) => r.lra)).toFixed(1)} LU against ${med(beat.map((r) => r.lra)).toFixed(1)} (${med(deep.map((r) => r.lra)) >= med(beat.map((r) => r.lra)) ? 'over' : 'under: reported, not gated'})`);
  }
  report.push(`named and held: the limiter ${heldLimits.join(', ') || 'none'}; a breakdown over its groove ${heldBreaks.join(', ') || 'none'}`);
  report.push(`${off.length} of ${rows.length} off their aim by more than ${NEAR_LU} LU, every one named: ${off.join(', ') || 'none'}`);
  return { fails, report };
}

if (has('gate')) {
  const rows = (JSON.parse(fs.readFileSync(path.resolve(arg('gate')!), 'utf8')).rows as (GateRow & { error?: string })[]).filter((r) => !r.error);
  if (has('names')) {
    const tracks = rows.filter((r) => Math.abs(levelOf(r) - r.target) > NEAR_LU).map((r) => ({ name: r.name, offLu: +(levelOf(r) - r.target).toFixed(2), why: '' }));
    const was = fs.existsSync(FEATURED_NAMES) ? new Map((JSON.parse(fs.readFileSync(FEATURED_NAMES, 'utf8')).tracks as { name: string; why: string }[]).map((x) => [x.name, x.why])) : new Map();
    for (const t of tracks) t.why = was.get(t.name) ?? '';
    const old = fs.existsSync(FEATURED_NAMES) ? JSON.parse(fs.readFileSync(FEATURED_NAMES, 'utf8')) : {};
    const whyOf = (list: Named[] | undefined, n: string) => (list ?? []).find((x) => x.name === n)?.why ?? '';
    const limits = rows.filter((r) => { const [sh, dp] = bandOf(r) === 'ambient' ? [5, 3] : [35, 12]; return r.limiter.share > sh || r.limiter.depth > dp; }).map((r) => ({ name: r.name, share: r.limiter.share, depth: r.limiter.depth, why: whyOf(old.limits, r.name) }));
    const breakdowns = rows.filter((r) => { if (bandOf(r) === 'ambient') return false; const g = sectionLevel(r, ['main', 'drop']), b = sectionLevel(r, ['breakdown']); return g != null && b != null && b > g + OVER_LU; }).map((r) => ({ name: r.name, overLu: +((sectionLevel(r, ['breakdown']) as number) - (sectionLevel(r, ['main', 'drop']) as number)).toFixed(2), why: whyOf(old.breakdowns, r.name) }));
    fs.writeFileSync(FEATURED_NAMES, JSON.stringify({ note: 'Written by tools/loudness-render.ts --gate <render> --names (round loudness-place, part 3): the featured tracks whose own theme, rendered whole at the trim the app plays, sits more than 1.5 LU off its band\'s aim (a groove by its mains and drops, a theme with few drums whole), each at the size it was measured and with what holds it (why, by hand). The featured render gate fails on a track off its aim not named here, on one more than 0.5 LU further off than named, and on a name back within 1.5 LU; the same for a limiter past its never-happen line (limits: 35 % / 12 dB on a groove, 5 % / 3 dB on a theme with few drums, whole) and a breakdown more than 0.5 LU over its groove (breakdowns). A name is the round\'s open work, never a waiver.', measuredAt: new Date().toISOString().slice(0, 10), render: path.basename(arg('gate')!), tracks, limits, breakdowns }, null, 1) + '\n');
    console.log(`named ${tracks.length}: ${tracks.map((t) => `${t.name} ${t.offLu}`).join(', ')}`);
  }
  const names = fs.existsSync(FEATURED_NAMES) ? JSON.parse(fs.readFileSync(FEATURED_NAMES, 'utf8')) : { tracks: [] };
  const { fails, report } = gate(rows, names);
  for (const l of report) console.log(l);
  for (const f of fails) console.log(`FAIL ${f}`);
  console.log(fails.length ? `the featured render gate: ${fails.length} failed` : `the featured render gate passed: ${rows.length} tracks`);
  process.exitCode = fails.length ? 1 : 0;
} else main();
