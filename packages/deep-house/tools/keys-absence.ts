// **The keys' long absences** (round keys-room, 10-29; his word: *"in Sunrise there is an issue that piano is gone from
// 0:30 until 1:50"*). Over the program guards' grid (`check-program-guards.ts`: the tiles, the ring, the crossings, the
// slow side, 27191; seeds 1-12, theme 1), the featured tracks and the house at seeds 1-60 (themes 1-3), every theme whose
// keys layer plays: the stretches with no keys sounding (a note's ring counted) between the first keys note and the
// last, each said with what the arrangement gives as its reason:
//
//   - **grammar**: the section's grammar has the keys lane off over it (an intro, a build's first phrases, an outro);
//   - **switch-up**: a switch-up takes the keys out over it;
//   - **silent**: the lane is on and the part plays nothing (a theme's placement that sits a section out);
//   - **rest**: the part rests inside its own statement (the rest between statements).
//
// An absence is **inside** a section where the keys play when it lies within one such section; else it crosses a line.
//
//   node tools/keys-absence.ts                 the distribution, the worst twelve with their links
//   node tools/keys-absence.ts --link "<q>"    one theme: every absence
//   --house <n>                                house seeds 1-n (60 by default); --no-grid, --no-featured
import { grid, linkOf, playedAt } from './check-program-guards.ts';
import { FEATURED } from '../src/featured.ts';

const argv = process.argv.slice(2);
const opt = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const PHRASE = 8;

export interface Absence { from: number; to: number; bars: number; seconds: number; kinds: string[]; inside: boolean; reasons: string[] }
export interface KeysReading { link: string; name?: string; family: string; bars: number; barSeconds: number; absences: Absence[] }

/** What plays the keys: the composition's keys families and variants, else the events' parts. */
function familyOf(t: any, keys: any[]): string {
  let sel: Record<string, string> = {};
  try { sel = JSON.parse(t.dice?.composition ?? '{}').selected ?? {}; } catch { /* none */ }
  const named = Object.entries(sel).filter(([f]) => !['bass', 'body', 'bass-free', 'body-free', 'percussion', 'harmony', 'figure-space',
    'receding-backbeat', 'broken-eighths', 'figure-groove', 'perc-loop', 'lazy-kit', 'ghost-backbeat'].includes(f)).map(([f, v]) => `${f}:${v}`);
  if (named.length) return named.join('+');
  const parts = [...new Set(keys.filter((e) => e.part || e.role).map((e) => String(e.part ?? e.role).replace(/[-:]\d+$/, '')))];
  if (parts.length) return parts.join('+');
  // the style's own keys lane: a theme stated in the lead register (absent from a breakdown so its return is an event),
  // the piano's melody or arpeggio, else the stab mask
  const d = t.dice ?? {};
  return d.motifRegister === 'lead' ? 'lead theme' : d.pianoRole ? `piano ${d.pianoRole}` : 'stab mask';
}

export function keysAbsences(t: any): Omit<KeysReading, 'link'> | null {
  const bs = t.barSeconds as number;
  const keys = (t.events as any[]).filter((e) => e.layer === 'keys');
  if (!keys.length) return null;
  // the bars a keys note sounds in, its ring counted (a sixteenth's grace at the edges)
  const sounding = new Array(t.bars).fill(false);
  for (const e of keys) {
    const a = e.bar as number, b = Math.min(t.bars - 1, Math.floor((e.t + Number(e.p.dur ?? 0)) / bs - 1 / 16));
    for (let x = a; x <= Math.max(a, b); x++) sounding[x] = true;
  }
  const sec = (b: number) => t.arrangement.sections.find((s: any) => b >= s.startBar && b < s.startBar + s.bars);
  const playsIn = new Set<number>(keys.map((e) => sec(e.bar)?.index));
  const laneOn = (b: number) => !!t.timeline[b]?.layers?.includes('keys');
  const switches = (t.moments ?? []).filter((m: any) => m.kind === 'switch-up');
  const first = sounding.indexOf(true), last = sounding.lastIndexOf(true);
  const absences: Absence[] = [];
  for (let b = first; b <= last; b++) {
    if (sounding[b]) continue;
    let e = b; while (e + 1 <= last && !sounding[e + 1]) e++;
    const bars = e - b + 1;
    const kinds = [...new Set(Array.from({ length: bars }, (_, i) => sec(b + i)?.kind))];
    const idx = new Set(Array.from({ length: bars }, (_, i) => sec(b + i)?.index));
    const reasons = new Set<string>();
    for (let x = b; x <= e; x++) {
      if (switches.some((m: any) => x >= m.from && x < m.to)) reasons.add('switch-up');
      else if (!laneOn(x)) reasons.add('grammar');
      else if (!playsIn.has(sec(x)?.index)) reasons.add('silent');
      else reasons.add('rest');
    }
    absences.push({ from: b, to: e, bars, seconds: +(bars * bs).toFixed(1), kinds, inside: idx.size === 1 && playsIn.has([...idx][0]), reasons: [...reasons] });
    b = e;
  }
  return { family: familyOf(t, keys), bars: t.bars, barSeconds: bs, absences };
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
export const say = (a: Absence, bs: number) => `${a.from}-${a.to} (${a.bars} bars, ${fmt(a.from * bs)}-${fmt((a.to + 1) * bs)}) ${a.kinds.join('>')} [${a.reasons.join(', ')}]${a.inside ? ' inside' : ''}`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const one = opt('--link');
  if (one) {
    const t: any = playedAt(one);
    const r = keysAbsences(t);
    console.log(t.arrangement.sections.map((s: any) => `${s.kind} ${s.startBar}+${s.bars}`).join(' | '));
    if (!r) { console.log('no keys'); process.exit(0); }
    console.log(`${r.family}: ${r.absences.length ? r.absences.map((a) => say(a, r.barSeconds)).join('\n  ') : 'never away'}`);
    process.exit(0);
  }
  const links: Array<{ link: string; name?: string; set: string }> = [];
  if (!argv.includes('--no-grid')) for (const g of grid()) for (const seed of g.seeds) links.push({ link: linkOf(seed, g.spell), set: 'grid' });
  if (!argv.includes('--no-featured')) for (const p of FEATURED) p.links.forEach((l, i) => links.push({ link: l, name: `${p.name} - ${p.labels?.[i] || i + 1}`, set: 'featured' }));
  const house = Number(opt('--house') ?? 60);
  for (let s = 1; s <= house; s++) for (let th = 0; th < 3; th++) links.push({ link: linkOf(String(s), null, th), set: 'house' });
  const rows: Array<KeysReading & { set: string }> = [];
  let none = 0;
  for (const L of links) {
    const t: any = playedAt(L.link);
    const r = keysAbsences(t);
    if (!r) { none++; continue; }
    rows.push({ ...r, link: L.link, name: L.name, set: L.set });
  }
  const longest = (r: KeysReading, f: (a: Absence) => boolean = () => true) => Math.max(0, ...r.absences.filter(f).map((a) => a.bars));
  const pct = (n: number, d: number) => `${n}/${d} (${d ? Math.round(100 * n / d) : 0} %)`;
  console.log(`keys absences over ${links.length} themes (${none} without keys): ${rows.length} with keys`);
  for (const set of ['all', 'grid', 'house', 'featured']) {
    const xs = set === 'all' ? rows : rows.filter((r) => r.set === set);
    if (!xs.length) continue;
    const inside = xs.filter((r) => longest(r, (a) => a.inside) > PHRASE).length;
    const anyLong = xs.filter((r) => longest(r) > PHRASE).length;
    const long16 = xs.filter((r) => longest(r) > 2 * PHRASE).length;
    const longS = xs.filter((r) => Math.max(0, ...r.absences.map((a) => a.seconds)) > 60).length;
    console.log(`\n${set}: ${xs.length} themes with keys`);
    console.log(`  away more than a phrase inside a section where they play: ${pct(inside, xs.length)}`);
    console.log(`  away more than a phrase anywhere between the first and last note: ${pct(anyLong, xs.length)}; more than two phrases: ${pct(long16, xs.length)}; over 60 s: ${pct(longS, xs.length)}`);
    const hist = new Map<string, number>();
    const bucket = (b: number) => b <= 8 ? '<=8' : b <= 16 ? '9-16' : b <= 24 ? '17-24' : b <= 32 ? '25-32' : '>32';
    for (const r of xs) hist.set(bucket(longest(r)), (hist.get(bucket(longest(r))) ?? 0) + 1);
    console.log(`  longest absence per theme, bars: ${['<=8', '9-16', '17-24', '25-32', '>32'].map((k) => `${k} ${hist.get(k) ?? 0}`).join(' · ')}`);
    const reasons = new Map<string, number>();
    for (const r of xs) for (const a of r.absences) if (a.bars > PHRASE) { const k = `${a.reasons.join('+')} over ${a.kinds.join('>')}`; reasons.set(k, (reasons.get(k) ?? 0) + 1); }
    console.log(`  absences over a phrase, by reason: ${[...reasons].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k} ${n}`).join('; ')}`);
    const fams = new Map<string, { n: number; long: number; worst: number }>();
    for (const r of xs) { const f = fams.get(r.family) ?? { n: 0, long: 0, worst: 0 }; f.n++; if (longest(r) > PHRASE) f.long++; f.worst = Math.max(f.worst, longest(r)); fams.set(r.family, f); }
    console.log(`  by keys family (themes, over a phrase, worst bars): ${[...fams].sort((a, b) => b[1].n - a[1].n).slice(0, 14).map(([k, f]) => `${k} ${f.n}/${f.long}/${f.worst}`).join('; ')}`);
  }
  console.log('\nthe worst twelve:');
  for (const r of [...rows].sort((a, b) => Math.max(0, ...b.absences.map((x) => x.seconds)) - Math.max(0, ...a.absences.map((x) => x.seconds))).slice(0, 12)) {
    const w = r.absences.reduce((m, a) => (a.seconds > m.seconds ? a : m));
    console.log(`  ${r.name ?? r.link}  ${r.family}: ${say(w, r.barSeconds)}`);
  }
  console.log('\nfeatured with keys:');
  for (const r of rows.filter((x) => x.set === 'featured')) console.log(`  ${r.name}  ${r.family}: ${r.absences.filter((a) => a.bars > PHRASE).map((a) => say(a, r.barSeconds)).join('; ') || 'never away over a phrase'}`);
}
