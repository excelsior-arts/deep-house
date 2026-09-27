// The view's own look, and the one rule it keeps from the ring.
//
// Eugene, 09-19: *"I don't want it to follow the colour of the ring. On a dark
// background, a bright interface, more technical and independent from the
// ring's colour scheme — a professional debug tool, cool and futuristic,
// following canonical sound-engineering equipment and software rather than our
// magical vibe. Magical is for the user interface."*
//
// So: a dark ground, a cool neutral for line work and type, **one** accent for
// signal, the three LED colours the industry reads without being told, meters
// as bars with scale marks in decibels, boxes with hard corners and a
// monospaced face for every number. Nothing here is a gradient, a glow or an
// ornament.
//
// What it keeps from the ring is the rule and not the style: **every mark is a
// real value**. The derived colour — the ring's whole palette — appears in
// exactly one place in the whole view, as the small swatch that reports the
// spell the set was cast under, because that is a reading and not a decoration.
// The ring itself keeps its own look inside its panel, because it is the same
// SVG scaled and nothing is redrawn.

/** The palette, as tokens. Nothing in the view names a colour any other way. */
export const INK = {
  ground: '#05070a',
  panel: '#0b1016',
  sunken: '#070b0f',
  line: '#1d2830',
  edge: '#33454f',
  type: '#8aa2b0',
  bright: '#dbe8f0',
  // 4.6:1 on the panel (M14, both reviews: #5b7180 was 3.74:1 under the view's
  // 6–10 px type); a fixed literal of this palette, never the ring's colour
  dim: '#6f8798',
  /** the one accent: the engine's own lines in the ledger, and a hand's focus */
  signal: '#4fc3f7',
  /**
   * **The wiring is grey** (Eugene, 09-25: *"no acid blue lines — shades of
   * grey for the wiring"*): the main path the lightest and heaviest, a signal
   * a step down, a send the faintest; a return and the sidechain are the
   * signal's grey, told apart by their dash.
   */
  wireMain: '#aebbc4',
  wire: '#6f7f8a',
  wireFaint: '#4c5c66',
  green: '#3ad17f',
  amber: '#ffb020',
  red: '#ff4d4f',
  /** a meter's LED that is not lit: there, and dark */
  ledOff: '#0e1a14',
  /**
   * **The view's two inks for words** (M6, Eugene: *"if labels are goldish, all
   * value text should be more in the white domain"* — and *"the machine view
   * should not follow the ring's colour; it's a tech tool and should be
   * consistent"*): a name, a title or a label in the house gold, fixed; a value
   * or a reading in the readouts' white; a note, a scale or a sentence in a
   * white set back. None of them is read off the ring's worn colour or the
   * spell's hue: the ring in its corner is the only thing here that wears it.
   */
  label: '#f2c14e',
  value: '#dbe8f0',
  note: '#9aa5ad',
} as const;

/**
 * **One spacing scale for the whole view** (M5, Eugene: *"the layout needs
 * better fine-tuning of paddings around boxes and buttons; some boxes touch
 * borders, it looks cheap"*): every gap, inset and padding in the drawing and
 * in the panes is one of these, in the drawing's units (a CSS pixel at scale 1).
 *
 *   hair  4   a list's rows; a key's inset in its row
 *   s     8   a frame's inner gutter; two boxes; two keys; the readout's padding
 *   m    12   two families; a tile's side padding
 *   l    16   the label band over a frame's contents; the canvas's own margin
 *   xl   24   between a column's rule and what stands under it
 */
export const SPACE = { hair: 4, s: 8, m: 12, l: 16, xl: 24 } as const;

/**
 * **The density, by the width the view is seen at** (M6, Eugene: *"for mobile
 * we compress all paddings to the most dense view, but on bigger screens give
 * it more space to fill the canvas proportionally"*). Two numbers:
 *
 *   the spacing  g(w) = 1 at 390 px, 1.5 at 1440, 2 at 2560, straight between
 *                (and held at the ends): every gap, inset, lane and corner of
 *                the drawing, in pixels, is its phone value times g;
 *   the type     t(w) = 1 up to 1999 px and 1.25 from 2000, one step and no
 *                more: the size of a box and of a word, and the left column's
 *                (M8, Eugene: *"if I make the browser bigger I just want to see
 *                more of the machine blocks … only on super-big screens do we
 *                see a bigger left panel"*) — up to the break every pixel of
 *                width goes to the graph.
 *
 * The drawing is shown at `t`, so its own units carry spacing of g / t; what
 * the pane has beyond the columns goes to the gutters, and the drawing is never
 * zoomed to fill.
 */
/** The spacing's step: a twentieth, about a hundred pixels of width (M14). */
export const DENSITY_STEP = 0.05;
/** The one width the type, and the left column with it, steps up at (M8). */
export const DENSITY_BREAK = 2000;
export function density(width: number): { space: number; type: number; gap: number } {
  const raw = width <= 390 ? 1 : width <= 1440 ? 1 + (0.5 * (width - 390)) / 1050 : Math.min(2, 1.5 + (0.5 * (width - 1440)) / 1120);
  // in steps of DENSITY_STEP (M14): a width a pixel apart is the same drawing,
  // so a drag re-lays the graph at the steps and not on every pixel
  const g = Math.round(raw / DENSITY_STEP) * DENSITY_STEP;
  const t = width >= DENSITY_BREAK ? 1.25 : 1;
  return { space: g / t, type: t, gap: g };
}

/** A key, wherever it is drawn — on a strip in the drawing, or in a popover (M6). */
export const KEY = { w: 24, h: 20, font: 9.5 } as const;
/** The toolbar under the ring's keys (M19): a finger's height. */
export const TOOL_KEY_H = 24;

/**
 * **How dim a box at rest is drawn** (gated or idle): a source box at
 * `REST_BOX`, a chip, a strip and a row at `REST`. Two numbers, as the view
 * has always drawn them — whether they should be one is a question for the
 * eye, not a tidy — named once each where they were four literals (round (f)
 * of the reconciled review of 09-24, D38; `tools/scenarios.ts` states both on
 * its own).
 */
export const REST_BOX = 0.45;
export const REST = 0.5;

/** The scale a meter is marked in, in dBFS. */
export const SCALE = [0, -6, -12, -24, -48] as const;
export const METER_FLOOR = -60;

/** Where a decibel reading falls along a meter, nought to one. */
export const meterAt = (db: number): number =>
  Math.max(0, Math.min(1, (db - METER_FLOOR) / (0 - METER_FLOOR)));

/** What an LED says, as the industry reads it. */
export type Lamp = 'off' | 'green' | 'amber' | 'red';

export const LAMP: Record<Lamp, string> = {
  off: INK.line,
  green: INK.green,
  amber: INK.amber,
  red: INK.red,
};

/**
 * The stylesheet, as text.
 *
 * It is a template literal, so **no comment in it may contain a backtick** —
 * one in a CSS comment closes the string and the file stops parsing. The type
 * check says so at once, which is why it is worth knowing rather than worth
 * avoiding.
 *
 * It is injected in a `<style>` of its own when the view opens and removed when
 * it closes, so the ring's page carries not one byte of it while the ring is
 * what is on the screen — which is half of why the four untouched pictures are
 * pixel-identical. The other half is that nothing here writes inside the ring's
 * own markup: everything the machine view owns is under `#machine`, and the one
 * thing it does to the page is set `data-view` on the root element, whose rules
 * are all in this sheet and go with it.
 */
export const SHEET = `
:root[data-view="machine"] { background: ${INK.ground}; }
:root[data-view="machine"] body {
  background: ${INK.ground};
  overflow: auto;
  touch-action: auto;
  overscroll-behavior: auto;
}
:root[data-view="machine"] #field,
:root[data-view="machine"] #name,
:root[data-view="machine"] #mark { display: none; }
/* The ring keeps its own look and is the same SVG: what changes is the box it
   is centred in, which is the panel instead of the window. */
:root[data-view="machine"] #stage { position: absolute; inset: 0; }
:root[data-view="machine"] #tilt { width: 100%; height: 100%; }

/* The panel mark is the way in, and not seen in the view (M8, Eugene: *"the
   bottom-right icon going to the machine view should be hidden in the machine
   view itself"*): the ways out are CLOSE in the toolbar under the ring (M13)
   and a still press on the dark round the ring. */
:root[data-view="machine"] #panel { display: none; }
/* the About's scroll lock holds inside the view (M14, the review of 09-26): this sheet's
   body rule came later at the same weight and let the page scroll under it */
:root[data-view="machine"].about-open body { overflow: hidden; }

#machine {
  position: relative;
  min-height: 100dvh;
  color: ${INK.type};
  background: ${INK.ground};
  font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 11px;
  line-height: 1.45;
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
  user-select: text;
  -webkit-user-select: text;
}
#machine * { box-sizing: border-box; }

/* **Three columns** (Eugene's sketch, 09-19): the ring and every reading down
   the left with the one control at the foot of them, the graph edge to edge in
   the middle with nothing drawn over it, and the ledger down the right. */
#machine .view.rack { height: 100dvh; }
/* the side and the ledger step their type with the drawing's (M6): --t is
   the type step density() gives for the window's width */
#machine { --t: 1; }
#machine .desk-pop, #machine .help { zoom: var(--t); }
#machine .view.rack .pane.side, #machine .view.rack .pane.ledger { zoom: var(--t); }
#machine .view.rack .sheet {
  display: grid;
  grid-template-columns: calc(336px * var(--t)) minmax(0, 1fr) calc(312px * var(--t));
  grid-template-areas: "side graph ledger";
  gap: 1px;
  height: 100%;
  background: ${INK.line};
}
#machine .pane { background: ${INK.panel}; min-width: 0; min-height: 0; }
#machine .view.rack .pane.side {
  grid-area: side;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
#machine .ringbox { position: relative; flex: 0 0 auto; height: 316px; border-bottom: 1px solid ${INK.line}; overflow: hidden; }
/* **The ring's toolbar** (M13): directly under the ring, on its ground, one row
   of a fixed height with COPY LINK, SHOW / HIDE LEDGER and CLOSE right-aligned.
   On a phone the ring and the toolbar are pinned together as one block. */
#machine .ring-block { flex: 0 0 auto; background: ${INK.ground}; }
/* (M19) the toolbar's keys are a finger's: 24 px, the row growing with them */
#machine .ring-tools { display: flex; justify-content: flex-end; align-items: center; gap: ${SPACE.hair}px; height: ${TOOL_KEY_H + SPACE.s * 2}px; padding: 0 ${SPACE.s}px; box-sizing: border-box; background: ${INK.ground}; border-bottom: 1px solid ${INK.line}; }
#machine .ring-tools .pane-key { white-space: nowrap; height: ${TOOL_KEY_H}px; }
#machine .view.rack .engine-block { flex: 0 0 auto; }
#machine .engine-block { border-top: 1px solid ${INK.line}; }
#machine .view.rack .facts { flex: 1 1 auto; min-height: 0; overflow: auto; }
#machine .pane.graph { grid-area: graph; overflow: auto; }
/* the ledger put away (M6): the graph takes its column */
/* put away (M20, Eugene: "closed ledger looks trashy, side panel for no
   reason"): no rail and no panel, the graph the whole width, and one key
   floating over the canvas — top-right beside where the ledger stands, at the
   page's foot on a phone — its face the log mark, four short lines */
#machine .view.rack.no-ledger .sheet { grid-template-columns: calc(336px * var(--t)) minmax(0, 1fr); grid-template-areas: "side graph"; }
#machine .sheet { position: relative; }
#machine .pane-key.ledger-show { position: absolute; z-index: 4; zoom: var(--t); width: ${TOOL_KEY_H}px; min-width: 0; height: ${TOOL_KEY_H}px; padding: 0; display: grid; place-items: center; }
#machine .view.rack .ledger-show { top: ${SPACE.s}px; right: ${SPACE.s}px; }
#machine .view.scrolling .ledger-show { bottom: ${SPACE.s}px; right: ${SPACE.s}px; }
/* on a phone the page's foot keeps a key's room under the canvas, so the mark
   stands under the legend and not on it */
#machine .view.scrolling.no-ledger .sheet { padding-bottom: ${TOOL_KEY_H + SPACE.s * 2}px; }
#machine .ledger-show svg, #machine .log-key svg { display: block; }
#machine h2 .log-key { width: ${KEY.h}px; min-width: 0; padding: 0; display: grid; place-items: center; color: ${INK.bright}; border-color: ${INK.bright}; }
/* pressed, it already wears the bright edge: its focus is a ring outside it */
#machine h2 .log-key:focus-visible { outline: 1px solid ${INK.bright}; outline-offset: 2px; }
#machine h2.with-caption { display: flex; align-items: baseline; gap: ${SPACE.s}px; }
#machine h2 .caption { text-transform: none; letter-spacing: 0.02em; color: ${INK.note}; font-size: 10px; margin-left: ${SPACE.s}px; }
#machine .genre-block { flex: 0 0 auto; }
/* The GENRES header (M8; M13, Eugene: WORK IN PROGRESS on the title's line at
   every width): the title and the tier on the left, the keys on the right, and
   the tag centred in the room between them — one line, never wrapped; on a
   phone the tag's size and tracking come down a step to fit beside the longest
   tier's name and BACK. */
/* (M18) a long family's name gives way before the tag does: the title is the
   one column that may shrink, and ends in an ellipsis; its tile says it whole */
#machine h2.genre-head { display: grid; grid-template-columns: minmax(0, max-content) 1fr auto; align-items: center; gap: ${SPACE.s}px; }
#machine h2.genre-head > .title { white-space: nowrap; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
#machine h2.genre-head > .keys { display: flex; justify-content: flex-end; gap: ${SPACE.hair}px; }
#machine h2.genre-head > .wip { justify-self: center; font-size: 8px; letter-spacing: 0.16em; color: ${INK.note}; white-space: nowrap; }
#machine .view.scrolling h2.genre-head > .wip { font-size: 7px; letter-spacing: 0.08em; }
#machine h2.with-key { display: flex; align-items: center; justify-content: space-between; gap: ${SPACE.s}px; }
#machine .pane-key { font-family: inherit; font-size: ${KEY.font}px; letter-spacing: 0.04em; text-transform: uppercase; height: ${KEY.h}px; min-width: ${KEY.w}px; padding: 0 ${SPACE.s}px; border-radius: 2px; color: ${INK.value}; background: ${INK.sunken}; border: 1px solid ${INK.edge}; cursor: pointer; }
#machine .pane-key:hover, #machine .pane-key:focus-visible { border-color: ${INK.bright}; outline: none; }
#machine .pane.ledger { grid-area: ledger; display: flex; flex-direction: column; min-height: 0; }
/* the view's own controls are pressed and dragged, never read out: a drag
   across them selects nothing (round K9); its readings stay selectable. A
   press is taken at once, with no wait for a second tap (round M1). */
#machine .desk-strip, #machine .desk-pop { user-select: none; -webkit-user-select: none; touch-action: manipulation; }
#machine [role="button"]:focus-visible { outline: none; }
/* every SVG key draws its focus on its own rect (M14, the review of 09-26: the master's
   band rows and RESET sit outside .desk-strip and drew nothing) */
#machine [role="button"]:focus-visible > rect,
#machine .desk-strip [role="button"]:focus-visible rect,
#machine .desk-strip [role="button"]:hover > rect { stroke: ${INK.bright}; stroke-width: 1; }
#machine .desk-pop { position: fixed; z-index: 20; width: min(272px, calc(100vw - 16px)); padding: ${SPACE.m}px; border: 1px solid ${INK.edge}; background: ${INK.panel}; color: ${INK.type}; font: inherit; box-shadow: 0 4px 16px #0008; }
#machine .desk-pop-title { color: ${INK.label}; text-transform: uppercase; letter-spacing: .8px; padding-bottom: 6px; border-bottom: 1px solid ${INK.line}; }
#machine .desk-row { display: grid; grid-template-columns: 1fr auto; gap: 6px; margin: 10px 0; }
#machine .desk-row output { color: ${INK.value}; }
#machine .desk-fader { grid-column: 1 / -1; display: grid; grid-template-columns: 32px 1fr 32px; gap: 8px; align-items: center; }
#machine .desk-fader input { width: 100%; margin: 0; accent-color: ${INK.type}; cursor: pointer; }
#machine .desk-fader { grid-template-columns: ${KEY.w}px 1fr ${KEY.w}px; }
#machine .desk-keys { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 4px; }
/* **The popover's keys are the strips' keys** (M6): the same 20 high and at
   least 24 wide, the same face, size and capitals, the same ink and the same
   lit colours, a word key as wide as its word */
#machine .desk-pop button { font-family: inherit; font-size: ${KEY.font}px; letter-spacing: 0.04em; text-transform: uppercase; height: ${KEY.h}px; min-width: ${KEY.w}px; line-height: 1; border-radius: 2px; color: ${INK.value}; background: ${INK.sunken}; border: 1px solid ${INK.edge}; padding: 0 ${SPACE.s}px; cursor: pointer; }
#machine .desk-pop button:hover, #machine .desk-pop button:focus-visible { border-color: ${INK.bright}; color: ${INK.bright}; outline: none; }
#machine .desk-pop button:disabled { opacity: .4; cursor: default; }
#machine .desk-pop .desk-toggle.on { background: ${INK.bright}; color: ${INK.ground}; border-color: ${INK.bright}; font-weight: 700; }
#machine .desk-pop .desk-toggle.mute.on { background: ${INK.red}; border-color: ${INK.red}; }
#machine .desk-pop .desk-toggle.solo.on { background: ${INK.amber}; border-color: ${INK.amber}; }
#machine .desk-tools { border-top: 1px solid ${INK.line}; margin-top: 8px; padding-top: 8px; display: grid; gap: 6px; }
#machine .desk-name { color: ${INK.label}; }
#machine .desk-status { color: ${INK.dim}; overflow-wrap: anywhere; }
#machine .desk-pop p { color: ${INK.dim}; margin: 8px 0 0; font-size: 10px; }

/* **The page-scroll mode**: one long page in the order the document is in —
   the ring, the engine, the readings, then the graph, then the ledger. The
   graph is the one element that scrolls sideways, because a layered graph is
   wider than a phone; **the page itself never scrolls across**. */
#machine .view.scrolling .sheet { display: block; background: ${INK.ground}; }
#machine .view.scrolling .pane { margin-bottom: 1px; }
/* the side pane dissolves into the sheet on a phone (M14, the review of 09-26): a sticky
   box is held inside its containing block, and the pane ended at the engine
   row, so the pinned ring and its toolbar left with it before the graph */
#machine .view.scrolling .pane.side { display: contents; }
#machine .view.scrolling .ring-block {
  position: sticky;
  top: 0;
  z-index: 3;
}
#machine .view.scrolling .ringbox {
  position: relative;
  height: 30dvh;
  min-height: 150px;
  /* solid, so what scrolls goes under the ring and not through it (M2) */
  background: ${INK.ground};
}
#machine .view.scrolling .pane.graph { overflow-x: auto; overflow-y: hidden; }
#machine .view.scrolling .pane.ledger { display: block; }
#machine .view.scrolling .lines { overflow: visible; }

#machine h2 {
  margin: 0;
  padding: 6px 10px 5px;
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: ${INK.dim};
  border-bottom: 1px solid ${INK.line};
  background: ${INK.sunken};
}
/* **A key in a header takes no height of its own** (M10, Eugene: *"both BACK on
   genres and the LEDGER buttons, when present, stretch the header vertically,
   and the page wiggles on pressing them"*): the key is 20 px on a 12 px title
   line, and it stretched its row by the difference, so a header grew when its
   key came and shrank when it went, and everything under it moved. Its margins
   give that back: it stands centred over the header's own padding, and the
   row is the title's height with it or without it. */
#machine h2 .pane-key { margin-block: -${(KEY.h - 12) / 2 + 2}px; }

/* The readings, as tiles (round M1): a name over its value, three to a row in
   the side column and on a phone, the three sentences a row of their own. */
#machine .list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  background: ${INK.line};
  border-bottom: 1px solid ${INK.line};
}
#machine .fact {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  padding: ${SPACE.s}px ${SPACE.m}px;
  background: ${INK.panel};
}
#machine .fact.wide { grid-column: 1 / -1; flex-direction: row; align-items: baseline; gap: 10px; }
#machine .fact .k {
  font-size: 8.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${INK.label};
  white-space: nowrap;
}
#machine .fact.wide .k { flex: 0 0 auto; width: 52px; }
#machine .fact .v {
  min-width: 0;
  color: ${INK.value};
  /* (M19, Eugene: "too large") the readings at 11 px, a phone's as a desktop's */
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
#machine .fact.wide .v { flex: 1 1 auto; text-align: right; }
#machine .fact.wrap .v { white-space: normal; overflow: visible; }
/* The spell tile (M8, Eugene: *"the alignment of the SPELL label and the inner
   values looks off — need to uniform the paddings"*): a tile like any other —
   the same padding, its name where every tile's name is, the swatch inline
   after it at the name's cap height — and the eight cells one row of equal
   columns from the name's left edge at every width, a phone's too (M8: *"on
   mobile, where we need compression, these wrap onto a new line and steal
   vertical space"*), each a name over a value with a tile's own line gap. */
#machine .fact.spell { flex-direction: column; align-items: stretch; gap: ${SPACE.hair}px; }
#machine .spell-head { display: flex; align-items: center; gap: ${SPACE.s}px; line-height: 1; }
#machine .fact.wide .spell-head .k { width: auto; }
#machine .spell-head .swatch { width: 7px; height: 7px; margin: 0; border: 0; }
#machine .spell-grid { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); column-gap: ${SPACE.hair}px; row-gap: ${SPACE.s}px; }
#machine .spell-grid .cell { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; min-width: 0; }
#machine .fact.wide .spell-grid .cell .k { width: auto; opacity: .7; }
#machine .spell-grid .cell .v { font-size: 11px; color: ${INK.note}; overflow: visible; }
#machine .spell-grid .cell.off .k { opacity: 1; }
#machine .spell-grid .cell.off .v { color: ${INK.value}; }
/* **On a phone a tile is one line** (M8, Eugene: *"on mobile the 9-tile grid is
   fine — it's just that the label/value pairs could be one-liners"*): the name
   at the left and the value at the right on one baseline, a pair that does not
   fit going to a second line only then; the spell's cells each a name and its
   value side by side. The desktop keeps the name over the value. */
#machine .view.scrolling .fact:not(.wide) { flex-direction: row; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; column-gap: ${SPACE.hair}px; padding: ${SPACE.hair}px ${SPACE.s}px; }
#machine .view.scrolling .fact:not(.wide) .k, #machine .view.scrolling .fact:not(.wide) .v { line-height: 14px; }
#machine .view.scrolling .fact:not(.wide) .v { font-size: 11px; }
#machine .view.scrolling .fact.wide { padding: ${SPACE.hair}px ${SPACE.s}px; }
#machine .view.scrolling .spell-grid .cell { flex-direction: row; align-items: baseline; gap: 2px; }
#machine .view.scrolling .spell-grid .cell .v { font-size: 11px; }
#machine .fact .v.warn { color: ${INK.amber}; }
#machine .fact .v.bad { color: ${INK.red}; }
#machine .swatch {
  display: inline-block;
  width: 11px;
  height: 11px;
  vertical-align: -1px;
  margin-right: 5px;
  border: 1px solid ${INK.edge};
}

/* The ledger. */
#machine .lines { overflow: auto; flex: 1 1 auto; min-height: 0; }
#machine .line {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  border-bottom: 1px solid ${INK.line};
  background: transparent;
  color: ${INK.type};
  font: inherit;
  padding: 4px 10px 5px;
  cursor: copy;
}
#machine .line:hover, #machine .line:focus-visible { background: ${INK.sunken}; color: ${INK.bright}; outline: none; }
#machine .line .bar { color: ${INK.dim}; margin-right: 8px; }
#machine .line .fields { color: ${INK.dim}; }
#machine .line.clip .what, #machine .line.late .what, #machine .line.fault .what { color: ${INK.red}; }
#machine .line.hot .what, #machine .line.prepare .what { color: ${INK.amber}; }
#machine .line.seam .what, #machine .line.cast .what, #machine .line.spell .what,
#machine .line.engine .what { color: ${INK.signal}; }
#machine .line.desk .what { color: ${INK.amber}; }

/* **The manual** (M2): one tooltip, solid, in the panel's own look, kept while
   the pointer is on it and faded as it leaves. */
#machine .help {
  position: fixed;
  z-index: 30;
  width: min(300px, calc(100vw - 16px));
  padding: 9px 11px 10px;
  border: 1px solid ${INK.edge};
  background: ${INK.panel};
  color: ${INK.type};
  box-shadow: 0 4px 16px #0008;
  font-size: 11px;
  line-height: 1.45;
  opacity: 1;
  transition: opacity .15s ease;
  /* it never takes a box from under the hand: the pointer passes through it to
     whatever it lies over, and the page it shows follows the pointer */
  pointer-events: none;
}
#machine .help.out { opacity: 0; }
#machine .help-title { color: ${INK.label}; text-transform: uppercase; letter-spacing: .8px; padding-bottom: 5px; margin-bottom: 6px; border-bottom: 1px solid ${INK.line}; }
#machine .help p { margin: 0 0 6px; }
#machine .help .help-line { color: ${INK.dim}; }
#machine .help .help-now { color: ${INK.dim}; margin: 0; overflow-wrap: anywhere; }
#machine .line.copied { background: ${INK.sunken}; }
#machine .empty { padding: 10px; color: ${INK.dim}; }

/* **The one control**, and it is one row high: the engines side by side as
   segments, the one that is playing lit, at the foot of the left column under
   a header of its own (M8: the genres are the top function, the engine not). */
#machine .engine {
  display: flex;
  background: ${INK.sunken};
  border-bottom: 1px solid ${INK.line};
}
#machine .view.scrolling .engine { border-top: 0; }
#machine .engine .row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  flex: 1 1 0;
  min-width: 0;
  border: 0;
  border-left: 1px solid ${INK.line};
  background: transparent;
  color: ${INK.dim};
  font: inherit;
  padding: 7px 6px 8px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
}
#machine .engine .row:first-child { border-left: 0; }
#machine .engine .row:hover, #machine .engine .row:focus-visible { background: ${INK.panel}; outline: none; }
/* a key's focus is a hairline of the bright ink inside it (M14), the lit engine row and the lit genre key included */
#machine .engine .row:focus-visible, #machine .genres button:focus-visible { outline: none; box-shadow: inset 0 0 0 1px ${INK.bright}; }
#machine .engine .row .id { letter-spacing: 0.1em; overflow: hidden; text-overflow: ellipsis; }
#machine .engine .row.on { background: ${INK.panel}; color: ${INK.bright}; }
#machine .engine .row.arriving { color: ${INK.amber}; }

#machine svg { display: block; }

/* **The words of the drawing** (M6): the page draws every SVG text in its worn
   gold (the ring's own rule, which the ring needs); here a label is the house
   gold, a value the readouts' white and a note a white set back, whatever the
   ring is wearing. */
#machineDiagram text.l { fill: ${INK.label}; }
#machineDiagram text.l.lit { fill: ${INK.amber}; }
#machineDiagram text.v { fill: ${INK.value}; }
#machineDiagram text.v.warn { fill: ${INK.amber}; }
#machineDiagram text.n { fill: ${INK.note}; }
/* A key's letter is printed, not engraved (M8, Eugene: a lit M and S read as
   black blobs): the page's knockout stroke round every SVG word, in the page's
   black, thickened the ground-coloured letter on the red and amber fill into a
   shape. On a key the letter has no stroke; lit, it is the ground's colour on
   the lamp's fill, as a desk prints it. */
#machineDiagram text.k { fill: ${INK.value}; stroke: none; }
#machineDiagram text.k.on { fill: ${INK.ground}; }
#machineDiagram text.dry-mark { fill: ${INK.note}; stroke: none; }
#machineDiagram text.msd { fill: ${INK.edge}; }
#machineDiagram text.msd.mute.lit { fill: ${INK.red}; }
#machineDiagram text.msd.solo.lit { fill: ${INK.amber}; }
#machineDiagram text.msd.dry.lit { fill: ${INK.bright}; }
`;

export default INK;
