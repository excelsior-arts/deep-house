// **The program guards**: the bad-sound checks the liquid producer rounds wrote into their listen-through
// (`tools/producer-timeline.ts`), made general and run over the ring. Each one reads a planned theme and its compiled
// program — never a render — and is written against what every theme has: its tempo (bars, beats, sixteenths), its
// section map, its chords, and its layers. Nothing here names a place, a genre or a seed.
//
//   node tools/check-program-guards.ts                 the whole grid: counts per guard per spell, the worst cases
//   node tools/check-program-guards.ts --json <file>   the same, and every finding written to a file
//   node tools/check-program-guards.ts --link "<query>"  one theme, every finding
//   node tools/check-program-guards.ts --line          one line of totals (`npm run check` prints it)
//
// It reports and never fails: the findings are the next round's list of what may sound bad. The guards:
//
//   - **unlabelled**: where an arrangement labels its phrases (a theme that carries one), a foreground event — a
//     soloist note, a keys note, an arranged pad — with no label: something no phrase owns;
//   - **landing**: a landing (a drop, or a chord change after the harmony held four bars, outside a break) that the
//     drums play into with no gesture: no crash, swell or riser near it, no fill (snares added over the bar before or
//     its last beat), no breath (the drums thinned over it), no entry, no new top (the hats on new steps or in new voices);
//   - **build**: a bar of a build (a build section, or the run-up into a drop) where nothing harmonic or melodic
//     sounds, in a track that has harmony around it;
//   - **empty**: more than a phrase of groove (drums sounding, outside the intro, the outro and the break) where
//     nothing but the drums and the bass sounds;
//   - **stop**: a held chord or pad (a bar or more) that ends while the music goes on with no fade, no handover to
//     the next harmonic strike within a beat, and a release under 0.6 s (a voice that declares none is passed over);
//   - **bend**: a bass bend that throws the line more than three semitones over its own level past the register's
//     ceiling (the line's floor, the lowest twentieth of its notes, plus the bend room's 17 semitones and a margin of 2).
//
// Every threshold is `LIMITS`, below.
//
// The measured hole (a build bar quieter than the bar before) reads a render, so it stays in the timeline tool.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { planTheme, programOf, recipesFor } from '../src/mix.ts';
import { linkRead, linkWrite } from '../src/link.ts';
import { HOUSE, type Spell, type Bird } from '../src/spell.ts';
import { COMPASS } from '../src/bird-influence.ts';
import { CELLS, presetSpell } from '../src/machine/genre-table.ts';
import { lineUnder } from '../src/mined-phrase.ts';

/** The Pages preview a finding's link opens on (`t=` the second to hear). */
export const PREVIEW = 'https://eugene-tea.github.io/deep-house/';

const quiet = <T>(fn: () => T): T => {
  const keep = [console.log, console.info, console.warn];
  console.log = console.info = console.warn = () => {};
  try { return fn(); } finally { [console.log, console.info, console.warn] = keep; }
};

// ----- the grid -----

/** A spell of the grid, by name, and the seeds it is planned at. */
export interface GridSpell { name: string; spell: Partial<Spell> | null; seeds: string[] }

const SEEDS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const pull = (birds: Partial<Record<Bird, number>>): Partial<Spell> => ({ ...HOUSE, ...birds });

/**
 * **The grid**: every genre tile's spell (the nine cells, Deep House the centre); the ring's corners (each bird of the
 * compass pulled to 0.95) and midpoints (two neighbours at 0.8); the slow side; the odd crossings (opposite birds both
 * pulled; fast without drums; slow with drums); the deep wide dub link; and the ambient benchmark's spell, with its
 * own seed. Seeds 1-12 at each.
 */
export function grid(): GridSpell[] {
  const out: GridSpell[] = [];
  for (const c of CELLS) if (c) out.push({ name: `tile ${c.label}`, spell: c.spell && Object.keys(c.spell).length ? presetSpell(c) : null, seeds: SEEDS });
  for (const b of COMPASS) out.push({ name: `ring ${b}`, spell: pull({ [b]: 0.95 }), seeds: SEEDS });
  COMPASS.forEach((b, i) => { const n = COMPASS[(i + 1) % 8]; out.push({ name: `ring ${b}+${n}`, spell: pull({ [b]: 0.8, [n]: 0.8 }), seeds: SEEDS }); });
  out.push({ name: 'ring slow side', spell: pull({ ember: 0.1 }), seeds: SEEDS });
  for (let i = 0; i < 4; i++) { const a = COMPASS[i], z = COMPASS[i + 4]; out.push({ name: `ring ${a}x${z}`, spell: pull({ [a]: 0.9, [z]: 0.9 }), seeds: SEEDS }); }
  out.push({ name: 'ring fast, no spark', spell: pull({ ember: 0.95, spark: 0 }), seeds: SEEDS });
  out.push({ name: 'ring slow, spark', spell: pull({ ember: 0.1, spark: 0.9 }), seeds: SEEDS });
  out.push({ name: 'dub link', spell: { ember: 0.92, tide: 0.90, zephyr: 0.25, root: 0.85, veil: 0.15, spark: 0.10, loom: 0.80 }, seeds: SEEDS });
  out.push({ name: '27191 ambient', spell: pull({ ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 }), seeds: ['27191', ...SEEDS] });
  return out;
}

/** The written link of a grid point (the page's own writer). */
export const linkOf = (seed: string, spell: Partial<Spell> | null, theme = 0) => linkWrite({ seed, theme, strategy: 'house-v2', spell });

/** What the page plays off a link: read, cast and planned as the page does. */
export function playedAt(link: string) {
  const read = quiet(() => linkRead(`?${link.replace(/^\?/, '')}`));
  const L = read.link;
  const seed = L.seed ?? '1';
  const cast = quiet(() => recipesFor({ masterSeed: seed, strategy: L.strategy, search: `?${read.search}` }));
  return quiet(() => planTheme(seed, L.theme, { preset: 'auto', strategy: L.strategy, spell: cast.spell, recipe: cast.track, accompaniment: L.accompaniment, development: L.development }));
}

// ----- the guards -----

export type Guard = 'unlabelled' | 'landing' | 'build' | 'empty' | 'stop' | 'bend';
export const GUARDS: readonly Guard[] = ['unlabelled', 'landing', 'build', 'empty', 'stop', 'bend'];
/** One finding: the guard, the bar it starts at, how bad (bars, notes or semitones), and what it is. */
export interface Finding { guard: Guard; bar: number; weight: number; says: string }

type Ev = { t: number; bar: number | null; voice: string; layer: string; part?: string; role?: string; label?: string; note?: string; p: Record<string, any> };
export interface Theme { barSeconds: number; beat: number; bars: number; events: Ev[]; arrangement: { sections: Array<{ kind: string; startBar: number; bars: number }> };
  progression?: { states?: Array<{ bar: number; chord: { label: string } }>; changeEvery?: number }; passage?: unknown }

const DRUMS = new Set(['kick', 'clap', 'hats', 'shaker']);
/** The harmonic and melodic layers: what holds a chord or sings a line (the bass and the drums are neither). */
const TONAL = new Set(['keys', 'pad', 'lead', 'stab', 'arp', 'pluck', 'piano', 'bell', 'vocal', 'strings', 'melodic']);
const tonal = (e: Ev) => TONAL.has(e.layer) && typeof e.p.midi === 'number';
/** A bed: what holds the space when no chord or line does (a weather, a vinyl bed, an arranged texture). */
const bedding = (e: Ev) => tonal(e) || e.part === 'texture' || (e.layer === 'fx' && /weather|vinyl/i.test(e.voice));
const isSnare = (e: Ev) => e.layer === 'clap';

/**
 * **Every threshold, in one place.** Bars, beats and sixteenths are the tempo's; the one number in seconds is the ear's
 * (a release that long is a soft end at any tempo). The register's ceiling is the bend room's (`bendInRoom`, the liquid
 * row's `bass.register.ceilingSt`), with a margin before a throw past it is said.
 */
export const LIMITS = Object.freeze({
  /** a chord change is a landing after the harmony held this many bars */
  landingHoldBars: 4,
  /** a gesture counts within this much of a bar of the landing */
  gestureBars: 0.6,
  /** a fill: this many more snares over the last beat than the bar before had, or `fillBar` more over the bar */
  fillBeat: 2, fillBar: 3,
  /** a breath: the last beat's drums at this share of the bar before's, or the bar's at `breathBar` */
  breathBeat: 0.5, breathBar: 0.6,
  /** an entry: the drums on the landing this many times the bar before's; a turn: the hats' steps on it share under this of the bar before's, or their closed voices change */
  entry: 1.5, turn: 0.5,
  /** the run-up into a drop out of an intro or a break, in bars */
  runUpBars: 8,
  /** the groove bare (drums and bass alone) for more than this many bars is said, and more than `emptyBars` is empty */
  nearBars: 4, emptyBars: 8,
  /** a held note: a bar or more; a handover: the next strike within a beat; a soft end: a release of this many seconds */
  heldBars: 1, handoverBeats: 1, softEndS: 0.6,
  /** the bass's floor: its lowest twentieth of notes; the register's ceiling over it, and the margin before a throw is said */
  floorShare: 0.05, ceilingSt: 17, marginSt: 2,
  /** a throw: a bend this many semitones over its own line, read over this many sixteenths each side */
  throwSt: 3, windowSteps: 1.5,
});

/** Every guard over one theme: its plan (the labels, the sections, the chords) and its compiled program (what sounds). */
export function guards(plan: Theme): Finding[] {
  const prog = programOf(plan as any) as unknown as { events: Ev[]; settings: Record<string, any> };
  const bs = plan.barSeconds, beat = plan.beat, s16 = bs / 16, bars = plan.bars;
  const ev = prog.events.filter((e) => !e.p?.gone);
  const out: Finding[] = [];
  const sections = [...plan.arrangement.sections].sort((a, b) => a.startBar - b.startBar);
  const kindAt = (b: number) => sections.find((s) => b >= s.startBar && b < s.startBar + s.bars)?.kind ?? 'outro';
  const endOf = (e: Ev) => e.t + Number(e.p.dur ?? 0);
  // a note's release, as it says or as its voice's settings do (a voice that declares none shapes its own tail: unknown)
  const releaseOf = (e: Ev): number | null => { const r = e.p.release ?? prog.settings?.[e.voice]?.release; return typeof r === 'number' ? r : null; };
  const lastT = Math.max(...ev.map((e) => e.t));
  // per bar: drum onsets, snare onsets by quarter, tonal sounding, bass sounding
  const perBar = Array.from({ length: bars + 1 }, () => ({ drums: 0, snares: 0, lastBeatDrums: 0, lastBeatSnares: 0, kicks: 0, hats: new Set<number>(), hatVoices: new Set<string>(), tonal: false, bed: false }));
  for (const e of ev) {
    const b = Math.floor(e.t / bs + 1e-6);
    if (b < 0 || b > bars) continue;
    const step = (e.t - b * bs) / s16;
    if (DRUMS.has(e.layer)) {
      perBar[b].drums++;
      if (e.layer === 'kick') perBar[b].kicks++;
      if (isSnare(e)) perBar[b].snares++;
      if (e.layer === 'hats') { perBar[b].hats.add(Math.round(step)); if (!/open/i.test(e.voice)) perBar[b].hatVoices.add(e.voice); }
      if (step >= 11.5) { perBar[b].lastBeatDrums++; if (isSnare(e)) perBar[b].lastBeatSnares++; }
    }
  }
  // what sounds over a bar (the note's span with its release): a chord or a line, or a bed of any kind
  for (const e of ev) {
    if (!bedding(e)) continue;
    const a = Math.floor(e.t / bs + 1e-6), z = Math.min(bars, Math.floor((endOf(e) + Math.min(releaseOf(e) ?? 0, bs)) / bs - 1e-6));
    for (let b = Math.max(0, a); b <= z; b++) { perBar[b].bed = true; if (tonal(e)) perBar[b].tonal = true; }
  }

  // unlabelled: a theme the arrangement labels owns every foreground note with a phrase
  if (plan.passage) {
    const fg = plan.events.filter((e) => !e.p?.gone && (e.role === 'sparse-keys' || e.voice === 'wordlessVocal' || (e.part ?? '').startsWith('study-')) && !e.label);
    for (const e of fg) out.push({ guard: 'unlabelled', bar: e.bar ?? Math.floor(e.t / bs), weight: 1, says: `${e.voice}${e.part ? `/${e.part}` : ''} ${e.note ?? ''}`.trim() });
  }

  // the landings: each drop's start, and each chord change after the harmony held a phrase (four bars or more), outside
  // a break; a landing the drums play into (the bar before has them) wants a gesture
  const landings = new Set<number>(sections.filter((s) => s.kind === 'drop').map((s) => s.startBar));
  const states = plan.progression?.states ?? [];
  for (let i = 1; i < states.length; i++) if (states[i].bar - states[i - 1].bar >= LIMITS.landingHoldBars && states[i].chord.label !== states[i - 1].chord.label) landings.add(states[i].bar);
  const fxNear = (b: number) => ev.some((e) => e.layer === 'fx' && Math.abs(e.t - b * bs) <= LIMITS.gestureBars * bs && !/weather|vinyl/i.test(e.voice));
  for (const L of [...landings].sort((a, b) => a - b)) {
    if (L < 2 || L >= bars || kindAt(L) === 'breakdown') continue;
    const before = perBar[L - 1], prior = perBar[L - 2];
    if (!before.drums) continue; // the drums do not play into it: their entry is the answer
    const fill = before.lastBeatSnares >= prior.lastBeatSnares + LIMITS.fillBeat || before.snares >= prior.snares + LIMITS.fillBar;
    const breath = (before.lastBeatDrums <= LIMITS.breathBeat * prior.lastBeatDrums && prior.lastBeatDrums > 0) || before.drums <= LIMITS.breathBar * prior.drums;
    const entry = perBar[L].drums > LIMITS.entry * Math.max(1, before.drums);
    const on = perBar[L].hats, shared = [...on].filter((x) => before.hats.has(x)).length;
    const voices = perBar[L].hatVoices, sameVoices = voices.size === before.hatVoices.size && [...voices].every((v) => before.hatVoices.has(v));
    const turn = on.size > 0 && (shared < LIMITS.turn * Math.max(on.size, before.hats.size) || !sameVoices);
    if (fxNear(L) || fill || breath || entry || turn) continue;
    out.push({ guard: 'landing', bar: L, weight: 1, says: `${kindAt(L - 1)} into ${kindAt(L)}${states.some((s) => s.bar === L) ? ' (a chord change)' : ''}: no crash, swell, fill, breath, entry or new top` });
  }

  // the builds: a build section, and the run-up into a drop out of an intro or a break
  const hasHarmony = perBar.some((x) => x.tonal);
  const build = buildBars(plan);
  if (hasHarmony) {
    const holes = [...build].sort((a, b) => a - b).filter((b) => !perBar[b].tonal);
    for (const run of runs(holes)) out.push({ guard: 'build', bar: run[0], weight: run.length, says: `${run.length} bar${run.length > 1 ? 's' : ''} of a build with nothing harmonic or melodic (${run[0]}-${run[run.length - 1]})` });
  }

  // empty: the groove with nothing but drums and bass, longer than a phrase (eight bars; five to eight said as near)
  const groove = (b: number) => perBar[b].kicks > 0 && !['intro', 'outro', 'breakdown'].includes(kindAt(b));
  const bare = [...Array(bars).keys()].filter((b) => groove(b) && !perBar[b].bed);
  for (const run of runs(bare)) if (run.length > LIMITS.nearBars) out.push({ guard: 'empty', bar: run[0], weight: run.length, says: `${run.length} bars of drums and bass alone (${run[0]}-${run[run.length - 1]})${run.length <= LIMITS.emptyBars ? ', near' : ''}` });

  // stop: a held chord or pad ending while the music goes on, with no fade, handover or release
  const held = ev.filter((e) => tonal(e) && (e.layer === 'keys' || e.layer === 'pad') && Number(e.p.dur ?? 0) >= LIMITS.heldBars * bs && e.voice !== 'wordlessVocal');
  const onsets = ev.filter((e) => tonal(e) && Number(e.p.dur ?? 0) >= s16 * 4).map((e) => e.t).sort((a, b) => a - b);
  const stops = new Map<number, string[]>();
  for (const e of held) {
    const d = Number(e.p.dur), end = e.t + d;
    if (end > lastT - bs) continue;
    const gp = e.p.gainPath;
    const faded = Array.isArray(gp) && gp[gp.length - 1] <= 0.5 && gp[gp.length - 2] >= d - 0.05;
    const handed = onsets.some((x) => x > e.t + 0.5 && Math.abs(x - end) <= LIMITS.handoverBeats * beat);
    const r = releaseOf(e);
    if (faded || handed || r == null || r >= LIMITS.softEndS) continue;
    const b = Math.floor(end / bs);
    const l = stops.get(b) ?? []; l.push(`${e.voice} ${e.note ?? e.p.midi}`); stops.set(b, l);
  }
  for (const [b, xs] of stops) out.push({ guard: 'stop', bar: b, weight: xs.length, says: `${xs.length} held note${xs.length > 1 ? 's' : ''} stop at ${b} with no fade (${[...new Set(xs.map((x) => x.split(' ')[0]))].join(', ')})` });

  // bend: a bass bend thrown over its own line past the register's ceiling
  const bass = ev.filter((e) => e.layer === 'bass' && typeof e.p.midi === 'number');
  if (bass.length) {
    const sorted = bass.map((e) => Number(e.p.midi)).sort((a, b) => a - b);
    const floor = sorted[Math.floor(sorted.length * LIMITS.floorShare)], cap = floor + LIMITS.ceilingSt + LIMITS.marginSt;
    for (const e of bass) {
      if (!Array.isArray(e.p.bend)) continue;
      const x = bendThrow(e.p.bend as number[], Number(e.p.dur ?? 0), LIMITS.windowSteps * s16);
      const top = Number(e.p.midi) + x.top;
      if (x.throw > LIMITS.throwSt && top > cap) out.push({ guard: 'bend', bar: Math.floor(e.t / bs), weight: +(top - cap).toFixed(1), says: `a bend throws the line +${x.throw.toFixed(1)} to ${top.toFixed(1)} (${(top - floor).toFixed(1)} over its floor ${floor})` });
    }
  }
  return out.sort((a, b) => a.bar - b.bar);
}

/** Runs of consecutive bars. */
function runs(xs: number[]): number[][] {
  const out: number[][] = [];
  for (const x of xs) { const l = out[out.length - 1]; if (l && l[l.length - 1] === x - 1) l.push(x); else out.push([x]); }
  return out;
}

/** How far a bend path throws its note over its own line (`lineUnder`, as the register's room reads it), and the knot's height. */
export function bendThrow(b: number[], d: number, w: number): { throw: number; top: number } {
  let thrown = 0, top = 0;
  for (let i = 0; i < b.length; i += 2) {
    if (b[i] > d) break;
    const x = b[i + 1] - lineUnder(b, i >> 1, w);
    if (x > thrown) { thrown = x; top = b[i + 1]; }
  }
  return { throw: thrown, top };
}

/** The bars of a theme's builds: every build section, and the run-up (`runUpBars`) into a drop out of an intro or a break. */
export function buildBars(plan: Pick<Theme, 'arrangement'>): Set<number> {
  const sections = [...plan.arrangement.sections].sort((a, b) => a.startBar - b.startBar);
  const kindAt = (b: number) => sections.find((s) => b >= s.startBar && b < s.startBar + s.bars)?.kind ?? 'outro';
  const build = new Set<number>();
  for (const s of sections) {
    if (s.kind === 'build') for (let b = s.startBar; b < s.startBar + s.bars; b++) build.add(b);
    if (s.kind === 'drop' && s.startBar > 0 && ['intro', 'breakdown'].includes(kindAt(s.startBar - 1))) for (let b = Math.max(0, s.startBar - LIMITS.runUpBars); b < s.startBar; b++) build.add(b);
  }
  return build;
}

// ----- the run -----

/** A finding's whole link: the preview, the written link, the second its bar starts at. */
export const findingLink = (link: string, barSeconds: number, bar: number) => `${PREVIEW}?${link}&t=${Math.max(0, Math.floor(bar * barSeconds))}`;

function main() {
  const argv = process.argv.slice(2);
  const one = argv.indexOf('--link');
  if (one >= 0) {
    const link = argv[one + 1].replace(/^.*\?/, '');
    const plan = playedAt(link) as unknown as Theme;
    const found = guards(plan);
    for (const g of GUARDS) {
      const xs = found.filter((f) => f.guard === g);
      console.log(`${g}: ${xs.length ? xs.map((f) => `${f.bar} ${f.says}`).join('; ') : 'none'}`);
    }
    return;
  }
  const jsonAt = argv.indexOf('--json');
  const line = argv.includes('--line');
  const t0 = performance.now();
  const rows: Array<{ spell: string; seed: string; link: string; bpm: number; barSeconds: number; found: Finding[] }> = [];
  for (const g of grid()) for (const seed of g.seeds) {
    const link = linkOf(seed, g.spell);
    const plan = playedAt(link) as unknown as Theme & { bpm: number };
    rows.push({ spell: g.name, seed, link, bpm: plan.bpm, barSeconds: plan.barSeconds, found: guards(plan) });
  }
  const ms = performance.now() - t0;
  const total = (g: Guard) => rows.reduce((a, r) => a + r.found.filter((f) => f.guard === g).length, 0);
  if (line) { console.log(`program guards (a report, not a gate; npm run guards for the table): ${GUARDS.map((g) => `${g} ${total(g)}`).join(' · ')} over ${rows.length} themes in ${(ms / 1000).toFixed(1)} s`); return; }
  const names = [...new Set(rows.map((r) => r.spell))];
  const w = Math.max(...names.map((n) => n.length));
  console.log(`${'spell'.padEnd(w)}  ${GUARDS.map((g) => g.padStart(10)).join('')}   bpm`);
  for (const n of names) {
    const rs = rows.filter((r) => r.spell === n);
    const bpms = [...new Set(rs.map((r) => Math.round(r.bpm)))].sort((a, b) => a - b);
    console.log(`${n.padEnd(w)}  ${GUARDS.map((g) => String(rs.reduce((a, r) => a + r.found.filter((f) => f.guard === g).length, 0)).padStart(10)).join('')}   ${bpms.length > 2 ? `${bpms[0]}-${bpms[bpms.length - 1]}` : bpms.join(',')}`);
  }
  const all = rows.flatMap((r) => r.found.map((f) => ({ ...f, row: r })));
  console.log(`${'total'.padEnd(w)}  ${GUARDS.map((g) => String(all.filter((f) => f.guard === g).length).padStart(10)).join('')}`);
  // the worst: by weight inside each guard, ranked across guards by how far over the guard's own median it stands
  const median = (g: Guard) => { const v = all.filter((f) => f.guard === g).map((f) => f.weight).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : 1; };
  const score = (f: Finding) => f.weight / Math.max(1e-6, median(f.guard));
  // the worst ten, no more than three of one guard and one of a theme, so the list shows the spread
  const worst: typeof all = [];
  for (const f of [...all].sort((a, b) => score(b) - score(a) || b.weight - a.weight)) {
    if (worst.length >= 10) break;
    if (worst.filter((x) => x.guard === f.guard).length >= 3 || worst.some((x) => x.row === f.row && x.guard === f.guard)) continue;
    worst.push(f);
  }
  console.log('\nthe worst ten (at most three a guard):');
  for (const f of worst) console.log(`  ${f.guard} · ${f.row.spell} seed ${f.row.seed} bar ${f.bar}: ${f.says}\n    ${findingLink(f.row.link, f.row.barSeconds, Math.max(0, f.bar - 2))}`);
  console.log(`\n${rows.length} themes in ${(ms / 1000).toFixed(1)} s; a report, never a failure`);
  if (jsonAt >= 0) fs.writeFileSync(argv[jsonAt + 1], JSON.stringify(rows, null, 1));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
