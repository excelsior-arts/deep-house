// **The length rows, named by the places** (engine-data, 10-28; the brief: *"Add a check that the BELLS and BOWLS length
// band is the same as before the move (or say why it moved), and that a place with no length row reads its family's"*),
// in node, pure: the bands in minutes at the family pulls and the slow places as `src/length.ts` tabled them before the
// rows moved onto the style (`LENGTH_V2`) and the struck row onto BELLS's and BOWLS's entries (`length: 'struck'`),
// to a ten-thousandth of a minute; the share's slide off BELLS toward the floating pulse; and a drumless place that
// names no row (PSY, WAVES, the Ambient tile, 27191) reading the drumless band whole.
//
//   node --test tools/check-length.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minutesBand, namedShare, lengthRow } from '../src/length.ts';
import { lengthMargin } from '../src/places.ts';
import { asSpell, derive, HOUSE, BIRDS, type Spell } from '../src/spell.ts';
import { style, LENGTH_V2 } from '../src/styles/deep-house-v2.ts';

const P = style.places;
const at = (s: Partial<Spell>) => {
  const spell = asSpell({ ...HOUSE, ...s }), d = derive(spell), bpm = d.tempoCentre;
  const share = namedShare(lengthMargin(P, 'struck', spell, bpm), LENGTH_V2);
  const band = minutesBand(d, LENGTH_V2, share > 0 ? { row: 'struck', share } : null);
  return { d, share, band };
};
const near = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-4, `${what}: ${a.toFixed(4)} against ${b.toFixed(4)}`);

const BELLS = { ember: 0.05, tide: 0.65, zephyr: 0.65, root: 0.10, gleam: 0.80, veil: 0.30, spark: 0.55, loom: 0.90 };
const FLOATING = { ember: 0.10, tide: 0.85, zephyr: 0.90, root: 0.50, veil: 0.30, loom: 0.80, spark: 0 };

/** The bands as `length.ts` tabled them on 10-28 (minutes), measured on the tree before the move. */
const PINNED: Array<[string, Partial<Spell>, number, number, number]> = [
  ['the house', {}, 0, 3.0500, 4.0000],
  ['tech house', { ember: 0.55 }, 0, 3.0413, 3.9886],
  ['the Ambient tile', { ember: 0.05, tide: 0.85, loom: 0.9, veil: 0.4, spark: 0.1 }, 0, 9.1000, 9.9000],
  ['27191', { ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 }, 0, 8.8129, 9.5876],
  ['PSY', { ember: 0.08, tide: 0.90, zephyr: 0.65, root: 0.60, gleam: 0.35, veil: 0.90, spark: 0.55, loom: 0.70 }, 0, 8.5188, 9.2677],
  ['WAVES', { ember: 0.05, tide: 0.85, zephyr: 0.75, root: 0.55, gleam: 0.50, veil: 0.60, spark: 0.10, loom: 0.95 }, 0, 9.0230, 9.8162],
  ['BELLS', BELLS, 1, 5.2493, 5.7399],
  ['BOWLS, Tide 0', { ember: 0.02, tide: 0, zephyr: 0.50, root: 0.40, gleam: 0.80, veil: 0.00, spark: 0, loom: 1.0 }, 1, 5.1997, 5.6856],
  ['BOWLS, Tide 0.48', { ember: 0.02, tide: 0.48, zephyr: 0.50, root: 0.40, gleam: 0.80, veil: 0.00, spark: 0, loom: 1.0 }, 1, 5.3260, 5.8237],
  ["BOWLS's address", { ember: 0.02, tide: 0.95, zephyr: 0.50, root: 0.40, gleam: 0.80, veil: 0.00, spark: 0, loom: 1.0 }, 1, 5.4526, 5.9622],
];

test('the BELLS and BOWLS bands are what they were before the rows moved, and the pulls and the other slow places theirs', () => {
  for (const [name, s, share, lo, hi] of PINNED) {
    const r = at(s);
    near(r.share, share, `${name}: the struck share`);
    near(r.band[0], lo, `${name}: the band's bottom`);
    near(r.band[1], hi, `${name}: the band's top`);
  }
});

test('a place that names no length row reads its family\'s band whole', () => {
  for (const [name, s] of PINNED.filter(([, , share]) => share === 0)) {
    const r = at(s);
    const row = lengthRow(r.d, LENGTH_V2);
    assert.equal(row, r.d.drumsOn ? LENGTH_V2.groove : LENGTH_V2.drumless, `${name}: not its family's row`);
    const whole = minutesBand(r.d, LENGTH_V2, null);
    assert.deepEqual(r.band, whole, `${name}: a named row blended in where none is named`);
  }
  // a named row of the drumless family never moves a groove, whatever its share
  const groove = at({ ember: 0.55 });
  assert.deepEqual(minutesBand(groove.d, LENGTH_V2, { row: 'struck', share: 1 }), minutesBand(groove.d, LENGTH_V2, null));
});

test('the share slides off BELLS toward the floating pulse as it did: whole inside, smooth across the fade, nought past it', () => {
  const along = (f: number) => Object.fromEntries(BIRDS.map((b) => [b, +((BELLS[b] ?? HOUSE[b]) + f * ((FLOATING[b] ?? HOUSE[b]) - (BELLS[b] ?? HOUSE[b]))).toFixed(4)])) as Partial<Spell>;
  const slide: Array<[number, number, number, number]> = [[0.08, 1, 5.2501, 5.7408], [0.1, 0.9720, 5.3307, 5.8280], [0.12, 0.7583, 5.9855, 6.5368], [0.15, 0.2818, 7.7501, 8.4435], [0.3, 0, 9.0302, 9.8241]];
  for (const [f, share, lo, hi] of slide) {
    const r = at(along(f));
    near(r.share, share, `${f} of the way: the share`);
    near(r.band[0], lo, `${f} of the way: the bottom`);
    near(r.band[1], hi, `${f} of the way: the top`);
  }
});

test('the entries that name the struck row are BELLS\'s and BOWLS\'s, and the row is the style\'s', () => {
  const naming = (P.conversation ?? []).filter((e) => e.technique?.length === 'struck').map((e) => e.id).sort();
  assert.deepEqual(naming, ['bells-in-conversation', 'bowls-breathing']);
  assert.ok(LENGTH_V2.named.struck && LENGTH_V2.named.struck.family === 'drumless');
  // every named row an entry names is a row the style has
  for (const lane of ['conversation', 'journey', 'sea', 'ensemble', 'hook'] as const) for (const e of P[lane] ?? [])
    if (e.technique?.length) assert.ok(LENGTH_V2.named[e.technique.length], `${e.id} names ${e.technique.length}, no length row`);
});
