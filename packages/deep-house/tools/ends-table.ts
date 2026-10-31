// **The endings table** (round chillstep-ends, his word 10-29: *"both chillstep songs in Drive playlist were chopped
// in the end after we reduced length"*): how a groove theme ends, alone and inside a playlist, read off the plans as
// the page plans them (`played`) — never a render.
//
//   node tools/ends-table.ts                      the featured tracks, then the grid by place
//   node tools/ends-table.ts --featured           the featured tracks only
//   node tools/ends-table.ts --seeds 12           a smaller grid (seeds 1-12; 40 by default)
//   node tools/ends-table.ts --jobs 2             the grid in that many processes (2 by default)
//   node tools/ends-table.ts --lead 6             the playlist's ask, seconds ahead of the seam
//   node tools/ends-table.ts --json <file>        every row written to a file
//
// **Alone** a theme hands over on its own seam (`seamPlan`, the line the set chose). **In a playlist** the next track
// is asked `SEAM_LEAD_S` ahead of that seam (`playlist-play.ts`, a tick once a second). Until this round the hand-over
// it asked began on the next bar line after the ask, about five and a half seconds early: the browser row "a playlist
// hands its next track over on the record's own seam line" measured Drive - Fog Bank's at 169.1 s against its seam at
// 174.5 s, three bars early. `--early` models that: the ask at the seam less the lead and half a tick, the hand-over
// on the next bar line after it. Without `--early` the hand-over is the seam's own line (`atSeam`), as now.
//
// **A chopped ending** is a hand-over that begins inside a groove section (a main, a drop, a build) before its last
// phrase is over: the arriving track comes in over the record's own resolution. Read for each theme:
//   - `cut`: the bars of a groove section the hand-over takes before its line ends (0: none);
//   - `alone`: the seam itself inside a groove section off its phrase line (the set's own seam, never moved here);
//   - `hole`: no note of the record sounds in the hand-over's first bar (a break's breath at the line);
//   - `blend`: the seam's own blend in bars; under four, the record runs out under the hand-over (a four-bar outro).

import os from 'node:os';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { played } from './link-digest.ts';
import { grid } from './check-program-guards.ts';
import { linkWrite } from '../src/link.ts';
import { derive, HOUSE, type Spell } from '../src/spell.ts';
import { FEATURED } from '../src/featured.ts';
import { seamPlan, blendBarsFor, blendAsked, programOf } from '../src/performance.ts';
import { SEAM_LEAD_S } from '../src/playlist-play.ts';
import GENRES from '../src/genres/genres.json' with { type: 'json' };

const quiet = <T>(fn: () => T): T => { const a = console.log, b = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };
const arg = (k: string, d?: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const EARLY = process.argv.includes('--early');
const LEAD = +(arg('--lead', String(SEAM_LEAD_S))!);
const GROOVE = new Set(['main', 'drop', 'build']);

export interface EndRow {
  group: string; name: string; link: string; theme: number; groove: boolean; bpm: number; bars: number;
  form: string; phrase: number; seam: number; blend: number; handover: number; before: string;
  cut: number; cutKind: string | null; alone: boolean; offPhrase: boolean; hole: boolean;
}

/** The genre table's tuned spells (the families and their subs), Chillstep first. */
export function genreSpells(): Array<{ name: string; spell: Partial<Spell> }> {
  const out: Array<{ name: string; spell: Partial<Spell> }> = [];
  for (const f of (GENRES as any).families) {
    if (f.tuned && f.spell) out.push({ name: f.label, spell: f.spell });
    for (const s of f.subs ?? []) if (s.tuned && s.spell) out.push({ name: s.label, spell: s.spell });
  }
  out.sort((a, b) => (b.name === 'Chillstep' ? 1 : 0) - (a.name === 'Chillstep' ? 1 : 0));
  return out;
}

/** Every spell of the grid: Chillstep, the house, the genre tiles, then every other tuned genre. */
export function endSpells(): Array<{ name: string; spell: Partial<Spell> | null }> {
  const g = genreSpells();
  const out: Array<{ name: string; spell: Partial<Spell> | null }> = [g[0], { name: 'house', spell: null }];
  for (const t of grid()) if (t.name.startsWith('tile ') && t.spell) out.push({ name: t.name, spell: t.spell });
  for (const s of g.slice(1)) out.push(s);
  return out;
}

/** One theme's ending. */
export function endOf(group: string, name: string, link: string, theme?: number): EndRow {
  const { plan, request } = quiet(() => played(link, theme));
  const p: any = plan;
  const bs = p.barSeconds;
  const birds = { ...HOUSE, ...((request as any).spell ?? {}) } as Spell;
  const S: any[] = p.arrangement?.sections ?? [];
  const phrase = Math.max(1, Math.round((p.phraseMap?.time?.phraseS ?? 8 * bs) / bs));
  // the seam as the transport reads it (`control.seamSeconds`)
  const sp = quiet(() => seamPlan(p, blendBarsFor(p, blendAsked(p)), { boundaryBars: 16 }));
  const seamAt = sp.at, blend = sp.bars;
  const seam = Math.round(seamAt / bs);
  const handover = EARLY ? Math.min(seam, Math.ceil((seamAt - LEAD + 0.5) / bs - 1e-9)) : seam;
  const at = (bar: number) => S.find((s) => bar >= s.startBar && bar < s.startBar + s.bars);
  const sec = at(handover);
  const before = at(Math.max(0, seam - 1));
  // the groove bars the hand-over takes before the section's own line (its end, or the seam where that comes first)
  const cut = sec && GROOVE.has(sec.kind) && handover > sec.startBar ? Math.min(seam, sec.startBar + sec.bars) - handover : 0;
  const seamSec = at(seam);
  const offPhrase = !!seamSec && seam > seamSec.startBar && (seam - seamSec.startBar) % phrase !== 0;
  const alone = offPhrase && GROOVE.has(seamSec.kind);
  // the record's notes over the hand-over's first bar: under a fifth of it covered (a hit counts a quarter second)
  const t0 = handover * bs, t1 = t0 + bs;
  const events = quiet(() => programOf(p)).events as any[];
  const spans = events.map((e) => [Math.max(t0, e.t), Math.min(t1, e.t + Math.max(0.25, +(e.p?.dur ?? 0)))]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let covered = 0, reach = t0;
  for (const [a, b] of spans) { if (b > reach) { covered += b - Math.max(a, reach); reach = b; } }
  const hole = covered < 0.2 * bs;
  const form = S.map((s) => `${s.kind[0] === 'b' && s.kind !== 'breakdown' ? 'B' : s.kind[0]}${s.bars}`).join(' ');
  return { group, name, link, theme: theme ?? 0, groove: derive(birds).drumsOn, bpm: p.bpm, bars: p.bars, form, phrase, seam, blend, handover,
    before: before ? `${before.kind} ${before.startBar}-${before.startBar + before.bars - 1}` : '-', cut, cutKind: cut ? sec.kind : null, alone, offPhrase, hole };
}

export function featuredEnds(): EndRow[] {
  return FEATURED.flatMap((f) => f.links.map((link, i) => endOf(`featured ${f.name}`, `${f.name} - ${f.labels?.[i] || i + 1}`, link)));
}

function jobs(seeds: number) {
  const out: Array<{ name: string; spell: Partial<Spell> | null; seed: string; theme: number }> = [];
  for (const s of endSpells()) for (let seed = 1; seed <= seeds; seed++) for (let theme = 0; theme < 3; theme++) out.push({ ...s, seed: String(seed), theme });
  return out;
}

const HERE = fileURLToPath(import.meta.url);

async function main() {
  const shard = arg('--shard');
  const seeds = +(arg('--seeds', '40')!);
  if (shard) {
    const [k, n] = shard.split('/').map(Number);
    const rows = jobs(seeds).filter((_, i) => i % n === k).map((j) => endOf(j.name, j.name, linkWrite({ seed: j.seed, theme: j.theme, strategy: 'house-v2', spell: j.spell } as any), j.theme));
    process.stdout.write(JSON.stringify(rows));
    return;
  }
  const featured = featuredEnds();
  console.log(`**The featured tracks** (${EARLY ? `the playlist's hand-over on the next bar line ${LEAD} s ahead of the seam` : 'the playlist\'s hand-over on the seam\'s line'})\n`);
  console.log('| track | bpm | form | phrase | before the seam | seam | blend | hand-over | groove bars cut | seam off its phrase | silent first bar |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of featured) if (r.groove) console.log(`| ${r.name} | ${r.bpm} | ${r.form} | ${r.phrase} | ${r.before} | ${r.seam} | ${r.blend} | ${r.handover} | ${r.cut ? `${r.cut} (${r.cutKind})` : '—'} | ${r.alone ? 'yes' : '—'} | ${r.hole ? 'yes' : '—'} |`);
  const fg = featured.filter((r) => r.groove);
  console.log(`\nfeatured grooves: ${fg.length}, chopped ${fg.filter((r) => r.cut).length}, seam off its phrase ${fg.filter((r) => r.alone).length}, a blend under four bars ${fg.filter((r) => r.blend < 4).length}, silent first bar ${fg.filter((r) => r.hole).length}`);
  if (process.argv.includes('--featured')) return;
  const n = +(arg('--jobs', '2')!);
  const parts = await Promise.all(Array.from({ length: n }, (_, k) => new Promise<EndRow[]>((res, rej) => {
    const c = spawn(process.execPath, [HERE, '--shard', `${k}/${n}`, '--seeds', String(seeds), ...(EARLY ? ['--early', '--lead', String(LEAD)] : [])], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    c.stdout.on('data', (d) => { out += d; });
    c.on('close', (code) => code ? rej(new Error(`shard ${k} ${code}`)) : res(JSON.parse(out)));
  })));
  const rows = parts.flat();
  const json = arg('--json');
  if (json) fs.writeFileSync(json, JSON.stringify({ featured, rows }));
  console.log(`\n**The grid** (seeds 1-${seeds}, themes 1-3; grooves only)\n`);
  console.log('| place | grooves | chopped | of which a drop | a main | a build | bars cut (median) | seam off a groove\'s phrase | seam off any phrase | a blend under four bars | silent first bar |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  const groups = [...new Set(rows.map((r) => r.group))];
  const line = (name: string, rs: EndRow[]) => {
    const g = rs.filter((r) => r.groove);
    if (!g.length) return;
    const c = g.filter((r) => r.cut);
    const med = c.length ? c.map((r) => r.cut).sort((a, b) => a - b)[Math.floor(c.length / 2)] : 0;
    const k = (kind: string) => c.filter((r) => r.cutKind === kind).length;
    console.log(`| ${name} | ${g.length} | ${c.length} (${(100 * c.length / g.length).toFixed(0)} %) | ${k('drop')} | ${k('main')} | ${k('build')} | ${med} | ${g.filter((r) => r.alone).length} | ${g.filter((r) => r.offPhrase).length} | ${g.filter((r) => r.blend < 4).length} | ${g.filter((r) => r.hole).length} |`);
  };
  for (const gname of groups) line(gname, rows.filter((r) => r.group === gname));
  line('**all**', rows);
}

if (process.argv[1] === HERE) await main();
