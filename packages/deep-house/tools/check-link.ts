// A link is a promise: the unit test for every query parameter the page reads.
//
// Eugene, 09-22: *"We need to make sure we have a unit test for all page input
// URL query params ... I want to make sure the same sound will be restored in
// future once we release version 3 ... the deep links a user ever heard and
// liked on the generator will be the same nearly forever."* The module is
// `src/link.ts` (the reader and the writer) over `src/link-table.ts` (the
// table); this holds them to it:
//
//   (a) the table covers every parameter name that appears in `src/` and
//       `tools/`, and nothing else parses the address;
//   (b) state -> linkWrite -> linkRead is the same state, and the same plan;
//   (c) every written link names the seed, the engine and the theme, carries
//       every other sound parameter or leaves it to what its engine reads the
//       absence as, and never carries the bar;
//   (d) the default shift: with the page's default moved from v2 to an
//       engine that does not exist yet, every link written under v1 or v2 is
//       the same record, and only a bare link moves;
//   (e) every refusal, in its own words; an unknown parameter kept and ignored;
//   (f) the written string parses back through URLSearchParams unchanged, with
//       `:`, `,` and `/` plain;
//   (g) a v1 link plays v1's locked plan, a v2 link v2's, and the spell a link
//       leaves off is its engine's house;
//   (h) a bare address takes the stored link;
//   (i) every written link in a grid plays the program it was blessed with
//       (`tools/link-digest.json`);
//   (j) a genre row (`GENRE_LIBRARY`) pins by its audit link and is refused in
//       words without its family key's spell.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { linkRead, linkWrite, linkAt, linkBare, linkOver, linkSameSound, linkRaw, linkValue, LINK_ROWS, VERSIONS, DEFAULT_VER, versionOf, pageDefault, type LinkState, type Version, linkView, linkWithTime, linkWithout } from '../src/link.ts';
import { planTheme, recipesFor } from '../src/mix.ts';
import { STRATEGIES, DEFAULT_STRATEGY, strategyFromQuery } from '../src/strategies/index.ts';
import { HOUSE, BIRDS, BIRD_CODE, sameSpell, spellFromQuery, recipeFromQuery, spellQuery, spellNumber, parseSpell, type Spell } from '../src/spell.ts';
import { recipeById, GENRE_LIBRARY } from '../src/recipes.ts';
import { auditPoints } from './genre-recipes.ts';
import { accompanimentFor } from '../src/recipe-request.ts';
import { developmentFor } from '../src/development.ts';
import { readBypass } from '../src/set-plan.ts';
import { planHash } from './golden-plan.ts';
import * as linkDigest from './link-digest.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.join(HERE, '..');
const REPO = path.join(PKG, '..', '..');
const ROWS = new Map(LINK_ROWS.map((r) => [r.name, r]));

// --- (a) the table covers what is read ---------------------------------------

/** Every .ts/.tsx under a directory, but not node_modules. */
const filesUnder = (dir: string): string[] => !fs.existsSync(dir) ? [] : fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === 'node_modules' ? [] : filesUnder(p);
  return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
});
// `src/` and `tools/` of the page and the engine, and the repository's own
// tools. The private mining package keeps its own links and is not the page's.
const SCANNED = [
  ...filesUnder(path.join(PKG, 'src')), ...filesUnder(path.join(PKG, 'tools')),
  ...filesUnder(path.join(PKG, '..', 'engine', 'src')), ...filesUnder(path.join(PKG, '..', 'engine', 'tools')),
  ...filesUnder(path.join(REPO, 'tools')),
];
const rel = (f: string) => path.relative(REPO, f);
/** Names that look like a parameter in the source and are not one the page reads, with why. */
const NOT_PARAMETERS: Record<string, string> = {
  rate: 'the listening bench, retired 09-22; a check asserts a query carrying it reads no spell and no recipe',
  fx: 'an effect contract\'s doc comment (`?fx=chorus:0`); nothing reads it',
  ver: 'the engine\'s H-round spelling (`ver=v2`), retired 09-23 for `v=2` with no alias (Eugene: he has no such links); an unknown parameter, and a check asserts it is not read',
  strategy: 'the engine\'s old spelling, never shipped (Eugene, 09-22: "I don\'t have links like that yet"); an unknown parameter, and a check asserts it is not read',
  foo: 'the unknown parameter this check itself uses',
};

test('(a) every parameter named in src/ and tools/ has a row, and nothing else parses the address', () => {
  const found = new Map<string, string>();
  const patterns = [
    /[?&]([a-zA-Z_][a-zA-Z0-9_]*)=/g,
    /searchParams\.(?:get|set|has|delete|append)\(\s*['"]([^'"]+)['"]/g,
    /link(?:Raw|Value)\(\s*['"]([^'"]+)['"]/g,
    /link\.raw\(\s*(?:\$\{JSON\.stringify\()?['"]([^'"]+)['"]/g,
    // the reader's own reads, `q.get('latency')` in `linkRead`
    /\bq\.(?:get|has)\(\s*['"]([^'"]+)['"]/g,
  ];
  // In code, and separately in code less its comments: a name in a comment is
  // a parameter somebody wrote about, and a row is read only where code reads it.
  const inCode = new Map<string, string>();
  const uncommented = (text: string) => text.split('\n')
    .filter((line) => !/^\s*(?:\/\/|\/?\*)/.test(line)).map((line) => line.replace(/\s\/\/\s.*$/, '')).join('\n');
  for (const f of SCANNED) {
    const text = fs.readFileSync(f, 'utf8');
    for (const re of patterns) for (const m of text.matchAll(re)) if (!found.has(m[1])) found.set(m[1], rel(f));
    if (f.endsWith(path.join('src', 'link-table.ts'))) continue;
    for (const re of patterns) for (const m of uncommented(text).matchAll(re)) if (!inCode.has(m[1])) inCode.set(m[1], rel(f));
  }
  const missing = [...found].filter(([name]) => !ROWS.has(name) && !NOT_PARAMETERS[name]);
  assert.deepEqual(missing, [], `parameters read with no row in LINK_ROWS: ${missing.map(([n, f]) => `${n} (${f})`).join(', ')}`);
  // Every row is read somewhere outside the table **by code** (the reconciled
  // review of 09-24, R131: a name in a comment used to satisfy this, and the
  // ten bypass rows passed that way). The bypass rows are read by
  // `readBypass` walking `BYPASS_NAMES`, which no text search can see; the
  // next test holds `readBypass` to each of them by calling it.
  const unread = LINK_ROWS.filter((r) => r.class !== 'bypass' && !inCode.has(r.name)).map((r) => r.name);
  assert.deepEqual(unread, [], `rows no code reads: ${unread.join(', ')}`);

  const offenders: string[] = [];
  for (const f of SCANNED) {
    if (f.endsWith(path.join('src', 'link-table.ts'))) continue;
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;
      if (/URLSearchParams\([^)]*location/.test(line) || /location\.\w+[^;]*searchParams|searchParams[^;]*location/.test(line)
        || /new URL\(\s*location\.href/.test(line))
        offenders.push(`${rel(f)}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, [], `the address is parsed outside src/link-table.ts at ${offenders.join(', ')}`);
  // The dev deep link's bar is for tools: the page never writes one.
  const pageBars = filesUnder(path.join(PKG, 'src')).filter((f) => !f.endsWith(path.join('src', 'link.ts')) && /\blinkAt\(/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(pageBars.map(rel), [], 'the page calls linkAt, which writes a bar');
});

test('(a) the engines a link names are the strategies, one each, the record first; a bare link plays v2', () => {
  assert.deepEqual(VERSIONS.map((v) => v.strategy).sort(), Object.keys(STRATEGIES).sort(), 'VERSIONS and STRATEGIES differ');
  assert.equal(new Set(VERSIONS.map((v) => v.ver)).size, VERSIONS.length, 'two engines share a version token');
  assert.equal(VERSIONS[0].strategy, DEFAULT_STRATEGY, 'the first version is not the record');
  // The page's default is a named field, not the table's order, and not a
  // build flag: house-v2 in every build (Eugene, 09-23).
  assert.equal(DEFAULT_VER, '2', 'the page\'s default is not v2');
  assert.equal(pageDefault(), 'house-v2', 'a bare link does not play house-v2');
  assert.notEqual(pageDefault(), DEFAULT_STRATEGY, 'the page\'s default is the composer\'s record again');
  assert.deepEqual(VERSIONS.map((v) => [v.ver, v.strategy]), [['1', 'house-v1'], ['2', 'house-v2']]);
  // Both absent readings are frozen with their engine: what v1 and v2 read a
  // missing recipe, accompaniment and development as, for as long as they exist.
  for (const v of VERSIONS) assert.deepEqual({ ...v.absent }, { recipe: null, accompaniment: 'base', development: 'base' }, `v=${v.ver} reads an absence differently`);
  assert.ok(Object.isFrozen(VERSIONS) && VERSIONS.every((v) => Object.isFrozen(v) && Object.isFrozen(v.absent)), 'the version table is not frozen');
  // The engine is `v`, its value the number bare (Eugene, 09-23: *"just
  // `?v=2&seed=5555`, the shortest form possible"*). `v` accepts a strategy id
  // too, and the writer writes the number; `v=v2` is not a number and names
  // nothing.
  assert.equal(versionOf('house-v2')?.ver, '2');
  assert.equal(linkRead('?v=house-v2&seed=5').link.strategy, 'house-v2');
  assert.match(linkWrite({ seed: '5', theme: 0, strategy: 'house-v2' }), /^seed=5&v=2$/);
  assert.match(linkWrite({ seed: '5', theme: 0, strategy: 'house-v1' }), /^seed=5&v=1$/);
  assert.deepEqual(linkRead('?v=v2&seed=5').problems.map((p) => p.param), ['v']);
  // the bypass rows are the ones readBypass takes
  for (const r of LINK_ROWS.filter((r) => r.class === 'bypass'))
    assert.ok(readBypass(r.name === 'sub' ? '?sub=-3' : `?${r.name}=0`), `?${r.name}= is a bypass row readBypass does not take`);
  // ...and what is not a bypass row is not taken as one, so the call above can fail.
  assert.ok(!readBypass('?foo=0&seed=5&theme=2'), 'readBypass takes parameters that are not bypass rows');
});

// --- the sweep -----------------------------------------------------------------

type Fields = Required<Pick<LinkState, 'seed' | 'theme' | 'strategy' | 'accompaniment' | 'development'>> & { spell: Partial<Spell> | null; recipe: string | null };
const PULLS: Array<Partial<Spell> | null> = [null, { ember: 0.6, tide: 0.3 }, { veil: 0.85, loom: 0.2, spark: 0.52 }];
const HANDS = ['house/hand-conversation', 'house/hand-rolling', 'house/hand-answers'];
const MODES = ['base', 'phrased', 'shaped', 'percussion'] as const;
const quiet = <T>(fn: () => T): T => { const say = console.log; console.log = () => {}; try { return fn(); } finally { console.log = say; } };

/**
 * The plan a set of fields plays, the way the page plans off its address: the
 * cast (a named or drawn row, and the spell rolled inside it where the link
 * names none) and then the theme under the engine's style. `styles` lets the
 * default-shift proof plan an engine this build does not have.
 */
function planOf(f: Fields, styles: Record<string, unknown> = {}) {
  const search = `?${f.recipe ? `recipe=${f.recipe}&` : ''}accompaniment=${f.accompaniment}&development=${f.development}`;
  const real = STRATEGIES[f.strategy] ? f.strategy : DEFAULT_STRATEGY;
  const cast = quiet(() => recipesFor({ masterSeed: f.seed, strategy: real, search }));
  return planTheme(f.seed, f.theme, {
    preset: 'auto', strategy: real, style: (styles[f.strategy] ?? STRATEGIES[real].style) as never,
    spell: f.spell ?? cast.spell, recipe: cast.track, accompaniment: f.accompaniment, development: f.development,
  });
}
const hashOf = (f: Fields, styles?: Record<string, unknown>) => planHash(f.seed, f.theme, planOf(f, styles));
/** What the link a set writes says for its spell: the hand's, or none where the recipe rolls it. */
const fieldsOf = (link: ReturnType<typeof linkRead>['link']): Fields => ({
  seed: link.seed!, theme: link.theme, strategy: link.strategy, spell: link.spell, recipe: link.recipe,
  accompaniment: link.accompaniment, development: link.development,
});

/** Every state the sweep writes: seeds 1-30 under both engines at the house and two pulls, the hands, the draw, the modes. */
function sweep(): Fields[] {
  const out: Fields[] = [];
  const base = { recipe: null, accompaniment: 'base', development: 'base' } as const;
  for (let s = 1; s <= 30; s++) for (const strategy of ['house-v1', 'house-v2']) for (const spell of PULLS)
    out.push({ ...base, seed: String(s), theme: s % 3, strategy, spell });
  for (const recipe of HANDS) for (let s = 1; s <= 4; s++) for (const spell of [null, PULLS[1]])
    out.push({ seed: String(s), theme: 0, strategy: 'house-v2', spell, recipe, accompaniment: 'auto', development: 'base' });
  for (let s = 1; s <= 4; s++) out.push({ ...base, seed: String(s), theme: 1, strategy: 'house-v2', spell: null, recipe: 'auto' });
  for (const development of MODES) for (let s = 1; s <= 4; s++) for (const strategy of ['house-v1', 'house-v2'])
    out.push({ ...base, seed: String(s), theme: 0, strategy, spell: s % 2 ? null : PULLS[2], development });
  // A mode an engine cannot plan is a link the page refuses, not one it writes.
  return out.filter((f) => { try { planOf(f); return true; } catch { return false; } });
}
const SWEEP = sweep();
const writes = (f: Fields, base = '', explicit = false) => linkWrite(f, base, { explicit });

test('(b) state -> linkWrite -> linkRead is the same state and the same plan, compact and explicit', () => {
  assert.ok(SWEEP.length >= 220, `the sweep holds ${SWEEP.length} states`);
  for (const f of SWEEP) for (const explicit of [false, true]) {
    const search = writes(f, '', explicit);
    const read = linkRead(`?${search}`);
    assert.deepEqual(read.problems, [], `${search} was refused: ${read.problems.map((p) => p.long).join('; ')}`);
    const back = fieldsOf(read.link);
    for (const k of ['seed', 'theme', 'strategy', 'recipe', 'accompaniment', 'development'] as const)
      assert.equal(back[k], f[k], `${search}: ${k} read back as ${back[k]}, written ${f[k]}`);
    assert.ok(read.link.named, `${search} did not name its engine`);
    assert.ok(f.spell ? sameSpell(back.spell, f.spell) : back.spell === null, `${search}: the spell read back as ${JSON.stringify(back.spell)}`);
    // **Through the page's own reading of the written string**, not the fields
    // read back (R131: this compared `planOf` with itself on equal fields).
    // `played` reads the address, casts over it and plans, as the page does.
    if (!explicit) assert.equal(planHash(f.seed, f.theme, linkDigest.played(search).plan), hashOf(f), `${search} plays another record than the state it was written from`);
    // and the composer's own readers, which the page's planning goes through, agree
    assert.equal(strategyFromQuery(`?${search}`), f.strategy);
    assert.equal(recipeFromQuery(`?${search}`), f.recipe);
    assert.equal(accompanimentFor({ search: `?${search}` }), f.accompaniment);
    assert.equal(developmentFor({ search: `?${search}` }), f.development);
    assert.ok(f.spell ? sameSpell(spellFromQuery(`?${search}`), f.spell) : spellFromQuery(`?${search}`) === null);
  }
});

test('(c) every written link names the seed, the engine and a theme past the first, every other sound row or its engine\'s absence, and never the bar', () => {
  const bases = ['', '?bar=72', '?seed=9&v=1&theme=4&bar=190&spell=ember:0.9&recipe=house/growl-room&development=shaped&lock=engine&view=machine&out=silent&foo=1'];
  for (const f of SWEEP) for (const base of bases) for (const explicit of [false, true]) {
    const search = writes(f, base, explicit);
    const q = new URLSearchParams(search);
    const names = [...q.keys()];
    // K34: the first theme is what a link without one plays, so it is left out
    const head = f.theme > 0 ? ['seed', 'v', 'theme'] : ['seed', 'v'];
    assert.deepEqual(names.slice(0, head.length), head, `${search} does not open on ${head.join(', ')}`);
    assert.equal(q.has('theme'), f.theme > 0, `${search}: theme written ${q.has('theme')} for theme ${f.theme + 1}`);
    assert.ok(!q.has('ver'), `${search} carries the H round's spelling`);
    assert.ok(!q.has('bar'), `${search} carries a bar`);
    assert.ok(!q.has('strategy'), `${search} carries the old spelling`);
    for (const name of LINK_ROWS.filter((r) => r.class === 'sound').map((r) => r.name))
      assert.ok(q.getAll(name).length <= 1, `${search} carries ${name} twice`);
    if (explicit) for (const name of ['recipe', 'accompaniment', 'development'])
      assert.ok(q.has(name), `the explicit writer left ${name} off ${search}`);
    // what is left off is what the named engine reads its absence as
    const v = VERSIONS.find((x) => x.strategy === f.strategy)!;
    for (const name of ['recipe', 'accompaniment', 'development'] as const)
      if (!q.has(name)) assert.equal(f[name], v.absent[name], `${search} left ${name} off where v=${v.ver} would not read it back`);
    assert.equal(q.has('spell'), !!f.spell, `${search}: the spell written ${q.has('spell')}, asked ${!!f.spell}`);
    // the view rows and the unknown parameter of the base are kept, after the sound
    if (base.includes('lock=engine')) assert.match(search, /&lock=engine&view=machine&out=silent&foo=1$/);
  }
  // A dev link's bar is read and honoured; the writer takes it off.
  const dev = linkRead('?seed=5&v=2&theme=1&bar=72');
  assert.equal(dev.link.bar, 71, 'bar=72 is not the seventy-second bar');
  const t = planOf(fieldsOf(dev.link));
  assert.ok(t.bars > 71, `seed 5 theme 1 has ${t.bars} bars, so bar 72 is not in it`);
  assert.ok(!writes(fieldsOf(dev.link), '?seed=5&v=2&theme=1&bar=72').includes('bar='), 'the writer kept a dev link\'s bar');
  // `linkAt` is the tools' dev deep link, and the only writer with a bar.
  assert.equal(linkAt({ seed: '5', theme: 0, strategy: 'house-v2' }, 71), 'seed=5&v=2&bar=72');
});

test('(d) the default shift: under a page default of house-v3, every written link is the record it was, and a bare link moves', () => {
  // An engine that does not exist: its own token, its own readings of an
  // absence (every one of them different from v1's and v2's), and the
  // record's music, so its plans are not v2's.
  // Its style is its own (R131): it was the record's, so "a bare link moved"
  // proved only that v1 plans differently from v2. This one is house-v2's with
  // the tempo two BPM up, which no plan of either engine can match.
  const V3: Version = { ver: '3', strategy: 'house-v3', absent: { recipe: 'auto', accompaniment: 'auto', development: 'phrased' } };
  const versions = [...VERSIONS, V3];
  const v2 = STRATEGIES['house-v2'].style;
  const T = v2.settings.tempo;
  const v3Style = { ...v2, id: 'deep-house-v3', settings: { ...v2.settings, tempo: { ...T, slowMin: T.slowMin + 2, slowMax: T.slowMax + 2, fastMin: T.fastMin + 2, fastMax: T.fastMax + 2 } } };
  const styles = { 'house-v3': v3Style };
  const shifted = (search: string) => linkRead(search, { pageDefault: 'house-v3', versions, trial: false });
  let moved = 0;
  for (const f of SWEEP) {
    const search = `?${writes(f)}`;
    const now = linkRead(search).link, then = shifted(search).link;
    assert.deepEqual(fieldsOf(then), fieldsOf(now), `${search} reads differently once the page's default is v3`);
    assert.equal(hashOf(fieldsOf(then), styles), hashOf(f), `${search} plays another record once the page's default is v3`);
  }
  // A bare link is the page's choice, and the page's choice moved.
  for (let s = 1; s <= 30; s++) {
    const bare = shifted(`?seed=${s}`).link;
    assert.equal(bare.strategy, 'house-v3');
    assert.equal(bare.named, false);
    assert.deepEqual([bare.recipe, bare.accompaniment, bare.development], ['auto', 'auto', 'phrased'], 'a bare link does not read its absences as the new default does');
    const plain = { ...fieldsOf(bare), recipe: null, accompaniment: 'base', development: 'base' } as Fields;
    const under3 = hashOf(plain, styles);
    // The bare link plays v3's own plan: its style, planned directly.
    assert.equal(under3, planHash(plain.seed, plain.theme, planTheme(plain.seed, plain.theme, { preset: 'auto', style: v3Style as never, spell: null })), `?seed=${s} does not play house-v3's plan`);
    if (under3 !== hashOf({ ...plain, strategy: 'house-v2' }) && under3 !== hashOf({ ...plain, strategy: 'house-v1' })) moved++;
  }
  assert.equal(moved, 30, `only ${moved} of 30 bare links moved with the default`);
  // The page's own default today, which is what the shift is measured from.
  assert.equal(linkRead('?seed=5').link.strategy, 'house-v2');
  assert.equal(linkRead('?seed=5').link.named, false);
  assert.equal(linkRead('?seed=5', { pageDefault: 'house-v1' }).link.strategy, 'house-v1');
});

test('(e) every refusal, in its own words; an unknown parameter kept and ignored', () => {
  const REFUSALS: Array<[string, string, string, string]> = [
    ['?seed=%00%01', 'seed', 'bad seed · the house', 'seed "\\u0000\\u0001" is not a seed anybody could type; the page opens where it would with none'],
    ['?seed=5&theme=zero', 'theme', 'bad theme · theme one', 'theme "zero" is not a count from one; the page opens on theme one'],
    ['?seed=5&bar=-3', 'bar', 'bad bar · bar one', 'bar "-3" is not a count from one; the page opens on bar one'],
    ['?seed=5&v=9', 'v', 'no such engine · v2', 'v "9" names no engine in this build; the page plays v2'],
    ['?seed=5&spell=ember:lots', 'spell', 'bad spell · the house', 'spell "ember:lots" does not read as name:value pairs; the page plays the house'],
    ['?seed=5&accompaniment=maybe', 'accompaniment', 'bad accompaniment · the house', 'accompaniment "maybe" is not base or auto; the page plays base'],
    ['?seed=5&development=nope', 'development', 'bad development · the house', 'development "nope" is not a mode this page has; the page plays base'],
    ['?seed=5&recipe=nobody/x', 'recipe', 'no such recipe · the house', 'no recipe in this build is called "nobody/x"; the page plays the house'],
    ['?seed=5&recipe=../../mining/attempts/x.json', 'recipe', 'no such recipe · the house', 'no recipe in this build is called "../../mining/attempts/x.json"; the page plays the house'],
    ['?v=2&seed=5&recipe=house/hand-rolling', 'recipe', 'hand part alone · the house', 'recipe "house/hand-rolling" is a part and plays only over its accompaniment (add accompaniment=auto); the page plays the house'],
  ];
  for (const [search, param, short, long] of REFUSALS) {
    const got = quiet(() => linkRead(search));
    assert.deepEqual(got.problems.map((p) => p.param), [param], `${search} was refused on ${got.problems.map((p) => p.param).join(',')}`);
    assert.equal(got.problems[0].short, short);
    assert.equal(got.problems[0].long.replace(/\u0000/g, '\\u0000').replace(/\u0001/g, '\\u0001'), long);
    assert.ok(short.length <= 32, `${short} does not fit the ring`);
    assert.equal(linkRaw(param, `?${got.search}`), null, `${search} kept its ${param}`);
  }
  // the wording names whichever default the page has, and it is what plays
  // (R125: the short line said "the record" while v2 played)
  assert.match(linkRead('?v=9', { pageDefault: 'house-v1' }).problems[0].long, /the page plays v1$/);
  assert.equal(linkRead('?v=9', { pageDefault: 'house-v1' }).problems[0].short, 'no such engine · v1');
  for (const bad of ['9', 'v2', 'house-v9', 'nope']) {
    const read = linkRead(`?seed=5&v=${bad}`);
    assert.equal(read.link.strategy, pageDefault(), `?v=${bad} does not play the page's default`);
    assert.equal(read.link.named, false);
    assert.equal(read.problems[0].short, `no such engine · v${versionOf(pageDefault())!.ver}`, `?v=${bad}: the line does not name what plays`);
    assert.ok(!/record/.test(read.problems[0].short + read.problems[0].long), `?v=${bad}: the line names the record, which is not what plays`);
  }
  // An empty recipe is none, and is not refused (R125): it was refused as a
  // recipe called "" and then played as none anyway.
  const empty = linkRead('?v=2&seed=5&recipe=');
  assert.deepEqual(empty.problems, [], '?recipe= (empty) was refused');
  assert.equal(empty.link.recipe, null);
  assert.equal(hashOf(fieldsOf(empty.link)), hashOf(fieldsOf(linkRead('?v=2&seed=5').link)), 'an empty recipe plays something else than none');
  // a complete arrangement asked to develop is refused by the composer, and
  // said so — and what is taken off is the mode that made the pair illegal,
  // never the recipe the link named (R66 of the review of 09-24: the recipe
  // went first, and the mode that was at fault stayed)
  for (const [search, param] of [
    ['?v=2&seed=5&recipe=house/sub-room&development=shaped', 'development'],
    ['?v=2&seed=5&recipe=house/sub-room&development=percussion', 'development'],
    ['?v=1&seed=5&recipe=auto&development=shaped', 'development'],
  ]) {
    const sub = quiet(() => linkRead(search));
    assert.deepEqual(sub.problems.map((p) => [p.param, p.short]), [[param, `${param} refused · the house`]], search);
    assert.match(sub.problems[0].long, new RegExp(`^${param} ".+" was refused: .+; the page plays without it$`));
    assert.equal(linkRaw('recipe', `?${sub.search}`), linkRaw('recipe', search), `${search} lost its recipe`);
  }
  // one taken off where one is enough; where none alone plays, the recipe
  // goes first, as it always did (a part with no accompaniment and a mode)
  const both = quiet(() => linkRead('?v=2&seed=5&recipe=house/hand-rolling&development=shaped'));
  assert.deepEqual(both.problems.map((p) => [p.param, p.short]), [['recipe', 'hand part alone · the house']]);
  // a link the page plays in full comes back as it came, bar and all
  const good = '?v=2&seed=5&recipe=house/hand-rolling&accompaniment=auto&development=shaped&theme=2&bar=34&spell=ember:0.60,tide:0.30';
  const whole = linkRead(good);
  assert.deepEqual(whole.problems, []);
  assert.equal(whole.search, good.slice(1));

  // **Unknown parameters are kept and ignored**: the page plays without them
  // and the writer leaves them where they stand, after the sound, in their
  // order — a link somebody's messenger decorated still plays, and the
  // decoration is theirs. `strategy=` is one of them: never shipped, never read.
  const odd = linkRead('?seed=5&v=2&foo=1&strategy=house-v1');
  assert.deepEqual(odd.problems, []);
  assert.deepEqual(odd.link.unknown, [['foo', '1'], ['strategy', 'house-v1']]);
  assert.equal(odd.link.strategy, 'house-v2');
  assert.equal(hashOf(fieldsOf(odd.link)), hashOf(fieldsOf(linkRead('?seed=5&v=2').link)), 'an unknown parameter moved the plan');
  assert.equal(writes(fieldsOf(odd.link), '?seed=5&v=2&foo=1&strategy=house-v1'), 'seed=5&v=2&foo=1&strategy=house-v1');
  // ...and so are both old spellings of the engine: `strategy=` and the H
  // round's `v=` are bare links, and the writer keeps them where they stand.
  for (const spelling of ['strategy=house-v1', 'ver=v1', 'ver=1']) {
    const old = linkRead(`?${spelling}&seed=5`);
    assert.equal(old.link.strategy, 'house-v2', `?${spelling} named an engine`);
    assert.equal(old.link.named, false);
    assert.deepEqual(old.problems, []);
  }
  assert.equal(strategyFromQuery('?strategy=house-v2'), null);
  assert.equal(strategyFromQuery('?ver=v1'), null);
  assert.throws(() => linkRaw('strategy'), /no row/);
  assert.throws(() => linkRaw('ver'), /no row/);
  assert.equal(linkValue('development', '?v=2'), 'base');
});

test('(f) the written string parses back through URLSearchParams unchanged, with its separators plain', () => {
  for (const f of SWEEP) {
    const search = writes(f, '?view=machine&out=silent');
    const q = new URLSearchParams(search);
    assert.equal(q.toString().replace(/%3A/g, ':').replace(/%2C/g, ',').replace(/%2F/g, '/'), search, `${search} does not survive a parse`);
    assert.ok(!/%3A|%2C|%2F/i.test(search), `${search} escapes a separator`);
    if (f.spell) assert.equal(q.get('spell'), spellQuery(f.spell));
    if (f.recipe && f.recipe !== 'auto') assert.ok(search.includes(`recipe=${f.recipe}`), `${search} does not name ${f.recipe} plainly`);
  }
  // **The writer never writes what the reader refuses** (R104): a value is
  // written by `spellNumber`, in full and never as an exponent, and every value
  // in 0..1 reads back as itself. `ember:3e-7` used to be written, refused, and
  // read as the house.
  const tiny = [3e-7, 5e-7, 9.99e-7, 1e-7, 2.5e-12, 5e-324, 1e-6, 0.30000000000000004, 0.4837293, 1 - 2 ** -53, 0.005];
  for (let i = 0; i < 200; i++) tiny.push(((i * 2654435761) % 4294967296) / 4294967296 / 10 ** (i % 12));
  for (const v of tiny) {
    const w = spellNumber(v);
    assert.ok(!/e/i.test(w), `${v} is written ${w}`);
    assert.equal(parseSpell(`ember:${w}`)?.ember, v, `${v} is written ${w} and reads back as ${parseSpell(`ember:${w}`)?.ember}`);
    const q = spellQuery({ ember: v });
    assert.ok(q && sameSpell(linkRead(`?spell=${q}`).link.spell, { ember: v }), `?spell=${q} does not read back as ember ${v}`);
    assert.deepEqual(linkRead(`?seed=1&v=2&spell=${q}`).problems, [], `?spell=${q} is refused`);
  }
  // The hands' own values are unchanged: two decimals, the zeros kept.
  assert.equal(spellNumber(0.3), '0.30');
  assert.equal(spellNumber(1), '1.00');
  assert.equal(spellNumber(-0.2), '0.00');
  // A rolled value is carried in full, and a spell at the house under a recipe is all eight.
  assert.equal(new URLSearchParams(writes({ seed: '1', theme: 0, strategy: 'house-v2', spell: { veil: 0.4837293 }, recipe: null, accompaniment: 'base', development: 'base' })).get('spell'), 've:0.4837293');
  const home = new URLSearchParams(linkWrite({ seed: '1', theme: 0, strategy: 'house-v2', spell: HOUSE, recipe: 'house/deep-house' })).get('spell')!;
  assert.equal(home.split(',').length, BIRDS.length);
  assert.ok(sameSpell(linkRead(`?spell=${home}`).link.spell, HOUSE));
});

const FROZEN = { ember: 0.394, tide: 0.558, zephyr: 0.377, root: 0.717, gleam: 0.359, veil: 0.473, spark: 0.275, loom: 0.578 };
test('(g) a v1 link plays v1\'s locked plan, a v2 link v2\'s, and a spell left off is the engine\'s house', () => {
  const golden = JSON.parse(fs.readFileSync(path.join(HERE, 'golden-digest.json'), 'utf8'));
  for (const [ver, id, block] of [['1', 'house-v1', golden], ['2', 'house-v2', golden.strategies['house-v2']]] as const) {
    for (const [master, themes] of Object.entries(block.masters) as Array<[string, Array<{ hash: string }>]>) {
      for (let i = 0; i < themes.length; i++) {
        const link = linkRead(`?v=${ver}&seed=${master}${i ? `&theme=${i + 1}` : ''}`).link;
        assert.equal(link.strategy, id);
        assert.equal(planHash(master, i, planOf(fieldsOf(link))), themes[i].hash, `?v=${ver}&seed=${master} theme ${i + 1} is not ${id}'s locked plan`);
        // and it is the engine's house that stands for the spell the link leaves
        // off: its eight numbers written out, not the object (R131: the object
        // was `HOUSE` itself, and the cached identity answered for both). That
        // the identity is arithmetic and not the cache is `tools/check.ts`'s,
        // for every strategy's style.
        if (i === 0) assert.equal(planHash(master, i, planOf({ ...fieldsOf(link), spell: { ...FROZEN } })), themes[i].hash,
          `${id}'s house is not the spell a link without one plays`);
      }
    }
  }
  // The house is a fact of each engine, frozen with it: these eight numbers.
  for (const id of Object.keys(STRATEGIES)) assert.deepEqual({ ...STRATEGIES[id].spell.HOUSE }, FROZEN, `${id}'s house moved`);
  assert.ok(recipeById('house/hand-rolling'), 'the sweep\'s hands are not in the library');
});

test('(h) a bare address takes the stored link: its sound rows, then the address\'s own, read like any link', () => {
  // Eugene, 09-23: a home-screen app opens on the manifest's start_url, a bare
  // address, and has to come back to the whole link and not only its seed.
  for (const bare of ['', '?', '?out=silent', '?view=machine&foo=1', '?bar=12']) assert.ok(linkBare(bare), `${bare} is not bare`);
  for (const name of LINK_ROWS.filter((r) => r.class === 'sound').map((r) => r.name))
    assert.ok(!linkBare(`?${name}=1`), `?${name}= is read as a bare address`);
  for (const f of SWEEP) {
    const stored = writes(f);
    const over = linkOver(stored, '?out=silent&foo=1');
    assert.equal(over, `${stored}&out=silent&foo=1`, `the stored ${stored} over a bare address is ${over}`);
    const read = linkRead(`?${over}`);
    assert.deepEqual(read.problems, []);
    const back = fieldsOf(read.link);
    for (const k of ['seed', 'theme', 'strategy', 'recipe', 'accompaniment', 'development'] as const) assert.equal(back[k], f[k], `${over}: ${k}`);
    assert.ok(f.spell ? sameSpell(back.spell, f.spell) : back.spell === null, `${over}: the spell`);
  }
  // Only sound rows come off a store, and since K21 the machine view: never a
  // bar, a lock or anything unknown; the address's own view row wins.
  assert.equal(linkOver('seed=5&v=2&theme=3&bar=40&view=machine&lock=engine&foo=1', ''), 'seed=5&v=2&theme=3&view=machine');
  assert.equal(linkOver('seed=5&v=2&theme=3&bar=40&lock=engine&foo=1', ''), 'seed=5&v=2&theme=3');
  assert.equal(linkOver('seed=5&v=2&theme=3&view=machine', '?view=ring'), 'seed=5&v=2&theme=3&view=ring');
  // K21: the view row is written while the machine view is open and taken off
  // when it closes, every other row where it stands; it is not a sound row, so
  // a link with it is still bare, the same place, and no digest moves for it
  const here = 'seed=9&v=2&theme=4&spell=ember:0.90&out=silent&foo=1';
  const opened = linkView(`?${here}`, true);
  assert.equal(opened, `${here}&view=machine`);
  assert.equal(linkView(`?${opened}`, false), here);
  assert.equal(linkView('?view=machine', false), '');
  assert.ok(linkBare('?view=machine') && linkSameSound(`?${here}`, `?${opened}`), 'a view row is a sound row');
  assert.equal(linkRead(`?${opened}`).link.view, 'machine');
  // A stored link the page would refuse is refused as a link is.
  assert.deepEqual(linkRead(`?${linkOver('seed=5&v=9&spell=ember:lots', '')}`).problems.map((p) => p.param), ['v', 'spell']);
});

test('(h) a stored second is the same place\'s alone: the seed, the theme, the engine, the spell, the recipe and the modes, as the page reads them', () => {
  // R26 of the review of 09-24: a link resumed at the stored second whenever
  // its seed and theme matched, under any engine, spell, recipe or mode. The
  // store's side of it is control.ts's (round (c)'s file; the patch is
  // tmp/fix-e/R25-R26-restore.patch); this is the question it asks.
  for (const f of SWEEP) {
    const stored = writes(f);
    assert.ok(linkSameSound(`?${stored}`, `?${stored}&out=silent&bar=12&view=machine`), `${stored}: a view row or a bar is another place`);
    assert.ok(linkSameSound(`?${stored}`, `?${linkOver(stored, '')}`), `${stored} over a bare address is another place`);
  }
  const place = 'seed=5&v=2&theme=2';
  // an absence and the row it means are one place
  assert.ok(linkSameSound(`?${place}`, `?${place}&accompaniment=base&development=base&recipe=none`));
  assert.ok(linkSameSound(`?${place}`, `?${place}&spell=${BIRDS.map((b) => `${b}:${spellNumber(HOUSE[b])}`).join(',')}`));
  for (const other of ['seed=6&v=2&theme=2', 'seed=5&v=1&theme=2', 'seed=5&v=2&theme=3', `${place}&spell=ember:0.60`,
    `${place}&recipe=auto`, `${place}&development=shaped`, `${place}&accompaniment=auto`, 'seed=5&theme=2&v=2&spell=tide:0.30'])
    assert.ok(!linkSameSound(`?${place}`, `?${other}`), `${other} is read as ${place}`);
});

// --- (i) what a written link plays, held to a committed digest -----------------
//
// The reconciled review of 09-24, R5. (b), (d) and (g) prove the
// reader and the writer agree with each other and with the two locks at the
// house; nothing held a pulled bird, a mode or a recipe to what it played
// yesterday. `tools/link-digest.json` does: a grid of written links, each
// hashed as the whole program the page plays off it.
// **Round K29: the birds are written by their two letters, and every link
// written with their full names still plays what it played** (Eugene: *"support
// the full names for backward compatibility — I have tons of links saved"*).
// `link-aliases.json` is every digest link that named a bird in full, beside the
// link the writer makes of it now and the program hash the full-name link was
// blessed with at dcf6c91. For every row: the two read to one state, the writer
// turns the old state into exactly the new link, the page plans the same record
// off both, and the digest's row for the new link is still that hash.
const ALIASES = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'link-aliases.json'), 'utf8'));
// **Round K32: the link with the time.** `t` is a start position and never a
// sound row: the time link is the canonical link plus `t`, it reads back to
// the same state and the second, no writer but the time link emits it (a base
// carrying it included), and no digest or alias row names it.
test('(l) the time link is the canonical link and the second, and nothing else ever writes t', () => {
  for (const f of SWEEP.slice(0, 60)) {
    for (const sec of [0, 1, 252, 999]) {
      const w = linkWithTime(f, sec, '?view=machine&out=silent');
      const back = linkRead(`?${w}`);
      assert.deepEqual(back.problems, [], `${w} was refused`);
      assert.equal(back.link.t, sec, `${w} reads t as ${back.link.t}`);
      const canon = linkWrite(f, '?view=machine&out=silent');
      assert.equal(linkWithout(w, 't'), canon, `the time link is not the canonical link plus t: ${w}`);
      assert.deepEqual({ ...fieldsOf(back.link) }, { ...fieldsOf(linkRead(`?${canon}`).link) }, `${w} reads to another state than ${canon}`);
    }
    assert.ok(!/(^|&)t=/.test(linkWrite(f, '?t=40&bar=3&view=machine')), 'the canonical writer carried t (or the bar) from its base');
  }
  assert.equal(linkRead('?seed=5&v=2&t=4.5').link.t, null, 'a t that is not whole seconds is read');
  assert.equal(linkRead('?seed=5&v=2').link.t, null);
  const file = linkDigest.saved();
  assert.ok(file.rows.every((r) => !/(^|&)t=/.test(r.link)), 'a digest row names a time');
  assert.ok(ALIASES.rows.every((a) => !/(^|&)t=/.test(a.old) && !/(^|&)t=/.test(a.new)), 'an alias row names a time');
  assert.equal(linkWithTime({ seed: '5', theme: 2, strategy: 'house-v2' }, 252.9), 'seed=5&v=2&theme=3&t=252');
  // K34: a link without a theme is the first theme, and the first theme is written without one
  assert.equal(linkWithTime({ seed: '1', theme: 0, strategy: 'house-v2' }, 252.9), 'seed=1&v=2&t=252');
});

test('(m) K34: a link without a theme is the first theme, and the first theme is written without one', () => {
  // Eugene, K34: "skip theme=1 ... assume it's the default value if not set".
  for (const v of ['1', '2']) {
    const bare = linkRead(`?seed=1&v=${v}`), one = linkRead(`?seed=1&v=${v}&theme=1`);
    assert.deepEqual(bare.problems, []);
    assert.deepEqual(one.problems, []);
    assert.deepEqual(fieldsOf(bare.link), fieldsOf(one.link), `?seed=1&v=${v} and ?seed=1&v=${v}&theme=1 are not one place`);
    assert.equal(fieldsOf(one.link).theme, 0);
    assert.equal(hashOf(fieldsOf(bare.link)), hashOf(fieldsOf(one.link)), `?seed=1&v=${v} and its theme=1 plan two records`);
    assert.equal(linkWrite(bare.link), `seed=1&v=${v}`);
    assert.equal(linkWrite(one.link), `seed=1&v=${v}`);
  }
  // any theme past the first is still written, and still one-based
  assert.equal(linkWrite(linkRead('?seed=1&v=2&theme=2').link), 'seed=1&v=2&theme=2');
  assert.equal(linkWrite(linkRead('?seed=1&v=2&theme=10').link), 'seed=1&v=2&theme=10');
  assert.equal(linkWithTime(fieldsOf(linkRead('?seed=1&v=2&theme=1&t=252').link), 252), 'seed=1&v=2&t=252');
});

test('(k) a link written with the birds\' full names or the first theme reads, writes and plays as the link the page writes', () => {
  const file = linkDigest.saved();
  assert.ok(ALIASES.rows.length >= 143, `the alias table holds ${ALIASES.rows.length} links`);
  for (const a of ALIASES.rows) {
    // K29's rows name a bird in full; K34's carry the first theme, which a written link now leaves out
    const full = /spell=[^&]*\b(ember|tide|zephyr|root|gleam|veil|spark|loom):/.test(a.old), first = /(^|&)theme=1(&|$)/.test(a.old);
    assert.ok(full || first, `${a.old} names no bird in full and no first theme`);
    assert.ok(!/(^|&)theme=1(&|$)/.test(a.new), `${a.new} still names the first theme`);
    assert.ok(!/\b(ember|tide|zephyr|root|gleam|veil|spark|loom):/.test(a.new), `${a.new} still names a bird in full`);
    const was = linkRead(`?${a.old}`), now = linkRead(`?${a.new}`);
    assert.deepEqual(was.problems.map((p) => p.short), now.problems.map((p) => p.short), `${a.old} and ${a.new} are refused differently`);
    const fw = fieldsOf(was.link), fn = fieldsOf(now.link);
    assert.deepEqual({ ...fw, spell: null }, { ...fn, spell: null }, `${a.old} and ${a.new} read to different states`);
    assert.ok(sameSpell(fw.spell, fn.spell) && JSON.stringify(fw.spell) === JSON.stringify(fn.spell), `${a.old} and ${a.new} read to different spells`);
    // a row whose engine refuses one of its rows (v1 has no recipe or development)
    // is keyed by the state the grid wrote, which the read drops: its old and new
    // links write one link, the one without the refused row
    const refused = file.rows.find((r) => r.link === a.new && r.group === a.group)?.refused;
    assert.equal(linkWrite(was.link), refused ? linkWrite(now.link) : a.new, `the writer makes ${linkWrite(was.link)} of ${a.old}, not ${a.new}`);
    if (refused) for (const name of refused) assert.ok(!linkWrite(was.link).includes(`${name}=`), `${a.old} writes the ${name} its engine refuses`);
    if (!a.themes) assert.equal(planHash(fw.seed, fw.theme, linkDigest.played(a.old).plan), planHash(fn.seed, fn.theme, linkDigest.played(a.new).plan), `${a.old} plans another record than ${a.new}`);
    const row = file.rows.find((r) => r.link === a.new && r.group === a.group && (r.themes ?? null) === (a.themes ?? null));
    assert.ok(row, `the digest has no row for ${a.new}`);
    assert.equal(row!.hash, a.hash, `${a.new} plays ${row!.hash}, where ${a.old} was blessed with ${a.hash}`);
  }
  // mixed spellings in one spell, any case, read as one spell
  assert.ok(sameSpell(parseSpell('ember:0.20,ti:0.80,VE:0.70'), parseSpell('em:0.20,tide:0.80,veil:0.70')));
  assert.equal(parseSpell('eb:0.20'), null, 'a name that is neither a bird nor its code is refused');
  for (const b of BIRDS) assert.equal(BIRD_CODE[b], b.slice(0, 2), `${b}'s code is not the machine view's two letters`);
  assert.equal(new Set(Object.values(BIRD_CODE)).size, BIRDS.length, 'two birds share a code');
  // the writers that are not the page's address follow the one writer: the
  // record tools' .txt link, the view's genre keys and its spell tile's letters
  const src = (f: string) => fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', f), 'utf8');
  assert.ok(/linkWrite\(/.test(src('machine/private/record.ts')) && !/`\$\{b\}:|`\$\{bird\}:/.test(src('machine/private/record.ts')), 'the record tools write a link of their own');
  assert.ok(/spellQuery\(spell\)/.test(src('machine/genres.tsx')), 'the genre keys write a spell of their own');
  assert.ok(/<span className="k">\{b\.slice\(0, 2\)\}<\/span>/.test(src('machine/view.tsx')), 'the view\'s spell tile no longer prints a bird\'s first two letters');
});

test('(i) every written link in the grid plays the program it was blessed with', () => {
  const file = linkDigest.saved();
  assert.ok(file.blessings.length >= 1 && file.blessings.every((b) => b.trim().length > 20), 'a bless of the link digest without its reason');
  const { moved, rows } = linkDigest.verify(file);
  assert.deepEqual(moved, [], `what a link plays has moved:\n${moved.slice(0, 8).join('\n')}`);
  // The grid is what §4 (b) asked for: both engines, the benchmark, every bird
  // both ways, every mode under each accompaniment, the draw and every shipped row.
  const groups = new Map<string, number>();
  for (const r of file.rows) groups.set(r.group, (groups.get(r.group) ?? 0) + 1);
  assert.deepEqual([...groups.keys()].sort(), ['benchmark', 'masters', 'modes', 'pulls', 'recipes', 'sets']);
  assert.ok(rows >= 120, `the grid holds ${rows} links`);
  for (const bird of BIRDS) for (const v of ['0.10', '0.90']) for (const ver of ['1', '2'])
    assert.ok(file.rows.some((r) => r.group === 'pulls' && r.link === `seed=1&v=${ver}&spell=${BIRD_CODE[bird]}:${v}`), `no row pulls ${bird} to ${v} under v=${ver}`);
  // Every key is the page's own writer's output, so it names its engine.
  for (const r of file.rows) assert.equal(linkRead(`?${r.link}`).link.named, true, `${r.link} does not name its engine`);
  // **A pulled bird is locked, not the house again**: under v2 each pull plays
  // another program than the house on the same seed and theme. Before this
  // digest the bird-to-knob map had no lock at all. (Under v1, the record, most
  // pulls of seed 1 play its house note for note — its switches are off and it
  // has no knobs — and the rows hold that too.)
  const house = file.rows.find((r) => r.link === 'seed=1&v=2')!.hash;
  const same = file.rows.filter((r) => r.group === 'pulls' && r.link.startsWith('seed=1&v=2&') && r.hash === house).map((r) => r.link);
  // One pull is the house on this seed and theme, measured 09-24: Gleam at a
  // tenth moves no die seed 1's first theme rolls and no knob it plays.
  assert.deepEqual(same, ['seed=1&v=2&spell=gl:0.10'], `v2 pulls that play the house: ${same.join(', ')}`);
  // And the check can fail: one hash altered is one row named.
  const tampered = { ...file, rows: file.rows.map((r, i) => (i === 7 ? { ...r, hash: '0'.repeat(64) } : r)) };
  const caught = linkDigest.verify(tampered).moved;
  assert.equal(caught.length, 1);
  assert.ok(caught[0].includes(file.rows[7].link), caught[0]);
});

// --- (i) the freeze: what a cut shipped, a link keeps -------------------------
//
// Eugene's question 6 of the reconciled review of 09-24: the digest is what
// every v2 link plays today, and it freezes at the v2 release. The release runs
// `link-digest.ts --check`, which reads the digest the last cut shipped; here
// the rule itself, on a cut made up from the committed file.
test('(i) a row a cut shipped is frozen, and a digest moved since the cut states its reason', () => {
  const file = linkDigest.saved();
  // The committed digest against the one the last cut shipped (`master`'s),
  // which is what the release's `npm run check` holds it to.
  assert.deepEqual(linkDigest.sinceCut(linkDigest.lastCut(), file), [], 'the link digest has moved since the last cut');
  // No cut carries the digest (v1.0.0 does not): nothing to hold it to.
  assert.deepEqual(linkDigest.sinceCut(null, file), []);
  // The cut is the file as it stands: nothing has moved.
  assert.deepEqual(linkDigest.sinceCut(file, file), []);
  // A shipped row re-hashed is refused, with or without a reason.
  const moved = { ...file, rows: file.rows.map((r, i) => (i === 3 ? { ...r, hash: 'f'.repeat(64) } : r)) };
  const reasoned = { ...moved, blessings: [...file.blessings, 'a reason that does not re-open a shipped link'] };
  for (const now of [moved, reasoned]) {
    const faults = linkDigest.sinceCut(file, now);
    assert.ok(faults.some((f) => f.startsWith('frozen:') && f.includes(file.rows[3].link)), faults.join('\n'));
  }
  // A shipped row dropped from the grid is refused too.
  const dropped = { ...reasoned, rows: file.rows.filter((_, i) => i !== 5) };
  assert.ok(linkDigest.sinceCut(file, dropped).some((f) => f.includes('no longer in the digest')));
  // A row added since the cut (a new engine's) needs a stated reason, and passes with one.
  const extra = { ...file.rows[0], link: 'seed=1&v=3', strategy: 'house-v3' };
  const added = { ...file, rows: [...file.rows, extra] };
  assert.ok(linkDigest.sinceCut(file, added).some((f) => f.includes('no blessing was added')));
  assert.deepEqual(linkDigest.sinceCut(file, { ...added, blessings: [...file.blessings, 'v3 joins the grid'] }), []);
});

test('(j) a genre row pins by its audit link, round-trips through the writer, and without its key\'s spell is refused in words', () => {
  const quiet2 = <T,>(f: () => T): T => { const log = console.log; console.log = () => {}; try { return f(); } finally { console.log = log; } };
  for (const p of auditPoints()) {
    const read = quiet2(() => linkRead(`?${p.search}`));
    assert.deepEqual(read.problems, [], p.id);
    assert.equal(linkWrite({ seed: read.link.seed!, theme: read.link.theme, strategy: read.link.strategy, spell: read.link.spell,
      recipe: read.link.recipe, accompaniment: read.link.accompaniment, development: read.link.development }, '', { explicit: true }), p.search);
    const bare = quiet2(() => linkRead(`?v=2&seed=${p.seed}&recipe=${p.id}`));
    assert.deepEqual(bare.problems.map((x) => x.param), ['recipe'], `${p.id} without a spell was not refused`);
    assert.match(bare.problems[0].long, /genre pattern and plays under its family key's spell/);
  }
  assert.ok(GENRE_LIBRARY.every((r) => recipeById(r.id) === r));
});
