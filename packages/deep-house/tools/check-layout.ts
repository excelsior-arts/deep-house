// **The fold's two rules** (his word 10-29 on the open Duo: "it was a hard requirement to not cross the hinge when ring
// and panel are open, also ring should have hinge in the middle when single … please put it somewhere so we don't
// break this rule"), in node, pure, on `shellLayout` (src/shell-layout.ts) for the Duo's inner display as the shell
// reports it, upright (the crease across) and held as a book (the crease down), with and without the wordmark over the
// ring and the safe insets:
// - the ring alone: its centre on the fold;
// - the ring and the panel open: each in its own half, the ring's circle and the paper clear of the fold, inside the
//   window.
//
//   node --test tools/check-layout.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shellLayout, RING_INK } from '../src/shell-layout.ts';
import type { ShellFold } from '../src/shell-library.ts';

/** The Duo's inner display (pt): upright, upright under the app's band, as a book, as a book under the band. */
const INNER: Array<[string, number, number, ShellFold]> = [
  ['upright', 669, 951, { axis: 'h', at: 475.5 }],
  ['upright, the band', 669, 835, { axis: 'h', at: 417.5 }],
  ['a book', 951, 669, { axis: 'v', at: 475.5 }],
  ['a book, the band', 867, 635, { axis: 'v', at: 433.5 }],
];
const NAME_FOOT = [0, 60];
const ENDS: Array<readonly [number, number]> = [[0, 0], [59, 34]];
const EPS = 0.5;

const cases = INNER.flatMap(([what, w, h, fold]) => NAME_FOOT.flatMap((foot) => ENDS.map((ends) => ({
  what: `${what} ${w} x ${h}${foot ? ', the wordmark over the ring' : ''}${ends[0] ? ', the safe insets' : ''}`,
  w, h, fold, l: shellLayout(w, h, false, w > h, foot, [0, 0], fold, null, false, null, ends),
}))));

test('the ring alone stands on the fold', () => {
  for (const { what, w, h, fold, l } of cases) {
    const c = fold.axis === 'h' ? h / 2 + l.stage.dy : w / 2 + l.stage.dx;
    assert.ok(Math.abs(c - fold.at) < EPS, `${what}: the ring's centre at ${c.toFixed(1)}, the fold at ${fold.at}`);
    assert.ok(l.stage.side > 0, `${what}: no ring`);
  }
});

test('the ring and the panel open stand each in its own half, neither crossing the fold', () => {
  for (const { what, w, h, fold, l } of cases) {
    const along = fold.axis === 'h' ? 'y' : 'x';
    const c = along === 'y' ? h / 2 + l.stage.dy + l.ring.dy : w / 2 + l.stage.dx + l.ring.dx;
    // the ring's circle: its square less the ink's margin (`RING_INK`), as the fold's layout measures it
    const r = (l.stage.side * l.ring.k * (1 - 2 * RING_INK)) / 2;
    const p = along === 'y' ? { from: l.panel.y, to: l.panel.y + l.panel.h } : { from: l.panel.x, to: l.panel.x + l.panel.w };
    const ringFirst = c < fold.at;
    const ringClear = ringFirst ? c + r <= fold.at + EPS : c - r >= fold.at - EPS;
    const paperClear = ringFirst ? p.from >= fold.at - EPS : p.to <= fold.at + EPS;
    assert.ok(ringClear, `${what}: the ring's circle reaches ${(ringFirst ? c + r : c - r).toFixed(1)} across the fold at ${fold.at}`);
    assert.ok(paperClear, `${what}: the paper spans ${p.from.toFixed(1)} to ${p.to.toFixed(1)} across the fold at ${fold.at}`);
    assert.ok(l.panel.w > 0 && l.panel.h > 0, `${what}: no paper`);
    assert.ok(l.panel.x >= -EPS && l.panel.y >= -EPS && l.panel.x + l.panel.w <= w + EPS && l.panel.y + l.panel.h <= h + EPS,
      `${what}: the paper leaves the window`);
  }
});
