// The hats' figure across a phrase (round hat-figure, his ear 10-17: "the hats
// update is great"): the row's own faults, the phrase's places for every
// length, the speech at the house's birds, and the planner's promises on a
// theme drawn here — never one kind twice in a phrase, never the same hits two
// bars running, nothing on a bar that settles, only an accent over busy voices,
// and a held theme's turnarounds not all one word (the review of 10-17).
import assert from 'node:assert/strict';
import test from 'node:test';
import { HAT_FIGURE, hatFigureFaults, placesOf, speechOf, planHatFigure, type FigureInput, type FigureState } from '../src/hat-figure.ts';
import { HOUSE } from '../src/spell.ts';

test('the row has no faults', () => {
  assert.deepEqual(hatFigureFaults(HAT_FIGURE), []);
});

test("a phrase's places: the row's shape for its length, else its longest that fits on the last bars, the rest settling", () => {
  assert.deepEqual(placesOf(4), HAT_FIGURE.shape['4']);
  assert.deepEqual(placesOf(8), HAT_FIGURE.shape['8']);
  assert.deepEqual(placesOf(16), [...new Array(8).fill('settle'), ...HAT_FIGURE.shape['8']]);
  assert.deepEqual(placesOf(12), [...new Array(4).fill('settle'), ...HAT_FIGURE.shape['8']]);
  assert.deepEqual(placesOf(6), ['settle', 'settle', ...HAT_FIGURE.shape['4']]);
  assert.deepEqual(placesOf(3), ['settle', 'settle', 'settle']);
  assert.deepEqual(placesOf(0), []);
  for (let n = 1; n <= 32; n++) {
    const p = placesOf(n);
    assert.equal(p.length, n);
    assert.equal(p[0], 'settle', `a ${n}-bar phrase's first bar settles`);
    if (n >= 4) assert.equal(p[n - 1], 'turn', `a ${n}-bar phrase turns into its line`);
  }
});

test("at the house's birds the speech is the row's base and its state's step", () => {
  const S = HAT_FIGURE.speech;
  assert.ok(Math.abs(speechOf('normal', HOUSE) - S.base) < 1e-9);
  for (const st of ['busy', 'rest', 'hold'] as const) assert.ok(Math.abs(speechOf(st, HOUSE) - (S.base + S[st])) < 1e-9);
});

/** A theme of eight-bar phrases, closed hats on the offbeats, the voices' state a phrase at a time. */
const theme = (states: FigureState[], open = false): FigureInput => {
  const phrases = states.map((_, k) => ({ from: 1 + k * 8, to: 9 + k * 8 }));
  const stateAt = (bar: number) => states[Math.floor((bar - 1) / 8)] ?? 'normal';
  const offbeats = [2, 6, 10, 14];
  return {
    seed: 'check-hat-figure', spell: HOUSE, phrases,
    skip: () => false,
    state: stateAt,
    hats: () => ({ closed: offbeats.map((step) => ({ step, vel: 0.8 })), open: [] }),
    free: (_bar, q) => !offbeats.includes(q),
    struck: () => [],
    canOpen: () => open,
  };
};

test("the planner's promises on a drawn theme", () => {
  const states: FigureState[] = ['normal', 'busy', 'rest', 'hold', 'normal', 'hold', 'rest', 'busy', 'hold', 'hold', 'hold', 'hold'];
  for (const open of [false, true]) {
    const I = theme(states, open);
    const words = planHatFigure(I);
    assert.deepEqual(planHatFigure(I), words, 'the same theme, the same words');
    assert.ok(words.length > 0, 'the figure speaks somewhere');
    I.phrases.forEach((ph) => {
      const mine = words.filter((w) => w.bar >= ph.from && w.bar < ph.to);
      assert.equal(new Set(mine.map((w) => w.kind)).size, mine.length, `never one kind twice in the phrase from ${ph.from}`);
      const places = placesOf(ph.to - ph.from);
      for (const w of mine) assert.notEqual(places[w.bar - ph.from], 'settle', `nothing on bar ${w.bar}, which settles`);
    });
    const hits = (w: (typeof words)[number]) => JSON.stringify([w.ghosts?.map((g) => g.step), w.open, w.accent?.step]);
    for (let i = 1; i < words.length; i++) if (words[i].bar === words[i - 1].bar + 1) assert.notEqual(hits(words[i]), hits(words[i - 1]), `bars ${words[i - 1].bar}-${words[i].bar} say the same hits`);
    for (const w of words) {
      if (w.state === 'busy') assert.equal(w.kind, 'accent', `over busy voices an accent only (bar ${w.bar}: ${w.kind})`);
      for (const g of w.ghosts ?? []) assert.ok(g.level > 0 && g.level <= 1, `a ghost's level in (0, 1] at bar ${w.bar}`);
    }
    // (a held theme's turnarounds, the lift refused or not, are not all one word: the review of 10-17)
    const heldTurns = words.filter((w) => w.state === 'hold' && w.place === 'turn').map((w) => w.kind);
    assert.ok(heldTurns.length >= 3 && new Set(heldTurns).size >= 2, `held turnarounds ${heldTurns.join(' ')}`);
  }
});
