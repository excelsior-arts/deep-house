// Which bird reaches which cell, from the model and never from the drawing
// (round K13 of the ring).
//
// Eugene, 2026-09-24: *"we do need lines to all birds connected by function —
// but a dotted line, so we keep the geometric structure of the original vision
// while adding a statement of truth via secondary dotted lines. The lines must
// not be hard-coded in the SVG ring but come from the data model, so if birds
// get more connected the ring always shows it accurately."*
//
// Two halves, and neither is a list of lines:
//
//   what a bird biases   worked out at load from the spell layer itself: the
//                        fields of `derive()` that move when the bird does,
//                        the style's controls whose slopes name it, and the
//                        candidate lists whose measured signatures it drives
//                        (`listDrives`, the same choice the weights make)
//   what a cell reads    `bird-labels.json`'s `reads`: the dice the cell's
//                        big word and subtitle are computed from
//
// An edge A → B is A biasing something B's cell reads. `tools/check.ts` holds
// the table to the measured matrix (`tools/birds-matrix.json`, written by
// `tools/birds-memo.ts --matrix-json`): every influence measured on a quarter
// of the seeds or more is declared, and every declared edge measures.
//
// The star's two squares and its octagon are the frame, drawn as they always
// were; a declared edge between two birds the frame does not join is drawn
// dotted, and one the frame does join stays strong.

import { BIRDS, HOUSE, derive, listDrives } from './spell.ts';
import type { Bird, Derived, Spell } from './spell.ts';
import { LABEL_TABLE } from './bird-labels.ts';
import type { Style } from '@deep-house/engine/style';

/** The compass, clockwise from north: the star's eight points (`ring.ts`, `CELLS`). */
export const COMPASS: readonly Bird[] = Object.freeze(['ember', 'spark', 'zephyr', 'gleam', 'root', 'loom', 'tide', 'veil'] as Bird[]);

/** One bird's reach into another's cell, and the dice it reaches it through. */
export interface Edge { from: Bird; to: Bird; via: string[] }

/** The fields of `derive()` a bird moves: each bird to either wall, the rest at the house. */
function deriveBiases(): Record<Bird, string[]> {
  const at = derive(HOUSE as Spell) as unknown as Record<string, unknown>;
  const out = {} as Record<Bird, string[]>;
  for (const b of BIRDS) {
    const moved = new Set<string>();
    for (const v of [0, 1]) {
      const d = derive({ ...HOUSE, [b]: v } as Spell) as unknown as Record<string, unknown>;
      for (const k of Object.keys(at) as Array<keyof Derived>) if (JSON.stringify(d[k]) !== JSON.stringify(at[k])) moved.add(k);
    }
    out[b] = [...moved];
  }
  return out;
}

const BIASES = new WeakMap<object, Record<Bird, Set<string>>>();

/**
 * Every die each bird biases, by the name the spell layer gives it and the
 * kind it is — `derive.pulse` is the field, `control.pulse` the pulse family's
 * chance, which are two different dice with one word.
 */
export function biasesOf(style: Style): Record<Bird, Set<string>> {
  const hit = BIASES.get(style);
  if (hit) return hit;
  const out = {} as Record<Bird, Set<string>>;
  const derived = deriveBiases();
  for (const b of BIRDS) out[b] = new Set(derived[b].map((f) => `derive.${f}`));
  const controls = (style as Style & { controls?: Record<string, { slopes: Partial<Record<Bird, number>> }> }).controls || {};
  for (const [name, rule] of Object.entries(controls)) {
    for (const [b, slope] of Object.entries(rule.slopes)) if (slope) out[b as Bird].add(`control.${name}`);
  }
  for (const [list, drives] of Object.entries(listDrives(style))) for (const b of drives) out[b].add(`list.${list}`);
  BIASES.set(style, out);
  return out;
}

/** What each cell's reading is computed from (`bird-labels.json`). */
export const readsOf = (b: Bird): readonly string[] => LABEL_TABLE.birds[b].reads;

const EDGES = new WeakMap<object, Edge[]>();

/** Every A → B with A ≠ B and something in common, in the compass order. */
export function edgesOf(style: Style): Edge[] {
  const hit = EDGES.get(style);
  if (hit) return hit;
  const biases = biasesOf(style);
  const out: Edge[] = [];
  for (const from of COMPASS) {
    for (const to of COMPASS) {
      if (from === to) continue;
      const via = readsOf(to).filter((d) => biases[from].has(d));
      if (via.length) out.push({ from, to, via });
    }
  }
  EDGES.set(style, out);
  return out;
}

/**
 * The frame's own line between two points of the star, by their compass
 * index: `square` two apart (0-2-4-6, 1-3-5-7), `octagon` next to each other,
 * or none (three and four apart).
 */
export function frameLine(i: number, j: number): 'square' | 'octagon' | null {
  const d = Math.min((i - j + 8) % 8, (j - i + 8) % 8);
  return d === 1 ? 'octagon' : d === 2 ? 'square' : null;
}

/** One line of the ring between two birds joined by function, either way round. */
export interface Link { a: number; b: number; kind: 'square' | 'octagon' | 'dotted'; edges: Edge[] }

/** Every pair of birds an edge joins, with the line the ring draws between them. */
export function linksOf(style: Style): Link[] {
  const pairs = new Map<string, Link>();
  for (const e of edgesOf(style)) {
    const i = COMPASS.indexOf(e.from), j = COMPASS.indexOf(e.to);
    const a = Math.min(i, j), b = Math.max(i, j);
    const key = `${a}-${b}`;
    let l = pairs.get(key);
    if (!l) { l = { a, b, kind: frameLine(a, b) ?? 'dotted', edges: [] }; pairs.set(key, l); }
    l.edges.push(e);
  }
  return [...pairs.values()].sort((x, y) => x.a - y.a || x.b - y.b);
}
