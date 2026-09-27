// A bird's glyph, drawn: one drawing per bird, and it never changes.
//
// Eugene, 09-23: *"remove the icon animation and the two states — element
// icons are permanent; they are already complex, and by the time a user gets a
// cognitive understanding of their role by empirical experiments, having a
// whole other set of visuals is over the top for any user and for me."* So the
// sigil/icon pair, the morph between them under the pointer and the tumble on a
// throw are gone, and a cell carries one mark that is drawn once when the cell
// is built and never written again — nothing here runs on a frame.
//
// `bird-glyphs.json` is the data: marks in a 13-unit box, each a path of
// absolute M, L, C, Q and Z commands, so a glyph is scaled to the node it sits
// in by multiplying every number in it and the stroke stays the ring's own
// `thin` rather than growing with the drawing. `tools/check.ts` holds the file
// to that grammar and to its box.

import GLYPHS from './bird-glyphs.json' with { type: 'json' };
import { bandsOf } from './bird-labels.ts';
import { strategyById } from './strategies/index.ts';
import { DRUMS_ON_ABOVE, EMBER_DRIVING_AT } from './spell.ts';
import type { Bird } from './spell.ts';

const NS = 'http://www.w3.org/2000/svg';

/** One mark of a glyph: an outline, a knock-out in the ground, or a small solid in the ink. */
export interface GlyphMark { d: string; fill?: 'ground' | 'ink' }
export interface GlyphRow {
  bird: string; name: string; means: string; label: string;
  marks: GlyphMark[];
  /**
   * Levels of the same drawing keyed by the bird's value, rising, the last at
   * 1 — Ember's embers, fire and blaze (Eugene, 09-23: *"a few variants for the
   * burning level"*). The ring draws the level the bird's playing value falls
   * in (`glyphAt`), and redraws only when that level changes.
   */
  variants?: { level: string; upTo: number; label: string; marks: GlyphMark[]; inclusive?: boolean }[];
}

/**
 * **A level turns where its bird's word turns** (round K15: a glyph changed
 * level while the word stayed, and the reverse, because its thresholds were
 * set in the glyph passes before K13's bands existed). A banded bird's level
 * names the band it draws (`band`, the band's index): it holds up to that
 * band's threshold in the bird's own value (`bandsOf`'s `birdAt`, the others
 * at the house), and the last to 1. Where a glyph has more levels than its
 * bird has bands the table says how they split: Tide's four are near, the
 * lower and the upper half of open (`half`), and distant. Since K23 Spark has
 * one level a band again: the slim bolt for straight, the bolt for rolling and
 * the storm for broken. Ember keeps its own
 * values — they are its family's thresholds — and Zephyr, whose word is the
 * plan's keys and not a band, keeps its own.
 */
type Keyed = { level: string; upTo?: number; edge?: 'drums' | 'driving'; band?: number | number[]; half?: 'low' | 'high'; label: string; marks: GlyphMark[] };
function keyed(row: { bird: string; variants?: Keyed[] }): GlyphRow['variants'] {
  if (!row.variants) return undefined;
  const bands = row.variants.some((v) => v.band != null) ? bandsOf(strategyById('house-v2').style)[row.bird as Bird] : [];
  const edge = (k: number) => (k < 0 ? 0 : k >= bands.length - 1 ? 1 : bands[k].birdAt ?? 1);
  return row.variants.map((v) => {
    // Ember's two turns, solved from the composer (K30): at the drums' edge the
    // one at it is still without them (`drumsOn` is above it), so the level
    // holds it; at the steady band's end the band is below it, so it does not
    if (v.edge === 'drums') return { level: v.level, upTo: DRUMS_ON_ABOVE, inclusive: true, label: v.label, marks: v.marks };
    if (v.edge === 'driving') return { level: v.level, upTo: EMBER_DRIVING_AT, label: v.label, marks: v.marks };
    if (v.band == null) return { level: v.level, upTo: v.upTo!, inclusive: true, label: v.label, marks: v.marks };
    // a level drawing several bands holds up to the last of them
    const k = Array.isArray(v.band) ? Math.max(...v.band) : v.band;
    const upTo = v.half === 'low' ? (edge(k - 1) + edge(k)) / 2 : edge(k);
    return { level: v.level, upTo, label: v.label, marks: v.marks };
  });
}

export const GLYPH_BOX: number = GLYPHS.box;
/** Every bird's glyph, its levels keyed in the bird's value. */
export const GLYPH_ROWS: GlyphRow[] = (GLYPHS.birds as unknown as Array<GlyphRow & { variants?: Keyed[] }>).map((r) => ({ ...r, variants: keyed(r) }));
const ROWS = GLYPH_ROWS;

// The box drawn at the size the cell actually is: its half width lands at 0.85
// of the node's radius, so the widest mark stops a little short of the circle
// it sits in.
export const glyphScale = (R: number) => (R * 1.7) / GLYPH_BOX;

/** A path's numbers, every one multiplied: the grammar has no flags to spoil. */
const scaled = (d: string, S: number) => d.replace(/-?\d*\.?\d+(?:e-?\d+)?/g, (n) => String(+(+n * S).toFixed(2)));

/** The marks a bird is drawn with. */
export function glyphOf(bird: string): GlyphMark[] {
  const row = ROWS.find((b) => b.bird === bird);
  return row ? row.marks : [];
}

/**
 * **The level a value is in, by the rule its word is cut by** (K30, the reviews
 * of 09-26): a band holds a value strictly under its threshold (`bandAt`), so a
 * banded level does too — at five edges on the hundredth grid the glyph drew
 * one level and the word said the next; a level with its own values (Zephyr's,
 * and Ember's at the drums' edge) holds its threshold.
 */
function levelOf(variants: NonNullable<GlyphRow['variants']>, value: number) {
  return variants.find((v) => (v.inclusive ? value <= v.upTo : value < v.upTo)) ?? variants[variants.length - 1];
}

/** The name of the level a value falls in, or `''` for a bird with one drawing. */
export function levelAt(bird: string, value: number): string {
  const row = ROWS.find((b) => b.bird === bird);
  if (!row || !row.variants) return '';
  return levelOf(row.variants, value).level;
}

/** And at a value: the level whose range holds it, for a bird that has levels. */
export function glyphAt(bird: string, value: number): GlyphMark[] {
  const row = ROWS.find((b) => b.bird === bird);
  if (!row) return [];
  if (!row.variants) return row.marks;
  return levelOf(row.variants, value).marks;
}

/**
 * Draw a bird's glyph into `parent` at the size a node of radius `R` is, in the
 * ring's own line work (`ln thin`, which strokes `#gold`). Called once per
 * cell build; the elements it makes are never written again.
 */
export function drawBirdGlyph(parent: Element, bird: string, R: number, marks: GlyphMark[] = glyphOf(bird)): SVGPathElement[] {
  const S = glyphScale(R);
  return marks.map((m) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', scaled(m.d, S));
    if (m.fill === 'ink') {
      p.setAttribute('fill', 'url(#gold)');
      p.setAttribute('stroke', 'none');
    } else {
      p.setAttribute('class', 'ln thin');
      if (m.fill === 'ground') p.setAttribute('fill', '#000000');
    }
    parent.appendChild(p);
    return p;
  });
}
