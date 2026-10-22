// **The zones** (PLAN-ZONES §3.9, the BELLS pilot §5), in node, on the compiled program: his worry is contamination at
// reach nought, and this is its gate.
//
//   1. static: the zones admitted (every lane a row or a borrowed row, the centre inside its own box), the boxes never
//      overlap, and no anchor — a link-digest row's spell, the protected spells, the tiles and tuned styles, every other
//      place's own birds, the planned styles' reserved spells — stands inside a box or within 0.05 of it on an address bird;
//   2. null outside: every probe outside every box (the digest's spells, the protected spells, a uniform sample over the
//      drumless side and the ring, a shell 0.01-0.02 outside each face of each box, the ambient anchors' birds dragged to
//      their ends) plans what the tables less the zones' entries plan, and what the style with no zones at all plans
//      wherever that style read none of a zone's entries;
//   3. the read trace: inside a box every lane reads the zone (its own entry or its borrowed row); outside, every lane
//      reads the legacy table and none reads a zone's entry;
//   4. one zone a spell: every seed and theme at one spell is in the one zone its address says (the box's faces);
//   5. the controls: no control leaves the zone over its travel (Root 0-1 among them, which left BELLS at 0.90 before),
//      an inert bird's whole travel plays the centre's program, and an address bird's lean reaches its ends at its band's
//      edges; the ring's detent at an edge;
//   6. reach: a turn inside a box draws only the zone's list, at any reach (BELLS's is empty: no turn), and a row a zone
//      lists is drawn nowhere outside it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planTheme } from '../src/mix.ts';
import { APP } from './as-played.ts';
import { themeHash } from './link-digest.ts';
import { placeReadsOf } from '../src/generator.ts';
import { libraryTurn } from '../src/library-draw.ts';
import { BIRDS, HOUSE, parseSpell, type Bird, type Spell } from '../src/spell.ts';
import { CELLS, TUNED_STYLES, presetSpell } from '../src/genres/genre-table.ts';
import { clockAt, type TimeEntry } from '../src/musical-time.ts';
import { freeStyle, TILE } from './second-clock-fixture.ts';
import { borrowLines, digestOf, type BorrowedFile } from './zones-borrow.ts';
import { DRAWABLE } from '../src/library-draw.ts';
import BORROWED from '../src/styles/zones-borrowed.json' with { type: 'json' };
import {
  zonesFaults, zoneOf, inZone, inBand, bandEnds, bandsMeet, withoutZones, leanShift, zoneDetent, PLACE_LANES,
  type Zone, type StylePlaces, type PlaceEntry, type BirdLeans, type PlaceLane,
} from '../src/places.ts';

const quiet = <T>(fn: () => T): T => {
  const keep = [console.log, console.info, console.warn];
  console.log = console.info = console.warn = () => {};
  try { return fn(); } finally { [console.log, console.info, console.warn] = keep; }
};
type Style = typeof APP;
const P = (APP as Style & { places: StylePlaces }).places;
const ZONES = P.zones ?? [];
const withZones = (zones: readonly Zone[]): Style => ({ ...APP, places: { ...P, zones } }) as Style;
/** The tables less every zone's own entries, and no zones: the legacy space as the zones leave it. */
const LEGACY_ONLY: Style = (() => {
  const own = (lane: string) => new Set(ZONES.map((z) => z.rows[lane as keyof Zone['rows']]).filter(Boolean));
  const { zones: _z, ...rest } = P;
  const places = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, Array.isArray(v) && (PLACE_LANES as readonly string[]).includes(k) ? (v as PlaceEntry[]).filter((e) => !own(k).has(e.id)) : v]));
  return { ...APP, places } as Style;
})();
const NO_ZONES = withoutZones(APP as Style & { places: StylePlaces }) as Style;
const plan = (style: Style, seed: string | number, n: number, spell: Spell, extra: Record<string, unknown> = {}) =>
  quiet(() => planTheme(String(seed), n, { strategy: 'house-v2', style, spell, ...extra }));
const hashOf = (t: ReturnType<typeof planTheme>) => themeHash(t).slice(0, 16);
const full = (s: Partial<Spell>): Spell => ({ ...HOUSE, ...s }) as Spell;
const r2 = (x: number) => Math.round(x * 100) / 100;
function rng(seed: number) { let x = seed >>> 0; return () => { x = (x + 0x6D2B79F5) >>> 0; let t = x; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** A spell on the ring's hundredths, as a link carries it. */
const onRing = (s: Spell): Spell => Object.fromEntries(BIRDS.map((b) => [b, r2(s[b])])) as Spell;
/** Spells inside a zone's box: each address bird anywhere in its band, every other bird anywhere. */
const insideOf = (z: Zone, n: number, seed: number): Spell[] => {
  const r = rng(seed);
  return Array.from({ length: n }, () => onRing(Object.fromEntries(BIRDS.map((b) => { const B = z.address[b]; if (!B) return [b, r()]; const [lo, hi] = bandEnds(B); return [b, lo + (hi - lo) * r()]; })) as Spell))
    .map((s) => { for (const b of Object.keys(z.address) as Bird[]) if (!inBand(s[b], z.address[b]!)) s[b] = r2(Math.min(Math.max(s[b], bandEnds(z.address[b]!)[0] + 0.01), bandEnds(z.address[b]!)[1] - 0.01)); return s; });
};
/** The shell: for each address bird's inner edge, spells 0.01 and 0.02 past it, the rest inside the box. */
const shellOf = (z: Zone, perFace: number, seed: number): Spell[] => {
  const out: Spell[] = [];
  for (const b of Object.keys(z.address) as Bird[]) {
    const [lo, hi] = bandEnds(z.address[b]!);
    const faces = [...(lo > 0 ? [-1] : []), ...(hi < 1 ? [1] : [])];
    for (const side of faces) insideOf(z, perFace, seed + out.length).forEach((s, i) => {
      const past = side > 0 ? (z.address[b]!.to !== undefined ? hi : hi - 0.01) + 0.01 * (1 + (i % 2)) : (z.address[b]!.from !== undefined ? lo : lo + 0.01) - 0.01 * (1 + (i % 2));
      out.push({ ...s, [b]: r2(past) });
    });
  }
  return out;
};
/** How far outside a box a spell stands on its address birds: the most any band is overshot (nought inside). */
const margin = (z: Zone, s: Spell) => Math.max(0, ...(Object.entries(z.address) as Array<[Bird, NonNullable<Zone['address'][Bird]>]>).map(([b, B]) => {
  const [lo, hi] = bandEnds(B);
  return s[b] < lo ? lo - s[b] : s[b] > hi ? s[b] - hi : inBand(s[b], B) ? 0 : 1e-9;
}));

/** The link digest's v2 spells, and the protected spells PLAN-AMBIENT §2.4 and the zones plan keep (seed 6's golden, the Ambient tile, seed 6 at the Dubstep spell). */
const DIGEST = (JSON.parse(fs.readFileSync(new URL('./link-digest.json', import.meta.url), 'utf8')).rows as Array<{ link: string; strategy: string }>)
  .filter((r) => r.strategy === 'house-v2').map((r) => new URLSearchParams(r.link));
const digestSpells = DIGEST.map((q) => ({ seed: q.get('seed') ?? '1', n: Math.max(0, Number(q.get('theme') ?? 1) - 1), spell: full(parseSpell(q.get('spell') ?? '') ?? {}) }));
const PROTECTED: Spell[] = [
  full({ ember: 0, tide: 0.90, zephyr: 0.25, root: 0.85, veil: 0.15, spark: 0.10, loom: 0.80 }),
  full({ ember: 0.10, tide: 0.85, zephyr: 0.90, root: 0.50, veil: 0.30, spark: 0, loom: 0.80 }),
  full({ ember: 0.92, tide: 0.90, zephyr: 0.25, root: 0.85, veil: 0.15, spark: 0.10, loom: 0.80 }),
  full({ ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 }),
];
/** The planned ambient styles' reserved spells (PLAN-AMBIENT §3): a zone that would hold one is refused before it lands. */
const RESERVED: Record<string, Partial<Spell>> = {
  bowls: { ember: 0.02, tide: 0.95, zephyr: 0.50, root: 0.30, gleam: 0.80, veil: 0.05, spark: 0, loom: 1.0 },
  om: { ember: 0.02, tide: 0.90, zephyr: 0.10, root: 1.0, gleam: 0.75, veil: 0.05, spark: 0, loom: 1.0 },
  waves: { ember: 0.05, tide: 0.85, zephyr: 0.75, root: 0.55, gleam: 0.50, veil: 0.60, spark: 0.10, loom: 0.95 },
  psy: { ember: 0.08, tide: 0.90, zephyr: 0.65, root: 0.60, gleam: 0.35, veil: 0.90, spark: 0.55, loom: 0.70 },
  loops: { ember: 0.03, tide: 0.55, zephyr: 0.35, root: 0.35, gleam: 0.60, veil: 0.15, spark: 0.30, loom: 1.0 },
  field: { ember: 0.02, tide: 0.75, zephyr: 0.45, root: 0.45, gleam: 0.15, veil: 0.20, spark: 0.05, loom: 1.0 },
  pulse: { ember: 0.12, tide: 0.40, zephyr: 0.55, root: 0.40, gleam: 0.60, veil: 0.45, spark: 0.25, loom: 0.85 },
};
const ownIds = (z: Zone) => new Set(Object.entries(z.rows).map(([lane, id]) => `${lane}/${id}`));
/** The style's lanes' words, as the app reads its zones' roles at load. */
const LANE_ROLES = [...new Set((APP as unknown as { lanes: Array<{ role: string }> }).lanes.map((l) => l.role))];
/** A theme the zone itself plays: no library turn but one its list admits, and its own technique where it lays one (BELLS: the conversation). */
const zonesOwn = (z: Zone, t: ReturnType<typeof planTheme>) => (!t.drawn || z.library.includes(t.drawn.id)) && (z.rows.conversation === undefined || !!t.conversation);

test('1. the zones are admitted, their boxes never overlap, and no anchor stands in or near a box not its own', () => {
  assert.ok(ZONES.length >= 1, 'no zone');
  assert.deepEqual(zonesFaults(P), []);
  for (const z of ZONES) {
    assert.ok(inZone(z, z.centre), `${z.id}: its centre outside its box`);
    for (const lane of PLACE_LANES) assert.ok((z.rows[lane] !== undefined) !== Object.hasOwn(z.borrow, lane), `${z.id}: ${lane}`);
    assert.ok(!Object.hasOwn(z.address, 'zephyr'), `${z.id}: Zephyr an address`);
  }
  // the bands' arithmetic, and the faults a second zone would meet
  assert.ok(bandsMeet({ to: 0.6 }, { from: 0.6 }) && !bandsMeet({ to: 0.6 }, { above: 0.6 }) && !bandsMeet({ below: 0.45 }, { from: 0.45 }) && bandsMeet({}, { above: 0.9 }));
  const bells = ZONES[0];
  const restless: Zone = { ...bells, id: 'test-restless', address: { ...bells.address, veil: { above: 0.60 } }, centre: { ...bells.centre, veil: 0.9 } };
  // (its rows are the bells' own, which stand at the bells' centre and not its: only the boxes are asked here)
  assert.deepEqual(zonesFaults({ ...P, zones: [bells, restless] }).filter((m) => /box|centre is/.test(m)), [], 'a box over Veil 0.60 beside the bells is refused');
  const over: Zone = { ...restless, id: 'test-over', address: { ...bells.address, veil: { from: 0.60 } } };
  assert.ok(zonesFaults({ ...P, zones: [bells, over] }).some((m) => /overlap/.test(m)), 'two boxes sharing Veil 0.60 are admitted');
  assert.ok(zonesFaults({ ...P, zones: [{ ...bells, address: { ...bells.address, zephyr: { from: 0.5 } } }] }).some((m) => /Zephyr/.test(m)), 'Zephyr admitted as an address');
  // what the load refuses (the review of 10-18), each a mutation the faults must name
  assert.deepEqual(zonesFaults(P, LANE_ROLES), [], 'the shipped zones against the lanes\' roles');
  const refuses = (what: string, places: StylePlaces, re: RegExp) => assert.ok(zonesFaults(places, LANE_ROLES).some((m) => re.test(m)), `${what}: admitted (${zonesFaults(places, LANE_ROLES).join('; ')})`);
  const [ownLane, ownId] = Object.entries(bells.rows)[0] as [PlaceLane, string];
  const moved = { ...P, [ownLane]: (P[ownLane] as PlaceEntry[]).map((e) => (e.id === ownId ? { ...e, place: { ...e.place, birds: { ...e.place.birds, root: 0.2 } } } : e)) } as StylePlaces;
  refuses('an own entry whose place is not the centre', moved, /stands at another place/);
  const elsewhere = (P.harmony ?? []).find((e) => BIRDS.some((b) => (e.place.birds[b] ?? HOUSE[b]) !== bells.centre[b]))!;
  refuses(`an own entry of another place (harmony ${elsewhere.id})`, { ...P, zones: [{ ...bells, rows: { ...bells.rows, harmony: elsewhere.id } }] }, /harmony's .* stands at another place/);
  const [bLane] = Object.entries(bells.borrow).find(([, e]) => e) as [PlaceLane, PlaceEntry];
  // a second zone owning the lane the bells borrow, by the very row they borrow: the bells' borrow is then a zone's own entry
  const owner: Zone = { ...restless, id: 'test-owner', rows: { ...restless.rows, [bLane]: (bells.borrow[bLane] as PlaceEntry).id },
    borrow: Object.fromEntries(Object.entries(restless.borrow).filter(([k]) => k !== bLane)) };
  refuses('a borrowed row with a zone\'s own id', { ...P, zones: [bells, owner] }, new RegExp(`zone ${bells.id}: ${bLane} borrows ${(bells.borrow[bLane] as PlaceEntry).id}, a zone's own entry`));
  refuses('a row in the wrong lane (the bed\'s in the drums)', { ...P, zones: [{ ...bells, borrow: { ...bells.borrow, drums: (P.bed ?? [])[0] } }] }, /drums borrows .*, no entry of that lane's table/);
  refuses('a tempo band without lo < hi', { ...P, zones: [{ ...bells, tempo: { from: 80, to: 40 } }] }, /tempo band 80 to 40/);
  refuses('a library id no row has', { ...P, zones: [{ ...bells, library: ['ambient/no-such-row'] }] }, /library names ambient\/no-such-row/);
  refuses('a role no lane has', { ...P, zones: [{ ...bells, roles: ['bagpipes'] }] }, /roles names bagpipes/);
  assert.deepEqual(zonesFaults({ ...P, zones: [{ ...bells, library: [DRAWABLE[0].id] }] }, LANE_ROLES), [], 'a drawable row refused');
  // the borrowed rows held (M4): each today's read at its zone's centre by value, or kept by its digest; a hand edit fails
  // either way. The fixtures stand on the file's own keeps (a lane kept for real is no fault of theirs), on a lane it
  // does not keep; and a legitimate keep, a lane whose row is not today's read held by its digest, passes them whole
  const file = BORROWED as unknown as BorrowedFile;
  for (const z of ZONES) assert.deepEqual(z.borrow, file.zones[z.id], `${z.id}: plays other rows than the file's`);
  const holds = (P: StylePlaces, kept: NonNullable<BorrowedFile['kept']>, what: string) => {
    const bells = P.zones![0];
    assert.deepEqual(borrowLines(P, kept).filter((l) => l.fault).map((l) => l.fault), [], `${what}: the borrowed rows`);
    const mine = kept[bells.id] ?? {};
    const [tLane, tRow] = Object.entries(bells.borrow).find(([l, e]) => e && Object.keys(e).length > 2 && !Object.hasOwn(mine, l)) as [PlaceLane, PlaceEntry];
    const keeping = (digest: string) => ({ ...kept, [bells.id]: { ...mine, [tLane]: digest } });
    const edited = { ...JSON.parse(JSON.stringify(tRow)), edited: 3 } as PlaceEntry;
    const editedP = { ...P, zones: [{ ...bells, borrow: { ...bells.borrow, [tLane]: edited } }, ...P.zones!.slice(1)] } as StylePlaces;
    assert.ok(borrowLines(editedP, kept).some((l) => l.lane === tLane && l.fault), `${what}: a hand-edited ${tLane} row held`);
    assert.ok(!borrowLines(editedP, keeping(digestOf(edited))).some((l) => l.fault), `${what}: a kept ${tLane} row refused`);
    assert.ok(borrowLines(editedP, keeping(digestOf(tRow))).some((l) => l.lane === tLane && /kept row was edited/.test(l.fault ?? '')), `${what}: a kept ${tLane} row edited after its keep held`);
    assert.ok(borrowLines(P, keeping(digestOf(tRow))).some((l) => /agrees with today's read again/.test(l.fault ?? '')), `${what}: a stale keep held`);
    const sourceMoved = { ...P, [tLane]: (P[tLane] as PlaceEntry[]).map((e) => (e.id === tRow.id ? { ...e, moved: 1 } : e)) } as StylePlaces;
    assert.ok(borrowLines(sourceMoved, kept).some((l) => l.lane === tLane && l.fault), `${what}: a moved source of ${tLane} unseen`);
    return tLane;
  };
  const tLane = holds(P, file.kept ?? {}, 'the shipped file');
  // the kept fixture: the shipped file with another lane kept, its row a deliberately altered copy of today's read (the
  // zone holding on to an old read after its source moved), so the fixtures above must run on a lane beside it
  const [kLane, kRow] = Object.entries(bells.borrow).find(([l, e]) => e && l !== tLane) as [PlaceLane, PlaceEntry];
  const old = { ...JSON.parse(JSON.stringify(kRow)), older: 1 } as PlaceEntry;
  const keptP = { ...P, zones: [{ ...bells, borrow: { ...bells.borrow, [kLane]: old } }, ...ZONES.slice(1)] } as StylePlaces;
  const keptFile = { ...(file.kept ?? {}), [bells.id]: { ...(file.kept?.[bells.id] ?? {}), [kLane]: digestOf(old) } };
  assert.ok(borrowLines(keptP, file.kept ?? {}).some((l) => l.lane === kLane && l.fault), `the kept fixture's ${kLane} row unkept is held`);
  assert.notEqual(holds(keptP, keptFile, `${kLane} kept`), kLane, 'the fixtures ran on the kept lane');
  // the anchors
  const anchors: Array<[string, Spell]> = [
    ...digestSpells.map((d, i) => [`digest ${i} (${DIGEST[i].toString()})`, d.spell] as [string, Spell]),
    ...PROTECTED.map((s, i) => [`protected ${i}`, s] as [string, Spell]),
    ...CELLS.filter(Boolean).map((p) => [`tile ${p!.label}`, full(presetSpell(p!))] as [string, Spell]),
    ...TUNED_STYLES.map((p) => [`tuned ${p.of}/${p.label}`, full(presetSpell(p))] as [string, Spell]),
    ...Object.entries(RESERVED).map(([k, s]) => [`reserved ${k}`, full(s)] as [string, Spell]),
  ];
  for (const z of ZONES) {
    const own = ownIds(z);
    const places = PLACE_LANES.flatMap((lane) => ((P[lane] ?? []) as PlaceEntry[]).filter((e) => !own.has(`${lane}/${e.id}`)).map((e) => [`${lane}/${e.id}`, full(e.place.birds)] as [string, Spell]));
    const near = [...anchors, ...places].filter(([, s]) => margin(z, s) < 0.05 - 1e-9).map(([k, s]) => `${k} at ${margin(z, s).toFixed(3)}`);
    assert.deepEqual(near, [], `${z.id}: anchors inside its box or within 0.05 of it`);
  }
});

/** The probes outside every box: the digest's spells, the protected, a uniform sample, the shell, the ambient anchors dragged. */
function outsideProbes(): Array<{ seed: string; n: number; spell: Spell; kind: string }> {
  const out: Array<{ seed: string; n: number; spell: Spell; kind: string }> = [];
  for (const d of digestSpells) out.push({ ...d, kind: 'digest' });
  PROTECTED.forEach((s, i) => out.push({ seed: String(1 + i), n: 0, spell: s, kind: 'protected' }));
  const r = rng(31);
  for (let i = 0; i < 60; i++) out.push({ seed: String(1 + (i % 12)), n: i % 3, spell: onRing(Object.fromEntries(BIRDS.map((b) => [b, b === 'ember' ? r() * 0.18 : r()])) as Spell), kind: 'drumless' });
  for (let i = 0; i < 30; i++) out.push({ seed: String(1 + (i % 12)), n: i % 3, spell: onRing(Object.fromEntries(BIRDS.map((b) => [b, r()])) as Spell), kind: 'ring' });
  for (const z of ZONES) shellOf(z, 16, 41).forEach((s, i) => out.push({ seed: String(1 + (i % 12)), n: i % 3, spell: s, kind: 'shell' }));
  for (const at of PROTECTED.slice(0, 2).concat([PROTECTED[3]])) for (const b of BIRDS) for (const v of [0, 1]) out.push({ seed: '3', n: 0, spell: { ...at, [b]: v }, kind: 'dragged' });
  return out.filter((p) => !zoneOf(P, p.spell));
}

test('2-3. outside every box: the legacy read alone, the program the tables less the zones\' entries plan, and today\'s wherever today read none of a zone\'s entries', (ctx) => {
  const probes = outsideProbes();
  const zoneRead = (t: ReturnType<typeof planTheme>) => (placeReadsOf(t) ?? []).some((r) => ZONES.some((z) => ownIds(z).has(`${r.lane}/${r.id}`)));
  let same = 0, readZone = 0;
  const kinds: Record<string, number> = {};
  for (const p of probes) {
    const on = plan(APP, p.seed, p.n, p.spell), legacy = plan(LEGACY_ONLY, p.seed, p.n, p.spell), off = plan(NO_ZONES, p.seed, p.n, p.spell);
    const reads = placeReadsOf(on);
    assert.ok(reads && reads.length > 0, `${p.kind} ${p.seed}#${p.n}: no read trace`);
    assert.deepEqual(reads!.filter((r) => r.how !== 'legacy' || r.zone !== null).map((r) => `${r.lane}:${r.how}`), [], `${p.kind}: a zone read outside every box`);
    assert.ok(!zoneRead(on), `${p.kind} ${JSON.stringify(p.spell)}: a zone's entry read outside its box`);
    assert.equal(on.conversation, undefined, `${p.kind} ${JSON.stringify(p.spell)}: a conversation outside the zone`);
    assert.equal(hashOf(on), hashOf(legacy), `${p.kind} ${JSON.stringify(p.spell)}: not the legacy tables' program`);
    if (zoneRead(off)) { readZone++; kinds[p.kind] = (kinds[p.kind] ?? 0) + 1; continue; }
    assert.equal(hashOf(on), hashOf(off), `${p.kind} ${JSON.stringify(p.spell)}: moved, where the style with no zones read none of a zone's entries`);
    same++;
  }
  ctx.diagnostic(`${probes.length} probes outside every box: ${same} play today's program to the bit; ${readZone} read a BELLS entry today (${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ')}) and now play the tables less it`);
  assert.ok(probes.length >= 200 && same >= 150, `${probes.length} probes, ${same} unmoved`);
  for (const p of probes.filter((x) => x.kind === 'digest' || x.kind === 'protected')) assert.ok(!zoneRead(plan(NO_ZONES, p.seed, p.n, p.spell)), `${p.kind}: a shipped spell read BELLS today`);
});

test('3-4. inside a box every lane reads the zone, and every seed and theme at one spell is in the one zone its address says', (ctx) => {
  // no reader of a place table skips the one read (a call of its own to `nearestEntry` would read past every zone)
  // nor the free clock (second-clock's `clockAt`): it asks the one read for the time lane, a table handed it by name never
  for (const f of ['generator.ts', 'set-plan.ts', 'mix.ts', 'musical-time.ts']) {
    const src = fs.readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    assert.ok(!/\bnearestEntry\(/.test(src), `src/${f} reads a place table past readPlace`);
    assert.ok(!/(PLACED|places\??)\.time\b/.test(src), `src/${f} hands the time table past readPlace`);
  }
  assert.match(fs.readFileSync(new URL('../src/musical-time.ts', import.meta.url), 'utf8'), /export function clockAt\([^)]*\)[^{]*\{[^}]*readPlace\(places, 'time'/, 'clockAt reads past readPlace');
  // the free clock by the zone: a free time entry at the tile (second-clock's fixture) is the nearest at every centre that
  // borrows the tile's time, yet inside the box the zone's borrowed time answers (the bar clock), and a zone whose own
  // time is free plays free at its centre; outside, the fixture's free tile as second-clock laid it
  const FREE = freeStyle(APP as never) as Style, FP = (FREE as Style & { places: StylePlaces }).places;
  assert.equal(clockAt(FP, full(TILE), 47), 'free', 'the fixture is not free at its tile');
  for (const z of ZONES) {
    assert.equal(clockAt(withoutZones(FREE as Style & { places: StylePlaces }).places, z.centre, 47) === 'free', z.borrow.time?.id === 'the-ring-s-own-time-7', `${z.id}: the fixture's reach at the centre with no zones`);
    assert.equal(clockAt(FP, z.centre, 47), z.borrow.time && (z.borrow.time as TimeEntry).clock === 'free' ? 'free' : 'bars', `${z.id}: the free clock read past the zone`);
    const freeZone: Zone = { ...z, borrow: { ...z.borrow, time: { ...(z.borrow.time ?? { id: 'the-ring-s-own-time-7', place: { birds: {}, tempo: [0, Infinity] } }), clock: 'free' } as TimeEntry } };
    const style = withZones([freeZone]);
    assert.equal(clockAt((style as Style & { places: StylePlaces }).places, z.centre, 47), 'free', `${z.id}: a zone's free time not read`);
    assert.equal(plan(style, '1', 0, z.centre).clock, 'free', `${z.id}: a zone's free time not planned free`);
    assert.equal(plan(APP, '1', 0, z.centre).clock, undefined, `${z.id}: the shipped zone plays free`);
  }
  let reads = 0;
  for (const z of ZONES) {
    const own = new Map(Object.entries(z.rows)), borrowed = new Map(Object.entries(z.borrow).map(([k, e]) => [k, e?.id ?? null]));
    const probes = [...insideOf(z, 30, 51).map((s, i) => ({ seed: String(1 + (i % 12)), n: i % 3, spell: s }))];
    for (const p of probes) {
      const t = plan(APP, p.seed, p.n, p.spell);
      for (const r of placeReadsOf(t) ?? []) {
        reads++;
        assert.equal(r.zone, z.id, `${JSON.stringify(p.spell)}: ${r.lane} read outside the zone`);
        assert.ok(r.how === 'zone' ? own.get(r.lane) === r.id : r.how === 'borrowed' && borrowed.get(r.lane) === r.id, `${JSON.stringify(p.spell)}: ${r.lane} read ${r.how} ${r.id}`);
      }
      assert.ok(zonesOwn(z, t), `${JSON.stringify(p.spell)} ${p.seed}#${p.n}: not the zone's own theme`);
    }
    // the faces: at the edge (inside) and a hundredth past it, seeds 1-4 and themes 1-3, the zone is the address's
    for (const b of Object.keys(z.address) as Bird[]) {
      const [lo, hi] = bandEnds(z.address[b]!);
      for (const v of [lo, hi, lo - 0.01, hi + 0.01].filter((x) => x >= 0 && x <= 1)) {
        const spell = { ...z.centre, [b]: r2(v) } as Spell;
        const want = inZone(z, spell) ? z.id : null;
        for (const seed of ['1', '2', '3', '4']) for (const n of [0, 1, 2]) {
          const t = plan(APP, seed, n, spell);
          const zs = new Set((placeReadsOf(t) ?? []).map((r) => r.zone));
          assert.deepEqual([...zs], [want], `${b} ${v.toFixed(2)} seed ${seed} theme ${n + 1}: in ${[...zs].join(', ')}`);
        }
      }
    }
  }
  ctx.diagnostic(`${reads} reads inside the boxes, every one the zone's`);
});

test('5. no control leaves its zone over its travel, an inert bird plays the centre\'s program, an address bird\'s ends are its band\'s edges', () => {
  for (const z of ZONES) {
    for (const b of BIRDS) {
      const B = z.address[b];
      const [lo, hi] = B ? bandEnds(B) : [0, 1];
      // a twentieth's walk and both of the band's own ends, so it lands on each edge (Ember 0.18, Spark 0.45, Veil 0.60)
      const walk = [...new Set([...Array(Math.floor((hi - lo) / 0.05 + 1e-9) + 1).keys()].map((i) => r2(lo + 0.05 * i)).concat([r2(lo), r2(hi)]))];
      for (const v of walk) {
        const spell = { ...z.centre, [b]: v } as Spell;
        if (B && !inBand(spell[b], B)) continue;
        const t = plan(APP, '1', 0, spell);
        assert.ok((placeReadsOf(t) ?? []).every((r) => r.zone === z.id), `${b} ${spell[b]}: left ${z.id}`);
        assert.ok(zonesOwn(z, t), `${b} ${spell[b]}: not the zone's own theme`);
      }
      if (B) assert.ok(walk.includes(r2(hi)) && walk.includes(r2(lo)), `${b}: the walk misses its band's ends`);
    }
    // inert: a zone that holds Gleam and Tide plays the centre's program over their whole travel
    const inert = withZones([{ ...z, inert: ['gleam', 'tide'] }]);
    for (const seed of ['1', '2', '3']) {
      const centre = hashOf(plan(APP, seed, 0, z.centre));
      assert.equal(hashOf(plan(inert, seed, 0, z.centre)), centre, `seed ${seed}: an inert zone moved its centre`);
      for (const [b, v] of [['gleam', 0], ['gleam', 1], ['tide', 0], ['tide', 1]] as const)
        assert.equal(hashOf(plan(inert, seed, 0, { ...z.centre, [b]: v })), centre, `seed ${seed}: inert ${b} at ${v} moved the program`);
      assert.notEqual(hashOf(plan(APP, seed, 0, { ...z.centre, gleam: 0 })), centre, `seed ${seed}: Gleam wired and inert alike`);
    }
  }
  // an address bird's lean reaches its ends at the band's edges, and a bird with no band at nought and one, as before
  const L: BirdLeans = { centre: { veil: 0.3, root: 0.1 }, by: { veil: { count: 1 }, root: { size: 1 } }, ends: { count: [-0.55, 0.9], size: [-1, 1] } };
  const at = (veil: number, root: number, bands?: BirdLeans['bands']) => ({ count: leanShift({ ...L, ...(bands ? { bands } : {}) }, 'count', full({ veil, root })), size: leanShift({ ...L, ...(bands ? { bands } : {}) }, 'size', full({ veil, root })) });
  assert.equal(at(1, 1).count, 0.9); assert.equal(at(0, 0).count, -0.55); assert.equal(at(1, 1).size, 1); assert.equal(at(0.3, 0.1).count, 0);
  assert.ok(Math.abs(at(0.6, 1, { veil: [0, 0.6] }).count - 0.9) < 1e-12 && Math.abs(at(0.9, 1, { veil: [0, 0.6] }).count - 0.9) < 1e-12, 'Veil busiest at its band\'s top');
  assert.ok(Math.abs(at(0.45, 1, { veil: [0, 0.6] }).count - 0.45) < 1e-12, 'Veil half-way up its band');
  assert.equal(at(0.6, 1, { veil: [0, 0.6] }).size, 1, 'a bird with no band reads its ends at one');
  // the ring's detent at an edge: held at the band's last value inside until the hand is 0.03 past it
  const bells = ZONES[0], c = bells.centre;
  assert.equal(zoneDetent(P, c, 'veil', 0.62), 0.6); assert.equal(zoneDetent(P, c, 'veil', 0.63), 0.6); assert.equal(zoneDetent(P, c, 'veil', 0.64), 0.64);
  assert.equal(zoneDetent(P, c, 'spark', 0.43), 0.45); assert.equal(zoneDetent(P, c, 'spark', 0.41), 0.41); assert.equal(zoneDetent(P, c, 'ember', 0.2), 0.18);
  assert.equal(zoneDetent(P, c, 'root', 1), 1, 'a control held at an edge');
  assert.equal(zoneDetent(P, { ...c, veil: 0.7 }, 'veil', 0.62), 0.62, 'a detent outside the zone');
});

test('6. a turn inside a box draws only the zone\'s list at any reach, and a row a zone lists is drawn nowhere outside it', () => {
  for (const z of ZONES) {
    const turns = [...Array(12).keys()].flatMap((i) => [0, 1, 2].filter((n) => libraryTurn(String(i + 1), n, z.centre)).map((n) => [String(i + 1), n] as const));
    assert.ok(turns.length >= 6, `${z.id}: only ${turns.length} turns at its centre`);
    for (const reach of [0, 0.5, 1]) for (const [seed, n] of turns) {
      const t = plan(APP, seed, n, z.centre, { reach });
      if (!z.library.length) assert.ok(!t.drawn && t.conversation, `${z.id} reach ${reach} seed ${seed}#${n}: a turn drawn inside an empty list (${t.drawn?.id})`);
      else assert.ok(!t.drawn || z.library.includes(t.drawn.id), `${z.id}: ${t.drawn?.id} drawn inside the zone`);
    }
  }
  // a zone that lists a row: drawn inside only from its list, and never outside
  const bells = ZONES[0], row = 'ambient/slow-chords';
  const listing = withZones([{ ...bells, library: [row] }]);
  const tile = full({ ember: 0.10, tide: 0.85, zephyr: 0.90, root: 0.50, veil: 0.30, spark: 0, loom: 0.80 });
  let inside = 0, outside = 0, drewOutside = 0;
  for (let i = 1; i <= 12; i++) for (const n of [0, 1, 2]) {
    if (libraryTurn(String(i), n, bells.centre)) { const t = plan(listing, i, n, bells.centre); assert.equal(t.drawn?.id, row, `seed ${i}#${n}: inside the listing zone`); inside++; }
    if (libraryTurn(String(i), n, tile)) {
      const t = plan(listing, i, n, tile), today = plan(APP, i, n, tile);
      assert.notEqual(t.drawn?.id, row, `seed ${i}#${n}: the zone's row drawn outside it`);
      if (today.drawn?.id === row) drewOutside++;
      outside++;
    }
  }
  assert.ok(inside >= 6 && outside >= 6 && drewOutside >= 1, `inside ${inside}, outside ${outside}, the row drawn outside today ${drewOutside}`);
});
