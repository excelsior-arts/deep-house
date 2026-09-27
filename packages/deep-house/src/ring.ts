// The spell. One ring, no buttons: the sigil is the instrument panel.
//
// The rule every mark on it obeys: it is a value the machine holds or a
// control you can touch. Nothing is here because it looked occult. Each
// element below carries a one-line note saying what it tells or what it does;
// if a mark cannot answer that, it does not get drawn.
//
//   centre        start / stop; the master seed engraved, the chord under it
//   centre's rim  the four actions — play, skip, cast, back — as nodes of
//                 the same make as the star's cells, smaller, sitting on the
//                 circle's stroke at its axes the way a cell sits on a vertex
//   eight nodes   the dice, one per star point, each lit while its part plays
//   lane band     seven lanes, one per instrument, drawn around the whole
//                 theme so you can see the arrangement coming
//   section ring  the plan: intro, build, groove, breakdown, drop, outro
//   numbers       bar numbers every sixteen bars, and the minutes
//   cursor        where you are; drag the band to move it, flick to skip
//
// Everything it knows comes from control.ts; nothing here touches audio.

// No stamp travels with these imports: the build hashes every asset's name,
// so a new build is a new module graph and no tab keeps an old ring alive.
// The exception tracker first, so its handlers stand before any other module runs.
import { reportsWanted, reportsRunning, setReports } from './instrument.ts';
import { reportFaults } from './fault-report.ts';
import { report, aBug, addressFlood } from './ledger.ts';
import { createControl, LANES, romanNumeral } from './control.ts';
import { linkHere, linkView } from './link.ts';
import { WAIT_INK, WAIT_ALPHA } from './wait.ts';
import { STRATEGIES } from './strategies/index.ts';
import type { Lanes, Readout } from './control.ts';
import { installDebug } from './debug.ts';
// Planning a theme is arithmetic and no audio, so the ring can plan a dozen
// candidate seeds inside one frame and cast onto the one it wants.
import { styleDistance, FLOOR, WEIGHTS } from './style-distance.ts';
// The eight birds' glyphs: one drawing each, drawn once and never again.
import { drawBirdGlyph, glyphAt, levelAt } from './bird-glyph.ts';
// What a bird's cell says: the quantity it biases, and the seed's locked reading under it (round K13).
import { cellReading, sentenceOf, shortOf, hatsOfProgram, programFactsOf, keysOfProgram } from './bird-labels.ts';
import type { CellValue, LabelTheme } from './bird-labels.ts';
// Which bird reaches which cell: the ring's dotted lines, from the model (round K13).
import { linksOf, frameLine, COMPASS } from './bird-influence.ts';
// The ring's own colour, derived from the eight birds the set was cast under.
import { ringColour, restyle, mixHex, typeInk, paleInk } from './ring-colour.ts';
import type { RingColour } from './ring-colour.ts';
// The eight numbers a cell is a control over, and the house they rest at: the
// radius a cell stands at *is* its bird's value, so the ring reads the same
// vector the composer does rather than a second copy of it.
import { HOUSE, BIRDS, SPELL_SAME, spellQuery } from './spell.ts';
import type { Bird, Spell } from './spell.ts';
// What a hand reads off a bird: a percent of the house. Presentation only — the
// value a cell holds and the link writes is the 0..1 number above.
import { percentOf, valueOfPercent, percentShown, percentText, RIM_PERCENT, nearHouse, magnet, PULL_STEP, PULL_PAGE, TAP_STEP } from './bird-percent.ts';
// Whether a strategy's plan reads a held bird at all. A control that changes
// nothing breaks the ring's first rule, so the cells are controls exactly where
// `derive()` reaches the composer and readings everywhere else.
import { switchOn } from './lanes.ts';
import { castPool, pickCast } from './cast-pool.ts';
import { startScribe } from './machine/scribe.ts';
import type { Candidate } from './cast-pool.ts';
import { reducedMotion, coarsePointer } from './motion.ts';
import type { Parts, PlannedTheme } from './style-distance.ts';

// ==========================================================================
// What the ring is handed
//
// control.ts publishes one object with everything a face could want to draw,
// and it names that object itself: the readout, its lanes and the theme coming
// after this one are the transport's own types, imported rather than restated,
// so the boundary between the face and the machine is a type error and not a
// description that can drift. The three shapes below are the ring's own, and
// each is something the transport does not say.

/** A die is the word it rolled, or a row carrying that word. */
type Die = string | number | { value?: string | number; label?: string } | null | undefined;


/**
 * The dice, plus the two the cells are written for and the table does not
 * carry. The note on the `density` and `wet` cells says as much — *until the
 * sound engine exposes the density and wetness dice* — and it is still true:
 * `ThemeDice` has no `wetness` and no `wetnessDb`, so both reads come back
 * undefined and both cells fall through to their second reading. They are
 * written down here so the cells stay written for the day the engine rolls them.
 */

const NS = 'http://www.w3.org/2000/svg';
const C = 500;
const TAU = Math.PI * 2;

// --- radii, outward -------------------------------------------------------
const R_CORE_IN = 137;
const R_CORE = 150;
const R_ACT = R_CORE;    // the four actions sit ON the centre circle's stroke
const R_STAR = 316;      // the eight parameter cells
/**
 * **One size for every control, read off the ring's own square** (Eugene,
 * round K3: *"increase the bird circles to match the size of the play
 * controls; moreover increase all button circles on mobile by about 30 %. The
 * size should be based on the ring's square size, so when I go to the machine
 * view, where the ring shrinks into the top-left corner, I want the bigger
 * controls there as well."*)
 *
 * A control — each of the four actions and, since K3, each of the eight birds
 * — is `CTRL_R` of the ring's thousand units across its radius, and
 * `CTRL_SMALL_K` times that when the ring's square is smaller than
 * `CTRL_SMALL_SIDE` CSS pixels. The threshold is the geometry's own: a
 * 70-unit control on a 629-pixel square is drawn 44 px across, the size a
 * finger needs, so below it every control is made a third bigger — the phone
 * (376 px on a 400-px screen) and the machine view's corner alike. `ctrlR` is
 * the radius now; it is set from the square by `sizeControls`, which a
 * `ResizeObserver` on the square calls.
 */
const CTRL_R = 35;
const CTRL_SMALL_K = 1.3;
const CTRL_SMALL_SIDE = 629;
let ctrlR = CTRL_R;
/**
 * **A bird's own radius** (Eugene, round K5: *"I think we overdid the bird
 * icon size in desktop mode — now the whole card looks like bubble-gum
 * bubbles. On mobile it's fine."*). On a square at or over `CTRL_SMALL_SIDE`
 * a bird is `BIRD_R` units, 0.74 of a control and still bigger than the 20 it
 * was before round K3; on a smaller square it is the control's own radius, as
 * round K4 left it. `birdR` is the radius now, set by `sizeControls` with
 * `ctrlR`, and every mark a bird is drawn or measured with reads it: the node,
 * its glyph, its lights and hold sweep, its pending fill, its words' clear
 * space and its hit test. The house is `birdR` and the rim `SIZE_RIM` of it.
 */
const BIRD_R = 26;
/**
 * And on the small square a bird is a little smaller than the controls (Eugene,
 * round K8: *"reduce the bird circles by 12 % or so; they need to be a bit
 * smaller than the player controls"*): `BIRD_SMALL_OF_CTRL` of the control's
 * radius, 40.04 units where the controls are 45.5.
 */
const BIRD_SMALL_OF_CTRL = 0.88;
let birdR = BIRD_R;
/**
 * **The star's lines are heavier on the small square** (Eugene, round K6:
 * *"in mobile mode on smaller sizes we need to increase a little the thickness
 * of the lines that connect the bird circles — they look hair-thin"*). The two
 * squares and the octagon — the line and the faint wide stroke under it — are
 * drawn `STAR_SMALL_K` times their weight on a square under
 * `CTRL_SMALL_SIDE`, the same threshold the controls grow at; `starK` is that
 * factor now, set by `sizeControls`, and 1 on a desktop's square. He picked
 * 1.3 off the sheet of 1.3, 1.5 and 1.8 (round K8).
 */
const STAR_SMALL_K = 1.3;
let starK = 1;
const R_BAND_IN = 352;
const R_LANE0 = 358;
const R_LANE_GAP = 11;
const R_LANE_TOP = R_LANE0 + 6 * R_LANE_GAP;   // 424
const R_BAND_OUT = 430;
const SHADE_LO = R_LANE0 - 4;         // the shade over the played lanes
const SHADE_HI = R_LANE_TOP + 4;
const SHADE_INK = '#000000';          // the field's own ground, now flat
const SHADE_PLAYED = 0.5;             // over the bars already played
const SHADE_SEAM = 0.8;               // per unit of the fade the seam applies to the band
const R_SEC = 436;       // the section plan
const R_SEC_TXT = 446;
const R_NUM = 480;       // bar numbers and minutes
const R_ENGRAVE = 492;   // the live time, following the cursor

/** What a mark is drawn with. A value that is null is left off the element. */
type Attrs = Record<string, string | number | null | undefined>;

// A mark on the ring, which is an SVG element and one thing more: `setAttribute`
// is declared to take a string and in fact coerces whatever it is handed, and a
// good half of the ring's attributes are numbers and always have been. Saying so
// once, here, is what keeps the frame loop free of conversions it does not need
// to run — the type says what the DOM does and nothing is added to do it.
type Mark<T extends SVGElement = SVGElement> = T & {
  setAttribute(qualifiedName: string, value: string | number): void;
};

const el = <K extends keyof SVGElementTagNameMap>(
  tag: K, attrs: Attrs, parent?: Node | null,
): Mark<SVGElementTagNameMap[K]> => {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k] as string);
  if (parent) parent.appendChild(n);
  return n;
};
const clear = (n: Node) => { while (n.firstChild) n.removeChild(n.firstChild); };
// Write an attribute only when it changes. The two bloomed layers re-run
// their gaussian blur for any write inside them, an unchanged value included:
// on WebKit that was 12 ms a frame for a spin transform that never moved. What
// is not written is not rasterised.
// A cold cache asks the element once, so a write of the value that is already
// there is not a write either: the colour layer re-states the gradient's four
// stops on every set, and at the house those are the four it already carries.
/** The cache `put()` hangs off a node: every attribute it has written there. */
type Cached = Element & { __a?: Record<string, string> };

const put = (n: Cached, k: string, v: string | number) => {
  const s = String(v);
  const a = n.__a || (n.__a = {});
  if (a[k] === s) return;
  if (!(k in a) && n.getAttribute(k) === s) { a[k] = s; return; }
  a[k] = s;
  n.setAttribute(k, s);
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ==========================================================================
// The ring's colour
//
// `ring-colour.ts` turns the eight birds into one ink — the derivation is
// `notes/diagrams/colours.md`, and the rule it is built round is that **at the
// house vector it returns today's gold to the byte**, all four stops of the
// page's own `#gold` gradient. So an untouched ring is not a special case here
// and is not branched around: it goes down exactly the same path as a spell and
// comes out as the same pixels.
//
// **Everything that is the ring's colour takes it** (Eugene, 09-23: *"finish
// colouring the whole ring"*). Until then the transport — the four actions,
// the centre, the die, the beat dots, the big play mark — was cut in a second
// gradient that never moved, and every word was flat `--gold`;
// under a spell far from the house that left a gold island on a blue ring. Now
// there is one gradient and every mark is cut in it or re-based onto it, and
// the words wear `typeInk` — the ring's own hue leaning toward white as the
// spell leaves the house (`ring-colour.ts` says the numbers). What stays out
// of it is what was never gold: the tell's white and the page's own title,
// which is the name of the thing and not a value. `text { fill: var(--gold) }`
// in the page's stylesheet beats every `fill="url(#gold)"` attribute the ring
// writes, because a presentation attribute is the lowest author style there
// is, so the whole of the type is that one token.
//
// **The WebKit rule, which is why this is written the way it is.** The gradient
// lives in `<defs>` and all three bloomed groups reference it, so writing its
// stops re-runs their gaussian blur. It is therefore **stepped once**, at a
// theme boundary or a seam, under cover of the music changing anyway — never on
// a frame and never on a beat — while the unfiltered layers, where a colour
// write costs nothing, cross-fade onto their new shades on the set's own clock:
// `mix.approach`, which runs 0 to 1 over the thirty-two bars before a hand-over,
// the same clock the fader is on, and not an animation with a length of its own.
//
// Every fixed colour on the ring is re-based by one rule — its own offset from
// the gold in lightness, chroma and hue, laid back down on the new ink — so
// there is no second palette to keep in step, and at the house every one of
// them comes back the hex it has always been.
const goldStops = [...document.querySelectorAll('#gold stop')];
let colour = ringColour(null);        // the house: today's gold, exactly
let asked = colour;                   // and what the set has asked for
const wornTone = new Map<string, string>();
const askedTone = new Map<string, string>();
// Every mark the derived colour owns, with the page's own colour for it.
const toned: { node: Mark; attr: string; base: string }[] = [];
let tonedPruneAt = 256;

const tone = (base: string) => {
  let v = wornTone.get(base);
  if (v === undefined) { v = restyle(base, colour); wornTone.set(base, v); }
  return v;
};
const toneAsked = (base: string) => {
  let v = askedTone.get(base);
  if (v === undefined) { v = restyle(base, asked); askedTone.set(base, v); }
  return v;
};

/** A mark that is the music: drawn in the ring's colour, and re-drawn when it moves. */
function ink<T extends SVGElement>(node: Mark<T>, attr: string, base: string): Mark<T> {
  // **The list is kept to the marks that are drawn** (R63): only a colour walk
  // pruned it, and at the house there is none, so every rebuild left its old
  // marks here and the detached cells with them — about two hundred nodes a
  // theme. Past twice what it last held it drops what has left the document.
  if (toned.length >= tonedPruneAt) {
    let k = 0;
    for (const t of toned) if (t.node.isConnected) toned[k++] = t;
    toned.length = k;
    tonedPruneAt = Math.max(256, k * 2);
  }
  toned.push({ node, attr, base });
  put(node, attr, tone(base));
  return node;
}

// The unfiltered layers, at `e` of the way from what is worn to what is asked.
// A cell rebuilt since the last pass drops out of the list by having left the
// document, which is the only bookkeeping this needs.
function paintToned(e: number) {
  for (let i = toned.length - 1; i >= 0; i--) {
    const t = toned[i];
    if (!t.node.isConnected) { toned.splice(i, 1); continue; }
    put(t.node, t.attr, e >= 1 ? tone(t.base) : mixHex(tone(t.base), toneAsked(t.base), e));
  }
}

/**
 * **A held cell's own light takes the derived colour at once** (`notes/archive/2026-09-plans/cited/PLAN-BIRDS-UX.md`
 * §2). The rest of the ring walks onto the colour a spell asks for over the
 * seam's own clock, because the music has not changed hands yet; the cell a
 * hand is holding is the thing that *asked*, and what it wears is the answer to
 * the hand rather than a reading of the music. So its pending fill and its
 * halo are written from `asked` and not from what the ring is wearing.
 *
 * Nothing at all happens with no bird held, which is every picture the identity
 * proof is taken on.
 */
function paintHeldInk() {
  if (!heldValue.size || !cellNodes.length) return;
  for (let i = 0; i < cellNodes.length; i++) {
    const c = cellNodes[i];
    if (!c.held) continue;
    const h = haloOn[i];
    if (h) { put(h.wide, 'stroke', toneAsked('#f2c14e')); put(h.crisp, 'stroke', toneAsked('#ffd97a')); }
  }
}

/** The step: the shared gradient moves, and with it every line on the ring. */
function wearColour(next: RingColour) {
  asked = next;
  askedTone.clear();
  for (let i = 0; i < goldStops.length; i++) put(goldStops[i], 'stop-color', next.stops[i].hex);
  // and the two tokens every word of type is drawn in. They step on the same
  // clock the gradient does — at a boundary, at a seam or with nothing
  // playing, never on a frame — because the type is on the ring and the ring
  // changes colour once. At the house they are the stylesheet's own values.
  const root = document.documentElement.style;
  root.setProperty('--gold', typeInk(next));
  root.setProperty('--pale', paleInk(next));
  colour = next;
  wornTone.clear();
  paintToned(1);
}

/**
 * What the set has asked for, and when the ring may put it on: at a theme
 * boundary, at a seam, or with nothing playing. While it waits, the unfiltered
 * layers walk towards it on the seam's own approach.
 */
/**
 * The spell the ring is wearing the colour of, as a link would write it — a
 * string, because what is compared is the *value* and a hand builds a new
 * object for it every time it is asked.
 *
 * **It is what the set has been asked for and not only what it is playing.**
 * The readout's own spell turns over at the swap, the way every plan does; a
 * held bird is an ask, and the ring wears the answer to the ask from the moment
 * the hand lets go — which is what gives the colour something to walk towards
 * in front of a hand-asked seam, where before it only ever stepped at the end.
 */
let spellWorn: string | 0 = 0;         // a sentinel: no readout has been seen yet (the key: the engine's kind and the spell)

/**
 * **How near the hand-over is, on the clock that hand-over is actually on.**
 *
 * `mix.approach` runs over the thirty-two bars before the *arrangement's* own
 * seam, which is the right clock for a theme turning over by itself and the
 * wrong one for a hand-asked hand-over: a pull, a cast or an engine asks for a
 * seam that begins on the next phrase line and runs for the bars the set-plan
 * gives it, and before step 5 the colour had no walk at all in front of one —
 * it stepped at the swap and nothing moved before it (`TODO.md`, 09-19).
 *
 * So while a hand-over is in flight the walk is the **seam's own clock**: the
 * transport publishes the whole span and how much of it is left (`mix.cutSpan`,
 * `mix.cutIn`), and the walk is one divided by the other — the same two numbers
 * the node's fill is drawn from, so the colour and the fill close together
 * because they are one reading drawn twice.
 */
/**
 * How far a hand-asked seam's wait has walked, nought to one: the one reading
 * the colour's walk, the held bird's fill and the cut node's fill all take
 * (it was worked out twice, here and in `runCutFill`, until round (f) of the
 * reconciled review of 09-24, D41).
 */
function cutWalk(m: Readout['mix']): number {
  const span = Math.max(0.001, Number(m.cutSpan) || 0.001);
  const left = Math.max(0, Number(m.cutIn) || 0);
  return clamp(1 - left / span, 0, 1);
}

function seamWalk(r: Readout): number {
  const m = r.mix;
  if (m && m.cutting) return cutWalk(m);
  // A promise a hand has just made and the transport has not laid a seam for
  // yet **has not begun**, so the walk is nought rather than wherever the
  // arrangement's own seam happens to stand: a colour that jumped forward in
  // the moment between the ask and the seam would be reading the wrong clock
  // out loud.
  if (heldValue.size && !heldIsPlaying(r.spell)) return 0;
  return clamp((m && m.approach) || 0, 0, 1);
}

function runColour(r: Readout | null, boundary: boolean) {
  // **The colour is the engine's reading of the spell** (round K18, Eugene:
  // *"when I change house to v1 from the machine view, the ring colour wasn't
  // updated"*). An engine that does not read the spell — the record, whose
  // birds are readings — wears the house gold whatever the link holds; one that
  // does wears the spell's colour. The engine is the one the set is heading to
  // (a switch's arriving engine from the ask), so an engine switch re-asks the
  // colour as a spell does and it walks on the seam's own clock to the swap.
  const engine = control.state.strategyTo ?? (r ? r.strategy : null);
  const reads = !r || cellsControl(engine);
  const s = r && reads ? (heldValue.size ? heldSpell() : r.spell) : null;
  const key = `${reads ? 'reads' : 'record'}|${s ? spellQuery(s) : ''}`;
  if (key !== spellWorn) {
    spellWorn = key;
    asked = ringColour(s);
    askedTone.clear();
  }
  if (asked.hex === colour.hex) return;
  if (boundary || !r || !r.playing) { wearColour(asked); tonedAt = -1; return; }
  // **Written when the walk has moved a step a colour can show** (R122): the
  // walk ran over every mark on every readout, sixty a second, where a step of
  // a five-hundredth of the way is less than one level of any channel.
  const e = seamWalk(r);
  if (Math.abs(e - tonedAt) < 1 / 512 && e !== 0 && e !== 1 && asked === tonedFor) return;
  tonedAt = e;
  tonedFor = asked;
  paintToned(e);
  paintHeldInk();
}
let tonedAt = -1;
let tonedFor: RingColour | null = null;

const ang = (frac: number) => -Math.PI / 2 + frac * TAU;      // 0 = top, clockwise
const px = (frac: number, r: number) => C + Math.cos(ang(frac)) * r;
const py = (frac: number, r: number) => C + Math.sin(ang(frac)) * r;
const deg = (frac: number) => frac * 360;

/** A point, in whatever coordinates the mark round it is drawn in. */
type Pt = [number, number];

function arcPath(r: number, f0: number, f1: number, sweep = 1) {
  const a0 = ang(f0);
  const a1 = ang(f1);
  const span = sweep ? f1 - f0 : f0 - f1;
  const large = ((span % 1) + 1) % 1 > 0.5 ? 1 : 0;
  return `M${(C + Math.cos(a0) * r).toFixed(2)} ${(C + Math.sin(a0) * r).toFixed(2)}` +
    `A${r} ${r} 0 ${large} ${sweep} ${(C + Math.cos(a1) * r).toFixed(2)} ${(C + Math.sin(a1) * r).toFixed(2)}`;
}

// A quadrilateral with its corners rounded: each corner is cut back along both
// of its own edges and the corner itself becomes the control point of the
// curve that replaces it, so a face seen at a slant rounds the way a square
// one does. The die is built out of these.
function roundQuad(pts: readonly Pt[], r: number) {
  const n = pts.length;
  const back = (p: Pt, q: Pt): Pt => {
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const len = Math.hypot(dx, dy) || 1;
    const t = Math.min(r, len / 2) / len;
    return [p[0] + dx * t, p[1] + dy * t];
  };
  const f = (p: Pt) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
  let d = '';
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    d += `${i ? ' L' : 'M'}${f(back(p, pts[(i + n - 1) % n]))} Q${f(p)} ${f(back(p, pts[(i + 1) % n]))}`;
  }
  return `${d} Z`;
}

// A full circle drawn as a path, starting at the top and running clockwise —
// so bar 0 is at twelve o'clock and a dash pattern maps straight onto bars.
function circlePath(r: number) {
  return `M${C} ${C - r}A${r} ${r} 0 1 1 ${C} ${C + r}A${r} ${r} 0 1 1 ${C} ${C - r}`;
}

// An annular wedge: used once, for the shadow over the part already played.
function wedge(r0: number, r1: number, f0: number, f1: number) {
  const large = f1 - f0 > 0.5 ? 1 : 0;
  return `M${px(f0, r1).toFixed(1)} ${py(f0, r1).toFixed(1)}` +
    `A${r1} ${r1} 0 ${large} 1 ${px(f1, r1).toFixed(1)} ${py(f1, r1).toFixed(1)}` +
    `L${px(f1, r0).toFixed(1)} ${py(f1, r0).toFixed(1)}` +
    `A${r0} ${r0} 0 ${large} 0 ${px(f0, r0).toFixed(1)} ${py(f0, r0).toFixed(1)}Z`;
}

/** How a word is set: its tracking, where it hangs off its point, and its ink. */
interface TxtOpts {
  ls?: number;
  anchor?: string;
  fill?: string;
  op?: number | string;
  class?: string;
  /** printed as it is given, rather than put up in capitals */
  raw?: boolean;
}

function txt(
  parent: Node, s: string | number | null | undefined, x: number | string, y: number | string,
  size: number, o: TxtOpts = {},
) {
  const ls = (o.ls == null ? 0.16 : o.ls) * size;
  const anchor = o.anchor || 'middle';
  const t = el('text', {
    x, y,
    'font-size': size,
    'letter-spacing': ls.toFixed(2),
    'text-anchor': anchor,
    dx: anchor === 'middle' ? (-ls / 2).toFixed(2) : 0,
    fill: o.fill || 'url(#gold)',
    opacity: o.op == null ? 1 : o.op,
    'stroke-width': Math.min(4.4, Math.max(2.4, size * 0.3)).toFixed(1),
    class: o.class,
  }, parent);
  t.textContent = o.raw ? String(s) : String(s).toUpperCase();
  return t;
}

// The theme's number as the ring engraves it: the control's numeral in the
// ring's lower case (one table for both since round (f) of the reconciled
// review of 09-24, D41).
const roman = (n: number) => romanNumeral(n).toLowerCase();

// --- the wheel's glyphs ---------------------------------------------------
// The three marks of the click wheel, which are actions and not readings: the
// pair of dice, the play and pause mark, and the chevrons either side of it.
//
// Until the compass round there were nine more here, one per cell, each a
// picture of its own die — the room's crest, the twelve marks of the key, the
// beat division, the mask's own sixteen steps. Those are gone, and what they
// drew is not: **every one of them was a second rendering of a value the cell
// already prints in words beside it**, and what the cell carries instead is the
// one thing about it that was nowhere on the ring — which of the eight birds
// this point is. The one real loss is on record: the figures glyph *was* the
// hat mask, step for step, where the words only summarise it ("broken, 8
// hits"), and git holds the drawing if a later round wants the reading back as
// a second mark inside the node.
/**
 * **The die's corner, as one number** — a fifth of a face on the pair of dice,
 * `1.12 R x 0.075` for a node of radius R — and the corner every other mark of
 * the transport is drawn with since 09-23, so the chevrons, the play and pause
 * and the big play mark round the way the die does.
 */
const dieCorner = (R: number) => R * 1.12 * 0.075;
/** The pair's turn, in degrees, negative to the left (K26: Eugene's 5.5°, the logo's own). */
const DIE_TURN = -5.5;
/** Round joins and round ends, said on the path as well as in the stylesheet. */
const ROUND_ENDS = { 'stroke-linejoin': 'round', 'stroke-linecap': 'round' } as const;

/** An open corner `a → b → c` with `b` rounded by `r`, the way `roundQuad` rounds a closed one. */
function roundCorner(a: Pt, b: Pt, c: Pt, r: number): string {
  const back = (p: Pt, q: Pt): Pt => {
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const len = Math.hypot(dx, dy) || 1;
    const t = Math.min(r, len / 2) / len;
    return [p[0] + dx * t, p[1] + dy * t];
  };
  const f = (p: Pt) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
  return `M${f(a)} L${f(back(b, a))} Q${f(b)} ${f(back(b, c))} L${f(c)}`;
}

const GLYPH = {

  // --- roll a new set: two dice, mid-throw ------------------------------
  // A moon is a phase of something that goes round; casting a seed is a
  // throw. Square to the axes it was a box with dots in it, so the pair is
  // turned off them and given the depth it would have in the air, and every
  // corner is rounded like a real die's rather than cut: the far one tumbling
  // corner-on with its one showing and two sides under it, the near one
  // almost face on with its five and a sliver of its top face above it. The
  // near one knocks the far one out where they cross, the way a label does.
  //
  // **Drawn as a line drawing, not as faces** (Eugene, K23, on a zoom: *"the
  // line connections are not clean"*). Each face used to be its own rounded
  // quad, so every edge two faces share was drawn twice, rounded differently
  // at each end, and the near die's second face knocked out half of the line
  // under the first. Now each die is its silhouette — one closed outline, every
  // corner rounded once — and the edges inside it are open lines that end on
  // that outline, at the middle of the curve that rounds the corner they run
  // into; the near die's silhouette is the knock-out, so the far die's edges
  // stop at its line. And the pair is bigger (K23: *"too small for its
  // circle"*): 1.40 R where it was 1.12, its pips a fifth larger again so the
  // five still read on a phone; the corner stays the transport's one number.
  //
  // **The pair turned 5.5° to the left** (round K26, Eugene off the logo's
  // sheets: *"both lean alike, looks great"*): the whole pair as one rotation
  // about its centre, so the near die, which leans 11° right on its own, leans
  // 5.5° right and the upright far one 5.5° left — mirror leans. It is then
  // centred on the box of its turned corners as before. The logo's pair is the
  // same drawing at the same turn.
  die(g: Mark<SVGGElement>, R: number) {
    const U = R * 1.4;                        // the pair fills the node (1.12 R until K23)
    const rr = dieCorner(R);                  // the transport's one corner
    const PIP = 1.2;                          // the pips a fifth larger than their share of U
    // the tumbling one: the rhombus is its top face, the two quads its sides
    const w = U * 0.27;
    const hT = w * 0.56;
    const d = U * 0.24;
    const bx = -U * 0.15;
    const by = -U * 0.12;
    const T = (x: number, y: number): Pt => [bx + x, by + y];
    // the near one: a face turned a few degrees, with its top face on edge
    const hb = U * 0.185;
    const tb = 11 * Math.PI / 180;
    const cb = Math.cos(tb);
    const sb = Math.sin(tb);
    const fx = U * 0.2;
    const fy = U * 0.14;
    const F = (x: number, y: number): Pt => [fx + x * cb - y * sb, fy + x * sb + y * cb];
    const lift = (p: Pt, dx: number, dy: number): Pt => [p[0] + dx, p[1] + dy];
    const sd = U * 0.075;                     // how much of the top face shows
    const sx = -U * 0.035;
    const tl = F(-hb, -hb);
    const tr = F(hb, -hb);
    const pipF = hb * 0.52;
    // Each die's silhouette, clockwise, and the corners of it its inner edges
    // run into (by index): the far one's top face meets its sides along a V
    // with the upright under its apex; the near one's face meets its sliver
    // of top along one edge.
    const far: Pt[] = [T(0, -hT), T(w, 0), T(w, d), T(0, hT + d), T(-w, d), T(-w, 0)];
    const near: Pt[] = [lift(tl, sx, -sd), lift(tr, sx, -sd), tr, F(hb, hb), F(-hb, hb), tl];
    /** Where the rounded corner `i` of a silhouette actually is: the middle of its curve. */
    const on = (pts: Pt[], i: number): Pt => {
      const n = pts.length;
      const p = pts[i];
      const back = (q: Pt): Pt => {
        const dx = q[0] - p[0];
        const dy = q[1] - p[1];
        const t = Math.min(rr, Math.hypot(dx, dy) / 2) / (Math.hypot(dx, dy) || 1);
        return [p[0] + dx * t, p[1] + dy * t];
      };
      const a = back(pts[(i + n - 1) % n]);
      const b = back(pts[(i + 1) % n]);
      return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4];
    };
    const pt = (p: Pt) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
    const apex = T(0, hT);
    const edgesFar = `M${pt(on(far, 5))} L${pt(apex)} L${pt(on(far, 1))} M${pt(apex)} L${pt(on(far, 3))}`;
    const edgesNear = `M${pt(on(near, 5))} L${pt(on(near, 2))}`;
    const pips: { at: Pt; r: number }[] = [
      { at: T(0, 0), r: U * 0.05 * PIP },
      ...[F(0, 0), F(-pipF, -pipF), F(pipF, -pipF), F(-pipF, pipF), F(pipF, pipF)].map((at) => ({ at, r: U * 0.038 * PIP })),
    ];
    // the pair is centred on the node by the ground its turned corners cover,
    // so tuning any of the numbers above cannot leave it off the middle
    const ca = Math.cos(DIE_TURN * Math.PI / 180);
    const sa = Math.sin(DIE_TURN * Math.PI / 180);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of [...far, ...near]) {
      const x = p[0] * ca - p[1] * sa;
      const y = p[0] * sa + p[1] * ca;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const gg = el('g', {
      transform: `translate(${(-(x0 + x1) / 2).toFixed(2)} ${(-(y0 + y1) / 2).toFixed(2)}) rotate(${DIE_TURN})`,
    }, g);
    const pip = (p: { at: Pt; r: number }) => el('circle', { cx: p.at[0].toFixed(2), cy: p.at[1].toFixed(2), r: p.r.toFixed(2), fill: 'url(#gold)' }, gg);
    // the far die, its one pip, then the near one over it: its silhouette
    // knocks out what lies behind, and its line, its one edge and its five
    el('path', { class: 'ln fix thin', ...ROUND_ENDS, d: roundQuad(far, rr) }, gg);
    el('path', { class: 'ln fix thin', ...ROUND_ENDS, d: edgesFar }, gg);
    pip(pips[0]);
    const nearPath = roundQuad(near, rr);
    el('path', { d: nearPath, fill: '#000000' }, gg);
    el('path', { class: 'ln fix thin', ...ROUND_ENDS, d: nearPath }, gg);
    el('path', { class: 'ln fix thin', ...ROUND_ENDS, d: edgesNear }, gg);
    for (const p of pips.slice(1)) pip(p);
  },


  // play, and the same mark as a pause while the mix runs. **Its corners are
  // the die's** (Eugene, 09-23: *"on a circular ring design it is fair to avoid
  // super-sharp corners; the dice is the reference"*): the triangle is drawn
  // with the die's own corner radius, and the pause's two bars end round.
  play(g: Mark<SVGGElement>, R: number, playing: boolean) {
    if (playing) {
      const h = R * 0.46;
      const x = R * 0.2;
      el('path', { class: 'ln fix thin', ...ROUND_ENDS, d: `M${-x.toFixed(1)} ${-h.toFixed(1)} L${-x.toFixed(1)} ${h.toFixed(1)} M${x.toFixed(1)} ${-h.toFixed(1)} L${x.toFixed(1)} ${h.toFixed(1)}` }, g);
    } else {
      const h = R * 0.46;
      const w = R * 0.46;
      el('path', { class: 'ln fix thin', ...ROUND_ENDS, d: roundQuad([[-w * 0.6, -h], [w, 0], [-w * 0.6, h]], dieCorner(R)) }, g);
    }
  },
  // **The question, before anything has played** (round K25, Eugene: *"the
  // central giant Play and the top player button both show play on first open
  // — for the first page open, reuse the top button as informational: a giant
  // (?)"*). A question mark in the transport's line: its hook one stroke of
  // the play mark's weight, round-ended, and its point a pip of the die's.
  about(g: Mark<SVGGElement>, R: number) {
    const w = R * 0.27;
    const top = -R * 0.5;
    const d = `M${(-w).toFixed(2)} ${(top + w * 0.95).toFixed(2)}`
      + ` C${(-w).toFixed(2)} ${(top - w * 0.05).toFixed(2)} ${w.toFixed(2)} ${(top - w * 0.05).toFixed(2)} ${w.toFixed(2)} ${(top + w * 0.95).toFixed(2)}`
      + ` C${w.toFixed(2)} ${(top + w * 1.75).toFixed(2)} 0 ${(top + w * 1.7).toFixed(2)} 0 ${(R * 0.2).toFixed(2)}`;
    el('path', { class: 'ln fix thin', ...ROUND_ENDS, d }, g);
    el('circle', { cx: 0, cy: (R * 0.42).toFixed(2), r: (R * 1.4 * 0.05).toFixed(2), fill: 'url(#gold)' }, g);
  },
  // The theme after this one, and its mirror for the theme before. The pair
  // is built outward from the hair between the two marks, which is where the
  // eye puts a double chevron's centre: laying the first mark down at a fixed
  // offset and stepping the second one along left the pair 1.75 units off the
  // node's middle, and the beat dot that used to sit inside the node made the
  // lean look twice that.
  step(g: Mark<SVGGElement>, R: number, dir: number) {
    const h = R * 0.44;
    const w = R * 0.4;
    const gap = w * 0.05;
    let d = '';
    for (let i = 0; i < 2; i++) {
      const x = dir * (i === 0 ? -(w + gap / 2) : gap / 2);   // the mark's back
      // the point of each chevron is rounded with the die's own radius
      d += `${roundCorner([x, -h], [x + dir * w, 0], [x, h], dieCorner(R))} `;
    }
    el('path', { class: 'ln fix thin', ...ROUND_ENDS, d }, g);
  },
};

// --- the eight cells ------------------------------------------------------
// One point per die, and one layer per point: the cell lights while the part
// it stands for is playing.
// Every cell reads a die. Under a strategy with the `derived` switch the
// cells are also the birds' controls (`controls`, a slider each); under
// house-v1 they are only readings, and the actions live on the wheel inside.
//
// The layer names below are the arrangement's, and since round B the
// arrangement's layers are the instrument registry's: every registered voice
// declares the layer that gates it and `LAYER_ORDER` is those, once each, in
// the registry's order. Which die sits on which layer is the star's own
// arrangement and no property of an instrument implies it — a cell is a
// reading of a die and the layer only says when it is lit — so the pairing is
// written here and `tools/check.ts` holds the eight of them to being exactly
// `LAYER_ORDER`, permuted: a layer cannot be drawn that nothing plays, and a
// layer nothing draws cannot be left off the star.
//
// **The order is the compass** (`notes/diagrams/birds.md`), and since 09-23 it
// is the compass **upside down**. Eugene: *"bass is gravity and gravity pulls
// things to the bottom."* So Root stands at the bottom, where pulling it out —
// down — is the most bass and pushing it up into the core is nearly none,
// *"things float in the air"*; Ember, the fire, stands at the top. It is a
// vertical mirror of the ceremonial order the compass round drew and nothing
// else: Loom and Gleam went down with Root, Veil and Spark came up with Ember,
// and Zephyr and Tide keep east and west. Clockwise from north: **Ember, Spark,
// Zephyr, Gleam, Root, Loom, Tide, Veil.**
//
// What the compass round was taken for survives the mirror, because a mirror
// keeps every neighbour: **the star's two squares still separate matter from
// mood** — the square through the even vertices is exactly the four elements
// and the one through the odd vertices exactly the four moods — and **Ember and
// Spark are still neighbours**, which is where the derived tempo lives
// (`ember x (0.80 + 0.20 x spark)`, `spell.ts`), so the tie between them is the octagon's
// own edge rather than a bracket thrown across the middle.
//
// The dice's own order hops around the circle instead of running round it. That
// is the trade `birds.md` makes deliberately: which die sits at which point was
// never anything but the star's own arrangement, and the gate below reads the
// eight as a set, not as a sequence.
/** The eight dice, by the name each cell is known by here and in `tools/check.ts`. */
type CellId = 'preset' | 'key' | 'timbre' | 'figures' | 'bpm' | 'fx' | 'wet' | 'density';

const CELLS: { id: CellId; layer: string }[] = [
  { id: 'bpm', layer: 'clap' },
  { id: 'figures', layer: 'bass' },
  { id: 'timbre', layer: 'keys' },
  { id: 'key', layer: 'pad' },
  { id: 'preset', layer: 'kick' },
  { id: 'density', layer: 'sixteenths' },
  { id: 'wet', layer: 'hatClosed' },
  { id: 'fx', layer: 'hatOpen' },
];

// The bird each cell is, its name and the one line it means, off the same sheet
// (`notes/diagrams/birds.md`, `bird-glyphs.json`). A bird belongs to a *die* and
// not to a point of the star: the pairing below is the mapping, and `CELLS`
// above is where each one stands. The name is the cell's title line, in the
// ring's own type; the meaning is what a tap says, and neither replaces the
// die's own value, which is still the reading under it.
//
// `tools/check.ts` mirrors both tables and holds them to the compass, so the
// order cannot drift from the diagram without the gate saying so.
//
// **Which way is more** (Eugene, 09-20: *"it is not clear which direction makes
// it more or less; with bass I struggle to tell whether closer to the outer
// edge is more bass or less"*). The convention is one convention for all eight
// — **out is more of the bird, in is less** — and `out` and `in` are the two
// poles off `PLAN-MAGIC-V2` §2's own table. Since round K13 the ring does not
// say them: Eugene, *"all those 'Out is more', 'How light is harmony' — let's
// not make the user's head spin"*. What a bird is about is `means`, a plain
// noun, and what it is at is one sentence of the reading (`valueLine`).
const BIRD: Record<CellId, { key: string; name: string; means: string }> = {
  preset: { key: 'root', name: 'Root', means: 'the low end' },
  key: { key: 'gleam', name: 'Gleam', means: 'the harmony' },
  timbre: { key: 'zephyr', name: 'Zephyr', means: 'the brightness and the keys' },
  figures: { key: 'spark', name: 'Spark', means: 'the beat' },
  bpm: { key: 'ember', name: 'Ember', means: 'the drive and the tempo' },
  fx: { key: 'veil', name: 'Veil', means: 'the pace of change' },
  wet: { key: 'tide', name: 'Tide', means: 'the space round the notes' },
  density: { key: 'loom', name: 'Loom', means: 'the form' },
};

/** The bird a cell is, typed: the key above, read as the composer's own name. */
const birdOf = (id: CellId) => BIRD[id].key as Bird;

// --- the eight cells as controls (UX-1, `notes/archive/2026-09-plans/cited/PLAN-BIRDS-UX.md`) ----------
//
// **A cell is a reading until a hand pulls it**, and what a pull moves is the
// one thing the ring has ever been allowed to move: the spell. A held bird is a
// promise about the next theme and not a knob on this one — the music honours
// it at the next phrase line, over the same blend every other change of state
// on this ring lands over — so nothing here touches audio, exactly as the head
// of this file says, and `control.setSpell` is the whole of the door.
//
// **The radius is the value, and since 09-23 it is the percent.** 0.72 R at 0,
// the rest radius at the house value, and one straight line through both out
// to the rim: `R x (0.72 + 0.28 x percent / 100)`, where the percent is the
// house-anchored reading of `bird-percent.ts` — 0 % at 0, 100 % at the house,
// 130 % at 1. So the node's distance from the 0 % radius *is* the number the
// readout prints, one percent the same step of the node on either side of the
// house, and the rim is at 1.084 R where it used to be 1.08 R. Written that way
// for one reason above every other: at the house every cell is at `R_STAR` **by
// arithmetic and not by a branch** (a hundred per cent is the whole of `1 -
// PULL_IN` added to `PULL_IN`), so an untouched ring is not a special case.
//
// **And the record's page has no control on it.** Under `house-v1` no
// candidate list leans and no derived word reaches a plan, so a held bird would
// move nothing, and a control that changes nothing breaks the ring's first
// rule. Which strategies the cells are controls under is therefore read as a
// fact and never as a name: the strategy's style must carry the `derived`
// switch, which is derive-lite's own, and `house-v1` carries no switches at
// all.
const PULL_IN = 0.72;            // where a bird at 0 stands, as a share of the rest radius
// The snap to the house and the steps of an arrow, a page key and the phone's
// Less and More are percents of the house: `HOUSE_ZONE`, `PULL_STEP`,
// `PULL_PAGE` and `TAP_STEP` in `bird-percent.ts` (R64).
const PULL_SLOP = 4;             // screen pixels before a press is a pull and not a press
const SLIDE_EASE = 120;          // how quickly a released node slides home, in ms
const IMPLIED_MS = 90;           // and at most eleven plans a second behind a moving hand
// --- the hand on a bird (Eugene's list of 09-23, `rounds/ring-k.md`) --------
const LIFT = 0.16;               // a bird under a dragging hand is drawn this much bigger: lifted off the table
const LIFT_EASE = 90;            // how quickly it rises and settles, in ms
const OFF_AXIS_PX = 45;          // how far off its spoke a dragged bird may wander, either side, in screen pixels
const OFF_AXIS_EDGE = 0.25;      // the share of the spoke at each end where that play closes to nothing
const OFF_AXIS_EASE = 170;       // and how quickly it floats back onto the spoke when let go, in ms
const SIZE_CORE = 0.8;           // a bird at 0 %, drawn at this share of its size…
const SIZE_RIM = 1.05;           // …and at the rim; the house is 1, and it is linear in the percent between
// **A bird is never more than 5 % bigger than a control** (Eugene, round K4:
// *"do not allow a regular bird circle to be more than 5 % larger than the
// player controls themselves"*): at the house it is exactly `ctrlR`, the four
// actions' own radius, and at the rim `SIZE_RIM` of it — on every square.
const DOUBLE_MS = 380;           // two clicks inside this are a double click: that bird back to the house
// Where the phone's birds are drawn bigger is `CTRL_SMALL_K` (above): since
// round K3 every control on a small ring is 30 % bigger.
//
// **On the small square the birds stand further in** (Eugene, round K4: *"make
// them lie more into the inner ring; they overlap the track scroll too much,
// which will interfere with attempts to change the track position"*). There a
// bird is 40.04 units (0.88 of the 45.5 control, round K8), and at the rest
// radius it would reach into the lane band. So on a square under `CTRL_SMALL_SIDE` the 0 %
// radius stays where it is (0.72 of `R_STAR`, 227.5), the rim is put where a
// bird drawn at its largest stands `BIRD_BAND_CLEAR` units clear of the lane
// band — which is where the band's own hit test begins, `R_BAND_IN - 8` — and
// the house is where the percent puts it between the two: 284.8, the rim
// 302.0 (280.4 and 296.2 while a bird was the control's 45.5). `starR` is the rest radius and `pullIn` the 0 % share of it, both set
// by `sizeControls`; on a desktop's square they are `R_STAR` and `PULL_IN`,
// the ring as it was.
const BIRD_BAND_CLEAR = 8;
let starR = R_STAR;
let pullIn = PULL_IN;
const RELEASE_MS = 600;          // the long press on the centre that offers "release"
const RELEASE_HOLD_MS = 2600;    // and how long the offer stands
const CORE_HIT = 14;             // how far past the disc's rim a press is still the centre's, in ring units (K22)

/** The birds a hand is holding, by the composer's own name. The ring's only state. */
const heldValue = new Map<Bird, number>();

/** Where each cell stands now, and where it is going: the radius *is* the value. */
const cellR = new Float64Array(8).fill(R_STAR);
const cellTo = new Float64Array(8).fill(R_STAR);
/**
 * And the two things a dragging hand does to a bird that are **not** its value,
 * kept beside the radius for the same reason the radius is kept here: a
 * rebuild tears the cells down and these are motions, which belong to the ring
 * and not to the element drawing them. How far the bird is lifted off the
 * table (0..1), and how far off its own spoke it stands, in ring units along
 * the tangent — nought whenever no hand is on it.
 */
const cellLift = new Float64Array(8);
const cellLiftTo = new Float64Array(8);
const cellSide = new Float64Array(8);
const cellSideTo = new Float64Array(8);

/** Does a held bird reach this strategy's plan at all? */
const cellsControl = (id: string | null | undefined) => {
  const s = id ? STRATEGIES[id] : null;
  return !!s && switchOn(s.style, 'derived');
};
let controls = false;            // what the strategy that is playing says, redrawn with it

/**
 * **The spell a recipe rolled, while no hand has written one** (R58 of the
 * review of 09-24, Eugene's question 15: the reading that shows the truth).
 * Under `?recipe=` with no `spell=` the set plays a spell rolled inside the
 * row, and the birds no hand holds used to be drawn at the house while the
 * set played the roll, so "the radius is the value" did not hold. They stand
 * at the rolled value now. A hand's first commit writes a spell to the link
 * and the set plays that spell whole — the birds it does not hold at the
 * house — so from then on they rest at the house, which is again the truth.
 * The link is untouched: a roll is the recipe's, and `recipe=` carries it.
 */
let rolled: Partial<Spell> | null = null;
/** Whether the link names a spell: read at load, and set by a hand's first commit. */
let handSpell = false;
const restOf = (b: Bird) => (rolled && typeof rolled[b] === 'number' ? rolled[b]! : HOUSE[b]);

/** The value a bird stands at: what a hand is holding, or the value it rests at. */
const valueOf = (b: Bird) => heldValue.get(b) ?? restOf(b);

/** The rolled spell a readout carries: its spell, when it names a recipe and no hand has written one. */
function rollOf(r: Readout | null): Partial<Spell> | null {
  if (!r || !r.recipe || handSpell || heldValue.size || !r.spell) return null;
  const out: Partial<Spell> = {};
  for (const b of BIRDS) { const v = (r.spell as Partial<Spell>)[b]; if (typeof v === 'number' && v !== HOUSE[b]) out[b] = v; }
  return Object.keys(out).length ? out : null;
}
let rolledFrom: Readout['spell'] | undefined;
/**
 * **The birds stand at the spell that is asked, whoever asked it** (round K21,
 * Eugene: the machine view's Tech House key played 126 BPM and the ring's birds
 * stayed at the ambient spell they were at). The ring's own held values were
 * the truth and moved only under the ring's own hand, so a spell asked from
 * anywhere else — the genre keys, a journal walk, a pending landing committed
 * at a stop — changed the music and the link and not the birds. The asked
 * spell is the address's (every ask writes it at once, the ring's own
 * included), so whenever no hand of the ring's is on a bird or waiting to
 * commit, a difference between the address's spell and the held values is an
 * outside ask: every bird is stood at it — value, radius, words, glyph and held
 * state — and it waits and fills as a hand's ask would until it lands.
 */
function followOutsideAsk(r: Readout) {
  if (pendingCommit || sliding || cellNodes.some((c) => c.pulling)) return;
  const want = askedSpell();
  const a = offHouse(want);
  if (sameAsk(want, heldSpell())) return;
  ringAsked = want;
  heldValue.clear();
  for (const b of BIRDS) if (a[b] != null) heldValue.set(b, pulled(a[b]!));
  handSpell = !!want;
  if (rolled) rolled = null;
  // the wait runs from the ask, as a drop's does
  dropAt = performance.now();
  layoutCells();
  repaintCells(r);
  paintHeld(r);
  paintPanel();
}

/** Take a readout's roll; true when the birds' rest has moved and the cells want laying out. */
function takeRoll(r: Readout | null): boolean {
  if (r && r.spell === rolledFrom && (rolled !== null) === !!rollOf(r)) return false;
  rolledFrom = r ? r.spell : undefined;
  const next = rollOf(r);
  const same = JSON.stringify(next) === JSON.stringify(rolled);
  rolled = next;
  return !same;
}

/** The radius a value stands at: its percent of the house, on one straight line. */
function radiusFor(b: Bird, v: number): number {
  return starR * (pullIn + (1 - pullIn) * (percentOf(b, v) / 100));
}

/**
 * **How big a bird is drawn: a little smaller near the core, a little bigger
 * out at the rim** (Eugene, 09-23), read off the same percent the radius is, so
 * size and place say one thing. Exactly 1 at the house, which is why an
 * untouched ring's nodes are the drawing they always were.
 */
function sizeOf(radius: number): number {
  const p = ((radius / starR - pullIn) / (1 - pullIn)) * 100;
  if (p === 100) return 1;
  return p < 100
    ? SIZE_CORE + (1 - SIZE_CORE) * Math.max(0, p) / 100
    : 1 + (SIZE_RIM - 1) * Math.min(1, (p - 100) / (RIM_PERCENT - 100));
}

/** The spell a hand is holding: the held birds and nothing else, the house being absent. */
const heldSpell = (): Partial<Spell> | null => {
  if (!heldValue.size) return null;
  const out: Partial<Spell> = {};
  for (const [b, v] of heldValue) out[b] = v;
  return out;
};

/**
 * **What the ring itself last asked for** (round K30, the reviews of 09-26): the held
 * values at the ring's last commit, or at the outside ask it last stood at. A
 * genre key pressed while a hand is on a bird — or inside an arrow's 300 ms
 * commit — writes the address at once, and `followOutsideAsk` waits for the
 * hand; the drop then used to write the ring's held birds alone over it (the
 * five-bird Tech House preset became `em:0.73`). At a commit the address is
 * compared with this: where it moved, the ask from outside is the ground and
 * the hand's own moves since the ring last asked are laid over it.
 */
let ringAsked: Partial<Spell> | null = null;
/**
 * The address's spell, read once per address (the reviews of 09-26): the parse is kept against the search string it was read from.
 */
let askedFrom: string | null = null;
let askedWas: Partial<Spell> | null = null;
function askedSpell(): Partial<Spell> | null {
  const q = typeof location === 'undefined' ? '' : location.search;
  if (q !== askedFrom) {
    askedFrom = q;
    try { askedWas = (linkHere().spell || null) as Partial<Spell> | null; } catch (e) { askedWas = null; }
  }
  return askedWas;
}
/** The birds away from the house in a spell, by value. */
const offHouse = (sp: Partial<Spell> | null | undefined): Partial<Record<Bird, number>> => {
  const out: Partial<Record<Bird, number>> = {};
  if (sp) for (const b of BIRDS) { const v = sp[b]; if (typeof v === 'number' && Math.abs(v - HOUSE[b]) > 1e-9) out[b] = v; }
  return out;
};
/** Two spells the same to a hundredth's half (`SPELL_SAME`), a bird at the house the same as one not named. */
const sameAsk = (x: Partial<Spell> | null | undefined, y: Partial<Spell> | null | undefined): boolean => {
  const a = offHouse(x), b = offHouse(y);
  return BIRDS.every((k) => (a[k] ?? HOUSE[k]) - (b[k] ?? HOUSE[k]) <= SPELL_SAME && (b[k] ?? HOUSE[k]) - (a[k] ?? HOUSE[k]) <= SPELL_SAME);
};
/** The spell a commit asks for: the hand's held birds, over an outside ask that came in since the ring last asked. */
function spellToCommit(): Partial<Spell> | null {
  const outside = askedSpell();
  if (sameAsk(outside, ringAsked)) return heldSpell();
  const was = offHouse(ringAsked), held = offHouse(heldSpell()), ground = offHouse(outside);
  const out: Partial<Record<Bird, number>> = { ...ground };
  for (const b of BIRDS) {
    const moved = (was[b] ?? HOUSE[b]) !== (held[b] ?? HOUSE[b]);
    if (!moved) continue;
    if (held[b] == null) delete out[b]; else out[b] = held[b];
  }
  heldValue.clear();
  for (const b of BIRDS) if (out[b] != null) heldValue.set(b, out[b]!);
  return heldSpell();
}

/**
 * **Has *this bird's* promise landed** — is the value the set is playing the
 * value the hand is holding?
 *
 * It is asked one bird at a time, which is the correction UX-1's bugs round
 * made to it (Eugene, 09-20: *"it is unclear why changing one bird triggers
 * similar circles in other birds"*). The promise ring used to be one reading
 * for the whole ring, so pulling a second bird set every held cell's mark
 * closing again — including birds that had landed two seams ago and were not
 * waiting for anything. A promise is per bird because a bird is what a hand
 * moves; that the seam carrying them is one seam is the transport's business
 * and not a thing the ring has to draw eight times.
 *
 * The reading `sameSpell` takes, taken without building an object to take it
 * from: this is asked on every frame a bird is held.
 */
function birdLanded(b: Bird, spell: Readout['spell']): boolean {
  const held = heldValue.get(b) ?? HOUSE[b];
  const playing = (spell && (spell as Partial<Spell>)[b]) ?? HOUSE[b];
  // the one tolerance for the same spell (K30, `SPELL_SAME`, half a hundredth)
  return Math.abs(held - playing) <= SPELL_SAME;
}

/** And all eight of them, which is what the whole spell arriving means. */
function heldIsPlaying(spell: Readout['spell']): boolean {
  for (const b of BIRDS) if (!birdLanded(b, spell)) return false;
  return true;
}

/**
 * What a held bird is worth in the address bar, and the finest a cell can be
 * pulled to: **a hundredth**, which is what `spellQuery` writes a hand's value
 * as, so the ring never holds a number a link cannot carry and a link never
 * carries a decimal a hand did not ask for. What the title line prints is not
 * that number but its percent of the house (`bird-percent.ts`), a whole
 * percent read off the hundredth — presentation, never state.
 */
const pulled = (v: number) => +clamp(v, 0, 1).toFixed(2);

/**
 * **The phone's Less and More**: to the next whole `TAP_STEP` of a percent in
 * that direction — 95, 100, 105 — landed on a hundredth, because a hundredth is
 * what a link carries. The house itself is one of the steps and is landed on
 * exactly, so More from 95 % is the house and the bird is let go. A step never
 * moves nothing: on the short outer half, where a hundredth is less than a
 * percent, it moves by at least one.
 */
function stepPercent(b: Bird, v: number, dir: number, step = TAP_STEP): number {
  // from the percent the readout prints, so a hundredth that reads 104.8 is
  // stepped from the 105 a listener sees
  const p = percentShown(b, v);
  const to = clamp(dir > 0
    ? (Math.floor(p / step) + 1) * step
    : (Math.ceil(p / step) - 1) * step, 0, RIM_PERCENT);
  if (to === 100) return HOUSE[b];
  const want = pulled(valueOfPercent(b, to));
  if (want !== v) return want;
  return pulled(clamp(v + dir * 0.01, 0, 1));
}

// --- the bird's glyph ------------------------------------------------------
//
// One drawing per bird, and it never changes (Eugene, 09-23; `bird-glyph.ts`
// says why and how it is drawn). What used to be here — the sigil at rest, the
// musical icon under the pointer, the morph between them and the tumble on a
// throw — is gone, and with it every write a glyph ever made after its cell was
// built.
let pointed = -1;             // the cell under the pointer, or holding focus

// Which cell the hand or the keyboard is on. It is not a control: what a cell
// answers is its own reading, said in the tell.
function pointCell(cell: CellNode | null) {
  const i = cell ? cellNodes.indexOf(cell) : -1;
  if (i !== pointed) pointed = i;
  holdTell(cell);
}

/**
 * **The value a bird is playing at**: the set's own spell, not the hand's —
 * what the music has taken, which a pull reaches at the phrase line its drop
 * applies at and not before.
 */
const playingValue = (r: Readout | null, b: Bird): number =>
  (r && r.spell && (r.spell as Partial<Spell>)[b]) ?? HOUSE[b];

/**
 * **Ember's burn level follows the value the set is playing** (Eugene, 09-23:
 * *"a few variants for the burning level — from high flame to little sparkles
 * and smoke"*). A glyph with levels (`bird-glyphs.json`'s `variants`) is drawn
 * at the level its bird's *playing* value falls in, so a drop across 0.18 or
 * 0.66 changes the flame at the seam that carries it — never under a moving
 * hand, and never on a frame that is not a change of level. A glyph without
 * levels is never touched here, and at a level it already shows nothing is
 * written, so the glyphs stay the one drawing they are between two crossings.
 */
function paintGlyphLevels(r: Readout) {
  for (const c of cellNodes) followGlyph(c, r);
}

/**
 * **Under a hand the glyph follows the hand** (Eugene, round K3: *"icons should
 * change while the user is dragging the bird, with a little fade in/out
 * flip"*). The value a glyph shows is the hand's while a hand is on the bird or
 * holding it — the drag's provisional value, the phone's step or slider, the
 * value it was dropped at while the seam waits — and the set's playing value
 * otherwise; at the seam the two are one value, so nothing is left to change
 * there. A change of level is a **cross-fade** over `GLYPH_FADE`: the new
 * drawing is added over the old at nought and the two trade opacity on the
 * ring-silk clock (`runGlyphFade`), and then the old one is gone — no scale,
 * no turn, and nothing drawn at all when the level has not changed.
 */
const GLYPH_FADE = 150;

/**
 * **A bird's glyph keeps its own tilt** (Eugene, round K3: *"the icons in the
 * bird circles always keep their intended tilt despite the bird circle's
 * movement"* — and *"if the user is spinning the ring, it's okay to use the
 * physical tilt"*). The glyph is turned back by the star's continuous turn —
 * the sway, its ease, the drift — on the same frame the star is turned, so it
 * stands upright on the page whatever the sway does, and the lift, the size
 * and the off-axis play never turn it (the node only moves and scales). A
 * finger's spin is not taken off: the glyph whirls with its circle and, the
 * spin always ending on a whole turn, arrives upright with no snap.
 */
function uprightGlyphs() {
  const tr = `rotate(${(-swayDeg).toFixed(2)})`;
  for (const c of cellNodes) {
    put(c.glyph, 'transform', tr);
    if (c.glyphOut) put(c.glyphOut, 'transform', tr);
  }
}
function followGlyph(c: CellNode, r: Readout | null) {
  const key = BIRD[c.id].key;
  const v = controls && (c.pulling || c.held) ? c.value : playingValue(r, c.bird);
  const level = levelAt(key, v);
  if (level === c.glyphLevel) return;
  c.glyphLevel = level;
  if (c.glyphOut) c.glyphOut.remove();
  const incoming = el('g', { opacity: REDUCED ? 1 : 0, transform: `rotate(${(-swayDeg).toFixed(2)})` }, c.knot);
  drawBirdGlyph(incoming, key, birdR, glyphAt(key, v));
  if (REDUCED) { c.glyph.remove(); c.glyphOut = null; }
  else { c.glyphOut = c.glyph; c.fadeAt = performance.now(); }
  c.glyph = incoming;
}

function runGlyphFade(now: number) {
  for (const c of cellNodes) {
    if (!c.glyphOut) continue;
    const p = clamp((now - c.fadeAt) / GLYPH_FADE, 0, 1);
    put(c.glyph, 'opacity', p.toFixed(3));
    put(c.glyphOut, 'opacity', (1 - p).toFixed(3));
    if (p >= 1) { c.glyphOut.remove(); c.glyphOut = null; }
  }
}

// The two new dice arrive as { value, label }; read either shape.
// The other arm of the question is the die that is not a row, so what comes
// back is never the row itself; the cast is that, said where the checker
// cannot see it for itself.


/**
 * The tempo to print: the grid's, when the grid has been moved off this theme's
 * own, and the theme's otherwise. A tenth of a beat a minute is the resolution
 * the cell prints at, so anything under that is the same number and the reading
 * is the theme's — which is what keeps a set nobody has asked anything of
 * reading exactly as it always did.
 */
function tempoNow(r: Readout): number {
  const grid = r.gridBpm;
  return typeof grid === 'number' && Number.isFinite(grid) && Math.abs(grid - r.bpm) >= 0.1 ? grid : r.bpm;
}


/**
 * **What a cell prints** (round K13): the quantity its own bird biases as the
 * big word, the seed's locked reading as the subtitle — `bird-labels.ts`, the
 * one author, which the memo reads too. Under a strategy that reads no spell
 * (the record) it is the locked reading whole, as it always was. The tempo is
 * the grid's while a seam glides (`tempoNow`).
 */
function cellValue(id: CellId, r: Readout): CellValue {
  return cellReading(birdOf(id), { ...r, bpm: tempoNow(r) } as LabelTheme, labelStyle(r));
}
/** The style whose quantities the cells say: the playing strategy's, where it reads the spell. */
function labelStyle(r: Readout) {
  const s = STRATEGIES[r.strategy];
  return s && switchOn(s.style, 'derived') ? s.style : null;
}

// A cell is a reading, so touching it explains the reading rather than
// changing it. Every line comes from the same readout the cell is drawn from,
// and since the compass round it opens with what the bird means — the one line
// off `birds.md`, said where there is room for it rather than crowded into the
// cell beside the value it is about.
// --- the section plan -----------------------------------------------------
/** The build section's dash on the track, in ring units: the ornament, the focus mark and the dotted lines are the same dash (K30: one value, where the build's dash was typed a second time). */
const ORN_DASH = [9, 6];
const SECTION: Record<string, { short: string; dash: string | null; op: number }> = {
  intro: { short: 'int', dash: '3 9', op: 0.45 },
  build: { short: 'bld', dash: ORN_DASH.join(' '), op: 0.72 },
  main: { short: 'grv', dash: null, op: 0.82 },
  breakdown: { short: 'brk', dash: '2 9', op: 0.34 },
  drop: { short: 'drp', dash: null, op: 1 },
  outro: { short: 'out', dash: '14 8', op: 0.5 },
};

// ==========================================================================
const control = createControl();
// the ledger's faults, reported where the listener's switch is on (K33)
reportFaults(control);
installDebug(control);

const $ = (id: string) => document.getElementById(id);
// Every one of these is a mark of `index.html`'s own sigil and the ring has
// never run without them — the page is the module's container and not something
// it goes looking through — so each is taken as the element the page promises
// rather than threading a null down through every draw. The one lookup that is
// genuinely allowed to come back empty is `say`, and it is tested where it is
// used.
const stage = $('stage')!;
const tiltEl = $('tilt')!;
const outerSvg = $('outer')!;
const innerSvg = $('inner')!;
const glowSvg = $('glow')!;
const gRim = $('rim')!;
const gTimeline = $('timeline')!;
const gSpin = $('spin')!;
const gCells = $('starCells')!;
const gCore = $('core')!;
const gLive = $('live')!;
const gOuterLive = $('outerLive')!;
const gInnerLive = $('innerLive')!;
const starSvg = $('star')!;
const gStarLive = $('starLive')!;
const gStarLines = $('starLines')!;
// the words' own sheet: over the lines, under the birds and their lights
const gStarWords = $('starWords')!;

// The mandala: the star **sways about north** rather than turning a whole
// circle a theme, and it is read off the same clock as the cursor.
//
// Eugene's rule, once the cells became a compass: *"it is imperative we keep
// the circles roughly in the same area: after a big spin they should still land
// with Earth at the top; keep the current asymmetrical movement for liveness,
// but assume the north point (Earth/Root) never goes further than 20 degrees
// from north."* The bird at north is Ember since the compass was turned upside
// down (09-23); the rule is about north and not about Root. A compass that has
// turned is not a compass, and the ring now
// says which bird is which by where it stands, so the whole turn had to go.
//
// What it became is an **excursion and not a revolution**, and it is still a
// reading: one cycle of a sine over the theme's own progress, so the star leans
// right through the first quarter, passes north at the half, leans left through
// the third and comes home at the seam — where the next theme starts from the
// same place, which makes a hand-over seamless as a side effect. Since 09-23
// its size and its wander's pace are a curve of the tempo (`swayOf`) — at most
// ten degrees and two and a bit of drift, 12.3° — and every bird is held by
// a clamp inside fifteen degrees of home (`inDomain`), which is Eugene's rule
// now in place of the twenty. The uneven-speed feel is the drift's, and it
// stays.
//
// A throw still leans the star, because how hard the dice were thrown is a
// thing worth watching; the lean is held inside the birds' domains and turns
// no faster than `STAR_SPEED`, and `spinAngle` relaxes onto the nearest whole
// turn and is dropped, which is the north bird back at the top.
//
// The whole star turns as one sheet — geometry and cells together, so the
// lines keep running through the nodes that sit on them. The words ride the
// same sheet on its unfiltered sibling and are each held upright by a rotation
// of their own, which is why nothing inside the bloom is ever written.
//
// A system that asks for less motion gets none at all, and the north bird sits
// exactly north. (`STAR_TURN`, a switch that was only ever 1, is gone: round
// (f) of the reconciled review of 09-24, R127.)
/**
 * **The sway is a curve of the tempo, and every bird stays home** (Eugene,
 * 09-23: *"the movement of the bird bullets should be a bit slower — could be
 * proportional to BPM — and the positions of birds should not leave their
 * domains for more than 15° left or right. Now they travel far enough to be
 * accidentally picked as the neighbour bird for adjustment."*)
 *
 * Two anchors, tuned by ear, like the pulse's: `sway` is the excursion the
 * theme's own progress draws, `drift` the slow two-sine wander over it, and
 * `pace` how fast that wander runs (1 is its seven- and thirteen-second
 * periods, a half twice as slow). At `SWAY_FAST` and above the most there is —
 * smaller than the sixteen and two and a bit the ring swayed by before, which
 * reached 18.3°; at `SWAY_SLOW` and below the least; between them an S-curve in
 * the logarithm of the tempo. A change of tempo glides onto the new curve over
 * `SWAY_EASE`, so a seam never steps it.
 */
const SWAY_FAST = { bpm: 120, sway: 10, drift: 2.3, pace: 1 };
const SWAY_SLOW = { bpm: 60, sway: 5, drift: 1, pace: 0.5 };
/**
 * **No bird ever stands further than `BIRD_DOMAIN` degrees from its own home
 * direction** — neighbours are forty-five apart — whatever moved it: the sway,
 * its ease, a throw and its settle, the wander, a hand's off-axis play. It is a
 * clamp on the drawn position (`inDomain`), with the whole star's turn held a
 * degree inside it so a vertex drawn a frame behind the star cannot overshoot.
 * And the drawn star never turns faster than `STAR_SPEED` degrees a second.
 * A pointer further than `BIRD_HIT_DOMAIN` from a bird's home never picks it.
 */
const BIRD_DOMAIN = 15;
const BIRD_HIT_DOMAIN = 18;
const STAR_SPEED = 20;
const SWAY_EASE = 1200;   // how slowly the excursion follows its reading, in ms: a jump in the reading is a glide
// The excursion as it is drawn, which follows its reading and is never set to
// it (`frame`); null until the first frame takes the reading. And the curve as
// it is drawn, eased the same way, the drift's own clock, and the turn shown.
let sway: number | null = null;
let swayAt = 0;
let swayCurve: { sway: number; drift: number; pace: number } | null = null;
let driftT = 0;
let starShown: number | null = null;
// the clamped, continuous part of the star's turn as drawn — what a bird's
// domain is measured against; a finger's spin is added on top of it
let swayDeg = 0;

/** The sway's curve at a tempo: `SWAY_SLOW` below its tempo, `SWAY_FAST` above, an S-curve in log tempo between. */
function swayOf(bpm: number): { sway: number; drift: number; pace: number } {
  const t = bpm > 0 ? clamp(Math.log(bpm / SWAY_SLOW.bpm) / Math.log(SWAY_FAST.bpm / SWAY_SLOW.bpm), 0, 1) : 1;
  const s = t * t * (3 - 2 * t);
  const mix = (a: number, b: number) => a + (b - a) * s;
  return { sway: mix(SWAY_SLOW.sway, SWAY_FAST.sway), drift: mix(SWAY_SLOW.drift, SWAY_FAST.drift), pace: mix(SWAY_SLOW.pace, SWAY_FAST.pace) };
}
// How far a cell and its vertex wander from their place. 0 is a rigid drawing;
// six gives about twelve units peak to peak, enough that no square is ever
// quite true and the shape keeps changing, and far short of the hundred units
// of clear ground between a cell and anything else.
const STAR_FLEX = 6;
// **Reduced motion rests what is decorative and draws what is state** (R53):
// the sway, the drift, the wander, the lean under the pointer, the wobble, the
// pulse's swell and the breath, the cast's turn and the flash all rest; a bird
// moved by a hand, a seam's colour step, the fill, the beat dot and the cursor
// still draw, as one write each and never as an ease. Read live (`motion.ts`),
// so a preference changed with the page open is honoured at once.
let REDUCED = reducedMotion.on;
// A finger, rather than a pointer that can rest on a thing. It decides two
// unrelated questions and both are downstream of the same fact: the live layer
// is drawn every other frame (in `frame`), and an explanation is held open by
// a timer rather than by the hand, because there is nothing to hover with.
// Live as well: a tablet that gains a mouse redraws its words for a mouse.
let COARSE = coarsePointer.on;
// Where the star stands, in degrees off north. It starts at nought rather than
// at a sentinel, because nought is now a legal angle and the sway is as often
// to the left of north as to the right.
let starDeg = 0;
let wordStep = 0;

let last: Readout | null = null;
let lastChange = -1;
let lastBar = -1;
let lastPlanKey = '';
let spinAngle = 0;
/**
 * **A throw is one motion onto home** (Eugene, round K9: *"it stops randomly
 * and then another half-ring spin places the birds in position"*). At the lift
 * the turn the swipe's speed would coast to (the speed times `SPIN_COAST`, the
 * old decay's whole distance) is rounded to a whole turn — every bird back in
 * its own house — never behind where the star is going; and the star is driven
 * there on one ease-out, `a0 + D (1 − (1 − p)³)`, whose opening speed is the
 * swipe's own (so its length is `3 D / v0`): it slows all the way and stops on
 * the turn, with no second movement, no reversal and no snap. A harder swipe
 * is more turns and a longer stop. The stop is held between `SPIN_MIN_S` and
 * `SPIN_MAX_S`: a soft swipe that has already turned the star part of the way
 * round still has the rest of a turn to go, and at its own speed that would be
 * ten seconds of crawl — so it opens a little faster than the finger left it
 * and is home in three. A turn that was not a throw relaxes home the same way
 * over `SPIN_SETTLE_MS`.
 */
let spinEase: { a0: number; d: number; t0: number; dur: number } | null = null;
function spinHome(v0: number) {
  const a0 = spinAngle;
  const coast = v0 * SPIN_COAST;
  let to = Math.round((a0 + coast) / 360) * 360;
  if (v0 > 0) to = Math.max(to, Math.ceil(a0 / 360) * 360);
  if (v0 < 0) to = Math.min(to, Math.floor(a0 / 360) * 360);
  const d = to - a0;
  if (Math.abs(d) < 1e-6) { spinAngle = 0; spinEase = null; return; }
  const dur = v0 && Math.sign(v0) === Math.sign(d)
    ? clamp((3 * Math.abs(d)) / Math.abs(v0), SPIN_MIN_S, SPIN_MAX_S)
    : SPIN_SETTLE_MS / 1000;
  spinEase = { a0, d, t0: performance.now(), dur };
}
let dragFrac: number | null = null;     // where a scrub is holding the cursor, while it lasts
// The progress the star is turned to. A drag along the band moves the cursor
// and the played overlay and nothing else: the star is the dice's own gesture,
// and turning it under a scrub as well said the same thing twice. So while a
// hand is on the band the star holds where the record had got to, and takes
// the new reading when the hand lets go.
let starFrac = 0;
let transition = 0;

// ==========================================================================
// the rim: the frame of the timeline, and nothing else
function buildRim() {
  clear(gRim);
  // inner edge of the band — where dragging to seek starts
  el('path', { class: 'ln hair', d: circlePath(R_BAND_IN), opacity: 0.5 }, gRim);
  // outer edge of the band — where dragging to seek stops
  el('path', { class: 'ln hair', d: circlePath(R_BAND_OUT), opacity: 0.5 }, gRim);
}

// ==========================================================================
// the timeline: seven lanes, the plan, the numbers
// The coming theme's lanes and its line of text live beside the bloomed rim,
// not inside it: they move every frame through a seam, and a move inside the
// filtered group re-blurred the whole band each time.
// The two are built in one pass and cleared in one pass, so a guard on either
// of them covers both.
let nextLaneG: Mark<SVGGElement> | null = null;
let nextInfoText: Mark<SVGTextElement> | null = null;

// One lane is drawn as three circles of the same radius, one per loudness
// step, each with a dash pattern that is literally the bars it plays.
function laneDashes(levels: ArrayLike<number>, bars: number, r: number, want: number) {
  const per = (TAU * r) / bars;
  const runs: number[] = [];
  let cur = levels[0] === want;
  let run = 0;
  for (let b = 0; b < bars; b++) {
    const isOn = levels[b] === want;
    if (isOn === cur) { run++; continue; }
    runs.push(run);
    cur = isOn;
    run = 1;
  }
  runs.push(run);
  // A dash list starts with ink. If bar zero is silent, open with nothing.
  const arr = levels[0] === want ? runs : [0, ...runs];
  if (arr.length % 2) arr.push(0);
  if (!arr.some((v, i) => i % 2 === 0 && v > 0)) return null;
  return arr.map((v) => +(v * per).toFixed(3)).join(' ');
}

const LANE_OP = [0, 0.26, 0.55, 0.92];

// `halo` draws a wider, fainter copy under each dash: the glow the bloom
// filter gives the band, for lanes drawn outside it.
function drawLanes(
  parent: Node, lanes: Lanes, bars: number,
  { rOffset = 0, scale = 1, dim = 1, initials = true, halo = false }: {
    rOffset?: number; scale?: number; dim?: number; initials?: boolean; halo?: boolean;
  } = {},
) {
  const out: Mark<SVGPathElement>[] = [];
  LANES.forEach((L, i) => {
    const r = R_LANE0 + i * R_LANE_GAP + rOffset;
    const levels = lanes.level[L.id];
    for (let want = 1; want <= 3; want++) {
      const dash = laneDashes(levels, bars, r, want);
      if (!dash) continue;
      if (halo) {
        const h = el('path', {
          class: 'ln',
          d: circlePath(r),
          'stroke-width': (5.4 * scale + 7).toFixed(1),
          'stroke-linecap': 'butt',
          opacity: (LANE_OP[want] * dim * 0.16).toFixed(3),
        }, parent);
        h.style.strokeDasharray = dash;
      }
      // this lane at this loudness: where <instrument> plays, and how thickly
      const p = el('path', {
        class: 'ln',
        d: circlePath(r),
        'stroke-width': (5.4 * scale).toFixed(1),
        'stroke-linecap': 'butt',
        opacity: (LANE_OP[want] * dim).toFixed(3),
      }, parent);
      p.style.strokeDasharray = dash;
      out.push(p);
    }
    if (initials) {
      // which lane this is, said once, just before the theme starts
      const f = -0.012 - i * 0.0045;
      txt(parent, L.initial, px(f, r).toFixed(1), (py(f, r) + 3.5).toFixed(1), 10, { op: 0.55, ls: 0, class: 'laneKey' });
    }
  });
  return out;
}

function buildTimeline(r: Readout) {
  clear(gTimeline);
  // The lanes are drawn once and bloomed once. The part already played is
  // dimmed by a shade in the live layer (setPlayedSplit), not by a clip in
  // here: a clip that moved with the cursor re-blurred the whole rim every
  // half second, which on WebKit was a 125 ms frame each time.
  // a readout with no lanes on it is a transport with no theme, which is not a
  // thing the ring is ever handed: it is drawn from the first readout onwards
  drawLanes(gTimeline, r.lanes!, r.bars, {});
  lastShadeF = -1;
  if (nextLaneG) { clear(nextLaneG); put(nextLaneG, 'opacity', 0); }
  if (nextInfoText) { nextInfoText.textContent = ''; put(nextInfoText, 'opacity', 0); }

  // the plan: which section each stretch of the theme is
  for (const s of r.plan) {
    const st = SECTION[s.kind] || SECTION.main;
    const f0 = s.startBar / r.bars;
    const f1 = (s.startBar + s.bars) / r.bars;
    const p = el('path', {
      class: 'ln',
      d: arcPath(R_SEC, f0, Math.min(f1 - 0.002, 0.9999)),
      'stroke-width': 6.5,
      'stroke-linecap': 'butt',
      opacity: st.op,
    }, gTimeline);
    if (st.dash) p.style.strokeDasharray = st.dash;
    // where this section begins, cut through every lane
    el('path', {
      class: 'ln hair',
      opacity: 0.6,
      d: `M${px(f0, R_BAND_IN).toFixed(1)} ${py(f0, R_BAND_IN).toFixed(1)} L${px(f0, R_SEC + 6).toFixed(1)} ${py(f0, R_SEC + 6).toFixed(1)}`,
    }, gTimeline);
    // the name of the section, when its arc is long enough to hold one and
    // it does not land on twelve o'clock, which belongs to the lane key
    const fm = f0 + Math.min(0.022, (f1 - f0) * 0.4);
    if (f1 - f0 >= 0.022 && fm < 0.972 && fm > 0.012) {
      txt(gTimeline, st.short, px(fm, R_SEC_TXT).toFixed(1), (py(fm, R_SEC_TXT) + 4).toFixed(1), 11, { op: 0.62, ls: 0.24 });
    }
  }

  // bar numbers: every sixteen bars, or wider on a long theme so the rim
  // stays readable instead of becoming a ruler
  const minuteFracs: number[] = [];
  for (let m = 1; m * 60 < r.duration; m++) {
    const f = (m * 60) / r.duration;
    if (f < 0.965) minuteFracs.push(f);
  }
  const step = r.bars > 192 ? 64 : r.bars > 96 ? 32 : 16;
  for (let b = step; b < r.bars; b += step) {
    const f = b / r.bars;
    if (minuteFracs.some((mf) => Math.abs(mf - f) < 0.022)) continue;
    txt(gTimeline, String(b), px(f, R_NUM).toFixed(1), (py(f, R_NUM) + 4).toFixed(1), 11, { op: 0.4, ls: 0.1, raw: true });
  }
  // the minutes, so the ring is a clock as well as a plan
  minuteFracs.forEach((f, i) => {
    el('path', {
      class: 'ln hair',
      opacity: 0.55,
      d: `M${px(f, R_BAND_OUT).toFixed(1)} ${py(f, R_BAND_OUT).toFixed(1)} L${px(f, R_SEC + 10).toFixed(1)} ${py(f, R_SEC + 10).toFixed(1)}`,
    }, gTimeline);
    txt(gTimeline, `${i + 1}:00`, px(f, R_NUM).toFixed(1), (py(f, R_NUM) + 4).toFixed(1), 11, { op: 0.72, ls: 0.1, raw: true });
  });
}

// Which coming plan's lanes are drawn, by the lanes' own identity: `lanesOf`
// keeps one per plan, so a pull or an engine switch that re-plans the coming
// theme under the same seed is a new plan and is drawn again (R62). It was the
// theme's seed, and the band showed the old plan's lanes for the whole approach
// while the line beside it named the new one.
let nextDrawnFor: object | null = null;
function paintNext(r: Readout | null) {
  if (!nextLaneG) return;
  // The coming theme shows through as the seam nears, then crosses over it.
  const approach = r ? (r.mix.approach || 0) * 0.45 : 0;
  const t = Math.max(transition, r ? r.mix.transition : 0, approach);
  const info = r && r.mix.next;
  if (!info || t <= 0.001) {
    put(nextLaneG, 'opacity', 0);
    put(nextInfoText!, 'opacity', 0);
    // give the band its own brightness back: a seam that came and went, or a
    // seek away from one, must not leave the lanes dimmed
    put(shadeAll, 'fill-opacity', 0);
    return;
  }
  if (nextDrawnFor !== info.lanes) {
    nextDrawnFor = info.lanes;
    clear(nextLaneG);
    // the coming theme's lanes, so the next minutes are visible before they play
    drawLanes(nextLaneG, info.lanes!, info.bars, { rOffset: -5, scale: 0.42, dim: 1, initials: false, halo: true });
  }
  // the crossing: the next theme slides into the band as the old one leaves
  const slide = 5 * t;
  put(nextLaneG, 'transform', `translate(${C} ${C}) scale(${(1 + (slide / R_LANE0)).toFixed(4)}) translate(${-C} ${-C})`);
  put(nextLaneG, 'opacity', (0.22 + 0.7 * t).toFixed(3));
  // the band behind it dims as it arrives: a shade over the whole band, under
  // the coming lanes, in the layer that is repainted anyway
  const fade = t > 0.02 ? 1 - t * 0.75 : 1;
  put(shadeAll, 'fill-opacity', ((1 - fade) * SHADE_SEAM).toFixed(3));
  const label = `${String(info.key).replace('minor', 'min').replace('dorian', 'dor')} · ${info.bpm} · ${info.durationLabel}`;
  if (nextInfoText!.textContent !== label.toUpperCase()) nextInfoText!.textContent = label.toUpperCase();
  put(nextInfoText!, 'opacity', (0.25 + 0.5 * t).toFixed(3));
}

// ==========================================================================
// the star: it binds the eight cells, and carries the chord loop

// Where a vertex of the star stands at this moment: its place, plus a slow
// wander on two sines an axis, a different pace for every corner.
const FLEX: { px: number; py: number; ax: number; ay: number; qx: number; qy: number; bx: number; by: number }[] = [];
for (let i = 0; i < 8; i++) {
  FLEX.push({
    px: 5 + ((i * 2.7) % 6), py: 7 + ((i * 1.9) % 4),
    ax: (i * 1.13) % TAU, ay: (i * 2.41) % TAU,
    qx: 9 + ((i * 1.3) % 2), qy: 11 - ((i * 0.9) % 3),
    bx: (i * 0.71) % TAU, by: (i * 1.77) % TAU,
  });
}

// **The star bends with the birds** (Eugene, 09-20, on the built ring: *"I don't
// like the vertical bars by the circles; the previous approach of moving the
// lines to the birds was a stellar UX idea"*). The octagon and the two squares
// are drawn through wherever the eight cells stand, so a vertex **is** a node:
// pull a bird and the frame it is read against comes with it, and the shape of
// the star is the shape of the spell.
//
// This is UX-1's own drawing, put back. The bug round took it out along with
// the fault it was asked to fix, and the two were not the same thing: what was
// wrong was the **snap back** — a release rebuilt the eight cells, every value
// went home and the star sprang to the regular octagon — and not the bending.
// A value stays where the hand left it now (§3 of `notes/archive/2026-09-v2-day-chain/rounds/cells-ux1-bugs.md`
// fixed the rebuild), so the bent star stays bent, and the sway rides on top of
// it as it always has.
//
// The hairline spoke and its three-tick scale that stood in for the bending are
// gone with it: they were a second drawing of the one thing the star now says
// for itself, and a mark that repeats a mark is one mark too many.
//
// **At the house nothing bends**: every `cellR[i]` is `R_STAR` by the
// arithmetic of `radiusFor`, so the three shapes come out as the paths they
// have always been and the four blessed pictures do not move.
/**
 * A point on cell `i`'s own spoke at radius `r`, moved `side` units along the
 * tangent: where a bird stands, off-axis play included.
 */
function onSpoke(i: number, r: number, side: number): Pt {
  const a = ang(i / 8);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [C + c * r - s * side, C + s * r + c * side];
}

/**
 * The transform that carries a cell's lights — drawn round its rest place
 * `(x, y)` — onto where the node stands, at the size it is drawn at. At size
 * one it is the translate it has always been.
 */
function haloAt(x: number, y: number, kx: number, ky: number, sz: number): string {
  if (sz === 1) return `translate(${(kx - x).toFixed(2)} ${(ky - y).toFixed(2)})`;
  return `translate(${kx.toFixed(2)} ${ky.toFixed(2)}) scale(${sz.toFixed(4)}) translate(${(-x).toFixed(2)} ${(-y).toFixed(2)})`;
}

/** How big cell `i` is drawn now: its place's size, and the lift of a hand on it. */
const drawnSize = (i: number) => sizeOf(cellR[i]) * (1 + LIFT * cellLift[i]);

const FLEX_A = STAR_FLEX * 0.6;
const FLEX_B = FLEX_A * 0.7;
/** The furthest the wander carries a bird off its place along either axis. */
const FLEX_REACH = FLEX_A + FLEX_B;
function wanderAt(i: number, t: number): Pt {
  if (!STAR_FLEX || REDUCED) return [0, 0];
  const f = FLEX[i];
  return [
    FLEX_A * Math.sin((TAU * t) / f.px + f.ax) + FLEX_B * Math.sin((TAU * t) / f.qx + f.bx),
    FLEX_A * Math.sin((TAU * t) / f.py + f.ay) + FLEX_B * Math.sin((TAU * t) / f.qy + f.by),
  ];
}
/**
 * **The wander is held under a hand** (round K8). A bird a hand is pulling
 * keeps the wander it had when the pull began, so the hand alone moves it;
 * let go, it eases back into the star's wander over `OFF_AXIS_EASE`, with the
 * float back onto its spoke. `wanderHold` is how much of the held wander is in
 * the drawing: 1 under the hand, easing to nought after.
 */
const wanderHold = new Float64Array(8);
const wanderHoldTo = new Float64Array(8);
const wanderHeld: Pt[] = Array.from({ length: 8 }, () => [0, 0] as Pt);
function holdWander(i: number, on: boolean) {
  if (i < 0) return;
  if (on) {
    wanderHeld[i] = wanderAt(i, flexT());
    wanderHold[i] = wanderHoldTo[i] = 1;
  } else wanderHoldTo[i] = 0;
  cellsMoved = true;
}

function vertexAt(i: number, t: number, at?: number): Pt {
  const r = at == null ? cellR[i] : at;
  let [x, y] = onSpoke(i, r, at == null ? cellSide[i] : 0);
  const [lx, ly] = wanderAt(i, t);
  const h = at == null ? wanderHold[i] : 0;
  x += h ? wanderHeld[i][0] * h + lx * (1 - h) : lx;
  y += h ? wanderHeld[i][1] * h + ly * (1 - h) : ly;
  return at == null ? inDomain(i, x, y) : [x, y];
}

/**
 * **A bird inside its domain**: its drawn position turned back, at its own
 * radius, until it stands no more than `BIRD_DOMAIN` degrees from its home
 * direction once the star's own turn is added — whatever put it further.
 */
function inDomain(i: number, x: number, y: number): Pt {
  const home = ang(i / 8);
  let d = Math.atan2(y - C, x - C) - home;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  // A degree inside the domain, like the star's own turn: a vertex is drawn
  // at most thirty frames a second and the star can turn a little between two
  // of them, so the degree is what keeps a drawing a frame old inside fifteen.
  const lim = ((BIRD_DOMAIN - 1) * Math.PI) / 180;
  const turned = (swayDeg * Math.PI) / 180;
  const to = clamp(d, -lim - turned, lim - turned);
  if (to === d) return [x, y];
  const r = Math.hypot(x - C, y - C);
  return [C + Math.cos(home + to) * r, C + Math.sin(home + to) * r];
}

/** The wander's own clock, in seconds — nought where there is no wander. */
const flexT = () => (STAR_FLEX && !REDUCED ? performance.now() / 1000 : 0);

/** The eight vertices as path text, where the birds stand at `t`. */
function starVerts(t: number): string[] {
  const v: string[] = [];
  for (let i = 0; i < 8; i++) { const [x, y] = vertexAt(i, t); v.push(`${x.toFixed(2)} ${y.toFixed(2)}`); }
  return v;
}
function starPaths(t: number, v: string[] = starVerts(t)) {
  return [
    `M${v[0]} L${v[2]} L${v[4]} L${v[6]} Z`,
    `M${v[1]} L${v[3]} L${v[5]} L${v[7]} Z`,
    `M${v[0]} L${v[1]} L${v[2]} L${v[3]} L${v[4]} L${v[5]} L${v[6]} L${v[7]} Z`,
  ];
}

// One of the star's three shapes: the wide faint stroke standing in for the
// bloom, the line itself, and the path data both were last written with.
let flexLines: { wide: Mark<SVGPathElement>; crisp: Mark<SVGPathElement>; put: string }[] = [];

function buildSpin(r: Readout) {
  clear(gSpin);
  clear(gStarLines);
  // the circle the eight cells sit on: it does not move, so it keeps the bloom
  el('path', { class: 'ln hair', d: circlePath(starR), opacity: 0.6 }, gSpin);

  // **The frame** (round K13): the two squares and the octagon are the star's
  // geometry, drawn as they always were, and they are not a claim about which
  // bird reaches which — that is measured, and the truth is the dotted lines
  // drawn after them from `bird-influence.ts` (the spell layer's own biases
  // against the dice each cell reads, held to the measured matrix by
  // tools/check.ts). They breathe, so each is drawn twice: a wide faint stroke
  // standing in for the bloom, and the line itself over it.
  flexLines = [];
  const style = [
    { w: 1.6, op: 0.75, hw: 5.5, hop: 0.1 },
    { w: 1.6, op: 0.75, hw: 5.5, hop: 0.1 },
    { w: THIN_LINE.w, op: THIN_LINE.op, hw: 4.5, hop: 0.06 },
  ];
  // **The sway keeps its phase across a rebuild.** Drawn at nought the three
  // shapes would stand at the wander's own zero for up to a frame and then jump
  // back onto the clock; drawn at the clock they are where they already were.
  const verts = starVerts(flexT());
  const ds = starPaths(flexT(), verts);
  ds.forEach((d, i) => {
    const st = style[i];
    const wide = ink(el('path', { d, fill: 'none', 'stroke-width': +(st.hw * starK).toFixed(3), opacity: st.hop, 'stroke-linejoin': 'round' }, gStarLines), 'stroke', '#f2c14e');
    const crisp = el('path', { class: 'ln', d, 'stroke-width': +(st.w * starK).toFixed(3), opacity: st.op }, gStarLines);
    flexLines.push({ wide, crisp, put: d });
  });
  buildLinks(r, verts);
}

// --- the lines of function (round K13) ---------------------------------------
//
// Eugene, 2026-09-24: *"we do need lines to all birds connected by function —
// but a dotted line, so we keep the geometric structure of the original vision
// while adding a statement of truth … if there is a strong line already we
// don't downgrade it to dotted."* Every pair of birds `bird-influence.ts` joins
// and the frame does not is drawn **dotted** — dashed, in the track's own
// build dash (`ORN_DASH` 9 6 in ring units, the ornament's since K12b) —
// in the octagon's own weight (`THIN_LINE`, round K13b: *"the same thickness
// as the thin lines that connect each bird on the circle path"*); a pair the
// frame already joins keeps its strong line. It runs whole from bird to bird,
// under the transport, whose ground is a translucent disc (`CORE_GROUND`), so
// the geometry reads unbroken and the dashes peek through faintly. And the move's own lines light: while a hand holds a bird — the
// drag, the phone's slider, and from the drop until the value plays — the line
// between it and every bird whose reading the move changes (`consequent`,
// round K11b) is drawn over at full strength, dotted or strong, easing over
// `MARK_EASE` and carried across a rebuild. Nothing else changes.
//
// **And the lines into it are traced** (K14, Eugene's pick of the three: *"the
// faint trace"*). While a hand holds a bird, every line along which another
// bird reaches it — an edge *into* the held bird, a bird whose value would
// change its reading — is drawn over as the dash in the lit line's own colour
// and width at `TRACE_OP`, one constant, easing as the lit lines do. So a
// hand on Zephyr says "these feed me, I feed none", and a hand on Ember lights
// Ember–Zephyr and traces what feeds Ember. A line both ways round is lit where
// the move changes the other bird and traced where it does not. At rest
// nothing is drawn.
/** The octagon's line, and every dashed line of function with it: one pair (round K13b). */
const THIN_LINE = { w: 1.1, op: 0.4 };
/**
 * **A dash's own opacity** (K14): the dashes keep the octagon's weight
 * (`THIN_LINE.w`, Eugene's ask in K13b) and take an opacity of their own, so
 * a dash reads 3:1 or better on the black on a phone at device scale 1, where
 * the line is half a pixel wide; the octagon's own stays `THIN_LINE.op`.
 */
const DASH_OP = 0.8;
/**
 * The transport's ground: a disc of the page's black under the core, at this
 * opacity, so a line running under the centre peeks through faintly and the
 * play and skip still read (round K13b). The glyphs and their halos are drawn
 * over it at full.
 */
const CORE_GROUND = 0.55;
const LIT_WIDE_W = 6;         // the lit line's soft stroke, in units (the transport's halo's)
const LIT_WIDE_OP = 0.3;
const LIT_PX = 2;             // and its crisp line, in screen pixels
/** A line into the held bird, traced: the dash in the lit line's colour and width, this faint (K14). */
const TRACE_OP = 0.45;
interface LinkLine { a: number; b: number; kind: 'square' | 'octagon' | 'dotted'; declared: boolean;
  /** which end reaches the other, by the model: `a` into `b`, `b` into `a` */
  aToB: boolean; bToA: boolean;
  dot: Mark<SVGPathElement> | null; trace: Mark<SVGPathElement>; wide: Mark<SVGPathElement>; crisp: Mark<SVGPathElement>;
  lit: number; traced: number; put: string; said: string }
let linkLines: LinkLine[] = [];
const linkLit = new Map<string, number>();
const linkTraced = new Map<string, number>();
const dotW = () => THIN_LINE.w * starK;
const litW = () => clamp(LIT_PX / unitPx, 1, 8);
const dashOf = () => `${ORN_DASH[0]} ${ORN_DASH[1]}`;

/** The declared lines under the playing strategy, and one lit overlay for every line the ring draws between two birds. */
function buildLinks(r: Readout, verts: string[]) {
  for (const l of linkLines) { linkLit.set(`${l.a}-${l.b}`, l.lit); linkTraced.set(`${l.a}-${l.b}`, l.traced); }
  linkLines = [];
  const style = labelStyle(r);
  const links = style ? linksOf(style) : [];
  const under = el('g', { class: 'links' }, gStarLines);
  const pairs: Array<{ a: number; b: number; kind: LinkLine['kind']; declared: boolean; aToB: boolean; bToA: boolean }> = [];
  for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) {
    const decl = links.find((l) => l.a === a && l.b === b);
    const frame = frameLine(a, b);
    const aToB = !!decl && decl.edges.some((e) => e.from === COMPASS[a]);
    const bToA = !!decl && decl.edges.some((e) => e.from === COMPASS[b]);
    if (decl || (frame && style)) pairs.push({ a, b, kind: decl ? decl.kind : frame!, declared: !!decl, aToB, bToA });
  }
  // the dotted lines first, under every lit one (in the gold the frame's lines
  // wear, but not of their class: the frame is the three `ln` shapes alone)
  for (const p of pairs) {
    const d = `M${verts[p.a]} L${verts[p.b]}`;
    let dot: Mark<SVGPathElement> | null = null;
    if (p.kind === 'dotted') {
      dot = el('path', { class: 'dot', d, fill: 'none', stroke: 'url(#gold)', 'stroke-width': dotW().toFixed(3), 'stroke-linecap': 'butt', opacity: DASH_OP, 'data-link': `${p.a}-${p.b}` }, under);
      dot.style.strokeDasharray = dashOf();
    }
    linkLines.push({ ...p, dot, trace: null!, wide: null!, crisp: null!, lit: linkLit.get(`${p.a}-${p.b}`) ?? 0,
      traced: linkTraced.get(`${p.a}-${p.b}`) ?? 0, put: d, said: '' });
  }
  const over = el('g', { class: 'links' }, gStarLines);
  for (const l of linkLines) {
    const at = l.kind === 'dotted' ? under : over;
    l.trace = ink(el('path', { class: 'trace', d: l.put, fill: 'none', 'stroke-width': litW().toFixed(2), 'stroke-linecap': 'butt', opacity: 0 }, at), 'stroke', '#ffeec0');
    l.trace.style.strokeDasharray = dashOf();
    l.wide = ink(el('path', { class: 'lit', d: l.put, fill: 'none', 'stroke-width': (LIT_WIDE_W * starK).toFixed(2), 'stroke-linecap': 'round', opacity: 0 }, at), 'stroke', '#ffe0a0');
    l.crisp = ink(el('path', { class: 'lit', d: l.put, fill: 'none', 'stroke-width': litW().toFixed(2), 'stroke-linecap': l.kind === 'dotted' ? 'butt' : 'round', opacity: 0 }, at), 'stroke', '#ffeec0');
    if (l.kind === 'dotted') l.crisp.style.strokeDasharray = dashOf();
  }
  linksSaid = '';
}

/** The lines follow the birds, with the frame. */
function placeLinks(verts: string[]) {
  for (const l of linkLines) {
    const d = `M${verts[l.a]} L${verts[l.b]}`;
    if (d === l.put) continue;
    l.put = d;
    if (l.dot) l.dot.setAttribute('d', d);
    l.trace.setAttribute('d', d);
    l.wide.setAttribute('d', d);
    l.crisp.setAttribute('d', d);
  }
}

/** The bird a hand holds now: the one dragged or slid, or else one dropped and still waiting for its seam. */
function handBird(): number {
  const r = last;
  let i = cellNodes.findIndex((c) => c.pulling);
  if (i < 0 && r) i = cellNodes.findIndex((c) => c.held && !birdLanded(c.bird, r.spell));
  return controls ? i : -1;
}

let linksAt = 0;
let linksSaid = '';
/** Each line toward what it wants, lit or not, and its widths kept to the screen. */
function runLinks(now: number) {
  const dt = Math.min(FRAME_STEP, now - (linksAt || now));
  linksAt = now;
  const k = REDUCED ? 1 : 1 - Math.exp(-dt / MARK_EASE);
  const h = handBird();
  const px = `${unitPx.toFixed(4)}|${starK}`;
  if (px !== linksSaid) {
    linksSaid = px;
    for (const l of linkLines) {
      if (l.dot) { put(l.dot, 'stroke-width', dotW().toFixed(3)); l.dot.style.strokeDasharray = dashOf(); }
      put(l.crisp, 'stroke-width', litW().toFixed(2));
      if (l.kind === 'dotted') l.crisp.style.strokeDasharray = dashOf();
      put(l.trace, 'stroke-width', litW().toFixed(2));
      l.trace.style.strokeDasharray = dashOf();
      l.said = '';
    }
  }
  for (const l of linkLines) {
    const want = h >= 0 && ((l.a === h && cellNodes[l.b]?.consequent) || (l.b === h && cellNodes[l.a]?.consequent)) ? 1 : 0;
    // the line into the held bird, where it is not lit
    const into = h >= 0 && !want && ((l.b === h && l.aToB) || (l.a === h && l.bToA)) ? 1 : 0;
    l.lit = Math.abs(want - l.lit) < 0.002 ? want : l.lit + (want - l.lit) * k;
    l.traced = Math.abs(into - l.traced) < 0.002 ? into : l.traced + (into - l.traced) * k;
    const said = `${l.lit.toFixed(3)}|${l.traced.toFixed(3)}`;
    if (said === l.said) continue;
    l.said = said;
    put(l.wide, 'opacity', (LIT_WIDE_OP * l.lit).toFixed(3));
    put(l.crisp, 'opacity', l.lit.toFixed(3));
    put(l.trace, 'opacity', (TRACE_OP * l.traced).toFixed(3));
  }
}

// The lines are rewritten at half rate at most: the wander is slow, and this
// is the only path data that moves at all.
let flexAt = 0;
// Where the eight stand has moved and has not been drawn yet. It is the one
// thing that makes this loop run on a ring that asked for no motion: the wander
// is off under reduced motion and the pull is not, because a node that answers
// a hand is the answer and not a decoration.
let cellsMoved = false;
let slideAt = 0;
/**
 * **The most time a spring steps in one frame** (K14). Every ease on the ring
 * runs on the frame clock, and a frame that comes late used to step the whole
 * wait at once, up to 64 ms: in WebKit a bird dropped on a stopped set
 * replans the theme, the rim's lanes are redrawn inside the bloomed layer, and
 * the renderer holds the next frame 85–105 ms while it rasters the blur again
 * (the main thread free all the while) — so the bird let go off its spoke
 * jumped 36 % of the way home in the first frame. A page that could not draw
 * resumes its springs where they stood: a step is at most a frame and a bit of
 * a phone's thirty a second, and a stall is a pause, never a jump.
 */
const FRAME_STEP = 40;

/**
 * The slide, which is the only spring the cells have. A hand on a node gets the
 * node **under the hand** — the radius is written straight from the pointer,
 * because a value that lags the finger is a value the finger cannot set — and
 * everything else eases onto its target over `SLIDE_EASE`. Reduced motion steps.
 */
function runSlide(now: number) {
  const dt = Math.min(FRAME_STEP, now - (slideAt || now));
  slideAt = now;
  const ease = (v: Float64Array, to: Float64Array, i: number, ms: number, snap: number) => {
    if (v[i] === to[i]) return;
    if (REDUCED) { v[i] = to[i]; cellsMoved = true; return; }
    v[i] += (to[i] - v[i]) * (1 - Math.exp(-dt / ms));
    if (Math.abs(to[i] - v[i]) < snap) v[i] = to[i];
    cellsMoved = true;
  };
  for (let i = 0; i < cellR.length; i++) {
    ease(cellR, cellTo, i, SLIDE_EASE, 0.03);
    // the lift off the table, and the float back onto the spoke: two more
    // springs of the same make, so a bird let go settles and never snaps
    ease(cellLift, cellLiftTo, i, LIFT_EASE, 0.002);
    ease(cellSide, cellSideTo, i, OFF_AXIS_EASE, 0.03);
    ease(wanderHold, wanderHoldTo, i, OFF_AXIS_EASE, 0.002);
  }
}

/**
 * @param words place the words here too; the frame passes false and places
 *   them once, after the star has turned (R71: they were placed twice a frame)
 * @returns whether the birds were moved, so the words want placing
 */
function flexStar(now: number, words = true): boolean {
  // a bird under a hand is placed under it on every frame, before anything is drawn
  const hand = dragging && dragging.kind === 'pull' && dragging.moved ? dragging : null;
  if (hand) followHand(hand);
  runSlide(now);
  const flexing = !!STAR_FLEX && !REDUCED;
  if (!flexLines.length) return false;
  if (!flexing && !cellsMoved) return false;
  // (the wander alone redraws at thirty frames a second; a hand on a bird, a
  // bird sliding, lifting or floating back, every frame)
  if (!hand && !cellsMoved && now - flexAt < 33) return false;
  flexAt = now;
  cellsMoved = false;
  const t = flexing ? now / 1000 : 0;
  const verts = starVerts(t);
  const ds = starPaths(t, verts);
  for (let i = 0; i < flexLines.length; i++) {
    const L = flexLines[i];
    if (L.put === ds[i]) continue;
    L.put = ds[i];
    L.wide.setAttribute('d', ds[i]);
    L.crisp.setAttribute('d', ds[i]);
  }
  placeLinks(verts);
  // the cells go where their vertices went, and their lights with them
  for (let i = 0; i < cellNodes.length; i++) {
    const c = cellNodes[i];
    const [vx, vy] = vertexAt(i, t);
    c.dx = vx - c.x;
    c.dy = vy - c.y;
    // the wander alone, which is what the words follow
    const [wx, wy] = vertexAt(i, t, starR);
    c.wx = wx - c.x;
    c.wy = wy - c.y;
    // **A bird is drawn at the size its place says** — a little smaller near
    // the core, a little bigger at the rim — **and lifted under a dragging
    // hand**; its lights and its hold ring are scaled with
    // it, so the node and everything round it stay one object.
    const sz = drawnSize(i);
    const tr = sz === 1 ? `translate(${vx.toFixed(2)} ${vy.toFixed(2)})`
      : `translate(${vx.toFixed(2)} ${vy.toFixed(2)}) scale(${sz.toFixed(4)})`;
    if (c.putKnot !== tr) { c.knot.setAttribute('transform', tr); c.putKnot = tr; }
    const ht = haloAt(c.x, c.y, vx, vy, sz);
    if (c.putHalo !== ht) { c.hg.setAttribute('transform', ht); c.putHalo = ht; }
  }
  // The words follow the wander. Their clear space is measured once, at the
  // widest a title can be, so nothing a hand does to a title moves them.
  if (words) turnWords(starDeg, false);
  return true;
}

// ==========================================================================
// The click wheel: the four things you do to the mix, engraved on the axes of
// the inner ring. They are actions, not dice, so they do not sit on the star.
// Four actions on the four axes of the centre circle. Rendering a file is
// gone: the offline pass runs far slower than the music does, so it belongs to
// a later release rather than to a node that looks like it will answer.
//
// Where each word is said: inside the centre disc, beside the node it belongs
// to. The reading at its widest — VIII · 12:00, BREAKDOWN, EBMIN11 and six
// tones — runs from y 440 to y 558 and is at its broadest on the chord's own
// line, so the word for the node at twelve sits in the clear band above it and
// the word for the node at six in the band below. The words for the two nodes
// on the sides run in from the disc's edge towards their own node, and sit on
// the section's line rather than the chord's: at the chord's height the widest
// name leaves thirty units between itself and the node, and the word needs
// forty.
const LABEL_SIZE = 11;
// Each word keeps its own distance from its node's edge whatever the node's
// size: at `CTRL_R` these are the numbers the four words have always stood at
// (405, 600 and 112 from the middle).
const labelUp = () => C - R_ACT + ctrlR + 20;
const labelDown = () => C + R_ACT - ctrlR - 15;
const labelSideX = () => R_ACT - ctrlR - 3;
const LABEL_SIDE_Y = C - 22;

/** One of the four: where its node sits, and where its word is said. */
interface Action { id: string; f: number; word: string; lx: number; ly: number; la: string }
/** The four, at the control size of the moment. */
function actionsNow(): Action[] {
  return [
    { id: 'play', f: 0, word: 'play', lx: C, ly: labelUp(), la: 'middle' },
    { id: 'skip', f: 0.25, word: 'skip', lx: C + labelSideX(), ly: LABEL_SIDE_Y, la: 'end' },
    { id: 'cast', f: 0.5, word: 'cast', lx: C, ly: labelDown(), la: 'middle' },
    { id: 'back', f: 0.75, word: 'back', lx: C - labelSideX(), ly: LABEL_SIDE_Y, la: 'start' },
  ];
}

/** The same, once it is drawn: the node, its glyph, its word and its place. */
interface ActionNode extends Action {
  g: Mark<SVGGElement>;
  glyph: Mark<SVGGElement>;
  label: Mark<SVGTextElement>;
  x: number;
  y: number;
}


let gActions: Mark<SVGGElement> | null = null;
let gLabels: Mark<SVGGElement> | null = null;
const actionNodes: ActionNode[] = [];
let playGlyphG: Mark<SVGGElement> | null = null;
/** What the top key draws: the question until anything has played, then play or pause (K25). */
type PlayMode = 'about' | 'play' | 'pause';
let playDrawn: PlayMode | null = null;
/** The drawing the top key is leaving, and when it began to go (a cross-fade, K25). */
let playOut: Mark<SVGGElement> | null = null;
let playFadeAt = 0;
/** The question's cross-fade into the first pause: slower than a bird's level, so it reads as a change of role. */
const PLAY_FADE = 320;

function buildActions(r: Readout) {
  if (!gActions) gActions = el('g', { id: 'actions' }, gCore.parentNode);
  // The words sit on the unfiltered sheet with the beat and the big mark: a
  // hover writes their opacity, and a write inside a bloomed group makes
  // WebKit run the blur over the whole layer again.
  if (!gLabels || !gLabels.isConnected) gLabels = el('g', { id: 'actionLabels' }, gInnerLive);
  clear(gActions);
  clear(gLabels);
  actionNodes.length = 0;
  for (const a of actionsNow()) {
    const x = px(a.f, R_ACT);
    const y = py(a.f, R_ACT);
    const g = el('g', {
      'data-action': a.id, transform: `translate(${x} ${y})`,
      role: 'button', tabindex: '0', 'aria-label': a.word,
    }, gActions);
    g.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
      // **The page's one key plays wherever the focus is** (round K30, the reviews of 09-26):
      // before the first play the key at twelve is the About, and a close of the
      // view leaves the focus on it — so its Space is the page's, and only Enter
      // opens the About
      if (a.id === 'play' && ev.key !== 'Enter' && aboutMode()) return;
      ev.preventDefault();
      ev.stopPropagation();
      pressAction(a.id);
    });
    // The node knocks out its own ground first, so the circle's double stroke
    // and any line of the star behind it stop at the node's edge and the glyph
    // sits in clean black — the same idea as a label's halo.
    el('circle', { cx: 0, cy: 0, r: ctrlR, fill: '#000000' }, g);
    el('circle', { class: 'ln fix thin', cx: 0, cy: 0, r: ctrlR, fill: 'none' }, g);
    // its focus mark, one ornament gap outside the node (K24), on the unbloomed
    // sheet the words ride, so it is a line and never a glow
    const fr = focusRing(gLabels, x, y, ctrlR + ORN_GAP + ornW() / 2);
    g.addEventListener('focus', () => { hoverAction(a.id); markFocus(g, fr, true); });
    g.addEventListener('blur', () => { hoverAction(null); markFocus(g, fr, false); });
    const gl = el('g', {}, g);
    if (a.id === 'play') { playGlyphG = gl; playDrawn = null; playOut = null; }
    else if (a.id === 'skip') GLYPH.step(gl, ctrlR, 1);
    else if (a.id === 'back') GLYPH.step(gl, ctrlR, -1);
    else GLYPH.die(gl, ctrlR);
    // What it does, said only while the finger is on it, and said inside the
    // centre disc where there is room for it: out on the ring the word had to
    // thread the star's chords and the lane band, and the disc has a clear
    // band above the reading and another below it.
    const label = txt(gLabels, a.word, a.lx, a.ly, LABEL_SIZE, { op: 0, ls: 0.26, anchor: a.la });
    label.style.transition = 'opacity 160ms ease';
    actionNodes.push({ ...a, g, glyph: gl, label, x, y });
  }
  // The offer, said in the same band and the same type as the four actions'
  // own words, because it is the same kind of thing: what a press will do.
  releaseWord = txt(gLabels, 'release', C, labelDown(), LABEL_SIZE, { op: 0, ls: 0.26 });
  releaseWord.style.transition = 'opacity 160ms ease';
  if (releaseOffered()) put(releaseWord, 'opacity', 0.8);
  // A link the page would not play in full says so here, in the same band, in
  // the tell's white: one line, what was wrong and what plays instead
  // (`linkRead` in link.ts). It stands until a hand starts the set, and
  // gives the band up to a hovered action's word or the release offer.
  linkNote = null;
  const refused = control.linkProblems;
  if (refused.length) {
    const line = refused[0].short + (refused.length > 1 ? ` +${refused.length - 1}` : '');
    linkNote = txt(gLabels, line, C, labelDown() + 24, LINK_NOTE_SIZE, { op: 0, ls: 0.2, fill: '#ffffff' });
    linkNote.setAttribute('data-link-note', '');
    el('title', {}, linkNote).textContent = refused.map((p) => p.long).join('. ');
    linkNote.style.transition = 'opacity 160ms ease';
  }
  paintLinkNote();
  setPlayGlyph(r.playing);
  labelPlay(r.playing);
  hoverAction(hoveredAction);
}

// --- release all ----------------------------------------------------------
//
// **The one control the ring gains that is not a cell**, and it is a word and
// not a node: with a bird held, six hundred milliseconds on the centre disc
// says `release` in the free band below the reading — where the four actions
// already say their own word — and a second press takes the offer. It is two
// presses on purpose: letting eight birds go is the one gesture on this ring
// that cannot be undone by putting a finger back where it was.
//
// With no bird held it does not exist, and the centre is the transport it has
// always been. There is no key: the page has one key and it is the space bar.
const coreHold = { at: -1, until: 0 };
let releaseWord: Mark<SVGTextElement> | null = null;

const releaseOffered = () => performance.now() < coreHold.until;

function offerRelease(on: boolean) {
  coreHold.until = on ? performance.now() + RELEASE_HOLD_MS : 0;
  if (releaseWord) put(releaseWord, 'opacity', on ? 0.8 : 0);
  paintLinkNote();
  if (on) announce('release all of the ring\'s controls');
}

function runCoreHold(now: number) {
  if (coreHold.at >= 0 && now - coreHold.at >= RELEASE_MS) {
    coreHold.at = -1;
    if (dragging && dragging.kind === 'core') dragging.armed = true;
    offerRelease(true);
    nudge(0.25);
  }
  if (releaseWord && coreHold.until && now >= coreHold.until) offerRelease(false);
}

/**
 * **The top key is the About until anything has played** (round K25): on a
 * page where nothing has played yet — a bare open or a link, alike — the
 * centre's big play is the one play control, and the key at twelve draws the
 * question and opens the About sheet. From the first play on (the centre, the
 * space bar, the lock screen) it is play and pause for the rest of the page's
 * life: a stop draws play, never the question again.
 */
const playMode = (playing: boolean): PlayMode => (playing ? 'pause' : started ? 'play' : 'about');
const PLAY_WORD: Record<PlayMode, string> = { about: 'about', play: 'play', pause: 'pause' };

function labelPlay(playing: boolean) {
  const n = actionNodes.find((a) => a.id === 'play');
  const m = playMode(playing);
  if (n && n.g) {
    put(n.g, 'aria-label', m === 'about' ? 'About' : PLAY_WORD[m]);
    if (m === 'about') put(n.g, 'aria-haspopup', 'dialog');
    else n.g.removeAttribute('aria-haspopup');
  }
}

function setPlayGlyph(playing: boolean) {
  const mode = playMode(playing);
  if (!playGlyphG || playDrawn === mode) return;
  const was = playDrawn;
  playDrawn = mode;
  // the node at twelve is the whole of the transport once the set has run, so
  // what a screen reader is told turns over with the mark
  labelPlay(playing);
  // The question leaves by a cross-fade on the frame clock (`runPlayFade`), so
  // the change of role is seen and not jumped; play and pause trade at once,
  // as they always did. The new drawing is a sibling of the old in the node.
  // **Drawn on the unbloomed sheet while it fades** (K30, the reviews of 09-26:
  // the fade wrote two opacities a frame inside `#innerGlow`, which the WebKit
  // rule forbids). The key's own drawing turns over at once, hidden by one
  // write; a copy of the question and the new drawing trade opacity over it on
  // the words' sheet, and at the end the key's own is shown by one more write.
  const node = actionNodes.find((a) => a.id === 'play');
  const fade = was === 'about' && !REDUCED && !!node && !!gLabels;
  let outgoing: Element | null = null;
  if (fade) {
    if (playOut) { playOut.remove(); playOut = null; }
    outgoing = playGlyphG.cloneNode(true) as Element;
  }
  clear(playGlyphG);
  if (mode === 'about') GLYPH.about(playGlyphG, ctrlR);
  else GLYPH.play(playGlyphG, ctrlR, mode === 'pause');
  if (fade && outgoing) {
    const over = el('g', { transform: `translate(${node!.x.toFixed(2)} ${node!.y.toFixed(2)})`, 'aria-hidden': 'true' }, gLabels!);
    over.appendChild(outgoing);
    outgoing.setAttribute('opacity', '1');
    const incoming = el('g', { opacity: 0 }, over);
    if (mode === 'about') GLYPH.about(incoming, ctrlR); else GLYPH.play(incoming, ctrlR, mode === 'pause');
    put(playGlyphG, 'opacity', 0);
    playOut = over;
    playFadeAt = performance.now();
  } else put(playGlyphG, 'opacity', 1);
  if (node) { node.label.textContent = PLAY_WORD[mode].toUpperCase(); node.glyph = playGlyphG; }
  paintActionGlow();
}

function runPlayFade(now: number) {
  if (!playOut || !playGlyphG) return;
  const p = clamp((now - playFadeAt) / PLAY_FADE, 0, 1);
  const [outgoing, incoming] = [playOut.firstChild as Element | null, playOut.lastChild as Element | null];
  if (incoming) put(incoming, 'opacity', p.toFixed(3));
  if (outgoing && outgoing !== incoming) put(outgoing, 'opacity', (1 - p).toFixed(3));
  if (p >= 1) { playOut.remove(); playOut = null; put(playGlyphG, 'opacity', 1); }
}

let hoveredAction: string | null = null;

let heldAction: string | null = null;
let heldUntil = 0;

// The node that asked for a cut the music has not reached yet. Forward and
// back are a DJ cut, not a jump: the mix starts one on the next bar and blends
// over the bars after it, so a press is four seconds from anything a hand can
// hear. The node keeps its light and its word for the whole of that wait,
// because the only other answer to a press is silence, and a hand that is
// given silence presses again. control.ts has been publishing the wait all
// along, as mix.cutting and mix.cutInBars; nothing was reading it.
let cutAsked: string | null = null;
let cutTheme: number | null = null;
// the wait, drawn: the marks that draw it, and how far the last write got. The
// length itself is not kept here — it is read off the transport, which is the
// only thing that knows it (`mix.cutSpan`, `mix.cutIn`).
let gCutFill: Mark<SVGGElement> | null = null;
let cutWedge: Mark<SVGRectElement> | null = null;
let cutSpiral: Mark<SVGPathElement> | null = null;
let cutDrawnFor: string | null = null;
let cutFilledAt = -1;

function askCut(id: string) {
  cutAsked = id;
  cutTheme = last ? last.mix.themeNumber : null;
  hoverAction(id);
}

function cutLanded() {
  if (!cutAsked) return;
  const was = cutAsked;
  cutAsked = null;
  if (gCutFill) put(gCutFill, 'opacity', 0);
  cutFilledAt = -1;
  hoverAction(hoveredAction === was ? null : hoveredAction);
}

// The node that asked, made ready to fill.
//
// **Forward and back: a bar sweeping across the disc the way the theme is
// going** — out to the right under the forward chevrons, back to the left under
// the others — clipped to the node's own circle, with the node's mark drawn
// again over it. The same stroke laid twice over itself is the same stroke, so
// the copy costs nothing to look at and what lies between them is under the
// chevron rather than washed across it.
//
// **The dice: a clockwise spiral**, a sector swept from twelve o'clock round
// the die's own node, because a cast is not a move along a line and drawing it
// as one would say the wrong thing about it. It is the same wait, read off the
// same two numbers.
//
// It is all on the unfiltered sheet: the fill is written every frame, and a
// write inside a bloomed group re-runs the blur over the whole layer.
const cutR = () => ctrlR - 1.5;

// **The wait and the reset, one family** (Eugene, round K11: *"the radial
// spin indicator is hard to see; it feels nothing happens when the bird is
// dropped. On a phone in bright light that shade of grey is guaranteed to be
// unnoticeable. Do it for the other radial progress too: next, prev and the
// dice roll."*). Every fill that is a wait — inside a dropped bird, and the
// three actions' own under skip, back and the die — is the ring's gold at
// `WAIT_ALPHA` over the node's black; every sweep that is a reset — round a
// bird under a still press, and round the die under its own — is the same gold
// at full strength, `SWEEP_PX` screen pixels wide whatever the square, its
// inner edge `SWEEP_GAP` units off the node. They were the gold at 0.18 (a
// 1.3:1 brown on the black, which is the grey he saw) and a 2.2-unit line
// (0.8 of a CSS pixel on a phone's ring) fading up from 0.3. Measured on the
// phone picture at device scale 2 (round K11): the fill at 0.5 is 3.6:1
// against the black, over the 3:1 a graphic needs to read. The numbers to tune
// by hand are these three; `waitFill` and `paintSweep` are the one drawing.
// `WAIT_INK` and `WAIT_ALPHA` are in `wait.ts`, shared with the record tools (M14).
const SWEEP_PX = 3;
const SWEEP_GAP = 4;
/** A screen pixel in the ring's units, read by `sizeControls` from the square as laid out. */
let unitPx = 1;
const sweepW = () => clamp(SWEEP_PX / unitPx, 2.2, 12);
/** A sweep's radius round a node of radius `r`. */
const sweepR = (r: number) => r + SWEEP_GAP + sweepW() / 2;
/** A wait's fill: the die's own sector (or the steps' bar), the ring's gold at `WAIT_ALPHA`. */
// (on the colour the ring is wearing, as every line of it is — round K12c)
function waitFill<K extends 'path' | 'rect'>(tag: K, attrs: Attrs, parent: Node): Mark<SVGElementTagNameMap[K]> {
  const n = el(tag, { class: 'fill', ...attrs, opacity: WAIT_ALPHA }, parent);
  return ink(n, 'fill', WAIT_INK);
}
/** A reset's sweep round a node at (x, y), from twelve o'clock, drawn by `paintSweep`. */
function sweepArc(x: number, y: number, r: number, parent: Node): Mark<SVGCircleElement> {
  return ink(el('circle', {
    cx: x.toFixed(1), cy: y.toFixed(1), r: sweepR(r).toFixed(2), fill: 'none',
    'stroke-width': sweepW().toFixed(2), opacity: 0,
    transform: `rotate(-90 ${x.toFixed(1)} ${y.toFixed(1)})`,
  }, parent), 'stroke', WAIT_INK);
}
// **The bird in action, and the birds it moves** (Eugene, round K12: *"the play
// circles have a nice halo highlight on mouse-over, the bird circles do not —
// should be the same, and even more pronounced. When the user starts dragging
// a bird, on top of the size increase we should add another visual treatment
// that the bird is in action … a decorative extra ring with dotted/dashed lines
// … and if other birds get involved in the change, we draw the ornament and
// halo on those bird circles too, without the extra size"*). One construction
// on every bird, three states:
//
//   hover      the halo alone — **the transport's hover halo exactly** (round
//              K12b: *"the highlight of the player circle buttons and the bird
//              circles are not the same — we need to match"*): one pair of
//              strokes, `HALO_WIDE` under `HALO_CRISP`, the same numbers on
//              both, on at once as the transport's is; a fine pointer only
//   in action  the halo and the ornament: the bird a hand is dragging, the
//              phone's selected bird, and a dropped bird until its value plays
//   affected   the same halo and ornament on every bird whose reading the move
//              changes (`consequent`, round K11b), for as long as it does
//
// The size is the held bird's alone (the lift). The halo is one state across
// hover and hold, so a press on a hovered bird hands it over with no dip (round
// K12b: *"when the hover highlight shows up and I click to drag, it fades out
// and in again"*). The ornament is the track's section dash — the build
// section's `9 6`, dashes and not dots since K12b — closed round the node in a
// whole number of dashes inside the words' 8-unit gap, `ORN_PX` screen pixels
// wide, in the gold at full strength; it eases over `MARK_EASE` on the frame
// clock and is carried across a rebuild, so a theme turning over cuts it not.
const HALO_WIDE = { w: 6, op: 0.22 };     // the wide soft stroke, transport and bird alike
const HALO_CRISP = { w: 1.3, op: 0.8 };   // and the crisp one over it
const ORN_PX = 1.6;
const ORN_GAP = 2.5;          // units off the node to the ornament's inner edge
const MARK_EASE = 140;
const ornW = () => clamp(ORN_PX / unitPx, 1.4, 8);
const ornR = () => birdR + ORN_GAP + ornW() / 2;

// **The focus mark** (round K24, Eugene: *"design focus similar to the circles —
// round, with a dashed outline — shown only on keyboard navigation and hidden
// for click activities"*). A round key — the four actions and the eight birds —
// is never given the browser's outline, which on an SVG group is a square box
// round its bounds; it carries a circle of its own instead, the ornament's dash
// (the track's `9 6`, a whole number of dashes round) at the ornament's screen
// width, in the worn gold at the dashes' own opacity, one ornament gap outside the node — and
// on a bird outside the bird's own ornament, so a focused bird under the
// pointer shows both. Nought until focus arrives by a key: a click or a tap
// focuses a key and draws nothing. `lastInput` is what the hand did last, and
// `quietFocus` is a focus the page itself put back after a pointer closed the
// machine view (`ringFocus`), which stays unmarked until the next key.
let lastInput: 'key' | 'pointer' | null = null;
let quietFocus = false;
window.addEventListener('keydown', () => {
  lastInput = 'key';
  if (quietFocus) { quietFocus = false; delete document.documentElement.dataset.quietFocus; }
}, true);
window.addEventListener('pointerdown', () => { lastInput = 'pointer'; }, true);
/** The dashed circle a round key wears under keyboard focus, at radius `r` round (cx, cy). */
function focusRing(parent: Element, cx: number, cy: number, r: number): Mark<SVGCircleElement> {
  const c = 2 * Math.PI * r;
  const n = Math.max(8, Math.round(c / (ORN_DASH[0] + ORN_DASH[1])));
  const u = c / n;
  const dash = ORN_DASH[0] / (ORN_DASH[0] + ORN_DASH[1]);
  return el('circle', {
    class: 'focusRing', cx: cx.toFixed(1), cy: cy.toFixed(1), r: r.toFixed(2), fill: 'none',
    stroke: 'url(#gold)', 'stroke-width': ornW().toFixed(2), opacity: 0, 'aria-hidden': 'true',
    'stroke-dasharray': `${(u * dash).toFixed(2)} ${(u * (1 - dash)).toFixed(2)}`,
  }, parent);
}
/** Draw or take off a key's focus mark: drawn only for a focus a key brought. */
function markFocus(key: Element, ring: Element, on: boolean) {
  let visible = false;
  try { visible = key.matches(':focus-visible'); } catch (e) { /* a browser without the selector */ }
  put(ring, 'opacity', on && !quietFocus && (visible || lastInput === 'key') ? DASH_OP : 0);
}

/** And the sweep at `p` of a turn round a node of radius `r`: nothing at nought, full strength otherwise. */
function paintSweep(arc: Mark<SVGCircleElement>, p: number, r: number) {
  const rr = sweepR(r);
  const circ = TAU * rr;
  put(arc, 'r', rr.toFixed(2));
  put(arc, 'stroke-width', sweepW().toFixed(2));
  put(arc, 'opacity', p > 0 ? 1 : 0);
  arc.style.strokeDasharray = `${(circ * clamp(p, 0, 1)).toFixed(2)} ${circ.toFixed(2)}`;
}
/** Which node a hand-over a hand asked for belongs to. A spell and an engine
 * are changed by no node of the ring and so fill none. */
const CUT_NODE: Partial<Record<string, string>> = { skip: 'skip', back: 'back', cast: 'cast' };
function cutFillFor(id: string) {
  if (!gCutFill || !gCutFill.isConnected) {
    gCutFill = el('g', { id: 'cutFill', opacity: 0 }, gInnerLive);
    cutDrawnFor = null;
  }
  if (cutDrawnFor === id) return;
  cutDrawnFor = id;
  clear(gCutFill);
  cutWedge = null;
  cutSpiral = null;
  const a = actionNodes.find((x) => x.id === id);
  if (!a) return;
  const g = el('g', { transform: `translate(${a.x} ${a.y})` }, gCutFill);
  const clip = el('clipPath', { id: 'cutFillClip' }, g);
  el('circle', { cx: 0, cy: 0, r: cutR() }, clip);
  if (id === 'cast') {
    cutSpiral = waitFill('path', { d: '', 'clip-path': 'url(#cutFillClip)' }, g);
    GLYPH.die(g, ctrlR);
  } else {
    cutWedge = waitFill('rect', {
      x: -cutR(), y: -cutR(), width: 0, height: cutR() * 2, 'clip-path': 'url(#cutFillClip)',
    }, g);
    GLYPH.step(g, ctrlR, id === 'skip' ? 1 : -1);
  }
}

// The sector from twelve o'clock, swept clockwise: a whole turn is the whole
// disc, so the mark and the value are the same thing.
function spiralPath(p: number, r: number): string {
  if (p <= 0) return '';
  if (p >= 1) return `M 0 ${-r} A ${r} ${r} 0 1 1 -0.01 ${-r} Z`;
  const a = p * TAU;
  const x = Math.sin(a) * r;
  const y = -Math.cos(a) * r;
  return `M 0 0 L 0 ${-r} A ${r} ${r} 0 ${p > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`;
}

// The wait itself, **read off the seam's own clock and never sampled from a
// frame**: the transport publishes the whole span (the press to the swap, both
// ends off the seam it answered with) and how much of it is left, so the fill's
// length *is* the hand-over's length and a second press restarts the drawing
// because it moves both numbers. The fill closes exactly as the theme turns
// over, because the swap is that same moment.
//
// It blocks nothing. It is a reading of a wait and not a way of refusing the
// next press (step 1c).
//
// Reduced motion gets a **state and not an animation**: the node is filled for
// as long as the hand-over is in flight and the fill is written once, so
// nothing on the ring moves that a listener asked not to have move.
function runCutFill(r: Readout) {
  const kind = r.mix ? r.mix.cutKind : null;
  const id = (kind && CUT_NODE[kind]) || null;
  const on = !!(id && r.mix.cutting);
  if (!on) {
    // and nothing is written on a frame that has nothing to say
    if (cutFilledAt >= 0) {
      if (gCutFill && cutDrawnFor) put(gCutFill, 'opacity', 0);
      cutFilledAt = -1;
    }
    return;
  }
  cutFillFor(id!);
  const p = cutWalk(r.mix);
  if (REDUCED) {
    // one write, and only when the state itself changes
    if (cutFilledAt === 1) return;
    cutFilledAt = 1;
    put(gCutFill!, 'opacity', 1);
    if (cutSpiral) put(cutSpiral, 'd', spiralPath(1, cutR()));
    if (cutWedge) { put(cutWedge, 'width', (cutR() * 2).toFixed(2)); put(cutWedge, 'x', (-cutR()).toFixed(2)); }
    return;
  }
  cutFilledAt = p;
  put(gCutFill!, 'opacity', 1);
  if (cutSpiral) { put(cutSpiral, 'd', spiralPath(p, cutR())); return; }
  if (!cutWedge) return;
  const w = p * cutR() * 2;
  put(cutWedge, 'width', w.toFixed(2));
  put(cutWedge, 'x', (id === 'back' ? cutR() - w : -cutR()).toFixed(2));
}

// A tap the music will only obey on the next bar still has to look taken: the
// node holds its glow and its word for a moment.
function pulseAction(id: string, ms = 1100) {
  heldAction = id;
  heldUntil = performance.now() + ms;
  hoverAction(id);
}

function hoverAction(id: string | null) {
  hoveredAction = id || cutAsked || (performance.now() < heldUntil ? heldAction : null);
  for (const a of actionNodes) put(a.label, 'opacity', a.id === hoveredAction ? 0.8 : 0);
  paintActionGlow();
  paintLinkNote();
}

// The bad link's line (`buildActions`): up until a hand has started the set,
// and only while nothing else is saying a word in the band.
const LINK_NOTE_SIZE = 9;
let linkNote: Mark<SVGTextElement> | null = null;
function paintLinkNote() {
  if (!linkNote) return;
  const quiet = !started && !hoveredAction && !releaseOffered();
  put(linkNote, 'opacity', quiet ? 0.8 : 0);
}

// The same trick the cells use: a wide soft stroke under a crisp one, in the
// layer that carries no filter, so a hover never re-runs the bloom.
function paintActionGlow() {
  for (let i = 0; i < actionHalos.length; i++) {
    const a = actionNodes[i];
    if (!a) continue;
    const on = a.id === hoveredAction || (a.id === 'play' && last && last.playing);
    const h = actionHalos[i];
    put(h.crisp, 'opacity', on ? HALO_CRISP.op : 0);
    put(h.wide, 'opacity', on ? HALO_WIDE.op : 0);
  }
}

/** A word's clear space, in the ring's own coordinates. */
interface Box { x: number; y: number; w: number; h: number }

// ==========================================================================
/**
 * One of the eight, drawn: the node and its knot, the bird's glyph, the three
 * lines of words and the box they
 * take up, the light that wanders with it, and the last transform written to
 * each of the three sheets it has a mark on.
 */
interface CellNode {
  id: CellId;
  layer: string;
  g: Mark<SVGGElement>;
  knot: Mark<SVGGElement>;
  glyph: Mark<SVGGElement>;
  /** the level of its drawing it carries, for a bird whose glyph has levels (Ember's burn) */
  glyphLevel: string;
  /** the drawing fading out while a new level fades in, and when the fade began */
  glyphOut: Mark<SVGGElement> | null;
  fadeAt: number;
  /** the bird's name, and — while a hand is on it — its value beside it */
  title: Mark<SVGTextElement>;
  word: Mark<SVGTextElement>;
  sub: Mark<SVGTextElement>;
  sub2: Mark<SVGTextElement>;
  /** the three lines of the reading, together, so a change under a hand can cross-fade (round K11) */
  lines: Mark<SVGGElement>;
  /** the lines fading out while the new reading fades in, the strength they left at, and when */
  linesOut: Mark<SVGGElement> | null;
  linesFrom: number;
  linesAt: number;
  /** what the three lines were last given, or nothing before the first paint */
  saidLines: string;
  /** whether its lines read another bird's move, not the set (round K11b) */
  consequent: boolean;
  gt: Mark<SVGGElement>;
  bb: DOMRect;
  hg: Mark<SVGGElement>;
  x: number;
  y: number;
  f: number;
  /** where the node stands, off its rest place: the wander and the pull together */
  dx: number;
  dy: number;
  /**
   * and where its **words** stand, which is the wander alone. The words sit in
   * a band inside the star, and a bird pulled all the way in would carry them
   * over the wheel and a bird pulled out into the lane band: the value is said
   * by where the node is, so the reading does not have to travel to say it
   * again.
   */
  wx: number;
  wy: number;
  put: string;
  putKnot: string;
  putHalo: string;
  // --- the cell as a control (UX-1) ---------------------------------------
  /** which of the eight numbers this cell is */
  bird: Bird;
  /** the sector that fills the node as the promise arrives: the pending mark, the die's own */
  pendFill: Mark<SVGPathElement>;
  /** the ring that closes under a still press, as the die's does: every bird let go when it meets */
  holdArc: Mark<SVGCircleElement>;
  /** the wait's fill: when it began (the drop, on the page's clock) or -1, and how far it has run (round K12c) */
  fillFrom: number;
  fillP: number;
  /** the hover and in-action halo, and the ornament ring outside it (round K12) */
  markWide: Mark<SVGCircleElement>;
  markCrisp: Mark<SVGCircleElement>;
  orn: Mark<SVGCircleElement>;
  /** how far each is lit, 0..1, eased on the frame clock; and what was last written */
  markAt: number;
  ornAt: number;
  markSaid: string;
  /** the value under the hand, whether or not it has been let go */
  value: number;
  held: boolean;
  pulling: boolean;
  /** the die the value implies now, and the value and theme it was worked out for */
  implied: CellValue | null;
  impliedFor: number;
  impliedTheme: number;
  impliedAt: number;
  /** a paint asked for once the throttle's window is over, so the last value a hand left is the one read */
  impliedTrail: number;
  /**
   * and the immediate half of the same pull, in words: what it changes in the
   * sound that is already playing. Worked out beside the die, because the two
   * are one question asked of one value and they are said on one line.
   */
  /** whether the die it implies is a different die from the one playing */
  impliedNext: boolean;
  /** and the reading of the theme it implies, whole, for the phone's panel (round K9) */
  impliedR: Readout | null;
  /** what was last written into each of the four lines and the two marks */
  saidTitle: string;
  saidArc: string;
}

const cellNodes: CellNode[] = [];

/**
 * **What a rebuild carries over**, so that nothing slow is ever cut short.
 *
 * Eugene, 09-20, and it is a rule and not a note: *"the slow bird circle
 * animations must never be interrupted by activities around bird repositions or
 * anything else — things around the magic should be smooth as silk."* A theme
 * turning over, a strategy flipping, a cast, a seam, a re-plan: every one of
 * them tears the eight cells down and stands eight new ones up, and every new
 * one used to be born at the beginning of its own motion — the halo dark, the flash gone, the node snapped onto its target. The
 * elements are new; the motions are not, and a motion belongs to the *ring* and
 * not to the element that happens to be drawing it.
 *
 * So the three continuous things a cell owns are read off the old element and
 * written onto the new one in the same frame: the halo's lit share, the
 * flash's opacity and its radius. (The glyph's morph was the fourth until
 * 09-23, when the glyph stopped moving at all.) The springs that already live
 * outside the cells — the slide (`cellR`), the colour walk, the sway, the
 * breathing — were never lost and are only listed here so
 * the next reader knows where each of them lives.
 */
interface CarriedMotion { halo: number; flash: number; flashR: number; mark: number; orn: number; fillFrom: number; fillP: number }

function carryMotion(): CarriedMotion[] {
  return cellNodes.map((c, i) => ({
    halo: haloOn[i] ? haloLit[i] : 0,
    flash: haloFlash[i] ? Number(haloFlash[i].getAttribute('opacity')) || 0 : 0,
    flashR: haloFlash[i] ? Number(haloFlash[i].getAttribute('r')) || birdR : birdR,
    mark: c.markAt,
    orn: c.ornAt,
    fillFrom: c.fillFrom,
    fillP: c.fillP,
  }));
}

function buildCells(r: Readout) {
  const carried = carryMotion();
  const born = !cellNodes.length;
  clear(gCells);
  clear(gStarLive);
  clear(gStarWords);
  cellNodes.length = 0;
  // under the words and the halos: the scale a node is read against
  CELLS.forEach((c, i) => {
    const f = i / 8;
    const was = carried[i];
    // Where the cell stands: its rest place is still its rest place, and the
    // radius it is *drawn* at is the value its bird is held at. With nothing
    // held the two are the same number to the bit.
    const x = px(f, starR);
    const y = py(f, starR);
    const bird = birdOf(c.id);
    cellTo[i] = controls ? radiusFor(bird, valueOf(bird)) : starR;
    // **The slide is not restarted by a rebuild.** A cell on its way home keeps
    // going from where it actually is; only the very first build puts it on its
    // target, because there is nowhere it could be coming from.
    // The star's lines were drawn a moment ago, before this build knew where
    // the birds stand: a first build that puts a bird anywhere but where the
    // lines already run says it moved, so the lines are redrawn through it on
    // the next frame — with or without motion. (On a phone's square the rest
    // radius is 280.4 and the lines, drawn off the 316 every radius starts
    // at, ran past the birds' centres until a hand moved one, under reduced
    // motion — round K6b.)
    if (born) { if (cellR[i] !== cellTo[i]) cellsMoved = true; cellR[i] = cellTo[i]; }
    const [kx, ky] = onSpoke(i, cellR[i], cellSide[i]);
    // The one place on the star a keyboard can reach. As a reading it answers
    // focus with the same thing it answers a finger — the tell is drawn — and its label is the whole reading, because the words
    // beside it ride a sheet no screen reader is shown. Where the cells are
    // **controls** it is a slider besides, with the value, its ends and the
    // reading on it: an arrow is then accessibility on a focused control and
    // not a shortcut, which is the one kind of key this page allows.
    const g = el('g', {
      class: 'cell', 'data-id': c.id, opacity: 1, tabindex: '0', role: 'img',
    }, gCells);
    const knot = el('g', { transform: `translate(${kx.toFixed(1)} ${ky.toFixed(1)})` }, g);
    // the cell itself, with a wide faint stroke standing in for the bloom it
    // left behind; it lights while its part is playing
    el('circle', { cx: 0, cy: 0, r: birdR, fill: '#000000' }, knot);
    ink(el('circle', { cx: 0, cy: 0, r: birdR, fill: 'none', 'stroke-width': 5, opacity: 0.09 }, knot), 'stroke', '#f2c14e');
    el('circle', { class: 'ln thin', cx: 0, cy: 0, r: birdR, fill: 'none' }, knot);
    // **No filled centre** (Eugene, 09-23: *"it does not read as a custom
    // value"*). A held bird says so by where it stands and by the percent on its
    // title line, which are the value itself; a dot beside them was a third
    // mark saying the same thing and the one that read as nothing.
    //
    // **What fills the node now is the wait** (Eugene, 09-23, *"reuse the dice
    // button's progress indicator"*): the die's own clockwise sector from twelve
    // o'clock, drawn **inside** the bird's circle for the time between a drop
    // and the phrase line its value applies at, off the hand-over's own clock.
    // The two indicators mean on a bird what they mean on the die: the fill
    // inside is a change on its way, the sweep round the outline is a long
    // press. Under the bird's glyph; empty at rest.
    const pendFill = waitFill('path', { d: '' }, knot);
    // the bird: one glyph, drawn once, the same at rest, under a hand and held
    const gl = el('g', { transform: `rotate(${(-swayDeg).toFixed(2)})` }, knot);
    // at the hand's value where a hand holds the bird, the set's otherwise
    const gv = controls && heldValue.has(birdOf(c.id)) ? heldValue.get(birdOf(c.id))! : playingValue(r, birdOf(c.id));
    const glyphLevel = levelAt(BIRD[c.id].key, gv);
    drawBirdGlyph(gl, BIRD[c.id].key, birdR, glyphAt(BIRD[c.id].key, gv));

    // The words live on the sheet's live sibling: they turn with the star and
    // are held upright by their own rotation, and they carry the knockout
    // halo that always did their reading for them, so they need no bloom.
    const v = cellValue(c.id, r);
    const gt = el('g', {}, gStarWords);
    // The bird's name leads, and the die's own value is the line under it: the
    // name says which of the eight this point is, the value says what it rolled.
    // What the bird *means* is not printed — it is one tap away, in the tell,
    // because a cell that carried both would say the same thing twice.
    //
    // **The box the words are kept clear in is measured once, at the widest
    // the title can be** — the name and a three-figure percent — so a title
    // that takes a percent under a hand, or gives it back, moves no word: the
    // placer used to be asked again at both moments and a reading could jump
    // to another spot as the hand took the bird (Eugene, 09-23: *"the bird
    // swaps short to long during drag and back on release, which is jarring"*).
    const title = txt(gt, COARSE ? `${RIM_PERCENT}%` : `${BIRD[c.id].name} ${RIM_PERCENT}%`, 0, -12, 11, { op: 0.7, ls: 0.3 });
    const lines = el('g', {}, gt);
    const word = txt(lines, v.word, 0, 5, 16, { ls: 0.2 });
    // **On a small square the subtitle reads** (round K15, Eugene on the
    // phone: *"the subtext on a bird is small and unreadable — make its colour
    // as bright as the main label's, or at least 80–90 % as close"*): the big
    // word's own ink at `SUB_SMALL_OP` of its light; a desktop keeps its
    // quieter subtitle. Its size stays: at 11 and 12 units WebKit's face on
    // the phone's square left Root or Loom no clear side at the house.
    const small = unitPx * 1000 < CTRL_SMALL_SIDE;
    const sub = txt(lines, v.sub, 0, 22, small ? SUB_SMALL_SIZE : 10, { op: small ? SUB_SMALL_OP : 0.45, ls: 0.22 });
    const sub2 = txt(lines, v.sub2 || '', 0, 36, 10, { op: 0.35, ls: 0.22 });
    const bb = gt.getBBox();
    title.textContent = '';
    // its light, built with it so it wanders with it
    const hg = el('g', {}, gStarLive);
    // **Lit as brightly as the old one was**, not dark: a halo eases onto its
    // layer over about fifty frames, and a theme change that put it back to
    // nought made the eight lights blink out and swim back every time.
    const wide = ink(el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: birdR + 1, fill: 'none', 'stroke-width': 7, opacity: (was ? was.halo * 0.26 : 0).toFixed(3) }, hg), 'stroke', '#f2c14e');
    const crisp = ink(el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: birdR + 1, fill: 'none', 'stroke-width': 1.2, opacity: (was ? was.halo : 0).toFixed(3) }, hg), 'stroke', '#ffd97a');
    const flash = ink(el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: (was ? was.flashR : birdR).toFixed(1), fill: 'none', 'stroke-width': 2.4, opacity: (was ? was.flash : 0).toFixed(3) }, hg), 'stroke', '#fff8dc');
    // **The hold: every bird let go** — the same sweep round the outline the
    // die closes under its own long press, round whichever bird the hand is
    // resting on, so the one gesture reads the same wherever it is made. Nought
    // opacity until a still press has lasted longer than a click.
    const holdArc = sweepArc(x, y, birdR, hg);
    // **The bird under the pointer, and the bird in action** (round K12): the
    // transport's own hover halo — a wide soft stroke under a crisp one —
    // drawn stronger, and outside it the ornament: the track's dotted section
    // stroke closed into a ring round the node (`birdMarks`). Nought until a
    // hand or a move asks for them.
    const markWide = ink(el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: birdR, fill: 'none', 'stroke-width': HALO_WIDE.w, opacity: 0 }, hg), 'stroke', '#ffe0a0');
    const markCrisp = ink(el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: birdR, fill: 'none', 'stroke-width': HALO_CRISP.w, opacity: 0 }, hg), 'stroke', '#ffeec0');
    // (evenly dotted, so it needs no turn to start at twelve: only the sweeps,
    // which are progress, start there)
    const orn = ink(el('circle', { class: 'orn', cx: x.toFixed(1), cy: y.toFixed(1), r: ornR().toFixed(2), fill: 'none', 'stroke-width': ornW().toFixed(2), opacity: 0 }, hg), 'stroke', WAIT_INK);
    // and its focus mark, one ornament gap outside the ornament (K24)
    const focusMark = focusRing(hg, x, y, ornR() + ornW() + ORN_GAP);
    haloOn[i] = { wide, crisp };
    haloLit[i] = +(was ? was.halo : 0).toFixed(3);
    haloFlash[i] = flash;
    // A cell rebuilt while its bird is held is rebuilt where the bird stands,
    // lights and all, and at the size its place draws it at; at rest this
    // writes nothing.
    const sz = drawnSize(i);
    const halo = kx === x && ky === y && sz === 1 ? '' : haloAt(x, y, kx, ky, sz);
    if (halo) hg.setAttribute('transform', halo);
    if (sz !== 1) knot.setAttribute('transform', `translate(${kx.toFixed(1)} ${ky.toFixed(1)}) scale(${sz.toFixed(4)})`);
    const bird2 = birdOf(c.id);
    const node: CellNode = { ...c, g, knot, glyph: gl, glyphLevel, glyphOut: null, fadeAt: 0,
      title, word, sub, sub2, lines, linesOut: null, linesFrom: 1, linesAt: 0, saidLines: '', consequent: false, gt, bb, hg, x, y, f,
      dx: kx - x, dy: ky - y, wx: 0, wy: 0, put: '', putKnot: '', putHalo: halo,
      bird: bird2, pendFill, holdArc, markWide, markCrisp, orn,
      markAt: was ? was.mark : 0, ornAt: was ? was.orn : 0, markSaid: '',
      fillFrom: was ? was.fillFrom : -1, fillP: was ? was.fillP : 0,
      value: valueOf(bird2), held: controls && heldValue.has(bird2), pulling: false,
      implied: null, impliedFor: -1, impliedTheme: -1, impliedAt: 0, impliedTrail: 0, impliedNext: false, impliedR: null,
      saidTitle: '', saidArc: '' };
    g.addEventListener('focus', () => { pointCell(node); showTell(node); markFocus(g, focusMark, true); });
    g.addEventListener('blur', () => { pointCell(null); markFocus(g, focusMark, false); });
    g.addEventListener('keydown', (ev: KeyboardEvent) => cellKey(node, ev));
    cellNodes.push(node);
  });
  paintAll(r);
  sayCells(r);
  wordStep = Math.round(starDeg / 15);
  placeWords(starDeg);
  paintHeld(r);
  // the phone's panel stays open on the same bird across a rebuild
  if (panelCell) { const id = panelCell.id; panelCell = cellNodes.find((c) => c.id === id) ?? null; paintPanel(); }
}

// ==========================================================================
// **Where a bird's words stand** (Eugene, round K3: *"improve the floating
// label positioning to be closer to the bird circles in various cases"* — his
// pictures had Ember's words over its bird, Zephyr's far out from it and
// Root's floating above it). The words used to stand at one radius inside the
// star whatever the bird did; they follow the bird now.
//
// Each frame the words are placed from the bird's own place and size, in the
// upright frame the words are read in: a box a fixed `WORD_GAP` off the bird's
// drawn edge — **below the bird** whenever below is clear, then below and to a
// side, then to a side (the side towards the centre first), and, only when all
// of those are refused, **inside**, towards the centre between the bird and
// the transport. Clear means off every bird's circle, every word already
// placed, the transport (the centre disc with its four actions, and the seed's
// caption) — and **never over the track**: a box reaching past the lane band's
// inner edge is refused outright, as a bird under it is (round K4). The box is
// the widest the words can be (measured once), so a title taking a percent
// moves nothing. The words' sheet lies over the star's lines and under the
// birds.
//
// **A side is kept, and the sway alone never moves it** (round K4: *"the text
// jumps, changing position due to the slow bird move, and it looks like a
// glitch"*). Below first is asked only when a bird's words are first placed
// and when the bird comes to rest at a new place — a drop, a release, a link,
// the square changing. A side is then taken only if it is clear by
// `WORD_SLACK` units at every turn the sway can carry the star to at this
// tempo (its excursion and its wander, a degree over, never past the birds'
// 14°; the arrangement turning as one), or, where the ring has no such side,
// clear now and through as much of the sway as any; and off the track through
// the whole of it, always. After that a bird no hand is on keeps its side
// whatever the sway does — it gives it up only to a bird a hand is moving, or
// that bird's words — and a bird under a hand keeps its side while it is clear
// to within `WORD_HOLD`, however much better another side has become. The
// sides are fixed directions — below, below-left, below-right, left, right —
// turned with the star's continuous turn, so the words keep their place about
// their bird as the birds keep theirs about one another; "towards the centre"
// is an order of asking and never a meaning, so a bird swaying across the
// vertical does not turn one side into the other.
//
// **The wander is part of the sway** (K14). Each bird wanders a few units off
// its place on its own clock (`wanderAt`), and its words with it, so two
// neighbours' words close and open by up to twice `FLEX_REACH`. The keep used
// to read them where they stood, and in WebKit's wider face on the phone's
// square Tide's words wandered onto Veil's and Veil's jumped to another side.
// A bird at rest now asks its keep with every bird at rest stood at its place
// (`calm`), so the wander, like the sway, never takes a side away; and a side
// is taken clear of the others' words by `wordFlex` more than the slack, so
// the wander never carries two birds' words onto each other either.
/** A bird's subtitle on a small square: the big word's light at this share of it, and its size in ring units — the desktop's, since a size up crowded the words in WebKit (round K15). */
const SUB_SMALL_OP = 0.85;
const SUB_SMALL_SIZE = 10;
const WORD_GAP = 8;
const WORD_SLACK = 6;
const WORD_HOLD = 3;
/** How far the star's wander can carry a bird off its place, which a side off the track must allow for. */
const WORD_WANDER = 9;
/** And how long after the last bird moved the sides are still asked afresh, while the room round them settles. */
const WORD_SETTLE = 250;
let wordStirred = -Infinity;
/** The star's continuous turn when each bird's side was taken. */
const wordTurn = new Float64Array(8);
/** And how crowded the side was then, within `WORD_HOLD`: nought where it was clear. */
const wordCost = new Float64Array(8);
/** The order the birds' sides are asked in: the crowded first. */
let wordSeq: number[] = [];
/** The fresh birds' sides as last searched together, and the stir they were searched for. */
const wordSolved: (number | undefined)[] = [];
let wordSolvedAt = NaN;
let wordSolvedT = -Infinity;
let wordSolvedN = 0;
/** When a bird on a crowded side last looked for a clear one. */
const wordRetry = new Float64Array(8);
/** The side each bird's words are on: 0 below, 1 and 2 below-left and below-right, 3 and 4 left and right, 5 to 7 inside, 8 on round the bird. */
const wordSide = new Int8Array(8);
/** Where each bird stood (its target radius and the control size) when its side was last asked below-first. */
const wordKey: string[] = [];
const wordKeyTo = new Float64Array(8).fill(NaN);
const wordKeyBird = new Float64Array(8).fill(NaN);
/** And where each bird's words were last put, upright, with the bird they stand off: for the bench. */
const wordAt: { box: Box; aim: Box; bird: { x: number; y: number; r: number }; side: number; cost: number; below: number; t: number }[] = [];
/** The direction each bird's words stand in, upright, as it glides; and how quickly it follows a change of side. */
const wordAng: (number | null)[] = [];
const WORD_EASE = 120;
/**
 * **Two birds' words are kept clear through the wander** (K14). Each bird
 * wanders `FLEX_REACH` off its place along either axis, and its words with it,
 * so two birds' words can close by twice that: a side being taken is clear of
 * the others' words by `WORD_SLACK` more than that, and a side kept is asked
 * with every bird at rest stood at its place. Nought under reduced motion,
 * where nothing wanders.
 */
const wordFlex = () => (REDUCED ? 0 : 2 * FLEX_REACH);

/** An upright box's distance from a point, nought inside it. */
function boxDist(b: Box, x: number, y: number): number {
  const dx = Math.max(b.x - x, 0, x - (b.x + b.w));
  const dy = Math.max(b.y - y, 0, y - (b.y + b.h));
  return Math.hypot(dx, dy);
}
const boxesMeet = (a: Box, b: Box, pad = 0) =>
  a.x - pad < b.x + b.w && b.x < a.x + a.w + pad && a.y - pad < b.y + b.h && b.y < a.y + a.h + pad;

function placeWords(turnDeg: number) {
  turnWords(turnDeg, true);
}

/** Every forty-eighth of the way round: a word's last sides, worked out once. */
const WORD_RING: readonly Pt[] = Array.from({ length: 48 }, (_, k) => [Math.cos((k / 48) * TAU), Math.sin((k / 48) * TAU)] as Pt);

/** The ring as the placer reads it on one call: the birds where they are drawn, and the words placed so far. */
interface WordRoom {
  turnDeg: number;
  birds: { x: number; y: number; r: number }[];
  placed: (Box | undefined)[];
  transport: number;
  caption: Box;
  swayReach: number;
  /** Each bird at rest's own wander, upright — nought for a bird a hand, a lift, a slide or a spin is moving. */
  calm: Pt[];
}

function wordRoom(turnDeg: number): WordRoom {
  const t = (turnDeg / 360) % 1;
  // every bird where it is drawn, upright
  const birds = cellNodes.map((c, i) => {
    const [x, y] = rot(c.x + c.dx, c.y + c.dy, t);
    return { x, y, r: birdR * drawnSize(i) };
  });
  // How far the sway can carry the star at this tempo — its excursion and its
  // wander, a degree over — and never past the birds' fourteen
  const reachOf = (x: { sway: number; drift: number }) => x.sway + x.drift;
  const swayWant = swayOf(last ? tempoNow(last) : SWAY_FAST.bpm);
  // The wander each bird at rest carries, upright: what it is drawn at off
  // the place it keeps (K14, below). A bird anything else is moving has none
  // taken out: whatever moves it is real.
  const a = t * TAU;
  const calm = cellNodes.map((c, i): Pt => {
    if (c.pulling || cellLift[i] !== 0 || cellR[i] !== cellTo[i] || spinAngle !== 0) return [0, 0];
    const [px, py] = onSpoke(i, cellR[i], cellSide[i]);
    const ox = c.x + c.dx - px;
    const oy = c.y + c.dy - py;
    return [ox * Math.cos(a) - oy * Math.sin(a), ox * Math.sin(a) + oy * Math.cos(a)];
  });
  return {
    turnDeg,
    birds,
    calm,
    placed: [],
    // the transport: the core's disc and the four actions on its edge, each
    // with four units of air
    transport: ctrlR + 4,
    caption: { x: C - 66, y: C + R_ACT + ctrlR + 1, w: 132, h: 14 },
    swayReach: Math.min(BIRD_DOMAIN - 1, Math.max(reachOf(swayWant), swayCurve ? reachOf(swayCurve) : 0) + 1),
  };
}

/** A bird's words' box off a bird standing at (bx, by) of radius `r`, out along (dx, dy) until its nearest point is the gap. */
function wordBoxOff(r: number, w: number, h: number, bx: number, by: number, dx: number, dy: number): Box {
  let along = r + WORD_GAP + (Math.abs(dx) * w) / 2 + (Math.abs(dy) * h) / 2;
  let box: Box = { x: 0, y: 0, w, h };
  for (let k = 0; k < 6; k++) {
    box = { x: bx + dx * along - w / 2, y: by + dy * along - h / 2, w, h };
    const off = boxDist(box, bx, by) - (r + WORD_GAP);
    if (Math.abs(off) < 0.05) break;
    along -= off;
  }
  return box;
}

/** Whether a box of width `w` reaches over the track: a corner past the lane band's inner edge. */
function wordOnTrack(box: Box, w: number, pad = 0): boolean {
  const h = box.h;
  return Math.max(Math.hypot(box.x - C, box.y - C), Math.hypot(box.x + w - C, box.y - C),
    Math.hypot(box.x - C, box.y + h - C), Math.hypot(box.x + w - C, box.y + h - C)) > R_BAND_IN - 2 - pad;
}

/** Side `k` of a bird standing at `b`, as the placer's own list turns it with the star. */
function wordDir(b: { x: number; y: number }, k: number, turnDeg: number): Pt {
  const d = Math.SQRT1_2;
  if (k >= 5 && k < 8) {
    let ux = C - b.x;
    let uy = C - b.y;
    const un = Math.hypot(ux, uy) || 1;
    ux /= un;
    uy /= un;
    return k === 5 ? [ux, uy] : k === 6 ? [(ux - uy) * d, (uy + ux) * d] : [(ux + uy) * d, (uy - ux) * d];
  }
  const base: Pt = k < 5 ? ([[0, 1], [-d, d], [d, d], [-1, 0], [1, 0]] as Pt[])[k] : WORD_RING[k - 8];
  const sw = ((turnDeg - spinAngle) * TAU) / 360;
  const cs = Math.cos(sw);
  const sn = Math.sin(sw);
  const [x, y] = base;
  return [x * cs - y * sn, x * sn + y * cs];
}

/**
 * Everything a bird's words are placed with: its candidate sides and what each
 * would cost, asked of the ring as it stands in `room`.
 */
function wordCtx(room: WordRoom, i: number) {
  const { birds, placed, transport, caption, swayReach, turnDeg, calm } = room;
  const c = cellNodes[i];
  const b = birds[i];
  const w = c.bb.width;
  const h = c.bb.height;
  const d = Math.SQRT1_2;
  // towards the centre, for the words of a bird with nowhere else off the track
  let ux = C - b.x;
  let uy = C - b.y;
  const un = Math.hypot(ux, uy) || 1;
  ux /= un;
  uy /= un;
  const dirs: Pt[] = [[0, 1], [-d, d], [d, d], [-1, 0], [1, 0]];
  // and, where even those are crowded, every forty-eighth of the way round
  for (let k = 0; k < 48; k++) dirs.push([WORD_RING[k][0], WORD_RING[k][1]]);
  // The fixed sides swing with the sway: "below" is below the bird as the
  // star stands at north, turned with the star's continuous turn — so under
  // the sway every bird's words keep their place about the bird as the
  // birds keep theirs about one another, and the arrangement turns as one.
  const sw = ((turnDeg - spinAngle) * TAU) / 360;
  const cs = Math.cos(sw);
  const sn = Math.sin(sw);
  for (const q of dirs) { const [x, y] = q; q[0] = x * cs - y * sn; q[1] = x * sn + y * cs; }
  dirs.splice(5, 0, [ux, uy], [(ux - uy) * d, (uy + ux) * d], [(ux + uy) * d, (uy - ux) * d]);
  // **Below the bird, and never above it** (round K3: *"text should be under
  // the bird circle"*), the side towards the centre asked first of the two
  const r2 = b.x < C;
  const order = [0, r2 ? 2 : 1, r2 ? 1 : 2, r2 ? 4 : 3, r2 ? 3 : 4, 5, 6, 7];
  for (let k = 8; k < dirs.length; k++) order.push(k);
  // The words' box off a bird standing at (bx, by), out along (dx, dy) until
  // the box's nearest point is the gap off the bird's edge: exact for a box
  // square to it, and a few steps of walking back in for a box met at a
  // slant, whose nearest point is a corner and not a side.
  const boxOff = (bx: number, by: number, dx: number, dy: number): Box => {
    let along = b.r + WORD_GAP + (Math.abs(dx) * w) / 2 + (Math.abs(dy) * h) / 2;
    let box: Box = { x: 0, y: 0, w, h };
    for (let k = 0; k < 6; k++) {
      box = { x: bx + dx * along - w / 2, y: by + dy * along - h / 2, w, h };
      const off = boxDist(box, bx, by) - (b.r + WORD_GAP);
      if (Math.abs(off) < 0.05) break;
      along -= off;
    }
    return box;
  };
  const boxAt = (dx: number, dy: number) => boxOff(b.x, b.y, dx, dy);
  const boxFor = (k: number) => boxAt(dirs[k][0], dirs[k][1]);
  // **Never over the track** (round K4: *"preferably labels should not go
  // over the track circle"*): a corner past the lane band's inner edge
  const onTrack = (box: Box, pad = 0) => Math.max(...[[box.x, box.y], [box.x + w, box.y], [box.x, box.y + h], [box.x + w, box.y + h]]
    .map(([x, y]) => Math.hypot(x - C, y - C))) > R_BAND_IN - 2 - pad;
  // What a spot costs with the star turned `dt` of a turn from where it is
  // now: a bird, a word, the transport or the seed's caption under it, three
  // each; the track, everything. The birds and the words already placed turn
  // with the star, the transport does not. `pad` is how much clearer than
  // touching a spot must be — `WORD_SLACK` for a side being taken, nought for
  // the side the words are on.
  // `still`: every bird at rest stands at its place, the wander taken out (K14).
  const costAt = (k: number, pad: number, dt: number, words = true, still = false): number => {
    const off = (q: number): Pt => (still ? calm[q] : [0, 0]);
    const [bx, by] = dt ? rot(b.x - off(i)[0], b.y - off(i)[1], dt) : [b.x - off(i)[0], b.y - off(i)[1]];
    let [dx, dy] = dirs[k];
    if (dt) { const a = dt * TAU; [dx, dy] = [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)]; }
    const box = boxOff(bx, by, dx, dy);
    if (onTrack(box, Math.max(0, pad))) return Infinity;
    let n2 = 0;
    for (let j = 0; j < birds.length; j++) {
      const [jx, jy] = dt ? rot(birds[j].x - off(j)[0], birds[j].y - off(j)[1], dt) : [birds[j].x - off(j)[0], birds[j].y - off(j)[1]];
      if (boxDist(box, jx, jy) < birds[j].r + (j === i ? WORD_GAP - 0.5 : 2 + pad)) n2 += 3;
    }
    // the words already placed this frame, and where the rest stood the last
    // one — so a side taken here is never one a later bird's words are on
    for (let q = 0; q < cellNodes.length && words; q++) {
      if (q === i) continue;
      let p = placed[q] ?? wordAt[q]?.aim;
      if (!p) continue;
      if (still) p = { x: p.x - off(q)[0], y: p.y - off(q)[1], w: p.w, h: p.h };
      if (dt) {
        // the arrangement turns as one: the box's centre about the ring's
        const [ox, oy] = rot(p.x + p.w / 2, p.y + p.h / 2, dt);
        p = { x: ox - p.w / 2, y: oy - p.h / 2, w: p.w, h: p.h };
      }
      if (boxesMeet(box, p, pad > 0 ? pad + wordFlex() : pad)) n2 += 3;
    }
    if (boxDist(box, C, C) < R_CORE + 4 + pad) n2 += 3;
    for (const q of actionNodes) if (boxDist(box, q.x, q.y) < transport + pad) n2 += 3;
    if (boxesMeet(box, caption, pad)) n2 += 3;
    return n2;
  };
  const costOf = (k: number, pad: number) => costAt(k, pad, 0);
  // **Clear through the whole sway**: a side being taken is asked at every
  // turn the sway can carry the star to at this tempo, either side of
  // north, so that the sway alone never blocks it later.
  const swayTurns = [-1, -2 / 3, -1 / 3, 0, 1 / 3, 2 / 3, 1].map((u) => (swayReach * u - (turnDeg - spinAngle)) / 360);
  /** How much of the sway a side is clear through, by the slack: 0 to 1. */
  // A bird under a hand can be taken out to the rim, lifted: its side must
  // be off the track there as well, or the words would have to glide round
  // across the track to get off it
  const rimR = radiusFor(c.bird, 1);
  const atRim = (k: number) => {
    const out = rimR / (Math.hypot(b.x - C, b.y - C) || 1);
    const rb = birdR * SIZE_RIM * (1 + LIFT);
    const [dx, dy] = dirs[k];
    let along = rb + WORD_GAP + (Math.abs(dx) * w) / 2 + (Math.abs(dy) * h) / 2;
    const bx = C + (b.x - C) * out;
    const by = C + (b.y - C) * out;
    let box: Box = { x: 0, y: 0, w, h };
    for (let n = 0; n < 6; n++) {
      box = { x: bx + dx * along - w / 2, y: by + dy * along - h / 2, w, h };
      const off = boxDist(box, bx, by) - (rb + WORD_GAP);
      if (Math.abs(off) < 0.05) break;
      along -= off;
    }
    return !onTrack(box);
  };
  /** Off the track at every turn the sway can reach, by the slack — and, under a hand, at the rim. */
  const offTrack = (k: number) => (!c.pulling || atRim(k)) && swayTurns.every((dt) => {
    const [bx, by] = rot(b.x, b.y, dt);
    const a = dt * TAU;
    const [dx, dy] = dirs[k];
    return !onTrack(boxOff(bx, by, dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)), WORD_WANDER);
  });
  const clearFor = (k: number) => {
    if (costAt(k, WORD_SLACK, 0) !== 0 || !offTrack(k)) return -1;
    let n = 0;
    for (const dt of swayTurns) if (costAt(k, WORD_SLACK, dt) === 0) n++;
    return n / swayTurns.length;
  };
  const robust = (k: number) => clearFor(k) === 1;
  return { c, b, w, h, dirs, order, boxAt, boxFor, onTrack, costAt, costOf, swayTurns, offTrack, clearFor, robust };
}
type WordCtx = ReturnType<typeof wordCtx>;

/**
 * **What the placer costs, for the bench** (R71): how many times it ran, how
 * long it took, and how many birds were asked afresh against how many kept
 * their side on the cheap path. Nothing is drawn off it.
 */
const placer = { calls: 0, ms: 0, full: 0, kept: 0 };

/**
 * **A bird at rest keeps its side without the whole question being asked
 * again** (the reconciled review of 09-24, R71: the placer ran about ninety
 * times a second, every bird's eight sides asked through the whole sway on
 * every frame the star moved, and eight of every ten of its cost calls worked
 * out a reading only the bench looks at). A bird no hand is on, at rest, not
 * whirled, whose side was last kept clear with nothing crowding it, keeps it
 * while nothing but the star's own motion has moved: the sway turns the birds
 * and their words as one, so a question asked with the star turned back to
 * where the side was taken has the answer it had (round (c2)'s keep path). The
 * one part of it the sway does reach — whether the side has swung onto the
 * track — is still asked every frame, and each bird is asked the whole
 * question again in turn, one a call, so the wander is never left unread for
 * more than eight calls. Anything else moving — a bird under a hand, sliding,
 * lifted, a side changing, the size, the words' own boxes — asks every bird.
 */
const wordEasy = new Uint8Array(8);
let wordRoomSig = new Float64Array(0);
let wordCheck = 0;
function wordRoomMoved(): boolean {
  const n = cellNodes.length;
  const len = n * 9 + 4;
  const sig = wordRoomSig.length === len ? wordRoomSig : new Float64Array(len);
  let moved = sig !== wordRoomSig;
  const put = (k: number, v: number) => { if (sig[k] !== v) { sig[k] = v; moved = true; } };
  for (let j = 0; j < n; j++) {
    const c = cellNodes[j];
    const o = j * 9;
    put(o, cellR[j]); put(o + 1, cellTo[j]); put(o + 2, cellLift[j]); put(o + 3, cellSide[j]);
    put(o + 4, c.pulling ? 1 : 0); put(o + 5, wordSide[j]); put(o + 6, c.bb.width); put(o + 7, c.bb.height);
    put(o + 8, c.bb.x + c.bb.y);
  }
  put(n * 9, birdR); put(n * 9 + 1, ctrlR); put(n * 9 + 2, spinAngle); put(n * 9 + 3, REDUCED ? 1 : 0);
  wordRoomSig = sig;
  return moved;
}

function turnWords(turnDeg: number, force: boolean) {
  const began = performance.now();
  placer.calls += 1;
  const t = (turnDeg / 360) % 1;
  const room = wordRoom(turnDeg);
  const { birds, placed } = room;
  const now = performance.now();
  const crowded: number[] = [];
  if (wordSeq.length !== cellNodes.length) wordSeq = cellNodes.map((_, i) => i);
  const ctxCache: (WordCtx | undefined)[] = [];
  const ctxOf = (i: number): WordCtx => (ctxCache[i] ??= wordCtx(room, i));
  if (wordRoomMoved()) wordEasy.fill(0);
  const checked = cellNodes.length ? wordCheck % cellNodes.length : 0;
  wordCheck = checked + 1;
  // A bird that has come to rest somewhere new stirs the room: for a moment
  // every bird at rest asks for its side afresh
  const settledOf = (i: number) => !cellNodes[i].pulling && cellR[i] === cellTo[i];
  for (let i = 0; i < cellNodes.length; i++) {
    if (!settledOf(i) || (cellTo[i] === wordKeyTo[i] && birdR === wordKeyBird[i])) continue;
    wordKeyTo[i] = cellTo[i];
    wordKeyBird[i] = birdR;
    const key = `${cellTo[i].toFixed(3)}|${birdR}`;
    if (wordKey[i] !== key) { wordKey[i] = key; wordStirred = now; }
  }
  const freshOf = (i: number) => wordAng[i] == null || (settledOf(i) && now - wordStirred < WORD_SETTLE);
  // **Asked afresh, the sides are asked together**: one bird taking the first
  // clear side can take the only room a neighbour had, so the fresh birds'
  // sides are searched as one — each a side clear through the whole sway of
  // everything but words and off the track, no two birds' words within
  // `WORD_SLACK` of one another, the preferred order of each kept wherever the
  // search allows — and only where no such arrangement exists does each bird
  // take its own best in turn.
  // (searched when the room stirs and then every half `WORD_EASE` while the
  // window lasts, not every frame: the others' words are asked where they are
  // going, so an answer holds for a few frames)
  const fresh8 = cellNodes.map((_, i) => i).filter(freshOf);
  const unplaced = fresh8.some((i) => wordAng[i] == null);
  if (fresh8.length && (unplaced || wordSolvedAt !== wordStirred || wordSolvedN !== cellNodes.length || now - wordSolvedT > WORD_EASE / 2)) {
    wordSolvedAt = wordStirred;
    wordSolvedT = now;
    wordSolvedN = cellNodes.length;
    wordSolved.length = 0;
    const solved = wordSolved;
    const fixed: Box[] = [];
    for (let j = 0; j < cellNodes.length; j++) if (!fresh8.includes(j) && wordAt[j]?.aim) fixed.push(wordAt[j].aim);
    const cands = new Map<number, { k: number; box: Box; firm: boolean }[]>();
    for (const i of fresh8) {
      const x = ctxOf(i);
      const firm: { k: number; box: Box; firm: boolean }[] = [];
      const loose: { k: number; box: Box; firm: boolean }[] = [];
      for (const k of x.order) {
        if (!x.offTrack(k) || x.costAt(k, WORD_SLACK, 0, false) !== 0) continue;
        const box = x.boxFor(k);
        if (fixed.some((q) => boxesMeet(box, q, WORD_SLACK))) continue;
        // clear of everything but words through the whole sway first, then clear now
        const f = x.swayTurns.every((dt) => x.costAt(k, WORD_SLACK, dt, false) === 0);
        (f ? firm : loose).push({ k, box, firm: f });
      }
      cands.set(i, [...firm, ...loose]);
    }
    const seq = [...fresh8].sort((p, q) => cands.get(p)!.length - cands.get(q)!.length);
    const pick: { k: number; box: Box; firm: boolean; i: number }[] = [];
    const calmBox = (j: number, bx: Box): Box => ({ x: bx.x - room.calm[j][0], y: bx.y - room.calm[j][1], w: bx.w, h: bx.h });
    let budget = 20000;
    // every bird on a side clear through the whole sway if that can be done,
    // and only then a side clear now for the birds that need one
    let firmOnly = true;
    const dfs = (n: number): boolean => {
      if (n === seq.length) return true;
      for (const cand of cands.get(seq[n])!) {
        if (firmOnly && !cand.firm) continue;
        if (--budget < 0) return false;
        if (pick.some((q) => boxesMeet(calmBox(seq[n], cand.box), calmBox(q.i, q.box), WORD_SLACK + wordFlex()))) continue;
        pick.push({ ...cand, i: seq[n] });
        if (dfs(n + 1)) return true;
        pick.pop();
      }
      return false;
    };
    let found = dfs(0);
    if (!found) { firmOnly = false; budget = 20000; pick.length = 0; found = dfs(0); }
    if (found) seq.forEach((i, n) => { solved[i] = pick[n].k; });
  }
  const solved = wordSolved;
  for (const i of wordSeq) {
    const c = cellNodes[i];
    const b = birds[i];
    const w = c.bb.width;
    const h = c.bb.height;
    // Below-first is asked when the words are first placed and when the bird
    // has come to rest somewhere new; otherwise the side they are on is kept
    // while it is clear.
    // asked afresh on every frame until the room round it has settled, so a
    // side is never chosen against where a neighbour's words were a moment ago
    const fresh = freshOf(i);
    const was = wordSide[i];
    // **Under the sway alone nothing is asked again.** A bird no hand is on,
    // at rest on its place and not whirled by a finger, asks whether its side
    // is still clear with the star turned back to where it stood when the side
    // was taken — so the sway, which turns the birds and their words as one,
    // is taken out of the question, and only something else arriving on it (a
    // bird a hand is moving, words that moved for their own reason) can take
    // the side away. A bird under a hand asks the same at the turn it is at.
    // Either way a side is kept while it is clear to within `WORD_HOLD`.
    const cont = turnDeg - spinAngle;
    const still = !c.pulling && cellLift[i] === 0 && cellR[i] === cellTo[i] && spinAngle === 0;
    // **The cheap path**: a bird at rest whose side was kept clear, with
    // nothing but the star moving since (`wordEasy`), keeps it while it is off
    // the track; each bird in turn is still asked the whole question.
    const easy = !fresh && still && wordEasy[i] === 1 && wordCost[i] === 0 && wordAng[i] != null && i !== checked;
    const boxAtE = (dx: number, dy: number) => wordBoxOff(b.r, w, h, b.x, b.y, dx, dy);
    if (easy && !wordOnTrack(boxAtE(...wordDir(b, was, turnDeg)), w)) {
      placer.kept += 1;
      const dir = wordDir(b, was, turnDeg);
      const want = Math.atan2(dir[1], dir[0]);
      const dtW = Math.min(FRAME_STEP, now - (wordAt[i]?.t ?? now));
      let a0 = REDUCED ? want : wordAng[i]!;
      let da = want - a0;
      while (da > Math.PI) da -= TAU;
      while (da < -Math.PI) da += TAU;
      if (Math.abs(da) > 0.01) {
        const clearWay = (span: number) => {
          for (let k = 1; k < 8; k++) {
            const a = a0 + (span * k) / 8;
            if (wordOnTrack(boxAtE(Math.cos(a), Math.sin(a)), w)) return false;
          }
          return true;
        };
        const other = da > 0 ? da - TAU : da + TAU;
        if (!clearWay(da) && clearWay(other)) da = other;
      }
      a0 += da * (1 - Math.exp(-dtW / WORD_EASE));
      wordAng[i] = a0;
      const box = boxAtE(Math.cos(a0), Math.sin(a0));
      const aim = boxAtE(dir[0], dir[1]);
      placed[i] = aim;
      wordAt[i] = { box, aim, bird: b, side: was, cost: NaN, below: NaN, t: now };
      const ox = box.x + w / 2 - (c.bb.x + w / 2);
      const oy = box.y + h / 2 - (c.bb.y + h / 2);
      const [lx, ly] = rot(ox, oy, -t);
      const tr = `translate(${lx.toFixed(1)} ${ly.toFixed(1)}) rotate(${(-turnDeg).toFixed(2)})`;
      if (force || c.put !== tr) { c.gt.setAttribute('transform', tr); c.put = tr; }
      continue;
    }
    placer.full += 1;
    const { dirs, order, boxAt, boxFor, onTrack, costAt, costOf, offTrack, clearFor } = ctxOf(i);
    const back = still ? (wordTurn[i] - cont) / 360 : 0;
    let best = -1;
    // (a side taken where nothing was clear is kept while it is no more
    // crowded than it was when it was taken)
    const keep = !fresh && costAt(was, -WORD_HOLD, back, true, still) <= wordCost[i] && !onTrack(boxFor(was));
    // a crowded side is left for a clear one as soon as there is one
    const retry = keep && wordCost[i] > 0 && (!still || now - wordRetry[i] > WORD_SETTLE);
    if (retry) wordRetry[i] = now;
    if (keep && (wordCost[i] === 0 || !retry || !order.some((k) => clearFor(k) > 0))) best = was;
    else if (fresh && solved[i] !== undefined) best = solved[i]!;
    // a new side: the first clear through the whole sway, else the one clear
    // now and through the most of it, the order breaking a tie
    else {
      let most = 0;
      for (const k of order) {
        const f = clearFor(k);
        if (f > most) { most = f; best = k; if (f === 1) break; }
        else if (f >= 0 && best < 0) { best = k; }
      }
    }
    if (best < 0) {
      // nowhere clear by the slack: the least crowded spot off the track
      // through the whole sway, the one the words are on winning a tie, and
      // inside before the rest
      const safe = order.filter(offTrack);
      const pool = safe.length ? safe : order;
      best = pool.includes(was) && !fresh ? was : pool.includes(5) ? 5 : pool[0];
      let bestC = costOf(best, 0);
      for (const k of pool) { const ck = costOf(k, 0); if (ck < bestC) { best = k; bestC = ck; } }
    }
    const bestN = costOf(best, 0);
    if (best !== was || fresh) { wordTurn[i] = cont; wordCost[i] = costAt(best, -WORD_HOLD, 0, true, still); }
    wordSide[i] = best;
    // kept clear, at rest, with nothing crowding it: the cheap path from here
    wordEasy[i] = keep && best === was && still && wordCost[i] === 0 ? 1 : 0;
    // **The side glides, round the bird, and never through it** (round K3,
    // his amendment: *"while dragging a bird, the label follows it around,
    // while never overlapping the bird's position"*). The words go the way the
    // chosen side points by turning their direction round the bird over
    // `WORD_EASE`, and every direction on the way is placed at the gap by the
    // same walk — so a change of side is a glide round the circle, never a
    // jump, and it goes round the way that keeps off the track when one way
    // does.
    const want = Math.atan2(dirs[best][1], dirs[best][0]);
    const dtW = Math.min(FRAME_STEP, now - (wordAt[i]?.t ?? now));
    let a0 = REDUCED || wordAng[i] == null ? want : wordAng[i]!;
    let da = want - a0;
    while (da > Math.PI) da -= TAU;
    while (da < -Math.PI) da += TAU;
    if (Math.abs(da) > 0.01) {
      const clearWay = (span: number) => {
        for (let k = 1; k < 8; k++) {
          const a = a0 + (span * k) / 8;
          if (onTrack(boxAt(Math.cos(a), Math.sin(a)))) return false;
        }
        return true;
      };
      const other = da > 0 ? da - TAU : da + TAU;
      if (!clearWay(da) && clearWay(other)) da = other;
    }
    a0 += da * (1 - Math.exp(-dtW / WORD_EASE));
    wordAng[i] = a0;
    const box = boxAt(Math.cos(a0), Math.sin(a0));
    // (the others ask after where the words are going, not where they are on the way)
    const aim = boxFor(best);
    placed[i] = aim;
    if (fresh && bestN > 0) crowded.push(i);
    wordAt[i] = { box, aim, bird: b, side: best, cost: bestN, below: NaN, t: now };
    // the words' own origin, off the box's centre, back into the star's frame
    const ox = box.x + w / 2 - (c.bb.x + w / 2);
    const oy = box.y + h / 2 - (c.bb.y + h / 2);
    const [lx, ly] = rot(ox, oy, -t);
    const tr = `translate(${lx.toFixed(1)} ${ly.toFixed(1)}) rotate(${(-turnDeg).toFixed(2)})`;
    if (force || c.put !== tr) { c.gt.setAttribute('transform', tr); c.put = tr; }
  }
  // While the sides are being asked afresh, a bird that found nowhere clear is
  // asked first on the next frame, before its neighbours take the room it needs
  if (crowded.length) wordSeq = [...crowded, ...wordSeq.filter((j) => !crowded.includes(j))];
  placer.ms += performance.now() - began;
}

/**
 * **A bird's words, as the bench reads them**: where they stand, and — worked
 * out here, on the bench's asking, and not on every frame — whether below was
 * clear for them (`below`, nought where it was) and what their spot costs.
 */
function wordReading(i: number) {
  const at = wordAt[i];
  if (!at || !cellNodes[i]) return null;
  const room = wordRoom(starDeg);
  for (let q = 0; q < cellNodes.length; q++) room.placed[q] = wordAt[q]?.aim;
  const x = wordCtx(room, i);
  return { ...at, cost: x.costOf(at.side, 0), below: x.robust(0) ? 0 : 1 };
}

function rot(x: number, y: number, t: number): Pt {
  const a = t * TAU;
  const dx = x - C;
  const dy = y - C;
  return [C + dx * Math.cos(a) - dy * Math.sin(a), C + dx * Math.sin(a) + dy * Math.cos(a)];
}

// What the eight say to a screen reader, which sees no words on the star: the
// bird, what it means, and the reading itself — the same line the tell draws.
function sayCells(r: Readout) {
  for (const c of cellNodes) sayCell(c, r);
}

function repaintCells(r: Readout) {
  paintAll(r);
  sayCells(r);
  paintPanel();
}

/**
 * **The die a value implies now**, which is the sub-line under a hand.
 *
 * It is the plan's own answer and not a second one: the theme the promise is
 * about is planned under the spell the hand is holding, and the cell's own
 * reading is taken off it by exactly the function that reads the playing
 * theme's. So a pull that implies the same die reads the same die, which is
 * the ring not hiding how far a bird reaches (`notes/archive/2026-09-plans/cited/PLAN-BIRDS-UX.md` §5).
 *
 * Planning a theme is arithmetic and no audio, but it is not free — about
 * five to eleven milliseconds under house-v2 (round (c) of the reconciled
 * review of 09-24 measured 5.3 / 8.1 / 10.7 ms median, p90 and worst), which
 * is why a cast's candidates are planned ahead in idle slots — and a hand
 * moves faster than a theme needs planning, so it is worked
 * out at most eleven times a second and only when the value has actually moved.
 * Between those the cell keeps the last answer, which is the answer for a value
 * four thousandths away.
 */
/**
 * @param force `'now'` plans whatever the throttle says — the finger has just
 *   come off the slider; `true` plans at once only what is planned already or
 *   what the throttle allows, and otherwise asks for a paint when it does (R13:
 *   the phone's slider planned a whole theme on every notch it passed)
 */
function impliedDie(c: CellNode, r: Readout, now: number, force: boolean | 'now' = false): CellValue | null {
  // **The theme the promise is about: the one the cursor is on**, running or
  // stopped. Since Eugene's *"a bird move keeps the place"* (09-24) a pull
  // plans the theme playing again under the asked spell and hands over into it
  // at the bar the record is at, so running and stopped alike the promise is
  // about *this* theme — before, running, it was the one after, which a pull
  // entered at its intro. `mix.themeNumber` is one-based on the readout.
  const about = Math.max(0, r.mix.themeNumber - 1);
  // The answer goes stale when a theme lands as surely as when the hand moves.
  const fresh = c.implied && c.impliedTheme === about;
  if (fresh && Math.abs(c.value - c.impliedFor) < 0.004) return c.implied;
  const spell = { ...heldSpell(), [c.bird]: c.value } as Partial<Spell>;
  // **A promise planned already is read at once, whatever the throttle**: the
  // plans are kept by the whole request, so a hand going back over a value it
  // has passed costs nothing (R13).
  const known = !!control.plannedAlready(about, r.seed, control.state.strategyTo ?? r.strategy, spell);
  if (fresh && !known && force !== 'now' && now - c.impliedAt < IMPLIED_MS) {
    trailImplied(c, now);
    return c.implied;
  }
  c.impliedAt = now;
  c.impliedFor = c.value;
  c.impliedTheme = about;
  try {
    // **The whole request, asked of the one place that resolves it** (R57): the
    // recipe the set was cast under, the two modes and the theme length ride
    // with the spell, and the engine is the one the theme will arrive under.
    // It was planned here with the spell and the engine alone, and under
    // `?recipe=` the promise then named another instrument than the one that
    // would play (Zephyr's keys in 9 of 12 seeds).
    const t = control.planned(about, r.seed, control.state.strategyTo ?? r.strategy, spell) as any;
    c.impliedR = plannedReadout(t, r, spell);
    c.implied = cellValue(c.id, c.impliedR);
    // **And the other half of the same question**: what the pull changes in the
    // sound that is playing *now*, and whether the die it implies is a
    // different die from the one on the record. Worked out here so both halves
    // are one plan and one throttle.
    const playing = cellValue(c.id, r);
    c.impliedNext = String(c.implied.word ?? '') !== String(playing.word ?? '')
      || String(c.implied.sub ?? '') !== String(playing.sub ?? '');
  } catch (e) {
    // A plan that cannot be drawn says nothing rather than taking the ring
    // down: the value itself is still on the title line, which is the reading
    // the hand is actually moving. A bug under it is a report (R1).
    report('plan', 'the plan a pulled bird implies could not be drawn', e, { bird: c.bird }, aBug);
    c.implied = null;
    c.impliedR = null;
    c.impliedNext = false;
  }
  return c.implied;
}

/**
 * A planned theme read the way the ring reads a playing one, **with the spell
 * it was planned under**, which is what a cell's big word reads (round K13).
 */
function plannedReadout(t: any, r: Readout, spell: Partial<Spell> | null): Readout {
  return {
    ...r,
    spell: { ...HOUSE, ...(spell || {}) } as Readout['spell'],
    presetName: t.presetLabel,
    key: t.key.name,
    bpm: t.bpm,
    // The promise is about a theme that is not playing, so there is no grid
    // under it yet: what it implies is the tempo it is planned at.
    gridBpm: t.bpm,
    bars: t.bars,
    dice: t.dice,
    // what the planned theme's own program plays (K28's hats, K30's facts and
    // keys): spread from the playing readout they said the playing theme's,
    // and a hand's consequence on Spark's hats or Zephyr's keys read as none
    hats: hatsOfProgram(t.events, t.timeline),
    facts: programFactsOf(t.events, t.dice),
    keys: keysOfProgram(t.events, t.dice && t.dice.keysPreset) ?? null,
    durationLabel: r.durationLabel,
    plan: t.arrangement.sections.map((s: any) => ({
      label: s.label, kind: s.kind, startBar: s.startBar, bars: s.bars, index: s.index,
    })),
    track: t,
  } as Readout;
}

/**
 * **The whole ring reads the consequence of the hand** (Eugene, round K11b:
 * *"when I drag Ember the value of Zephyr changed too … the big label while
 * dragging should also extend to the other birds whose values will update
 * because of the dropped bird, so users have a clear understanding of the
 * consequences of the move for the whole ring"*). While a hand moves a bird,
 * and from the drop until the value plays, the theme that value implies is
 * already planned (`impliedDie`, the hand's bird's `impliedR`); every other
 * cell whose reading of that theme differs from its reading of **the same
 * theme planned without the hand** — the spell the set is playing under, the
 * next theme it would have played anyway — reads the implied one, cross-faded
 * as the hand's bird does. A cell the move does not touch reads the set, so a
 * theme turning over is not passed off as a consequence. The baseline is one
 * more plan for the whole drag, kept here by its request.
 */
let baseKey = '';
let baseR: Readout | null = null;
function consequence(r: Readout): { cell: CellNode | null; theme: Readout; base: Readout } | null {
  if (!controls) return null;
  const strategy = control.state.strategyTo ?? r.strategy;
  // the bird the hand is on, with the theme its value implies; or else, with an
  // ask out and not yet heard — a drop, a step, or a bird let go home (round
  // K12c) — the theme the whole ask implies
  const pull = cellNodes.find((c) => c.pulling && c.impliedR);
  let cell: CellNode | null = null;
  let theme: Readout | null = null;
  let about = -1;
  if (pull && pull.impliedR) { cell = pull; theme = pull.impliedR; about = pull.impliedTheme; }
  else if (cellNodes.some((c) => !c.pulling && !birdLanded(c.bird, r.spell))) {
    about = Math.max(0, r.mix.themeNumber - 1);
    const ask = heldSpell();
    const k = `${about}|${r.seed}|${strategy}|${JSON.stringify(ask)}`;
    if (k !== askKey) {
      askKey = k;
      askR = null;
      planSoon(about, r, strategy, ask, (t) => { if (askKey === k) askR = t; });
    }
    theme = askR;
    // the held bird that asked, when one did, reads its own value (K11)
    cell = cellNodes.find((c) => c.held && !birdLanded(c.bird, r.spell)) ?? null;
  }
  if (!theme) return null;
  const spell = (r.spell as Partial<Spell> | null) ?? null;
  const key = `${about}|${r.seed}|${strategy}|${JSON.stringify(spell)}`;
  if (key !== baseKey) {
    baseKey = key;
    baseR = null;
    planSoon(about, r, strategy, spell, (t) => { if (baseKey === key) baseR = t; });
  }
  return baseR ? { cell, theme, base: baseR } : null;
}

/**
 * **A plan the consequences read, never in the hand's own task** (round K12d:
 * the budget row measured a 51–53 ms long task in a pull — the first move
 * planned the value's theme and then the baseline beside it, in one task). A
 * plan already made is read at once; otherwise it is made in the next task and
 * the cells are read again then, so a drag plans its baseline once, a moment
 * after it begins, and the hand's frame carries only the value's own plan
 * (`impliedDie`, throttled as K11 throttles it).
 */
function planSoon(about: number, r: Readout, strategy: string, spell: Partial<Spell> | null, take: (t: Readout | null) => void) {
  const made = control.plannedAlready(about, r.seed, strategy, spell);
  if (made) { take(plannedReadout(made, r, spell)); return; }
  setTimeout(() => {
    try { take(plannedReadout(control.planned(about, r.seed, strategy, spell), r, spell)); } catch (e) {
      report('plan', 'the plan under a drag could not be drawn', e, {}, aBug);
      take(null);
    }
    if (last && cellNodes.length) { paintAll(last); paintHeld(last); }
  }, 0);
}
let askKey = '';
let askR: Readout | null = null;
const sameReading = (a: CellValue, b: CellValue) =>
  String(a.word ?? '') === String(b.word ?? '') && String(a.sub ?? '') === String(b.sub ?? '') && String(a.sub2 ?? '') === String(b.sub2 ?? '');

/** Every cell, the ones a hand holds first, so the rest read the plan they have just asked for. */
function paintAll(r: Readout) {
  for (const c of cellNodes) if (c.pulling || c.held) paintCell(c, r);
  for (const c of cellNodes) if (!c.pulling && !c.held) paintCell(c, r);
}

/** A hand's bird painted, and then every other cell, which reads its consequence. */
function paintHand(c: CellNode, r: Readout) {
  paintCell(c, r);
  sayCell(c, r);
  for (const o of cellNodes) if (o !== c) paintCell(o, r);
}

/** Paint the cell and its panel again once the throttle's window is over. */
function trailImplied(c: CellNode, now: number) {
  if (c.impliedTrail) return;
  c.impliedTrail = window.setTimeout(() => {
    c.impliedTrail = 0;
    if (!last || !cellNodes.includes(c)) return;
    paintHand(c, last);
    if (panelCell === c) paintPanel();
    // and the explanation, which reads the same plan (round K11)
    if (tell.at >= 0 && tell.cell === c && controls && (c.pulling || c.held)) showTell(c);
  }, Math.max(1, IMPLIED_MS - (now - c.impliedAt)) + 1);
}

/** One cell's four lines, and the two marks that say what a hand has done to it. */
function paintCell(c: CellNode, r: Readout) {
  // **The bird carries its short label at all times** (Eugene, 09-23: *"the
  // bird swaps short to long during drag and back on release, which is
  // jarring; stop that"*): three lines under the title, never the long words,
  // which live in the explanation beside it (`pullLine`).
  //
  // **And under a hand they are the reading the hand would leave** (Eugene,
  // round K11: *"the bird should change not only the percent but the label
  // itself, to what it would be if I dropped the bird right now"*). While a
  // hand moves the bird — the drag, the phone's slider and steps — and from the
  // drop until its value is the one playing, the three lines are the reading of
  // the theme the value implies (`impliedDie`, at most eleven plans a second
  // behind the hand, the last one always read), and they cross-fade over
  // `GLYPH_FADE` as the glyph does. At the seam the two readings are one, so
  // nothing changes there; a bird no hand is on reads the set, as it always did.
  const owned = controls && (c.pulling || c.held);
  const hand = c.pulling || (c.held && !birdLanded(c.bird, r.spell));
  if (hand) impliedDie(c, r, performance.now());
  // the glyph at the hand's value, cross-fading when it crosses a level
  followGlyph(c, r);
  // another bird's hand: this cell reads the move's consequence, where it has one
  const con = !(owned && hand) ? consequence(r) : null;
  let moved = false;
  let v = owned && hand && c.implied ? c.implied : cellValue(c.id, r);
  if (con && con.cell !== c) {
    const would = cellValue(c.id, con.theme);
    if (!sameReading(would, cellValue(c.id, con.base))) { v = would; moved = true; }
  }
  // The title line is the bird's name and, where a hand has moved it off the
  // house, **its percent of the house** — `EMBER 62%` — which is what a hand
  // reads instead of a fraction (Eugene, 09-23: *"0.45 is not obvious"*). The
  // house is 100 % and is not printed. On a finger the name goes and the
  // percent stays: the phone's birds carry the percent and the short reading,
  // and who each one is lives in the panel a tap opens.
  const pct = owned ? percentText(c.bird, c.value) : '';
  const title = COARSE ? pct : pct ? `${BIRD[c.id].name} ${pct}` : BIRD[c.id].name;
  const tu = title.toUpperCase();
  if (c.saidTitle !== tu) { c.saidTitle = tu; c.title.textContent = tu; }
  const up = String(v.word ?? '').toUpperCase();
  const su = String(v.sub ?? '').toUpperCase();
  const su2 = (COARSE ? '' : String(v.sub2 || '')).toUpperCase();
  const said = `${up}\n${su}\n${su2}`;
  if (c.saidLines !== said) {
    // a reading changed under a hand fades across; the first paint of a cell,
    // a set changing its own reading and reduced motion write it straight
    if (c.saidLines !== '' && (owned || moved || c.consequent) && !REDUCED) {
      const from = Number(c.lines.getAttribute('opacity') ?? 1);
      if (c.linesOut) c.linesOut.remove();
      const out = c.lines.cloneNode(true) as Mark<SVGGElement>;
      c.lines.parentNode!.insertBefore(out, c.lines);
      put(out, 'opacity', from.toFixed(3));
      c.linesOut = out;
      c.linesFrom = from;
      c.linesAt = performance.now();
      put(c.lines, 'opacity', 0);
    }
    c.saidLines = said;
  }
  c.consequent = moved;
  if (c.word.textContent !== up) c.word.textContent = up;
  if (c.sub.textContent !== su) c.sub.textContent = su;
  if (c.sub2.textContent !== su2) c.sub2.textContent = su2;
}

/** What each bird's marks want now: `[halo, ornament]`, each 0..1 (round K12). */
function markWant(c: CellNode, i: number): [number, number] {
  const r = last;
  const action = controls && (c.pulling || panelCell === c || (c.held && !!r && !birdLanded(c.bird, r.spell)));
  // another bird's move, while that move is a hand's or an ask not yet heard
  const moving = !!r && cellNodes.some((x) => x.pulling || !birdLanded(x.bird, r.spell));
  if (action || (c.consequent && moving)) return [1, 1];
  // the pointer on it, or a press on it that has not become a drag yet: the
  // halo holds from hover through the grab (round K12b)
  const d = dragging;
  const pressed = !!d && d.kind === 'pull' && d.cell === c;
  const hover = !COARSE && pointed === i && (!d || pressed);
  return [hover || pressed ? 1 : 0, 0];
}
let marksAt = 0;
/** The halo and the ornament, eased toward what each bird wants and written only when they change. */
function runBirdMarks(now: number) {
  const dt = Math.min(FRAME_STEP, now - (marksAt || now));
  marksAt = now;
  const k = REDUCED ? 1 : 1 - Math.exp(-dt / MARK_EASE);
  for (let i = 0; i < cellNodes.length; i++) {
    const c = cellNodes[i];
    const [hw, ow] = markWant(c, i);
    // a still press's sweep sits where the ornament does, and is the one drawn
    const ow2 = birdHoldDrawn === i ? 0 : ow;
    // the halo is on or off at once, as the transport's is; the ornament eases
    c.markAt = hw;
    c.ornAt = Math.abs(ow2 - c.ornAt) < 0.002 ? ow2 : c.ornAt + (ow2 - c.ornAt) * k;
    const w = ornW();
    const rr = ornR();
    const said = `${c.markAt.toFixed(3)}|${c.ornAt.toFixed(3)}|${w.toFixed(2)}|${rr.toFixed(2)}`;
    if (said === c.markSaid) continue;
    c.markSaid = said;
    put(c.markWide, 'opacity', (HALO_WIDE.op * c.markAt).toFixed(3));
    put(c.markCrisp, 'opacity', (HALO_CRISP.op * c.markAt).toFixed(3));
    put(c.orn, 'opacity', c.ornAt.toFixed(3));
    put(c.orn, 'r', rr.toFixed(2));
    put(c.orn, 'stroke-width', w.toFixed(2));
    // a whole number of the track's dashes round the node, so the ring has no seam
    const circ = TAU * rr;
    const n = Math.max(6, Math.round(circ / (ORN_DASH[0] + ORN_DASH[1])));
    const step = circ / n;
    const on = (step * ORN_DASH[0]) / (ORN_DASH[0] + ORN_DASH[1]);
    c.orn.style.strokeDasharray = `${on.toFixed(2)} ${(step - on).toFixed(2)}`;
  }
}

/** The reading's cross-fade under a hand, on the frame clock, as the glyph's. */
function runLinesFade(now: number) {
  for (const c of cellNodes) {
    if (!c.linesOut) continue;
    const p = clamp((now - c.linesAt) / GLYPH_FADE, 0, 1);
    put(c.lines, 'opacity', p.toFixed(3));
    put(c.linesOut, 'opacity', (c.linesFrom * (1 - p)).toFixed(3));
    if (p >= 1) { c.linesOut.remove(); c.linesOut = null; }
  }
}

/** When the hand last asked the music for something: every wait's fill runs from here (round K12c). */
let dropAt = -1;
/** A plan's identity as far as a listener can hear it: its tempo, key, length, room and every die. */
const planSigs = new WeakMap<object, string>();
function planSig(t: any): string {
  if (!t) return '';
  let v = planSigs.get(t);
  if (v === undefined) {
    v = JSON.stringify([t.bpm, t.key && t.key.name, t.bars, t.presetLabel, t.dice]);
    planSigs.set(t, v);
  }
  return v;
}

/**
 * **The wait, on every bird that is changing, until it is heard** (Eugene,
 * round K12c: *"when I move Ember to 160 BPM and play, then move back to 104,
 * the in-bird radial progress finishes quickly, but the BPM … takes 20–30 s to
 * roll into the new target"*; *"show a radial progress in each bird circle
 * that is transitioning now"*; *"Loom 100 % to 130 %: no radial indicator at
 * all"*).
 *
 * The fill is the die's own clockwise sector (`spiralPath`), and it measures
 * **the time until the value is heard**, from the drop:
 *
 *   - a reading that changes at the seam — a die, the key, the room — is heard
 *     at the swap: the transport's `cutIn`;
 *   - the tempo is heard when the grid is on it: the transport's `settleIn`,
 *     which since the fault pass of 09-24 follows the seam's tempo rule — at
 *     the swap for a far tempo, ridden there on the outgoing deck before the
 *     blend; otherwise the blend and the glide after it, a bar a percent for a
 *     near move, sixteen for the set's own drift and only what is left of a
 *     doubled or halved one — one sector over the seam and any glide together,
 *     never restarting at the seam;
 *   - a bird whose move changes nothing the plan carries (the seasoning alone)
 *     is heard on the next note, so it has no wait to draw.
 *
 * **Which birds fill**: the bird the hand dropped, whenever the plan it implies
 * differs from the same theme without the hand — in anything, not only its own
 * reading (Loom at 130 % changes the composition, the texture and the timbres
 * and not its own density word, and drew nothing) — and every bird whose
 * reading that move changes (`consequent`), each on its own clock. A fill
 * never runs backwards: an end read later is taken as it comes and the sector
 * holds until the time catches it up. It is drawn from state every frame and
 * carried across a rebuild, so nothing cuts it short.
 */
function paintHeld(r: Readout | null) {
  if (!cellNodes.length) return;
  const on = controls;
  const now = performance.now();
  const con = r ? consequence(r) : null;
  // the hand's ask is out and not yet heard at the seam
  const dropWaits = !!r && cellNodes.some((x) => !x.pulling && !birdLanded(x.bird, r.spell));
  for (const c of cellNodes) {
    let active = false;
    let tempo = c.id === 'bpm';
    if (on && r) {
      // its own ask, held or let go home, not yet heard, and changing the plan
      const own = !c.pulling && !birdLanded(c.bird, r.spell)
        && (con ? planSig(con.theme.track) !== planSig(con.base.track) : c.impliedNext);
      const moved = c.consequent && dropWaits;
      // the tempo goes on arriving after the seam, for as long as the grid glides
      const gliding = tempo && c.fillFrom >= 0 && tempoNow(r) !== r.bpm;
      active = own || moved || gliding;
      // a tempo that is not changing waits for the seam like any reading
      if (tempo && con && con.theme.bpm === con.base.bpm && !gliding) tempo = false;
    }
    if (!active) {
      c.fillFrom = -1;
      c.fillP = 0;
      if (c.saidArc !== '') { c.saidArc = ''; put(c.pendFill, 'd', ''); }
      continue;
    }
    if (c.fillFrom < 0 || (dropAt > c.fillFrom && dropWaits)) { c.fillFrom = dropAt >= 0 ? dropAt : now; c.fillP = 0; }
    const m = r!.mix;
    let p = c.fillP;
    if (REDUCED) p = 1;
    else {
      // what is left, on the transport's own clock; nothing until the seam is laid
      const left = tempo ? (m.settleIn || (m.cutting ? m.cutIn : 0)) : (m.cutting ? m.cutIn : 0);
      if (left > 0 || !dropWaits) {
        const end = now + left * 1000;
        p = Math.max(p, clamp((now - c.fillFrom) / Math.max(1, end - c.fillFrom), 0, 1));
      }
    }
    c.fillP = p;
    const key = p.toFixed(3);
    if (c.saidArc === key) continue;
    c.saidArc = key;
    put(c.pendFill, 'd', spiralPath(p, birdR - 1.5));
  }
}

/**
 * Where the eight stand, from the one piece of state there is: what a hand is
 * holding, and whether a held bird reaches this engine's plan at all. Under the
 * record every target is the rest radius, which is the record's page having no
 * control on it drawn as arithmetic rather than as a branch per mark.
 */
function layoutCells() {
  for (let i = 0; i < cellNodes.length; i++) {
    const c = cellNodes[i];
    c.held = controls && heldValue.has(c.bird);
    if (!c.pulling) c.value = valueOf(c.bird);
    cellTo[i] = controls && !c.pulling ? radiusFor(c.bird, valueOf(c.bird))
      : c.pulling ? radiusFor(c.bird, c.value)
      : starR;
    if (!controls) { c.implied = null; c.impliedFor = -1; c.impliedTheme = -1; }
  }
  cellsMoved = true;
}

/**
 * **A pull**: the value under the hand, and everything that follows from it on
 * the ring alone. Nothing here asks the transport for anything — a pull is a
 * drawing until the hand lets go, which is what makes "the URL on release and
 * not before" a fact about where `setSpell` is called from and not a rule
 * somebody has to remember.
 */
function setPull(c: CellNode, v: number, r: Readout | null) {
  const next = pulled(v);
  if (c.value === next && c.pulling) return;
  c.pulling = true;
  c.value = next;
  const i = cellNodes.indexOf(c);
  cellTo[i] = radiusFor(c.bird, next);
  // **Where the value is, and not where the finger is.** The two were one thing
  // while the node was under the pointer; since the hand travels a third of the
  // star's radius for a whole bird and the node is drawn on the map the ring was
  // blessed with, the node is the value's own place on its radius — and the
  // star's vertex with it. It is still written straight rather than eased,
  // because a reading that lagged the hand is a reading the hand cannot set.
  cellR[i] = cellTo[i];
  cellsMoved = true;
  if (r) paintHand(c, r);
}

/** The same value, asked for by a key or by a hook: it slides rather than jumps. */
function stepPull(c: CellNode, v: number, r: Readout | null) {
  // the house itself is a value a step lands on exactly, and it is not a hundredth
  const next = v === HOUSE[c.bird] ? v : pulled(v);
  c.pulling = true;
  c.value = next;
  cellTo[cellNodes.indexOf(c)] = radiusFor(c.bird, next);
  cellsMoved = true;
  if (r) paintHand(c, r);
}

/**
 * **Let go.** Inside the house zone the bird snaps home and is released;
 * anywhere else it is held, and the spell is set — which writes the address
 * bar at the ask and hands the music over on the next phrase line.
 */
function endPull(c: CellNode, r: Readout | null, snap = true) {
  c.pulling = false;
  const h = HOUSE[c.bird];
  // A hand's drag lets go near the house and means the house; the phone's
  // steps land exactly where they were asked, and the house is one of them.
  if (snap ? nearHouse(c.bird, c.value) : c.value === h) { releaseCell(c, r); return; }
  c.value = pulled(c.value);
  heldValue.set(c.bird, c.value);
  layoutCells();
  commitSpell(r, `${BIRD[c.id].name} held at ${percentShown(c.bird, c.value)} percent`);
}

/** One bird, let go: home to the house, and the cell is a reading again. */
function releaseCell(c: CellNode, r: Readout | null) {
  // a commit still waiting for this bird is superseded by the release
  if (pendingCommit && pendingCommit.c === c) { clearTimeout(pendingCommit.timer); pendingCommit = null; }
  const was = c.held;
  c.pulling = false;
  c.implied = null;
  c.impliedFor = -1;
  c.impliedTheme = -1;
  heldValue.delete(c.bird);
  layoutCells();
  commitSpell(r, was ? `${BIRD[c.id].name} released` : '');
}

/** Every bird let go at once: the ring is a reading again and the link is bare. */
function releaseAll(r: Readout | null) {
  if (pendingCommit) { clearTimeout(pendingCommit.timer); pendingCommit = null; }
  if (!heldValue.size && !cellNodes.some((c) => c.pulling)) return false;
  heldValue.clear();
  for (const c of cellNodes) { c.pulling = false; c.implied = null; c.impliedFor = -1; c.impliedTheme = -1; }
  layoutCells();
  // every bird let go is every bird, an outside ask's included: nothing to merge onto
  ringAsked = askedSpell();
  commitSpell(r, 'the ring\'s controls released', true);
  return true;
}

/**
 * **The one call that reaches the music**, and the one place the URL is
 * written: `control.setSpell` writes the address bar at the ask and lays the
 * seam from the next phrase line, and asking for the spell the set is already
 * under does nothing at all — so this may be called on every release without
 * keeping a copy to compare against.
 */
function commitSpell(r: Readout | null, said: string, whole = false) {
  // The link names a spell from here on (every bird let go under a recipe is
  // the house written whole), so no bird rests at a roll again (R58).
  handSpell = true;
  if (rolled) { rolled = null; layoutCells(); }
  // the wait every fill on the ring runs from (round K12c)
  dropAt = performance.now();
  const before = heldSpell();
  const ask = whole ? before : spellToCommit();
  ringAsked = ask;
  control.setSpell(ask);
  // the birds an outside ask moved stand where it put them (only when it did)
  if (JSON.stringify(ask) !== JSON.stringify(before)) layoutCells();
  const now = control.readout() as Readout | null;
  if (now) { paintAll(now); sayCells(now); paintHeld(now); }
  else if (r) { paintAll(r); sayCells(r); paintHeld(r); }
  paintPanel();
  // Once per release and never per frame, through the live region the readout
  // already has (`notes/archive/2026-09-plans/cited/PLAN-BIRDS-UX.md` §6).
  if (said) announce(said);
}

/**
 * The keys a focused cell answers, which is accessibility on a focused control
 * and not a shortcut: the page still has one key and it is the space bar. Every
 * one of them stops here, so nothing reaches the page's own handler.
 *
 * A key moves the value and **the commit waits for the hand to stop**: twenty
 * arrow presses are one hand-over and one address bar write, which is the same
 * promise a drag makes.
 */
//
// **One pending commit, whichever hand armed it** (R65). The keys and the
// phone's panel each kept one timer for every cell, so a second bird moved
// inside the 300 ms cancelled the first bird's commit and left it pulling —
// moved on the ring, out of the spell and out of the link. A commit armed for a
// different bird now lets the waiting one go first, at once.
const COMMIT_MS = 300;
let pendingCommit: { c: CellNode; run: () => void; timer: number } | null = null;
function armCommit(c: CellNode, run: () => void) {
  settleCommit(c);
  const p = { c, run, timer: 0 };
  p.timer = setTimeout(() => { if (pendingCommit === p) pendingCommit = null; run(); }, COMMIT_MS) as unknown as number;
  pendingCommit = p;
}
/** Another bird's waiting commit is made now; this bird's own is dropped, for its caller to settle. */
function settleCommit(c: CellNode) {
  const p = pendingCommit;
  if (!p) return;
  clearTimeout(p.timer);
  pendingCommit = null;
  if (p.c !== c) p.run();
}

function cellKey(c: CellNode, ev: KeyboardEvent) {
  if (!controls) return;
  const k = ev.key;
  let to: number | null = null;
  // To the next whole step of the percent, as the phone's Less and More (R64).
  if (k === 'ArrowUp' || k === 'ArrowRight') to = stepPercent(c.bird, c.value, 1, PULL_STEP);
  else if (k === 'ArrowDown' || k === 'ArrowLeft') to = stepPercent(c.bird, c.value, -1, PULL_STEP);
  else if (k === 'PageUp') to = stepPercent(c.bird, c.value, 1, PULL_PAGE);
  else if (k === 'PageDown') to = stepPercent(c.bird, c.value, -1, PULL_PAGE);
  else if (k === 'Backspace' || k === 'Delete') {
    if (!c.held && !c.pulling) return;
    ev.preventDefault();
    ev.stopPropagation();
    settleCommit(c);
    releaseCell(c, last);
    return;
  } else return;
  ev.preventDefault();
  ev.stopPropagation();
  stepPull(c, clamp(to, 0, 1), last);
  armCommit(c, () => endPull(c, last));
}

/** What one cell says to a screen reader: the reading, and the value where there is one. */
function sayCell(c: CellNode, r: Readout) {
  const owned = controls && (c.pulling || c.held);
  const pct = percentShown(c.bird, c.value);
  put(c.g, 'role', controls ? 'slider' : 'img');
  if (controls) {
    // A slider in the percent a hand reads, 0 to the rim with the house at a
    // hundred: the same number the title line prints.
    put(c.g, 'aria-valuemin', '0');
    put(c.g, 'aria-valuemax', String(RIM_PERCENT));
    put(c.g, 'aria-valuenow', String(pct));
    // What it is at, and the same long line the explanation and the phone's
    // panel read (`pullLine`, `valueLine`): which way of the house, what that
    // does to the sound, and the reading it would leave — no `now`, no `next`
    // (round K11 took them off the tooltip; round K13 off this). Said once per
    // release through the readout's own live region and never per frame.
    put(c.g, 'aria-valuetext', owned
      ? `${pct} percent of the house, held · ${pullLine(c, r)}`
      : `${pct} percent of the house · ${restSentence(c, r)}`);
  }
  put(c.g, 'aria-label', `${BIRD[c.id].name}, ${BIRD[c.id].means} · ${restSentence(c, r)}${owned ? `, held at ${pct} percent` : ''}`);
}

// ==========================================================================
// Has the set ever run in this page? The big mark belongs to the untouched
// state alone: it says what the circle is for before anything has happened.
// Once the set has played, a pause is a held position and not an empty
// machine, so the reading stays and the node at twelve o'clock is the play
// and pause control on its own. A reload restores the seed and the position
// but starts nothing, so it counts as untouched and the mark is there again.
let started = false;
const reading = (r: Readout | null) => started || !!(r && r.playing);

// All seven are engraved by `buildCore`, which runs before anything reads one.
let seedText!: Mark<SVGTextElement>, chordText!: Mark<SVGTextElement>,
  notesText!: Mark<SVGTextElement>, sectionText!: Mark<SVGTextElement>,
  themeText!: Mark<SVGTextElement>, coreScale!: Mark<SVGGElement>, coreTextG!: Mark<SVGGElement>;
// The four beat dots light in turn, four times a bar: they sit beside the
// bloomed star, because a write inside it re-blurred the whole star.
let gBeat: Mark<SVGGElement> | null = null, beatDots: Mark<SVGCircleElement>[] = [];

function buildCore(r: Readout) {
  clear(gCore);
  coreScale = el('g', {}, gCore);
  // the transport's ground: the lines under the centre show through it, faintly
  el('circle', { class: 'ground', cx: C, cy: C, r: R_CORE, fill: '#000', opacity: CORE_GROUND }, coreScale);
  // touch inside this circle to start or stop
  el('circle', { class: 'ln fix thin', cx: C, cy: C, r: R_CORE }, coreScale);
  el('circle', { class: 'ln fix hair', cx: C, cy: C, r: R_CORE_IN, opacity: 0.5 }, coreScale);
  // Before the first start the circle holds one mark and no words: what it is
  // for. The reading below appears once there is something to read, and from
  // then on it stays through a pause.
  coreTextG = el('g', { opacity: reading(r) ? 1 : 0 }, coreScale);
  // which theme of the mix this is, and how long it runs
  themeText = txt(coreTextG, `${roman(r.mix.themeNumber)} · ${r.durationLabel}`, C, C - 46, 14, { op: 0.6, ls: 0.28 });
  // the part of the theme playing now
  sectionText = txt(coreTextG, r.section || '', C, C - 22, 12, { op: 0.5, ls: 0.32 });
  // the chord sounding now
  chordText = txt(coreTextG, r.chord || '', C, C + 26, 30, { op: 0.95, ls: 0.16 });
  // the notes in it
  notesText = txt(coreTextG, (r.chordNotes || []).join(' '), C, C + 54, 12, { op: 0.5, ls: 0.38 });
  // The seed the whole set was grown from, engraved under the die that rolls a
  // new one and close enough to it to belong to it. It used to sit further out
  // at a size the rest of the reading is written in, where five digits were
  // wide enough to run into a cell's own words as the star carried them past
  // the bottom; it is debug information, so it comes in to the node and drops
  // a size rather than asking the star for room. Checked against the widest
  // seed there is at every ninety-sixth of a turn: the nearest a cell's word
  // comes is fourteen units.
  seedText = txt(coreScale, `seed ${r.seed}`, C, C + R_ACT + ctrlR + 11, 9, { op: 0.55, ls: 0.26 });
}

// ==========================================================================
// The seed, typed
//
// The caption under the die is a reading, and a reading worth keeping is one
// you should be able to set: a seed that turned out well is worth writing
// down, and there was no way back to it from the ring at all. A tap on the
// caption opens an editor in the caption's own place — a foreignObject, so
// the caret sits exactly where the number was, on a sheet outside both
// bloomed groups, because a filter over a foreignObject is a blurred caret.
const SEED_DIGITS = 6;
// The two are built together by `seedEditor()`, which every way into the field
// calls first, so the field is there wherever the group is.
let gSeedEdit: Mark<SVGGElement> | null = null;
let seedInput: HTMLInputElement | null = null;
let seedEditing = false;
let seedBox: Mark<SVGForeignObjectElement> | null = null;
let seedWas = '';

function seedEditor() {
  if (gSeedEdit && gSeedEdit.isConnected) return;
  gSeedEdit = el('g', { id: 'seedEdit' }, innerSvg);
  // Deep enough to hold the caption's own line, wide enough that the pair
  // never has to reflow; the box takes no pointer of its own, only the field
  // inside it does, so the ring under it is still the ring.
  const box = seedBox = el('foreignObject', {
    x: C - 120, y: C + R_ACT + ctrlR - 3, width: 240, height: 22,
  }, gSeedEdit);
  const wrap = document.createElement('div');
  wrap.className = 'seedWrap';
  const word = document.createElement('span');
  word.textContent = 'seed';
  seedInput = document.createElement('input');
  seedInput.type = 'text';
  seedInput.inputMode = 'numeric';
  seedInput.autocomplete = 'off';
  seedInput.spellcheck = false;
  seedInput.maxLength = SEED_DIGITS;
  seedInput.setAttribute('pattern', '[0-9]*');
  seedInput.setAttribute('aria-label', 'master seed');
  wrap.appendChild(word);
  wrap.appendChild(seedInput);
  box.appendChild(wrap);

  seedInput.addEventListener('input', () => {
    const clean = seedInput!.value.replace(/\D/g, '').slice(0, SEED_DIGITS);
    if (clean !== seedInput!.value) seedInput!.value = clean;
  });
  // The page answers Space, and a focused bird its arrows; while a number is
  // being typed neither may hear any of it.
  seedInput.addEventListener('keydown', (ev: KeyboardEvent) => {
    ev.stopPropagation();
    if (ev.key === 'Enter') { ev.preventDefault(); closeSeedEditor(true); }
    else if (ev.key === 'Escape') { ev.preventDefault(); closeSeedEditor(false); }
  });
  seedInput.addEventListener('keyup', (ev: KeyboardEvent) => ev.stopPropagation());
  seedInput.addEventListener('blur', () => closeSeedEditor(true));
  for (const k of ['pointerdown', 'pointerup', 'pointermove', 'click', 'touchstart'])
    seedInput.addEventListener(k, (ev: Event) => ev.stopPropagation());
  gSeedEdit.style.display = 'none';
}

function openSeedEditor() {
  if (seedEditing || !seedText || !last) return;
  seedEditor();
  seedEditing = true;
  seedWas = String(last.seed).replace(/\D/g, '').slice(0, SEED_DIGITS) || '1';
  seedInput!.value = seedWas;
  seedText.setAttribute('opacity', 0);
  gSeedEdit!.style.display = '';
  // inside the tap, so a phone opens its keypad on the same gesture
  try { seedInput!.focus({ preventScroll: true }); } catch (err) { seedInput!.focus(); }
  seedInput!.select();
}

function closeSeedEditor(commit: boolean) {
  if (!seedEditing) return;
  seedEditing = false;
  const typed = (seedInput!.value || '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  gSeedEdit!.style.display = 'none';
  seedInput!.blur();
  if (seedText) seedText.setAttribute('opacity', 0.55);
  if (commit && typed && typed !== seedWas) castTypedSeed(typed);
}

// A seed that was asked for by name is the seed that plays: no pool is drawn
// and nothing is scored, and it goes through the one door every other cast
// uses. The rest — the collapse, the rebuild, the reading — follows from
// control.ts exactly as a throw's does.
function castTypedSeed(seed: string) {
  spinAngle = 0;
 
  spinEase = null;
  nudge(0.9);
  if (control.resumeContext) control.resumeContext();
  lastCast = { seed: String(seed), from: last && last.seed, typed: true, distance: null, differs: [] };
  console.info(`[cast] seed ${seed} · typed`);
  control.setSeed(String(seed));
  return String(seed);
}

function setText(node: Element, v: string | number) {
  const s = String(v).toUpperCase();
  if (node.textContent !== s) node.textContent = s;
}

function repaintCore(r: Readout) {
  setPlayGlyph(r.playing);
  // one write, at the moment the set first starts — never during playback
  put(coreTextG, 'opacity', reading(r) ? 1 : 0);
  setText(seedText, `seed ${r.seed}`);
  setText(themeText, `${roman(r.mix.themeNumber)} · ${r.durationLabel}`);
  setText(sectionText, r.section || '');
  setText(chordText, r.chord || '');
  setText(notesText, (r.chordNotes || []).join(' '));
}

// ==========================================================================
// everything that moves every frame; no filter here, so the browser never
// re-runs a blur for a cursor that has shifted a degree
// Every mark below is drawn by `buildLive`, which runs once before the first
// frame is asked for and is the only thing that writes any of them.
/**
 * **The pulse's reach, as a curve of the tempo** (Eugene, 09-23: *"at slow
 * tempos, about 60 BPM and below, make it much more pronounced and wider, so
 * ambient tracks get sparse, wave-like pulsation to support deep meditative
 * waves of ambience"*). The trace is how far the beat's ring reaches out of the
 * centre circle — its travel and its glow together — in the ring's thousand
 * units, where one unit is a hair under a CSS pixel on a desktop ring and two
 * device pixels on a retina one.
 *
 * The two anchors are the two numbers to tune by ear. At `PULSE_FAST` and
 * above it is exactly the pulse the ring has always drawn — seven units out and
 * a glow nine wide, the "about 30 px" he measured it at; at `PULSE_SLOW` and
 * below it is five and a third times that, his "about 160 px"; between them it
 * is an S-curve in the logarithm of the tempo, because a tempo is heard as a
 * ratio.
 */
const PULSE_FAST = { bpm: 100, trace: 16 };
const PULSE_SLOW = { bpm: 60, trace: 85 };
function pulseTrace(bpm: number): number {
  if (!(bpm > 0)) return PULSE_FAST.trace;
  const t = clamp(Math.log(bpm / PULSE_SLOW.bpm) / Math.log(PULSE_FAST.bpm / PULSE_SLOW.bpm), 0, 1);
  const s = t * t * (3 - 2 * t);
  return PULSE_SLOW.trace + (PULSE_FAST.trace - PULSE_SLOW.trace) * s;
}

/**
 * **The pulse's shape at a slow tempo** (Eugene, round K3: *"on slow BPM the
 * pulse is not smooth enough; we likely need a log fade-in and fade-out, and
 * the edges of the pulse ring should fade out to near transparent"*).
 *
 * `pulseSoft(bpm)` is how slow the tempo reads, 0 at `PULSE_FAST` and above
 * and 1 at `PULSE_SLOW` and below, on `pulseTrace`'s own S-curve — so at a
 * house tempo nothing here changes the pulse the ring has always drawn.
 *
 * `pulseEnvelope` at soft 1 is a swell: it rises over the first
 * `PULSE_RISE` of the beat on a logarithm, `log(1 + K p) / log(1 + K)`, and
 * falls over the rest on the same logarithm to nought exactly at the next
 * beat, where the rise begins again from nought — so there is no step at the
 * beat, and the steepest frame at 50 BPM is `PULSE_LOG_K / (PULSE_RISE ln(1 +
 * K))` of the envelope over 0.014 of a beat, under 0.04 of opacity.
 *
 * `PULSE_LAYERS` are the ring's stacked strokes, the whole width first and
 * then eleven narrower ones on its middle, each a twelfth narrower than the
 * last (round K4: *"if possible make a smoother gradient"* — four read as
 * bands). Their opacities are solved every frame so that what they composite
 * to across the band is `pulseProfile`: at soft 1 a raised cosine, the whole
 * light at the middle falling to nought at the edge, no two neighbouring
 * steps more than 0.131 of the middle apart; at soft 0 flat, the widest alone
 * carrying all of it and the eleven at nought — the ring's own pulse. No
 * gradient to write, so nothing new is inked and nothing inside a bloom is.
 */
/**
 * **How often the pulse comes, a curve of the tempo too** (Eugene, round K4:
 * *"at 50 BPM we don't have a beat, so any pulse feels like a rush. Can we
 * skip the interval and do only one pulse? 50–60 BPM skip 3 beats, 60–90 skip
 * 2, 90+ no skip."*). One pulse every `beats` beats, the first row whose
 * `upTo` the tempo is at or under: once a bar, on its downbeat, at sixty and
 * below; every third beat to ninety; every beat above. The breaks are his, to
 * be tuned by ear. The swell (`pulseEnvelope`) stretches over the whole
 * interval, so a slow pulse is one breath and not a hit and a wait.
 */
const PULSE_EVERY = [{ upTo: 60, beats: 4 }, { upTo: 90, beats: 3 }, { upTo: Infinity, beats: 1 }];
function pulseEvery(bpm: number): number {
  return (PULSE_EVERY.find((row) => bpm <= row.upTo) ?? PULSE_EVERY[PULSE_EVERY.length - 1]).beats;
}
const PULSE_RISE = 0.35;
const PULSE_LOG_K = 3;
const PULSE_LAYERS = Array.from({ length: 20 }, (_, j) => 1 - j / 20);
function pulseSoft(bpm: number): number {
  return clamp((pulseTrace(bpm) - PULSE_FAST.trace) / (PULSE_SLOW.trace - PULSE_FAST.trace), 0, 1);
}
function pulseEnvelope(beat: number, bar: number, soft: number, every = 1, since = 0): number {
  // With one pulse every few beats, the beat is the whole interval: `since` is
  // how many whole beats have gone since the pulse, so the swell's phase is
  // the interval's and the hard beat decays over it rather than striking again
  if (every > 1) {
    const p = (since + beat) / every;
    bar = p;
    beat = since + beat;
    if (soft > 0) {
      const hard = Math.exp(-4.2 * beat) * 0.72 + Math.exp(-3 * bar) * 0.28;
      return hard + (swellAt(p) - hard) * soft;
    }
  }
  const hard = Math.exp(-4.2 * beat) * 0.72 + Math.exp(-3 * bar) * 0.28;
  if (soft <= 0) return hard;
  return hard + (swellAt(beat) - hard) * soft;
}
/** The swell at a point `b` of its interval, 0 to 1: a logarithm up, a logarithm down, nought at both ends. */
function swellAt(b0: number): number {
  const b = clamp(b0, 0, 1);
  const L = Math.log1p(PULSE_LOG_K);
  return b < PULSE_RISE
    ? Math.log1p((PULSE_LOG_K * b) / PULSE_RISE) / L
    : 1 - Math.log1p((PULSE_LOG_K * (b - PULSE_RISE)) / (1 - PULSE_RISE)) / L;
}
/**
 * **The corona** (round K14, Eugene, on a slow pulse: *"there is a sense of a
 * highlight wave coming off the circle and back. I want … one connected thing
 * — a solar crown: play is the planet and the glow follows the planet's
 * gravity, not just runs away and back"*). The pulse is light anchored to the
 * transport's disc: brightest at its rim and falling away outward on an
 * exponential to nought at its reach, a body with one edge — the disc's — and
 * never a band with two. The breath changes its reach and its light in place;
 * nothing of it travels. It is the stacked strokes the pulse always was, each
 * standing on the rim (its inner edge at `R_CORE`) and reaching out
 * `PULSE_LAYERS[j]` of the whole reach, so the strip between one and the next
 * narrower is lit by every stroke that covers it, solved to composite to
 * `coronaProfile` at the strip's middle.
 *
 * The reach is the tempo's trace (`pulseTrace`, the long one at sixty and
 * below) times `CORONA_REST` at the floor of the swell and the whole of it at
 * the swell's top; the rim's own light breathes with it (`coronaRim`).
 */
const CORONA_FALL = 2.5;
const CORONA_REST = 0.4;
/**
 * **The slow crown reaches further** (round K15, Eugene: *"on super low BPM
 * the pulse crown could go 30 % further"*, and K17: *"could still go 20 %
 * further"*): at sixty and below the reach is this much of the tempo's trace,
 * easing in on the square of `pulseSoft` so the faster bands keep theirs. Since
 * K17 it is not stopped short of the birds: the crown lies on the star's own
 * sheet under the birds and their words, which draw over it, so its reach is
 * the same on a phone's square as on a desktop's.
 */
const CORONA_REACH_SLOW = 1.56;
/**
 * **The beat, as the ring first drew it** (round K19, Eugene: *"the big circle
 * flying away is cute but should be a lot more subtle … the pulse on fast beats
 * was better on the very original ring implementation — I'd take it back from
 * there; on slow ones the crown gradient as we designed"*). Taken from the ring
 * of 09-20 (`2ffc978`, before round K): a wide soft stroke and the crisp rim
 * over it, lifted off the disc's rim by `7 × e` units on the beat's own hard
 * envelope and settling back, their light `0.05 + 0.26 e` and `0.14 + 0.52 e`
 * — scaled by the tempo's trace as the K rules scale it. Every beat above
 * ninety it is the rim, over the corona at rest; every third beat to ninety it
 * is drawn at `BEAT_MID` of its light over the corona's swell; once a bar the
 * corona breathes alone.
 */
const BEAT_MID = 0.5;
/** A test's tempo for the pulse, in place of the grid's (the bench's `pulseAt`); null is the grid's. */
let pulseBpmAsked: number | null = null;
/** The corona's light at `u` of its reach, as a share of the rim's: 1 on the rim, nought at the reach. */
const coronaProfile = (u: number) => {
  const x = clamp(u, 0, 1);
  return (Math.exp(-CORONA_FALL * x) - Math.exp(-CORONA_FALL)) / (1 - Math.exp(-CORONA_FALL));
};
/** Each stacked stroke's opacity for a light `o` on the rim. */
function coronaOpacities(o: number, out: number[]) {
  let prev = 0;
  for (let j = 0; j < PULSE_LAYERS.length; j++) {
    const inner = j + 1 < PULSE_LAYERS.length ? PULSE_LAYERS[j + 1] : 0;
    const want = o * coronaProfile((PULSE_LAYERS[j] + inner) / 2);
    out[j] = j === 0 ? want : Math.max(0, 1 - (1 - want) / (1 - prev));
    prev = want;
  }
}
const pulseAlpha: number[] = [];
/**
 * **The corona's texture** (K14, and K19, Eugene: *"those little bars are too
 * repetitive — make them blend in better, just a gradient, with some random
 * order, so it's similar to a wave/spectrum response indicator on music
 * equipment"*): an uneven spread of fine rays out of the rim, their angles,
 * widths and lengths drawn once from a fixed sequence (`RAY_SEED`, a constant
 * and never the theme's, so every load and every picture has the same) — the
 * lengths a smooth random line round the disc, as an analyser's spectrum is,
 * with a grain on it — each ray a sliver that fades from the rim to nothing
 * along the corona's own gradient (`coronaFade`), at `RAY_OP` of the swell.
 * None is drawn where an action's node sits on the rim.
 */
// K21 (*"the lines on the corona are still too prominent — need to blend them
// in more"*): not slivers but wide soft wedges, each several degrees across and
// faint, overlapping so that together they are a slow ripple of the corona's
// light round the disc — no one of them seen on its own.
const RAYS = 90;
/** A wedge's half-width, in degrees: from this… */
const RAY_W = 2.5;
/** …to this more. */
const RAY_W_SPREAD = 4;
/**
 * The rays' light: K19's 0.3, K20's 0.18 (*"a little less prominent"*), and
 * K21's 0.05 (*"still too prominent — need to blend them in more"*), where no
 * ray stands out from the arc round it by 4 % of the rim's lightness — and
 * K22's 0.04, since at 0.05 Chromium's desktop square read 3.2–4.2 % by the
 * frame the breath was caught on, at the bar and not under it.
 */
const RAY_OP = 0.04;
/** And where along its reach a ray's fade has already fallen to `RAY_MID_OP` of the rim's: near the rim, so a ray reads as grain inside the gradient. */
const RAY_MID = 0.3;
const RAY_MID_OP = 0.35;
const RAY_SEED = 0x5eed1;
let raysFor = '';
/** The rays' fixed spread: an angle, a width and a share of the reach each, and a light of its own. */
const RAY_SET: { a: number; w: number; len: number; op: number }[] = (() => {
  let h = RAY_SEED >>> 0;
  const rnd = () => { h = (h + 0x6d2b79f5) >>> 0; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // a smooth line round the disc: four sines of random phase, as a spectrum's envelope
  const ph = [rnd(), rnd(), rnd(), rnd()].map((x) => x * TAU);
  const env = (a: number) => 0.5 + 0.22 * Math.sin(3 * a + ph[0]) + 0.14 * Math.sin(7 * a + ph[1]) + 0.09 * Math.sin(13 * a + ph[2]) + 0.05 * Math.sin(29 * a + ph[3]);
  const out = [];
  for (let i = 0; i < RAYS; i++) {
    // angles jittered well off an even comb
    const a = ((i + (rnd() - 0.5) * 0.9) / RAYS) * TAU;
    const len = clamp(env(a) * (0.55 + 0.9 * rnd()), 0.12, 1);
    out.push({ a, w: ((RAY_W + RAY_W_SPREAD * rnd()) * Math.PI) / 180, len, op: 0.25 + 0.35 * rnd() });
  }
  return out;
})();

let pulseRings: Mark<SVGCircleElement>[] = [];
let coronaG: Mark<SVGGElement> | null = null, coronaRays: Mark<SVGGElement> | null = null;
let coronaFade: Mark<SVGElement> | null = null, coronaFadeIn!: Mark<SVGElement>, coronaFadeMid!: Mark<SVGElement>;
let waveRings: Mark<SVGCircleElement>[] = [];
let rimG: Mark<SVGGElement> | null = null;
let cursorG!: Mark<SVGGElement>,
  pulseRing2!: Mark<SVGCircleElement>, castRing!: Mark<SVGCircleElement>,
  breathDisc!: Mark<SVGCircleElement>, holdRing!: Mark<SVGCircleElement>,
  holdDim!: Mark<SVGCircleElement>;
// A still press this long on the die starts the whole set again, and on any
// bird lets every bird go: one hold for both (the birds' own copy of the same
// 700 went in round (f) of the reconciled review of 09-24, D40).
const HOLD_MS = 700;
const hold = { at: -1, fired: false };
let bigPlay: Mark<SVGGElement> | null = null, bigPlayOp = 1, bigPlayPrev = 0;
let tellPath: Mark<SVGPathElement> | null = null, tellText: Mark<SVGTextElement> | null = null,
  tellTP: SVGTextPathElement | null = null;
// How long the tapped explanation stays.
//
// Eugene, reading them on the page: *"when I press the bird circle and the
// tooltip shows, it should be visible as long as I keep the mouse on the
// circle; for touch devices a timeout is fine, but it needs to be 1 to 2
// seconds longer."* So there are two behaviours and the pointer decides which.
// With something that can rest on a cell the line is **held** for as long as it
// rests there and goes three tenths of a second after it leaves — no timer at
// all. With a finger there is nothing to rest, so the timer stays and is a
// second and a half longer than it was, and a second tap on the same cell takes
// the line away rather than restating it.
const TELL_IN = 150;          // the fade in of a new line
const TELL_OUT = 300;         // the fade once the hand has gone
const TELL_TOUCH = 1500;      // what a finger gets over and above the timer
const tell: { at: number; dur: number; cell: CellNode | null; hold: boolean; risen: boolean; f: number } =
  { at: -1, dur: 2400, cell: null, hold: false, risen: false, f: 0 };
let shadeAll!: Mark<SVGPathElement>, shadePlayed!: Mark<SVGPathElement>;
let lastBeatDrawn = -1;
let lastShadeF = -1;
let cursorFaded = -1;
let engravePath!: Mark<SVGPathElement>, engraveText!: Mark<SVGTextElement>,
  engraveTP!: SVGTextPathElement;
// A halo is the wide soft stroke and the crisp one over it; the flash is the
// single ring the cast and the seam fire through.
/** The light each bird's halo was last written at, by the frame: the attribute, as a number. */
const haloLit = new Float64Array(8);
let haloOn: { wide: Mark<SVGCircleElement>; crisp: Mark<SVGCircleElement> }[] = [],
  haloFlash: Mark<SVGCircleElement>[] = [],
  actionHalos: { wide: Mark<SVGCircleElement>; crisp: Mark<SVGCircleElement> }[] = [];

function buildLive() {
  clear(gLive);
  clear(gOuterLive);
  clear(gInnerLive);
  // Two shades over the band, on the rim's own sheet so they sit exactly on
  // the lanes whatever the tilt. The played part sits under the first at a
  // fixed depth; the whole band sits under the second while the coming theme
  // arrives. The shade is the field's own colour where the band lies, so it
  // dims the lanes and not the ground under them, and its depth is matched by
  // eye to the clipped copy at 0.4 it replaced: a translucent line let the
  // bloom show through it, so 0.4 opacity read brighter than 0.4 of the light.
  shadePlayed = el('path', { d: '', fill: SHADE_INK, 'fill-opacity': SHADE_PLAYED }, gOuterLive);
  shadeAll = el('path', { d: wedge(SHADE_LO, SHADE_HI, 0, 0.9999), fill: SHADE_INK, 'fill-opacity': 0 }, gOuterLive);
  // the coming theme, drawn the same way in a dimmer tone, above the shades
  nextLaneG = el('g', { opacity: 0 }, gOuterLive);
  // what is coming: its key, its tempo and how long it runs
  nextInfoText = txt(gOuterLive, '', C, (C + 458).toFixed(1), 12, { op: 0, ls: 0.22 });
  nextDrawnFor = null;

  // a held die: the ground darkens under it and a ring closes round it
  holdDim = el('circle', { cx: px(0.5, R_ACT).toFixed(1), cy: py(0.5, R_ACT).toFixed(1),
    r: ctrlR, fill: '#000', opacity: 0 }, gLive);
  holdRing = sweepArc(px(0.5, R_ACT), py(0.5, R_ACT), ctrlR, gLive);

  // the cast: one ring leaving the circle when a new mix is rolled
  castRing = ink(el('circle', { cx: C, cy: C, r: 200, fill: 'none', 'stroke-width': 2, opacity: 0 }, gLive), 'stroke', '#ffe9a8');

  // What the circle is for, said once and plainly: a single outlined triangle
  // at two fifths of the centre's width while the set is stopped, fading out
  // over 400 ms when it starts. It lives on the unfiltered sheet, so the fade
  // never asks WebKit to re-run the bloom.
  // Its corners are the die's, scaled with the mark: it is the node's own play
  // triangle drawn 37 / (0.46 x CTRL_R) times as big, so its radius is. It is
  // not a control's circle and does not grow with them.
  const TRI = roundQuad([[C - 26, C - 37], [C + 41, C], [C - 26, C + 37]], dieCorner(CTRL_R) * (37 / (CTRL_R * 0.46)));
  bigPlay = el('g', { opacity: 1 }, gInnerLive);
  ink(el('path', { d: TRI, fill: 'none', 'stroke-width': 9, opacity: 0.13, ...ROUND_ENDS }, bigPlay), 'stroke', '#ffe0a0');
  el('path', { d: TRI, fill: 'none', stroke: 'url(#gold)', 'stroke-width': 2.4, ...ROUND_ENDS }, bigPlay);

  // a cell, answering a tap: one line engraved along the ring beside it
  tellPath = el('path', { id: 'tellPath', d: '', fill: 'none' }, gInnerLive);
  // White, and the one line of type on the ring that is not gold. It runs along
  // the rim with the band's own lanes behind it — the brightest thing the ring
  // draws — and Eugene could not read it there: gold type over gold dashes is
  // the one place on the sigil where the knockout alone is not enough. White is
  // also the only ink that stays legible whatever the derived colour does, so
  // the hint is the same hint under a spell as it is at the house.
  tellText = el('text', { class: 'tell', 'font-size': 12, 'letter-spacing': 2.6, opacity: 0,
    stroke: '#05040a', 'stroke-width': 3.6, 'paint-order': 'stroke', 'stroke-linejoin': 'round' }, gInnerLive);
  tellTP = document.createElementNS(NS, 'textPath');
  tellTP.setAttribute('href', '#tellPath');
  tellTP.setAttribute('startOffset', '50%');
  tellTP.setAttribute('text-anchor', 'middle');
  tellText.appendChild(tellTP);

  // The four beats of the bar; the one you are on is lit. Each dot sits at
  // the middle of its own quarter of the circle rather than at its start, so
  // the bar still begins at twelve o'clock and runs clockwise while the four
  // axes are left to the four action nodes — a dot on an axis fell inside a
  // node and read as a mark of the node's own, beside its glyph.
  gBeat = el('g', {}, gInnerLive);
  beatDots = [];
  for (let i = 0; i < 4; i++) {
    const f = (i + 0.5) / 4;
    beatDots.push(el('circle', {
      cx: px(f, R_CORE_IN - 6).toFixed(1), cy: py(f, R_CORE_IN - 6).toFixed(1),
      r: i === 0 ? 3 : 2.2, fill: 'url(#gold)', opacity: 0.25,
    }, gBeat));
  }

  haloOn = [];
  haloFlash = [];

  // the beat, breathing at the centre while the track runs
  breathDisc = ink(el('circle', { cx: C, cy: C, r: R_CORE_IN, opacity: 0 }, gLive), 'fill', '#ffd97a');
  // the action under the finger, and play while the mix runs
  actionHalos = [];
  for (const a of actionsNow()) {
    const x = px(a.f, R_ACT);
    const y = py(a.f, R_ACT);
    const g = el('g', {}, gLive);
    const wide = ink(el('circle', { cx: x, cy: y, r: ctrlR, fill: 'none', 'stroke-width': HALO_WIDE.w, opacity: 0 }, g), 'stroke', '#ffe0a0');
    const crisp = ink(el('circle', { cx: x, cy: y, r: ctrlR, fill: 'none', 'stroke-width': HALO_CRISP.w, opacity: 0 }, g), 'stroke', '#ffeec0');
    actionHalos.push({ wide, crisp });
  }

  // the beat's ring: the widest stroke first and the narrower ones stacked on
  // it, so its middle is brighter than its edges wherever it is soft
  // the corona: on the transport's own sheet and under its bloomed group, so
  // an action's node, which knocks out its own ground, is drawn over it and a
  // glyph is never lit through; outside the bloom, so its writes run no blur
  // (since K17 on the star's sheet, first, so the lines, the birds and their
  // words draw over it; turned back against the star so it stands still with
  // the disc, as its rays must)
  if (!coronaG || !coronaG.isConnected) {
    coronaG = el('g', { id: 'corona', 'aria-hidden': 'true' }, starSvg);
    starSvg.insertBefore(coronaG, starSvg.firstChild);
  }
  put(coronaG, 'transform', starDeg ? `rotate(${(-starDeg).toFixed(2)} ${C} ${C})` : '');
  clear(coronaG);
  // the rays' fade: from the rim's light to nothing at the reach, on the ring's own ink
  const defs = el('defs', {}, coronaG);
  coronaFade = el('radialGradient', { id: 'coronaFade', gradientUnits: 'userSpaceOnUse', cx: C, cy: C, r: R_CORE + 16 }, defs);
  coronaFadeIn = ink(el('stop', { offset: 0.9, 'stop-opacity': 1 }, coronaFade), 'stop-color', '#ffe0a0');
  coronaFadeMid = ink(el('stop', { offset: 0.95, 'stop-opacity': RAY_MID_OP }, coronaFade), 'stop-color', '#ffe0a0');
  ink(el('stop', { offset: 1, 'stop-opacity': 0 }, coronaFade), 'stop-color', '#ffe0a0');
  coronaRays = el('g', { fill: 'url(#coronaFade)', opacity: 0 }, coronaG);
  raysFor = '';
  pulseRings = PULSE_LAYERS.map((w) => ink(el('circle', { cx: C, cy: C, r: R_CORE, fill: 'none', 'stroke-width': 0, opacity: 0 }, coronaG!), 'stroke', '#ffe0a0'));
  // the rim's own line stays on the transport's sheet, over the disc's ground
  // it edges, where it has always been drawn (at rest too)
  if (!rimG || !rimG.isConnected) {
    rimG = el('g', { id: 'coronaRim', 'aria-hidden': 'true' }, innerSvg);
    innerSvg.insertBefore(rimG, innerSvg.firstChild);
  }
  clear(rimG);
  pulseRing2 = ink(el('circle', { cx: C, cy: C, r: R_CORE, fill: 'none', 'stroke-width': 1.6, opacity: 0 }, rimG), 'stroke', '#ffe9a8');
  // the wave: a soft stroke under a crisp one, in a group of its own
  const wg = el('g', { id: 'coronaWave' }, coronaG);
  waveRings = [
    ink(el('circle', { cx: C, cy: C, r: R_CORE, fill: 'none', 'stroke-width': 9, opacity: 0 }, wg), 'stroke', '#ffe0a0'),
    ink(el('circle', { cx: C, cy: C, r: R_CORE, fill: 'none', 'stroke-width': 1.6, opacity: 0 }, wg), 'stroke', '#ffeec0'),
  ];

  // where you are in the theme
  cursorG = el('g', { opacity: 0.95 }, gLive);
  ink(el('path', { d: `M${C} ${C - R_BAND_IN + 2} L${C} ${C - R_SEC - 8}`, 'stroke-width': 12, opacity: 0.14, fill: 'none', 'stroke-linecap': 'round' }, cursorG), 'stroke', '#ffe0a0');
  ink(el('path', { d: `M${C} ${C - R_BAND_IN} L${C} ${C - R_SEC - 10}`, 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round' }, cursorG), 'stroke', '#ffeec0');
  ink(el('circle', { cx: C, cy: C - R_SEC, r: 10, fill: 'none', 'stroke-width': 6, opacity: 0.18 }, cursorG), 'stroke', '#ffe0a0');
  ink(el('circle', { cx: C, cy: C - R_SEC, r: 4.2 }, cursorG), 'fill', '#ffeec0');

  // the time and the bar you are on, engraved beside the cursor
  engravePath = el('path', { id: 'engravePath', d: '', fill: 'none' }, gLive);
  engraveText = el('text', { 'font-size': 14, 'letter-spacing': 2.6, fill: '#ffe9a8', opacity: 0.85 }, gLive);
  engraveTP = document.createElementNS(NS, 'textPath');
  engraveTP.setAttribute('href', '#engravePath');
  engraveTP.setAttribute('startOffset', '50%');
  engraveTP.setAttribute('text-anchor', 'middle');
  engraveText.appendChild(engraveTP);
}

// Where the cursor cuts the band: everything before it sits under the shade.
// The shade covers the seven lanes and stops short of the rim's two hairlines
// and the section ring outside them, which were never dimmed.
function setPlayedSplit(f: number) {
  if (!shadePlayed) return;
  put(shadePlayed, 'd', f <= 0.002 ? '' : wedge(SHADE_LO, SHADE_HI, 0, Math.min(f, 0.9999)));
}

// The explanation runs along the ring just outside its own cell, upright on
// either half, on the unfiltered sheet so its fade costs nothing.
/**
 * **What the line says while a hand is on the bird**: the explanation of the
 * short label, and nothing about when (Eugene, round K11: *"there is a radial
 * tooltip about NEXT DEEP FX, but it's confusing"*). The label under the bird
 * already reads what the value would be if it were let go now; the line along
 * the track is that reading's long form, one plain sentence of what the music
 * is at that value (round K13: `The sound is close and dry; the theme has 7
 * sections.`) — the same words, from the same author, as the phone panel's
 * line (`valueLine`). No pole, no comparison, no `now`, no `next`: the
 * wait is the fill inside the bird, and the percent is on the label (round K3,
 * *nothing twice*). With the value playing it is the playing value's line.
 */
function pullLine(c: CellNode, r: Readout): string {
  const waiting = c.pulling || !birdLanded(c.bird, r.spell);
  if (!waiting) return restLine(c, r);
  return valueLine(c, c.value, { ...(heldSpell() || {}) } as Partial<Spell>, c.impliedR ?? r, r);
}


function showTell(cell: CellNode) {
  if (!last || !tellPath) return;
  // A cell a hand is holding says what the hand is doing to it; one nobody is
  // holding says what it means and what it rolled.
  const line = controls && (cell.pulling || cell.held)
    ? pullLine(cell, last) : restLine(cell, last);
  if (!line) return;
  // **The line stands still on the track's inner edge** (Eugene, round K4:
  // *"that white tooltip text should not move — it was nicely laid out on the
  // inner circle edge; only the gold labels attached to the birds should
  // follow the bird position on drag and continuous animation"*). It runs
  // along the lane band's inner edge, 338 on the top half and 350 on the
  // bottom (where its type hangs inward, so its path is a line of type further
  // out), centred on the bird's direction as the line is opened — its home
  // with the star's turn at that moment — and it keeps that arc for as long as
  // it is up: the drag, the sway, the lift, the drop and the wait move the
  // bird and its words and never the line.
  const fresh = tell.at < 0 || tell.cell !== cell;
  if (fresh) tell.f = cell.f + starDeg / 360;
  const f = tell.f;
  const top = Math.sin(ang(f)) < 0.02;
  const rr = top ? 338 : 350;
  // Wide enough for the longest line there is: the meaning in front of the
  // reading took Spark's cell to seventy characters, which at this type and
  // this radius wants 0.19 of a turn either side. The arc is only as long as
  // the text on it, so a wider one costs a shorter line nothing.
  const w = 0.19;
  put(tellPath, 'd', top ? arcPath(rr, f - w, f + w, 1) : arcPath(rr, f + w, f - w, 0));
  const up = line.toUpperCase();
  // the path, the text and the run along it are made in one pass
  if (tellTP!.textContent !== up) tellTP!.textContent = up;
  // **A line that is already up stays up** (Eugene, 09-23: *"the tooltip
  // blinks during drag; it must be rock solid"*). Every move of a pull says the
  // line again, and each saying used to start it over from nought — a fade-in
  // on every pointer event, which is the blink. A new line fades in; the line
  // of the bird already speaking only has its words and its timer renewed, at
  // full strength.
  if (fresh) { tell.at = performance.now(); tell.risen = false; }
  // said again while still rising, it goes on rising; risen, its timer starts over
  else if (tell.risen) tell.at = performance.now();
  tell.cell = cell;
  // A finger's line runs on a timer and a pointer's is held by the hand; on a
  // fine pointer the timer is only what carries the line until the first frame
  // of hover arrives, since `holdTell` takes it over on the same move.
  tell.hold = !COARSE && pointed >= 0 && cellNodes[pointed] === cell;
}

/**
 * Where the hand is, as far as the explanation is concerned: on the cell whose
 * line is up, the line stays; anywhere else, it starts its three tenths of a
 * second out. A finger never gets here, because a touch has nothing resting.
 */
function holdTell(cell: CellNode | null) {
  if (COARSE || tell.at < 0) return;
  if (cell && cell === tell.cell) { tell.hold = true; return; }
  if (!tell.hold) return;
  tell.hold = false;
  tell.at = performance.now() - tell.dur;      // straight into the fade
}

function runTell(now: number) {
  if (tell.at < 0) return;
  // A frame's own clock can stand a hair before the moment the line was said,
  // so the elapsed time is never less than nought; and a line that has risen
  // once stays risen however often it is said again.
  const e = Math.max(0, now - tell.at);
  const dur = tell.dur + (COARSE ? TELL_TOUCH : 0);
  let op: number;
  if (!tell.risen && e < TELL_IN) op = e / TELL_IN;
  else if (tell.hold) { op = 1; tell.risen = true; }   // a hand is resting on the cell
  else if (e < dur) { op = 1; tell.risen = true; }
  else if (e < dur + TELL_OUT) op = 1 - (e - dur) / TELL_OUT;
  else { tell.at = -1; tell.cell = null; op = 0; }
  // a line is only ever up because `showTell` drew one, which makes the text
  put(tellText!, 'opacity', (op * 0.9).toFixed(3));
}

// ==========================================================================
// the cast
const cast: {
  t0: number; dur: number; collapse: number; swapped: boolean;
  /** the redraw held until the old sigil has folded away */
  pending: (() => void) | null;
  kind: string;
} = { t0: -1, dur: 1550, collapse: 0.17, swapped: true, pending: null, kind: 'full' };
const flash = { t0: -1, dur: 460 };
const cross = { t0: -1, dur: 1100 };

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);
const easeInOutQuart = (t: number) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);
function easeOutBack(t: number, s = 1.7) {
  const p = t - 1;
  return 1 + (s + 1) * p * p * p + s * p * p;
}

// Half the depth they had: enough parallax to feel like three sheets of
// glass, little enough that the rim and the star stay one object.
const Z_OUTER = -13;
const Z_INNER = 17;
const PERSPECTIVE = 1500;

function layerTransform(svg: HTMLElement, z: number, rot: number, scale: number) {
  svg.style.transform = `translateZ(${z}px) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
}

function startCast(kind: string, rebuild: (() => void) | null) {
  // The spin is left alone: a throw's own star decelerating into its cast is
  // how hard the dice were thrown, and it relaxes onto a whole turn by itself.
  // Every other way in — the tap, the reset — clears it before calling here.
  cast.t0 = performance.now();
  cast.kind = kind;
  cast.dur = kind === 'short' ? 430 : 1550;
  cast.collapse = kind === 'short' ? 0 : 0.17;
  cast.swapped = kind === 'short';
  cast.pending = rebuild || null;
  if (kind === 'short' && rebuild) { rebuild(); cast.pending = null; }
}
const startFlash = () => { flash.t0 = performance.now(); };
const startCross = () => { cross.t0 = performance.now(); };

function resetCastState() {
  layerTransform(outerSvg, Z_OUTER, 0, 1);
  layerTransform(innerSvg, Z_INNER, 0, 1);
  outerSvg.style.opacity = '1';
  innerSvg.style.opacity = '1';
  outerSvg.style.clipPath = '';
  for (const c of cellNodes) c.g.setAttribute('opacity', '1');
  for (const f of haloFlash) f.setAttribute('opacity', 0);
  gCore.setAttribute('opacity', '1');
  gBeat!.setAttribute('opacity', '1');
  castRing.setAttribute('opacity', 0);
  glowSvg.style.opacity = '1';
  if (coreScale) coreScale.removeAttribute('transform');
}

// The band draws itself into being clockwise: one dash offset per lane path,
// which is a style change on about twenty elements, not a redraw.
// Clipped on the layer element, not inside the filtered group, so the bloom is
// rasterised once and the sweep is a compositor job.
function sweepTo(sw: number) {
  outerSvg.style.clipPath = sw >= 1 ? '' : `polygon(${sweepPolygon(sw)})`;
}

// A pie wedge in percentages of the box, opening clockwise from the top.
function sweepPolygon(sw: number) {
  const pts = ['50% 50%', '50% -60%'];
  const steps = 24;
  for (let i = 1; i <= steps; i++) {
    const f = (sw * i) / steps;
    const a = ang(f);
    pts.push(`${(50 + Math.cos(a) * 160).toFixed(1)}% ${(50 + Math.sin(a) * 160).toFixed(1)}%`);
  }
  return pts.join(', ');
}

// Held at one point of the cast, so a headless camera can photograph a frame
// instead of whatever the animation had reached by the time the shutter fell.
let castFreeze: number | null = null;

function runCast(now: number) {
  if (cast.t0 < 0 && castFreeze == null) return false;
  // Under reduced motion a cast is its end state, drawn at once: the new sigil,
  // no fold, no turn, no ring leaving the circle (R53). The bench's frozen
  // frame is still the frame it asks for.
  const p = castFreeze == null ? (REDUCED ? 1 : clamp((now - cast.t0) / cast.dur, 0, 1)) : castFreeze;
  const c = cast.collapse;

  if (p < c) {
    // the old sigil folds away, counter-turning — composited, no repaint
    const k = easeInOutQuart(p / c);
    layerTransform(outerSvg, Z_OUTER, -26 * k, 1 - 0.1 * k);
    layerTransform(innerSvg, Z_INNER, -50 * k, 1 - 0.18 * k);
    outerSvg.style.opacity = String(1 - k);
    innerSvg.style.opacity = String(1 - k);
    glowSvg.style.opacity = String(1 - k);
    return true;
  }

  if (!cast.swapped) {
    cast.swapped = true;
    if (cast.pending) { cast.pending(); cast.pending = null; }
    sweepTo(0);
    for (const cn of cellNodes) cn.g.setAttribute('opacity', '0');
    gCore.setAttribute('opacity', '0');
    gBeat!.setAttribute('opacity', '0');
  }

  const q = (p - c) / (1 - c);
  layerTransform(outerSvg, Z_OUTER, 0, 1);
  outerSvg.style.opacity = '1';

  // the band sweeps into being, clockwise
  sweepTo(easeInOutQuart(clamp(q / 0.55, 0, 1)));

  // the star turns into place, a little past and back
  const sp = clamp((q - 0.22) / 0.45, 0, 1);
  layerTransform(innerSvg, Z_INNER, sp >= 1 ? 0 : -105 + 105 * easeOutBack(sp), 0.9 + 0.1 * easeOutCubic(sp));
  innerSvg.style.opacity = String(clamp(sp * 2, 0, 1));

  // the cells light one after another round the circle
  for (let i = 0; i < cellNodes.length; i++) {
    const local = clamp((q - (0.34 + i * 0.062)) / 0.18, 0, 1);
    cellNodes[i].g.setAttribute('opacity', local.toFixed(3));
    const fl = Math.sin(Math.PI * local);
    haloFlash[i].setAttribute('opacity', (fl * 0.85).toFixed(3));
    haloFlash[i].setAttribute('r', (birdR + 20 * (1 - local)).toFixed(1));
  }

  // the seed is engraved last
  const cp = clamp((q - 0.66) / 0.34, 0, 1);
  gCore.setAttribute('opacity', easeOutCubic(cp).toFixed(3));
  gBeat!.setAttribute('opacity', easeOutCubic(cp).toFixed(3));
  if (coreScale) {
    const s = 1 + 0.26 * (1 - easeOutBack(cp, 1.2));
    coreScale.setAttribute('transform', `translate(${C} ${C}) scale(${s.toFixed(4)}) translate(${-C} ${-C})`);
  }

  // one ring leaves the circle: the cast
  const rp = clamp(q / 0.72, 0, 1);
  castRing.setAttribute('r', (110 + 420 * easeOutQuint(rp)).toFixed(1));
  castRing.setAttribute('opacity', (0.75 * Math.pow(1 - rp, 1.6)).toFixed(3));
  castRing.setAttribute('stroke-width', (3 * (1 - rp) + 0.5).toFixed(2));
  glowSvg.style.opacity = String(clamp(q * 3, 0, 1));

  if (p >= 1 && castFreeze == null) {
    cast.t0 = -1;
    resetCastState();
    // the new sigil is drawn: if the set was playing when it was cast, it plays
    if (control.resumeIfCast) control.resumeIfCast();
    return false;
  }
  return true;
}

function runFlash(now: number) {
  if (flash.t0 < 0) return;
  // the flash is ornament: under reduced motion it is not drawn at all
  const p = REDUCED ? 1 : clamp((now - flash.t0) / flash.dur, 0, 1);
  for (let i = 0; i < haloFlash.length; i++) {
    const local = clamp((p - i * 0.06) / 0.3, 0, 1);
    haloFlash[i].setAttribute('opacity', (Math.sin(Math.PI * local) * 0.7).toFixed(3));
    haloFlash[i].setAttribute('r', (birdR + 14 * (1 - local)).toFixed(1));
  }
  if (p >= 1) { flash.t0 = -1; for (const f of haloFlash) f.setAttribute('opacity', 0); }
}

function runCross(now: number) {
  if (cross.t0 < 0) return;
  const p = REDUCED ? 1 : clamp((now - cross.t0) / cross.dur, 0, 1);
  transition = easeInOutQuart(p);
  if (p >= 1) { cross.t0 = -1; transition = 0; }
}

// ==========================================================================
// tilt
let tiltX = 0, tiltY = 0, tiltTX = 0, tiltTY = 0, tiltWX = 999, tiltWY = 999;
let wobA = 0, wobT = 0;
let dragging: Drag | null = null;

function nudge(amount = 1) {
  if (REDUCED) return;
  wobA = clamp(wobA + amount, 0, 1.6);
  wobT = performance.now();
}

// Four degrees, and the ring leans into the pointer: the side the finger is on
// is the side that comes up. (In CSS a positive rotateY sinks the right edge
// and a positive rotateX sinks the top, so both signs are negated here.)
const TILT_MAX = 4;

/**
 * **Where the ring's square is on the screen, read once a frame and before the
 * frame writes** (R122, R123). Every pointer move read the stage's rect and the
 * square's offsets, and the leaning, swaying star's own rect, after the
 * frame's transforms were written — a layout forced per move — and the star's
 * rect is the square turned, seventeen per cent wider at ten degrees. The
 * untransformed square is read at the top of the frame while a hand is about,
 * and a move between two frames reads that.
 */
interface Square { left: number; top: number; w: number; h: number }
let square: Square | null = null;
let squareFrame = -1;
let frameNo = 0;
let handAt = -Infinity;
function readSquare(): Square {
  const s = stage.getBoundingClientRect();
  return {
    left: s.left + tiltEl.offsetLeft, top: s.top + tiltEl.offsetTop,
    w: tiltEl.offsetWidth || 1, h: tiltEl.offsetHeight || 1,
  };
}
function squareNow(): Square {
  handAt = performance.now();
  if (!square || squareFrame !== frameNo) { square = readSquare(); squareFrame = frameNo; }
  return square;
}

function aimTilt(e: PointerEvent) {
  const q = squareNow();
  const nx = clamp((e.clientX - (q.left + q.w / 2)) / (q.w / 2), -1, 1);
  const ny = clamp((e.clientY - (q.top + q.h / 2)) / (q.h / 2), -1, 1);
  tiltTY = -nx * TILT_MAX;
  tiltTX = ny * TILT_MAX;
}

stage.addEventListener('pointermove', (e: PointerEvent) => {
  if (!(dragging && (dragging.kind === 'band' || dragging.kind === 'spin'))) aimTilt(e);
  if (dragging) return;
  // The whole viewport reports here, so the arrow goes back to normal when the
  // pointer leaves the sigil as well as when it lands on something.
  const hit = hitAt(e);
  hoverAction(hit.kind === 'action' ? hit.action.id : null);
  // and the cell under the hand, whose glyph turns from its sigil to its
  // musical icon while it is there — or the phone's active bird, which keeps
  // its icon for as long as its panel is open
  if (e.pointerType !== 'touch') pointCell(hit.kind === 'cell' ? hit.cell : panelCell);
  tiltEl.style.cursor = cursorFor(hit);
});
stage.addEventListener('pointerleave', () => { tiltTX = 0; tiltTY = 0; });

// ==========================================================================
// the flip
//
// The panel mark in the corner, and `?view=machine`. The machine view is a chunk of its own and is
// fetched the first time it is asked for, so the ring's page carries nothing of
// it — no React, no stylesheet, no box — until a hand asks (`PLAN-MACHINE-VIEW`
// §4b). **Nothing here touches the transport**: the set goes on playing across
// the flip because a flip is a sheet of CSS and a DOM move, and the sigil that
// ends up in the view's top-left panel is this very element, still live and
// still subscribed.
//
// **Its mark is the panel mark in the corner, off the ring** (`#panel`,
// below), and `?view=machine`; no key reaches it. Nothing is drawn on the ring
// for it, which is what keeps the untouched ring pixel for pixel what it was.
type MachineView = Awaited<ReturnType<typeof import('./machine/index.tsx').openMachineView>>;
let machine: MachineView | null = null;
// **The flip is one intent and one load** (R117). The first open fetches a
// chunk, and a click while it is in flight used to get `null` back — the mark
// said closed while the view opened anyway — and a second click was swallowed.
// Now the load is one promise every ask shares, and what the hand last asked
// for is what the page ends in: a second press during the load closes it as it
// arrives, and a third opens it again.
let machineLoading: Promise<MachineView | null> | null = null;
let machineWanted = false;

/** The mark says whether the view is up, whoever opened or closed it. */
function markSays(open: boolean) {
  const m = document.getElementById('panel');
  if (m) m.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function openMachine(): Promise<MachineView | null> {
  machineWanted = true;
  if (machine) return Promise.resolve(machine);
  if (machineLoading) return machineLoading;
  machineLoading = (async () => {
    try {
      const mod = await import('./machine/index.tsx');
      if (!machineWanted) return null;
      // the view's own ways out (M8) close it the way the page does, and give the ring its focus back
      if (!machine) machine = mod.openMachineView(control, () => { closeMachine(); ringFocus(); });
      viewRow(true);
      return machine;
    } catch (err) {
      console.error('deep-house: the machine view would not open', err);
      // ours when it threw while mounting; a chunk the network lost is not (R1)
      report('view', 'the machine view would not open', err);
      machineWanted = false;
      return null;
    } finally {
      machineLoading = null;
      markSays(!!machine);
    }
  })();
  return machineLoading;
}

function closeMachine(): void {
  machineWanted = false;
  markSays(false);
  if (!machine) return;
  machine.close();
  machine = null;
  viewRow(false);
}

/**
 * **Back at the ring, the ring has the focus** (M8): the view's CLOSE, or a
 * press on the dark round the ring, leaves the focus on the ring's first
 * action and not on a key that is no longer on the page.
 */
function ringFocus(): void {
  // **A pointer's close puts the focus back unmarked** (round K24): the focus
  // is there for the keyboard that comes next, and nothing is drawn — told to
  // the browser as `focusVisible: false` where it hears it (Chromium, Firefox)
  // and held by `quietFocus` everywhere, WebKit included, until the next key.
  // A close by a key (Enter or Space on BACK) marks the play key: the focus
  // moved by the keyboard and the keyboard has to see where it went.
  const put = () => {
    const first = document.querySelector('#actions g[tabindex]');
    if (first) focusBack(first);
  };
  // now, and again once the ring has laid itself out in the window: the
  // actions are drawn afresh for the new box, and a focus on the old ones goes
  put();
  requestAnimationFrame(() => requestAnimationFrame(put));
}

/**
 * Put the focus back on a key the page took it from (K24): marked when the
 * last input was a key, unmarked — `focusVisible: false` where the browser
 * hears it, and a quiet focus the ring and the CSS honour until the next key,
 * WebKit included — when it was a pointer.
 */
function focusBack(key: Element): void {
  const quiet = lastInput !== 'key';
  quietFocus = quiet;
  if (quiet) document.documentElement.dataset.quietFocus = '';
  else delete document.documentElement.dataset.quietFocus;
  try { (key as HTMLElement).focus({ preventScroll: true, focusVisible: !quiet } as FocusOptions); } catch (e) { /* nothing to focus */ }
}

// --- the About (round K25) -------------------------------------------------
// Opened by the footer's name, and by the key at twelve before anything has
// played (`playMode`). A native modal dialog (index.html): the page under it is
// inert and does not scroll, the focus goes in — to the close key when a key
// opened it, to the sheet itself (unmarked) when a pointer did — and comes back
// to the key that opened it by `focusBack`'s rule. It closes by its own key, a
// press on the dark outside it, and Escape, which is the dialog's own contract
// and not a shortcut of the page's. It is a view and not a place: nothing of it
// is written into the address, and it says nothing to the ledger.
const aboutSheet = document.getElementById('about') as HTMLDialogElement | null;
let aboutOpener: Element | null = null;
/**
 * The opener by name as well (M14, the review of 09-26): the ring's action keys are drawn
 * afresh by a redraw — a theme, a resize, the machine view closing — so the
 * element kept at the open may be gone at the close, and the focus fell to the
 * page. Its name finds the key drawn in its place.
 */
let aboutOpenerName: string | null = null;
const openerName = (el: Element | null): string | null => {
  if (!el) return null;
  const action = el.getAttribute('data-action');
  if (action) return `#actions [data-action="${action}"]`;
  return el.id ? `#${el.id}` : null;
};
/** The version as the About says it: `v2.0`, and the patch only when there is one. */
const aboutVersion = (v: string = __APP_VERSION__): string => {
  const [a, b = '0', c = '0'] = String(v).split('.');
  return `v${a}.${b}${c !== '0' ? `.${c}` : ''}`;
};
function openAbout(opener: Element | null): void {
  if (!aboutSheet || aboutSheet.open) return;
  aboutOpener = opener;
  aboutOpenerName = openerName(opener);
  const ver = document.getElementById('aboutVer');
  if (ver) ver.textContent = aboutVersion();
  document.documentElement.classList.add('about-open');
  try { aboutSheet.showModal(); } catch (e) { aboutSheet.setAttribute('open', ''); }
  const byKey = lastInput === 'key';
  const into = (byKey ? aboutSheet.querySelector('#aboutClose') : aboutSheet) as HTMLElement | null;
  try { if (into) into.focus({ preventScroll: true, focusVisible: byKey } as FocusOptions); } catch (e) { /* nothing to focus */ }
}
function closeAbout(): void {
  if (aboutSheet && aboutSheet.open) aboutSheet.close();
}
if (aboutSheet) {
  aboutSheet.addEventListener('close', () => {
    document.documentElement.classList.remove('about-open');
    const kept = aboutOpener;
    const name = aboutOpenerName;
    aboutOpener = null;
    aboutOpenerName = null;
    const back = kept && kept.isConnected ? kept : name ? document.querySelector(name) : null;
    if (back) focusBack(back);
  });
  const closeKey = document.getElementById('aboutClose');
  if (closeKey) closeKey.addEventListener('click', () => closeAbout());
  // a press on the dark outside the sheet: the dialog is the target of a press
  // on its backdrop, so it is told from a press on the sheet by where it landed
  aboutSheet.addEventListener('click', (e: MouseEvent) => {
    if (e.target !== aboutSheet) return;
    const b = aboutSheet.getBoundingClientRect();
    if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) closeAbout();
  });
}
const aboutMark = document.getElementById('mark');
if (aboutMark) aboutMark.addEventListener('click', () => openAbout(aboutMark));
// The error reports' switch (K25): what the key says is what this browser has
// stored, and pressing it is honoured at once (`setReports`, instrument.ts).
const reportsKey = document.getElementById('aboutReports');
function paintReports() {
  const on = reportsWanted();
  if (reportsKey) reportsKey.setAttribute('aria-checked', on ? 'true' : 'false');
  const word = document.getElementById('aboutReportsState');
  if (word) word.textContent = on ? 'on' : 'off';
}
paintReports();
if (reportsKey) reportsKey.addEventListener('click', () => { setReports(!reportsWanted()); paintReports(); });

/**
 * **The view is on the address while it is open** (round K21: *"the machine
 * view should be encoded in the URL so on a page refresh it is not gone"*):
 * `view=machine` written when it opens and taken off when it closes, every
 * other row where it stands; a refresh opens it again as a given link always
 * has, and the stored place carries it.
 */
function viewRow(open: boolean) {
  try {
    const search = linkView(location.search, open);
    if (search === location.search.replace(/^\?/, '')) return;
    history.replaceState(null, '', `${location.pathname}${search ? `?${search}` : ''}${location.hash}`);
  } catch (e) { /* a page with no history to write on */ report('address', 'the address could not be written', e, {}, addressFlood); }
}

/** The flip, both ways. A promise, because the first open fetches a chunk. */
function toggleMachine(): Promise<MachineView | null> {
  closePanel();
  if (machine || (machineLoading && machineWanted)) { closeMachine(); return Promise.resolve(null); }
  return openMachine();
}

// **The panel mark, which is the way in and the way out.** It is fixed and over
// the view, so the same element does both and a listener never has to find a
// second control to get back. `aria-expanded` is the state it is in, which is
// what a screen reader needs and is also a value anybody can read off the page.
const panelMark = document.getElementById('panel') as HTMLButtonElement | null;
if (panelMark) {
  panelMark.addEventListener('click', () => {
    nudge(0.2);
    // the mark says what was asked at once, and what came of it once it has
    // (`openMachine` and `closeMachine` write it)
    toggleMachine().catch((e) => console.error(e));
    if (machineWanted && !machine) markSays(true);
  });
}

// **The page has one key, and it is the space bar** (Eugene, 09-19): no
// keyboard shortcut for any tooling or behaviour. Six went with that rule —
// `ArrowRight` and `ArrowLeft` for forward and back, `n` for a cast, `m` for
// the machine view, `Home` for the start of the theme, and `Shift+R` for the
// reset to seed one — and what is left is play and pause, which is what the
// space bar means on every page that plays anything.
//
// Nothing that was reachable by a key is unreachable now: the four actions are
// on the ring and are focusable, the reset is the long press on the die, the
// start of the theme is the band, and the machine view is the panel mark in the
// corner (`#panel`, below), which Tab reaches like any other control. A key
// that reaches a control because the control has focus is not a shortcut, so
// the action nodes still answer Enter and Space for themselves and the seed
// field still hears what is typed into it.
window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
  if (seedEditing) return;   // a number is being typed; the page hears none of it
  if (aboutSheet && aboutSheet.open) return;   // the About is modal: its keys are its own (K25)
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  // a focused control answers Enter and Space itself
  if (t && t.closest && t.closest('#actions g[tabindex], button') && (e.key === ' ' || e.key === 'Enter')
    && !(e.key === ' ' && t.closest('#actions g[data-action="play"]') && aboutMode())) return;
  if (e.key !== ' ' && e.key !== 'Spacebar') return;
  e.preventDefault();
  // A held Space is one press: its repeats used to toggle the set at the
  // keyboard's rate, a start and a stop inside each other (R8).
  if (e.repeat) return;
  runAction('play');
});

// ==========================================================================
// pointers

/** A place on the sigil's own thousand-unit square. */
interface Pt2 { x: number; y: number }

function toSvg(e: PointerEvent, z = 0): Pt2 {
  const q = squareNow();
  const w = q.w;
  const h = q.h;
  const cx = q.left + w / 2;
  const cy = q.top + h / 2;
  const k = PERSPECTIVE / (PERSPECTIVE - z);
  return { x: C + ((e.clientX - cx) / (w * k)) * 1000, y: C + ((e.clientY - cy) / (h * k)) * 1000 };
}
function polar(pt: Pt2) {
  const dx = pt.x - C;
  const dy = pt.y - C;
  let f = (Math.atan2(dy, dx) + Math.PI / 2) / TAU;
  return { r: Math.hypot(dx, dy), f: ((f % 1) + 1) % 1 };
}
// The star has turned, so the finger is turned back by the same amount before
// it is matched against the cells' own places.
function unturn(pt: Pt2): Pt2 {
  if (!starDeg) return pt;
  const [x, y] = rot(pt.x, pt.y, -starDeg / 360);
  return { x, y };
}

// What a cell's node answers to. The first is what it has always been; the
// second is the finger's, **widened invisibly** (`notes/archive/2026-09-plans/cited/PLAN-BIRDS-UX.md` §2): the node
// is drawn at 20 of a thousand units, which is about fifteen screen pixels
// across on a phone, and a control a finger works wants forty-four. The
// drawing is untouched — this is a number in a hit test and nothing else — and
// it is claimed only where the band would not have it, so the seven lanes a
// scrub runs along keep every pixel they had (`hitAt`).
/**
 * **How far along a cell's own spoke a point stands**, signed and measured from
 * the middle, so a hand that drags through the centre of the ring goes on
 * reading *less* instead of turning round and reading more. The radius alone
 * cannot say it: it is a distance and has no sign, and MEASURED on a 400 px
 * page a drag of 220 px inward — which passes the middle by 97 — put a bird
 * back at 0.51 as though it had been pulled out.
 */
function alongSpoke(c: CellNode, pt: Pt2): number {
  const a = ang(c.f);
  return (pt.x - C) * Math.cos(a) + (pt.y - C) * Math.sin(a);
}

function hitCell(pt: Pt2, reach = birdR + 9): CellNode | null {
  const q = unturn(pt);
  const at = Math.atan2(pt.y - C, pt.x - C);
  for (let i = 0; i < cellNodes.length; i++) {
    const c = cellNodes[i];
    // **Only inside the bird's own domain** (Eugene, 09-23): a pointer more
    // than `BIRD_HIT_DOMAIN` degrees from a bird's home never picks it, so a
    // hand reaching for a neighbour finds the neighbour or nothing.
    // (a finger's spin carries every bird round with it, so it is taken off)
    let d = at - ang(i / 8) - (spinAngle * Math.PI) / 180;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    if (Math.abs(d) > (BIRD_HIT_DOMAIN * Math.PI) / 180) continue;
    // the node's own reach, at the size it is drawn at
    if (Math.hypot(q.x - c.x - c.dx, q.y - c.y - c.dy) <= reach * Math.max(1, drawnSize(i))) return c;
  }
  return null;
}

/**
 * The bird whose words stand under a point, upright, a few units' reach round
 * them — and only inside that bird's own domain, as the node itself is only
 * picked there: a hand twenty degrees off a bird never picks it.
 */
function hitWords(pt: Pt2, pad = 6): CellNode | null {
  const at = Math.atan2(pt.y - C, pt.x - C);
  for (let i = 0; i < cellNodes.length; i++) {
    let d = at - ang(i / 8) - (spinAngle * Math.PI) / 180;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    if (Math.abs(d) > (BIRD_HIT_DOMAIN * Math.PI) / 180) continue;
    const b = wordAt[i]?.box;
    if (b && pt.x >= b.x - pad && pt.x <= b.x + b.w + pad && pt.y >= b.y - pad && pt.y <= b.y + b.h + pad) return cellNodes[i];
  }
  return null;
}

/** How far across its own spoke a point stands, signed, along the spoke's tangent. */
function acrossSpoke(c: CellNode, pt: Pt2): number {
  const a = ang(c.f);
  return -(pt.x - C) * Math.sin(a) + (pt.y - C) * Math.cos(a);
}

/**
 * **How far off its axis a dragged bird may play, here on its spoke** (Eugene,
 * 09-23: *"let the bird move off its axis by roughly 40–50 px either side, but
 * only in the central range of the spoke; near the outer ring and near the
 * inner core it locks to the axis"*). Full play through the middle and closing
 * to nothing over the last quarter of the spoke at each end, read off the
 * node's own place. No number is read from it: it is feel, and it floats back
 * when the hand lets go.
 */
function offAxisReach(i: number, perUnit: number): number {
  const t = ((cellR[i] / starR - pullIn) / (((1 - pullIn) * RIM_PERCENT) / 100));
  const open = clamp(Math.min(t, 1 - t) / OFF_AXIS_EDGE, 0, 1);
  return (OFF_AXIS_PX / perUnit) * open;
}

/** The ring's thousand units, as screen pixels: how big a unit is drawn right now. */
function ringPerUnit(): number {
  return squareNow().w / 1000;
}
function hitAction(pt: Pt2): ActionNode | null {
  for (const a of actionNodes) if (Math.hypot(pt.x - a.x, pt.y - a.y) <= ctrlR + 6) return a;
  return null;
}
function angleDelta(a: number, b: number) {
  let d = b - a;
  while (d > 0.5) d -= 1;
  while (d < -0.5) d += 1;
  return d;
}

// What counts as a throw rather than a drag. The last quarter-second has to be
// fast — forty screen pixels and twenty degrees of ring — and the whole gesture
// has to have been short: a brisk scrub right across the band is a scrub,
// however quickly it was made.
const FLICK_WINDOW_MS = 250;
const FLICK_PX = 40;
const FLICK_DEG = 20;
const FLICK_MAX_DEG = 40;
const FLICK_MAX_MS = 500;

// ==========================================================================
// What a hand is doing, while it is doing it. There are six of them and they
// are not the same gesture with different fields: a scrub along the band keeps
// screen pixels because a flick is decided on those, and a throw of the star
// keeps the turn it has added up because the angle from where it began wraps.
interface BandDrag {
  kind: 'band';
  f0: number; f: number; acc: number; t0: number; turn: number; moved: boolean;
  trail: { t: number; x: number; y: number; f: number }[];
}
/** A drag on the star, whether it began on a cell or on the open ring. */
interface StarDrag {
  kind: 'spin' | 'cell';
  cell: CellNode | null;
  f: number; turn: number; spun: number; base: number;
  trail: { t: number; turn: number }[];
  /** how far the hand has travelled on the screen, and where it last was: a cast is only a clear attempt */
  px: number; lx: number; ly: number;
}
interface ActionDrag { kind: 'action'; action: ActionNode }
interface SeedDrag { kind: 'seed'; x: number; y: number }
/**
 * A mouse or a pen on a cell, where a cell is a control. It keeps the press's
 * own place in screen pixels because what separates a drag from a click is
 * whether the hand moved at all.
 */
/**
 * **The bird under the hand, exactly** (Eugene, round K8: *"there is some drag
 * ratio and delay; I want the bird to follow the hand precisely in the allowed
 * region"*). The node's place is the hand's place, projected into the region a
 * bird may stand in: along its spoke one unit for one unit from where the pull
 * took it, between the radius 0 % puts it at and the radius 130 % does; across
 * it one for one within the play off the axis, which closes to nothing at both
 * ends of the spoke. The value is read off that radius — the percent it stands
 * at, a hundredth — and asked for at the drop, as before. Called on every move
 * of the hand and again on every frame while the pull lasts, so a star turning
 * under a still hand does not carry the bird out from under it. No ease, no
 * ratio: the lift and the float back after the drop are the only animations.
 */
function followHand(d: PullDrag) {
  const c = d.cell;
  const i = cellNodes.indexOf(c);
  if (i < 0) return;
  const at = unturn(toSvg({ clientX: d.cx, clientY: d.cy } as PointerEvent, Z_INNER));
  const lo = radiusFor(c.bird, 0);
  const hi = radiusFor(c.bird, 1);
  const hand = clamp(d.R0 + alongSpoke(c, at) - d.r0, lo, hi);
  // **The magnet at the house** (Eugene, round K11: *"a little snap/lock into
  // the 100 % position, so you need to pull harder to get it out, and when
  // you're close to 100 % it snaps into position"*). The hand's own percent is
  // read off where it is; a bird sitting at the house stays there until the
  // hand is `HOUSE_HOLD` points away and then stands under the hand again, and
  // a bird anywhere else snaps home inside `HOUSE_ZONE` (`magnet`,
  // `bird-percent.ts`). Everywhere outside the detent the bird is under the
  // hand one unit for one, as round K8 made it.
  const home = HOUSE[c.bird];
  const p = magnet(((hand / starR - pullIn) / (1 - pullIn)) * 100, c.value === home);
  const R = p === 100 ? radiusFor(c.bird, home) : hand;
  cellR[i] = cellTo[i] = R;
  const v = p === 100 ? home : pulled(valueOfPercent(c.bird, clamp(p, 0, RIM_PERCENT)));
  const was = c.value;
  c.pulling = true;
  c.value = v;
  const reach = offAxisReach(i, d.perUnit);
  cellSide[i] = cellSideTo[i] = clamp(d.S0 + acrossSpoke(c, at) - d.a0, -reach, reach);
  cellsMoved = true;
  if (v !== was && last) paintHand(c, last);
}

interface PullDrag {
  kind: 'pull';
  cell: CellNode;
  x: number; y: number; t0: number;
  moved: boolean;
  /** the still press has let every bird go, and the lift is not also a click */
  fired: boolean;
  /**
   * Where the hand was along the spoke and across it when the pull began —
   * taken at the moment the slop is passed, so the four pixels that tell a
   * pull from a press are not also a jump; the node then moves exactly as far
   * as the hand has since (`followHand`)
   */
  r0: number;
  a0: number;
  /** the ring's units a screen pixel is, for the off-axis play */
  perUnit: number;
  /** where the node stood on its spoke, and off it, when the pull began */
  R0: number;
  S0: number;
  /** and where the hand is now, on the screen, so the bird is placed under it every frame */
  cx: number;
  cy: number;
}
/**
 * **A finger, not yet decided** (round K14, Eugene: *"we should allow drag on
 * mobile too — we just always show the bottom aux panel for control, but if
 * the user drags, they drag"*, and *"the wheel spin still doesn't work: if I
 * touch anywhere to pull down, the bird circles steal the first touch"*). A
 * touch on a bird, on a bird's words or on the star's open face is nothing
 * until it has moved `FINGER_SLOP` screen pixels, and then its direction says
 * what it is: along the spoke of the bird it began on, a pull of that bird
 * (the mouse's own drag from there on: the magnet, the live label, the value
 * asked for at the lift); round the ring, the star's spin, exactly as if it had
 * begun between two birds, no bird taken and no panel opened; a finger that
 * never moves is a tap, which opens the bird's panel. Along the spoke of no
 * bird — the open face — is nothing. The same three outcomes on every square.
 */
interface FingerDrag { kind: 'finger'; cell: CellNode | null; x: number; y: number; t0: number; f0: number; p0: Pt2; moved: boolean; fired: boolean; pointerId: number }
interface CoreDrag { kind: 'core'; t0: number; armed: boolean; release: boolean }
interface PlainDrag { kind: 'none' }
type Drag = BandDrag | StarDrag | ActionDrag | SeedDrag | PullDrag | FingerDrag | CoreDrag | PlainDrag;

function flickOf(d: BandDrag) {
  if (!d.moved || !d.trail || d.trail.length < 2) return 0;
  const now = performance.now();
  // a throw is over quickly and does not go far
  if (now - d.t0 > FLICK_MAX_MS) return 0;
  if (Math.abs(d.turn) * 360 > FLICK_MAX_DEG) return 0;
  const w = d.trail.filter((p) => now - p.t <= FLICK_WINDOW_MS);
  if (w.length < 2) return 0;
  let px = 0;
  let turn = 0;
  for (let i = 1; i < w.length; i++) {
    px += Math.hypot(w[i].x - w[i - 1].x, w[i].y - w[i - 1].y);
    turn += angleDelta(w[i - 1].f, w[i].f);
  }
  const dt = Math.max(1, w[w.length - 1].t - w[0].t);
  if (px < FLICK_PX) return 0;
  if (Math.abs(turn) * 360 < FLICK_DEG) return 0;
  if (px / (dt / 1000) < (FLICK_PX * 1000) / FLICK_WINDOW_MS) return 0;
  return Math.sign(turn);
}

// A drag on the star, whether it began on a cell or on the open ring. The turn
// is added up as it goes and never taken as the angle from where it started:
// three turns are three turns, a wobble across twelve o'clock is not a turn the
// other way, and the total travelled counts reversals, because a hand working
// the star back and forth is throwing hard.
function spinDrag(kind: 'spin' | 'cell', f: number, cell: CellNode | null, e: PointerEvent): StarDrag {
 
  spinEase = null;
  return { kind, cell, f, turn: 0, spun: 0, base: spinAngle, trail: [{ t: performance.now(), turn: 0 }],
    px: 0, lx: e.clientX, ly: e.clientY };
}

/** How far a finger moves before its direction decides what it is, in screen pixels (the tap's own slop). */
const FINGER_SLOP = PULL_SLOP * 3;

function fingerDrag(cell: CellNode | null, f: number, e: PointerEvent): FingerDrag {
  return { kind: 'finger', cell, x: e.clientX, y: e.clientY, t0: performance.now(), f0: f, p0: toSvg(e, Z_INNER), moved: false, fired: false, pointerId: e.pointerId };
}

/**
 * A finger past its slop, decided by its direction at the point it touched:
 * the share of its travel along the ray from the centre through that point
 * against the share round it. Along it, on a bird whose value a hand can move,
 * the finger is a pull from here; round it, the star's spin from where the
 * finger touched, so the travel so far is already turn; along the open face,
 * nothing.
 */
function decideFinger(d: FingerDrag, e: PointerEvent) {
  const p = toSvg(e, Z_INNER);
  let ux = d.p0.x - C;
  let uy = d.p0.y - C;
  const un = Math.hypot(ux, uy) || 1;
  ux /= un;
  uy /= un;
  const dx = p.x - d.p0.x;
  const dy = p.y - d.p0.y;
  const along = Math.abs(dx * ux + dy * uy);
  const round = Math.abs(dx * -uy + dy * ux);
  if (along >= round) {
    if (!d.cell || !controls) { dragging = { kind: 'none' }; pointCell(panelCell); return; }
    const c = d.cell;
    // the pull a mouse's press would have made, as if pressed here: its
    // first move arms it where the finger is, so the slop is not travel
    const at = unturn(p);
    dragging = {
      kind: 'pull', cell: c, x: d.x, y: d.y, t0: d.t0, moved: false, fired: false,
      r0: alongSpoke(c, at), a0: acrossSpoke(c, at), perUnit: ringPerUnit(),
      R0: 0, S0: 0, cx: e.clientX, cy: e.clientY,
    };
    pointCell(c);
    showTell(c);
    return;
  }
  // round the ring: the star's, and the bird is not taken
  pointCell(panelCell);
  const sd = spinDrag('spin', d.f0, null, e);
  sd.lx = d.x;
  sd.ly = d.y;
  dragging = sd;
}

// How fast the star was going when it was let go, in degrees a second, read
// over the last moments of the gesture — a hand that stops and then lifts has
// thrown nothing.
function throwSpeed(d: StarDrag) {
  const w = d.trail;
  if (w.length < 2) return 0;
  const dt = (w[w.length - 1].t - w[0].t) / 1000;
  if (dt <= 0.001) return 0;
  return ((w[w.length - 1].turn - w[0].turn) * 360) / dt;
}

// The caption's own square of the ring. It sits in the band a drag turns the
// star by, so without this a tap on it would be a throw of the dice. The
// words are small — nine units, which is three pixels on a phone — so the
// square has a floor a finger can find, and the node above it is tested first
// and keeps everything the two would share.
const SEED_HIT_W = 132;
const SEED_HIT_H = 56;
function seedBoxHit(pt: Pt2) {
  if (!seedText) return false;
  // measured once per caption and not on every pointer move (R122)
  const said = seedText.textContent || '';
  let b: DOMRect;
  if (seedBoxFor && seedBoxFor.said === said && seedBoxFor.node === seedText) b = seedBoxFor.b;
  else {
    try { b = seedText.getBBox(); } catch (err) { return false; }
    seedBoxFor = { said, node: seedText, b };
  }
  if (!b || !b.width) return false;
  const w = Math.max(b.width + 24, SEED_HIT_W) / 2;
  const h = Math.max(b.height + 24, SEED_HIT_H) / 2;
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  return Math.abs(pt.x - cx) <= w && Math.abs(pt.y - cy) <= h;
}
let seedBoxFor: { said: string; node: Element; b: DOMRect } | null = null;
const hitSeed = (pt: Pt2) => !seedEditing && seedBoxHit(pt);

/** What is under the hand: the band, the star's open ring, a cell, a node, the caption, the centre, or nothing. */
type Hit =
  | { kind: 'action'; action: ActionNode; f: number; inner: Pt2 }
  | { kind: 'cell'; cell: CellNode; f: number; inner: Pt2 }
  | { kind: 'seed' | 'core' | 'band' | 'spin' | 'none'; f: number; inner: Pt2 };

// One hit test, used by the pointer handlers and by the cursor, so what the
// arrow promises is exactly what the finger gets.
function hitAt(e: PointerEvent): Hit {
  const pt = toSvg(e, Z_OUTER);       // the rim and the band
  const inner = toSvg(e, Z_INNER);    // the star, the wheel, the core
  const { r, f } = polar(pt);
  const ri = polar(inner).r;
  const action = hitAction(inner);
  if (action) return { kind: 'action', action, f, inner };
  const cell = hitCell(inner);
  if (cell) return { kind: 'cell', cell, f, inner };
  const inBand = r >= R_BAND_IN - 8 && r <= R_SEC + 12;
  // A finger's widened target, claimed only outside the band: a cell pulled all
  // the way out stands at 342.5 and the band begins at 344, so this never takes
  // a pixel of the scrub — which is why it can be as wide as a finger wants.
  // Decided by the input and not by the screen: a finger gets it on any page,
  // and on every engine, because a finger's touch on a bird opens its panel
  // whether or not the bird can be moved.
  if (e.pointerType === 'touch' && !inBand) {
    const wide = hitCell(inner, Math.max(58, birdR + 14));
    if (wide) return { kind: 'cell', cell: wide, f, inner };
    // and a finger on a bird's words is on the bird (K14): the words are drawn
    // upright round the bird, where the placer put them
    const said = hitWords(inner);
    if (said) return { kind: 'cell', cell: said, f, inner };
  }
  if (hitSeed(inner)) return { kind: 'seed', f, inner };
  // **The centre answers out to the circle a hand sees** (round K22, Eugene:
  // *"in the machine view, play/stop by pressing the ring's centre pulse circle
  // is not working"*): the disc's rim is the pulse's own circle, lifted off it
  // on the beat and haloed round it, and a press on that circle's outer half
  // fell outside the disc (`R_CORE`) and did nothing — on the view's small ring
  // the circle is a few pixels wide, so that half was most presses. The centre
  // takes the press out to `CORE_HIT` beyond the rim: the beat's lift and half
  // its stroke, and a little air; the actions on the rim are asked first.
  if (ri <= R_CORE + CORE_HIT) return { kind: 'core', f, inner };
  if (inBand) return { kind: 'band', f, inner };
  if (ri > R_CORE && r < R_BAND_IN - 8) return { kind: 'spin', f, inner };
  return { kind: 'none', f, inner };
}

/**
 * **No hand on the ring** (Eugene, round K4: *"mouse drag on the ring does
 * nothing — with that we don't need the drag/hand cursor"*). The pointer says
 * a press does something on the birds, where they are controls, and on the
 * four actions and the core; everywhere else — the band, the star between the
 * birds, a drag of either — it is the plain arrow.
 */
function cursorFor(hit: { kind: string }) {
  if (dragging) return dragging.kind === 'band' || dragging.kind === 'spin' ? 'default' : 'pointer';
  switch (hit.kind) {
    case 'action':
    case 'core':
      return 'pointer';
    case 'seed':
      return 'text';      // the one reading on the ring you can write back
    case 'cell':
      // Under the record a cell is a reading and nothing on the star is
      // touched; where a held bird reaches the plan it is a control, and the
      // arrow says so before the hand finds out by pressing.
      return controls ? 'pointer' : 'default';
    default:
      return 'default';
  }
}

// ==========================================================================
// The throw
//
// A **finger's** swipe round the star that is **plainly a throw** is a throw of
// the dice: let go, it lands on a new master seed, and the star whirls on the
// swipe's own speed and decelerates home. Since round K3 a mouse never throws —
// *"disable the drag-to-roll on desktop completely — there is a big dice button
// anyway"* — and the whirl is no longer held inside the birds' domains: it is
// its own additive turn, and it always ends on a whole turn, every bird in its
// house (`frame`). Two things changed earlier on 09-23, both Eugene's:
//
// - **Only an obvious drag spins the dice.** *"Today a small mis-drag on a bird
//   throws the dice — jarring. Keep the cute spin-to-roll, but only on a clear
//   attempt: press, a significant travel of the pointer, release."* The star
//   still turns under any drag, which is the cute part, and relaxes home when
//   the hand lets go; it casts only past forty degrees of turn **and** sixty
//   screen pixels of travel, where it used to cast past five degrees.
// - **How far the drag is no longer how far the seed.** The ring used to plan a
//   dozen candidates and let the power of the throw pick how far down the
//   ranking of style distance to reach. The next roll is a plain random seed
//   now (`control.newSeed`); a journey heuristic may come back later as its
//   own round. How hard the star was thrown is still something to watch: it
//   coasts on the speed it was let go at.
//
// The tap on the die is not a throw and keeps its floor: it plans the dozen
// and lands on one that moves the room or the key (`newMix`).
const SPIN_CAST_DEG = 40;       // past this much turn…
const SPIN_CAST_PX = 60;        // …and this much travel of the hand on the screen, a release casts
const SPIN_TRAIL_MS = 140;      // the window the release speed is read over
const SPIN_VEL_MAX = 2000;      // degrees a second: past this it is a slip, not a throw
const SPIN_COAST = 0.45;        // seconds for the coast to fall by e
const SPIN_SETTLE_MS = 450;     // how long a turn that was not a throw takes to relax home
const SPIN_MIN_S = 0.8;         // the shortest a throw's stop may be…
const SPIN_MAX_S = 3;           // …and the longest
const CANDIDATES = 12;          // seeds planned and measured for one tap on the die
const TAP_BAND = 0.5;           // where a tap on the die reaches into them
const SEED_MIN = 1;
const SEED_MAX = 99999;

// A stream of numbers the throw itself decides — the turn, the speed and the
// moment it was let go — so two flicks that felt the same do not draw the same
// twelve candidates. Mulberry32, the same one the generator uses.
function throwStream(spun: number, vel: number, t: number) {
  let h = (Math.round(spun * 97) ^ Math.round(vel * 13) ^ Math.round(t * 1000)) >>> 0;
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let x = Math.imul(h ^ (h >>> 15), 1 | h);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// The candidates, planned and scored against what is playing, and the pick —
// the one module `tools/check.ts` walks twenty taps through (`cast-pool.ts`).
// **Each candidate is planned as the cast would play it**: through the
// control's own planning request (`control.planned`), under the engine the set
// is on and the spell and recipe a seed of its own is cast under, with the
// modes and the theme length the page has — never the bare record (R59).
function candidatePlan(seed: string): PlannedTheme {
  // A candidate that cannot be planned is left out of the throw (`castPool`),
  // and a bug under it is a report (R1): every seed should plan.
  try { return control.planned(0, seed, control.state.strategy) as unknown as PlannedTheme; } catch (e) {
    report('plan', 'a candidate of a throw could not be planned', e, { candidate: seed }, aBug);
    throw e;
  }
}

function castPoolHere(dir: number, rnd: () => number): Candidate[] {
  const from = Number(last && last.seed);
  return castPool({
    cur: last && (last.track as unknown as PlannedTheme),
    here: Number.isFinite(from) ? Math.round(from) : SEED_MIN,
    dir, rnd, plan: candidatePlan,
    candidates: CANDIDATES, seedMin: SEED_MIN, seedMax: SEED_MAX,
  });
}

/**
 * **The die's twelve candidates, planned ahead in idle slots** (R13, the cast's
 * half). A tap planned twelve whole themes inside the tap — 66 ms on this
 * machine under house-v2, a long task, four times that on a phone, on the thread
 * the scheduler pumps from. The stream a tap draws its seeds from is taken
 * ahead instead, its seeds are found without planning anything (a plan that
 * throws is a candidate `castPool` leaves out), and each is planned through the
 * control's own request in an idle slot of its own, so the tap finds them
 * planned. The draw is as random as it was: the stream is seeded by the clock
 * when it is taken rather than when it is used, and a second tap before the
 * set has changed takes a fresh one.
 */
let tapPrep: { key: string; t: number; seeds: string[]; done: number; spent: boolean } | null = null;
let tapPrepQueued = false;
// A candidate is planned under the spell and the recipe the address holds (the
// dice roll inside the held box), so those are part of which set it was for.
let tapSearch = '';
let tapAsk = '';
const tapKey = () => {
  if (!last) return '';
  const search = typeof location === 'undefined' ? '' : location.search;
  if (search !== tapSearch) {
    tapSearch = search;
    const q = new URLSearchParams(search);
    tapAsk = `${q.get('spell') ?? ''}|${q.get('recipe') ?? ''}`;
  }
  return `${last.seed}|${control.state.strategy}|${tapAsk}`;
};
function prepTap() {
  const key = tapKey();
  if (!key) return;
  if (!tapPrep || tapPrep.key !== key) {
    const t = performance.now();
    const seeds: string[] = [];
    const from = Number(last && last.seed);
    castPool({
      cur: null, here: Number.isFinite(from) ? Math.round(from) : SEED_MIN, dir: 0,
      rnd: throwStream(0, 0, t), plan: (seed) => { seeds.push(seed); throw new Error('found, not planned'); },
      candidates: CANDIDATES, seedMin: SEED_MIN, seedMax: SEED_MAX,
    });
    tapPrep = { key, t, seeds, done: 0, spent: false };
  }
  if (tapPrepQueued || tapPrep.spent || tapPrep.done >= tapPrep.seeds.length) return;
  tapPrepQueued = true;
  const run = () => {
    tapPrepQueued = false;
    const p = tapPrep;
    if (!p || p.spent || p.key !== tapKey() || p.done >= p.seeds.length) return;
    try { candidatePlan(p.seeds[p.done]); } catch (err) { /* left out at the tap, as ever */ }
    p.done += 1;
    prepTap();
  };
  const ric = (window as { requestIdleCallback?: (fn: () => void, o: { timeout: number }) => number }).requestIdleCallback;
  if (typeof ric === 'function') ric(run, { timeout: 2000 });
  else window.setTimeout(run, 60);
}

/** What the throw did, for the bench: the seed it landed on and the arithmetic behind it. */
interface CastRecord {
  seed: string;
  from: string | number | null;
  typed?: boolean;
  distance: number | null;
  differs: string[];
  band?: number;
  spun?: number;
  vel?: number;
  pool?: { seed: string; d: number }[];
}

/** What a throw asks for: how far into the ranking, and the floor it must clear. */
interface CastAsk {
  band: number;
  floor?: (p: Parts) => boolean;
  dir?: number;
  spun?: number;
  vel?: number;
}

let lastCast: CastRecord | null = null;

// One door for every cast the ring makes — the tap on the die and the throw of
// the star both come through here, and control.setSeed is the only entry used.
function castNewSeed(o: CastAsk) {
  // A tap draws from the stream its candidates were planned ahead for, when
  // they were planned for this set (`prepTap`); anything else, from now.
  const prepared = !o.spun && !o.vel && tapPrep && !tapPrep.spent && tapPrep.key === tapKey() ? tapPrep.t : null;
  const rnd = throwStream(o.spun || 0, o.vel || 0, prepared ?? performance.now());
  // spent: the next set's candidates are planned when the set changes hands
  if (tapPrep) tapPrep.spent = true;
  const pool = castPoolHere(o.dir || 0, rnd);
  const pick = pickCast(pool, o.band, o.floor || FLOOR.loud);
  nudge(0.9);
  // wake the context here, inside the gesture, so the set can start again when
  // the cast finishes a second and a half from now
  if (control.resumeContext) control.resumeContext();
  if (!pick) return control.newSeed();
  lastCast = {
    seed: pick.seed,
    from: last && last.seed,
    distance: +pick.distance.toFixed(3),
    differs: pick.differs,
    band: +o.band.toFixed(3),
    spun: Math.round(o.spun || 0),
    vel: Math.round(o.vel || 0),
    pool: pool.map((c) => ({ seed: c.seed, d: +c.distance.toFixed(3) })),
  };
  console.info(`[cast] seed ${pick.seed} · ${lastCast.distance} away · ${pick.differs.join(' ') || 'nothing named'}`);
  control.setSeed(pick.seed);
  return pick.seed;
}

/**
 * **A throw: a plain random seed** — no pool, no ranking, the transport's own
 * roll, through the same door every cast uses. What is kept for the bench is
 * what the hand did.
 */
function castPlain(spun: number, vel: number) {
  nudge(0.9);
  if (control.resumeContext) control.resumeContext();
  const from = last && last.seed;
  const seed = String(control.newSeed());
  lastCast = { seed, from, distance: null, differs: [], spun: Math.round(spun), vel: Math.round(vel) };
  console.info(`[cast] seed ${seed} · thrown, a plain roll`);
  return seed;
}

function newMix() {
  spinAngle = 0;
 
  spinEase = null;
  // A tap is a throw of middling power that has to move the room or the key:
  // those are the two nothing else can disguise, so two taps in a row can
  // never sound like one another.
  return castNewSeed({ band: TAP_BAND, floor: FLOOR.fresh, dir: 0 });
}

/**
 * A press on one of the four keys themselves (a pointer or Enter and Space on
 * the focused key): before anything has played the key at twelve is the About
 * (K25) and asks nothing of the set. The centre and the page's Space are play
 * whatever the key draws, so they call `runAction` directly.
 */
/** Whether the key at twelve is the About now: nothing has played yet. */
const aboutMode = () => playMode(!!(last && last.playing)) === 'about';

function pressAction(id: string) {
  if (id === 'play' && aboutMode()) {
    openAbout(document.querySelector('#actions g[data-action="play"]'));
    return;
  }
  runAction(id);
}

function runAction(id: string) {
  // **No guard** (step 1c, Eugene 09-19: *"no cut guard on next/previous/dice
  // or the lock screen"*). A press during a blend used to be swallowed here,
  // because the transport counted from the theme that was playing and a second
  // press arrived a theme further off than the hand meant. It aims now, so a
  // press retargets what is in flight: five nexts inside a second land five
  // themes ahead, each of them a hand-over and none of them a stop. The fill is
  // still the answer to a press; it is no longer a reason to refuse the next
  // one, and it restarts where the new press put it.
  pulseAction(id);
  if (id === 'play') { control.toggle(); nudge(0.35); }
  else if (id === 'skip') { askCut(id); control.skip(); nudge(0.5); }
  else if (id === 'back') { askCut(id); control.back(); nudge(0.3); }
  else if (id === 'cast') { askCut(id); newMix(); }
}

// Holding the die starts the whole set again from its first seed.
function resetAll() {
  spinAngle = 0;
 
  spinEase = null;
  nudge(1.1);
  if (control.resumeContext) control.resumeContext();
  return control.resetToStart();
}

function runHold(now: number) {
  if (!holdRing) return;
  if (hold.at < 0) {
    if (holdDim.getAttribute('opacity') !== '0') { put(holdDim, 'opacity', 0); put(holdRing, 'opacity', 0); }
    return;
  }
  const p = clamp((now - hold.at) / HOLD_MS, 0, 1);
  put(holdDim, 'opacity', (p * 0.55).toFixed(3));
  paintSweep(holdRing, p, ctrlR);
  if (p >= 1 && !hold.fired) {
    hold.fired = true;
    hold.at = -1;
    put(holdDim, 'opacity', 0);
    put(holdRing, 'opacity', 0);
    resetAll();
  }
}

// ==========================================================================
// The phone's panel (Eugene, 09-23: *"no dragging on the phone"*; since K14
// the panel is offered to a finger on any square and a finger may also drag:
// *"we just always show the bottom aux panel for control, but if the user
// drags, they drag"*)
//
// A finger on a bird makes it the active one and opens this under the ring: the
// bird's name and its percent, what it is about, what the music is at its value
// (one sentence, round K13), and two big buttons, **Less** and **More**, that step it by
// `TAP_STEP` points of a percent. His reason is the whole of the design:
// *"touch-release on any slider shifts the value; buttons are precise."* On the
// phone the birds themselves carry only the percent and the short reading, so
// who a bird is and what it means live here, a tap away.
//
// The steps land the way a key does: each press moves the bird at once, and the
// one call to the music waits for the finger to stop, so five presses are one
// hand-over and one address-bar write. On the record there is no panel (round
// K15d, Eugene: *"the panel should not show in v1"*): its birds are readings,
// a finger's tap says what one reads along the track as a mouse's press does,
// and a panel with no slider in it read as a fault.
const panelEl = document.getElementById('birdPanel');
const panelName = document.getElementById('birdPanelName');
const panelMeans = document.getElementById('birdPanelMeans');
const panelNow = document.getElementById('birdPanelNow');
const panelSteps = document.getElementById('birdPanelSteps');
const panelSlider = document.getElementById('birdPanelSlider') as HTMLInputElement | null;
const panelPct = document.getElementById('birdPanelPct');
/** The bird the panel is open on, or none. */
let panelCell: CellNode | null = null;

function openPanel(c: CellNode) {
  // the record's birds are readings: no panel (K15d)
  if (!controls) return;
  const opening = !panelCell || panelHiding;
  const wasHidden = !panelEl || panelEl.hidden;
  panelCell = c;
  panelHiding = false;
  if (panelEl) panelEl.hidden = false;
  paintPanel();
  layPanel();
  // it slides up from the bottom, on from wherever it stands (K20)
  if (opening && panelEl) {
    if (wasHidden) panelGo(panelEl.offsetHeight + 24, 0);
    panelGlide(0, 0, PANEL_SLIDE);
  }
}

/**
 * **The sheet at the bottom of the viewport it is seen in** (round K20; it was
 * K14b's panel laid under the ring and clamped): the sheet's bottom is the
 * visual viewport's — on an iPhone the browser's bars shorten the visual
 * viewport and not the layout one, so the gap under it is lifted off — and the
 * stylesheet keeps its rows above the safe-area inset. Laid again on opening
 * and on every change of the visual viewport.
 */
function layPanel() {
  if (!panelEl || panelEl.hidden) return;
  const vv = window.visualViewport;
  const gap = vv ? Math.max(0, window.innerHeight - (vv.offsetTop + vv.height)) : 0;
  const at = `${gap.toFixed(1)}px`;
  if (panelEl.style.bottom !== at) panelEl.style.bottom = at;
}
/** How long the sheet takes to slide up or down, eased; on from where it stands (K20). */
const PANEL_SLIDE = 110;
let panelHiding = false;

function closePanel() {
  if (!panelCell) return;
  // a slide the panel is closed under commits where the finger left it, as a
  // release does (a drag that loses its pointer commits the same way)
  if (sliding) { sliding = false; slideCommit(); }
  panelCell = null;
  pointCell(null);
  if (!panelEl) return;
  // it slides down and out from wherever it stands, and is put away there
  const h = panelEl.offsetHeight + 24;
  const hide = () => { panelHiding = false; if (!panelCell && panelEl) { panelEl.hidden = true; panelGo(0, 0); } };
  if (REDUCED || panelY >= h - 1) { hide(); return; }
  panelHiding = true;
  panelGlide(h, 0, PANEL_SLIDE, hide);
}

// **A finger's swipe down puts the panel away** (Eugene, round K7: *"need to
// close the bottom − / + panel on mobile with a swipe-down gesture"*). A touch
// that starts on the panel — anywhere but the slider, whose drags are its own
// and never reach here — carries the panel with it, a little: down at
// `PANEL_FOLLOW` of the finger's travel, up at a tenth of it, capped. Let go
// past `PANEL_SWIPE_PX` travelling downward (or past `PANEL_SWIPE_SHARE` of the
// panel's height whatever the speed) and the panel slides down and out over
// `PANEL_OUT` ms on the frame clock and closes, the bird with it, exactly as a
// tap elsewhere closes it; short of that it springs back over `PANEL_BACK` ms.
// Closing touches no value: a press or a slide already committed still lands
// at its phrase line. A mouse or a pen is unchanged.
const PANEL_SWIPE_PX = 40;
const PANEL_SWIPE_SHARE = 0.25;
const PANEL_SWIPE_SPEED = 0.2;   // px per ms, downward, at the lift
const PANEL_FOLLOW = 0.7;
const PANEL_OUT = 220;
const PANEL_BACK = 180;
let panelY = 0;
let panelAnim = 0;
/** Where the panel stands, off its place, and how see-through: written straight, no transition. */
function panelGo(y: number, fade: number) {
  cancelAnimationFrame(panelAnim);
  panelY = y;
  if (!panelEl) return;
  panelEl.style.transform = y ? `translateY(${y.toFixed(1)}px)` : '';
  panelEl.style.opacity = fade ? (1 - fade).toFixed(3) : '';
}
/** And a glide there, on the frame clock, eased out; `done` when it arrives. */
function panelGlide(to: number, fadeTo: number, ms: number, done?: () => void) {
  cancelAnimationFrame(panelAnim);
  const from = panelY;
  const f0 = panelEl && panelEl.style.opacity ? 1 - Number(panelEl.style.opacity) : 0;
  if (REDUCED || ms <= 0) { panelGo(to, fadeTo); if (done) done(); return; }
  const t0 = performance.now();
  const step = (now: number) => {
    const p = clamp((now - t0) / ms, 0, 1);
    const k = 1 - Math.pow(1 - p, 3);
    const y = from + (to - from) * k;
    const fade = f0 + (fadeTo - f0) * k;
    panelY = y;
    if (panelEl) {
      panelEl.style.transform = y ? `translateY(${y.toFixed(1)}px)` : '';
      panelEl.style.opacity = fade ? (1 - fade).toFixed(3) : '';
    }
    if (p < 1) panelAnim = requestAnimationFrame(step);
    else if (done) done();
  };
  panelAnim = requestAnimationFrame(step);
}
if (panelEl) {
  let swipe: { id: number; y0: number; trail: { t: number; y: number }[]; moved: boolean } | null = null;
  panelEl.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || !panelCell) return;
    swipe = { id: e.pointerId, y0: e.clientY, trail: [{ t: performance.now(), y: e.clientY }], moved: false };
    cancelAnimationFrame(panelAnim);
  });
  panelEl.addEventListener('pointermove', (e: PointerEvent) => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const dy = e.clientY - swipe.y0;
    if (Math.abs(dy) > 6) swipe.moved = true;
    const now = performance.now();
    swipe.trail.push({ t: now, y: e.clientY });
    while (swipe.trail.length > 2 && now - swipe.trail[0].t > 120) swipe.trail.shift();
    panelGo(dy > 0 ? dy * PANEL_FOLLOW : Math.max(-12, dy * 0.1), 0);
  });
  const lift = (e: PointerEvent, cancelled: boolean) => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const s0 = swipe;
    swipe = null;
    const dy = e.clientY - s0.y0;
    const first = s0.trail[0];
    const v = (e.clientY - first.y) / Math.max(1, performance.now() - first.t);
    const h = panelEl!.getBoundingClientRect().height || 1;
    const out = !cancelled && dy > 0 && ((dy >= PANEL_SWIPE_PX && v >= PANEL_SWIPE_SPEED) || dy >= h * PANEL_SWIPE_SHARE);
    if (s0.moved) {
      // a swipe is not a press: the button it started on is not pressed
      const eat = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
      panelEl!.addEventListener('click', eat, { capture: true, once: true });
      setTimeout(() => panelEl!.removeEventListener('click', eat, { capture: true }), 400);
    }
    if (out) panelGlide(h + 24, 1, PANEL_OUT, () => closePanel());
    else panelGlide(0, 0, PANEL_BACK);
  };
  panelEl.addEventListener('pointerup', (e) => lift(e, false));
  panelEl.addEventListener('pointercancel', (e) => lift(e, true));
}

/** The panel's words, off the same readings the bird and its explanation carry. */
function paintPanel() {
  const c = panelCell;
  if (!panelEl || !c || !last) return;
  const owned = controls && (c.pulling || c.held);
  const set = (n: HTMLElement | null, t: string) => { if (n && n.textContent !== t) n.textContent = t; };
  // The name alone: the percent is said once, over the slider's knob, where
  // the hand working it is looking (round K3).
  set(panelName, BIRD[c.id].name);
  set(panelMeans, BIRD[c.id].means);
  // **And said to a screen reader** (K30, the reviews of 09-26): the group, the
  // two keys and the slider carry the control they move; their words alone
  // were "less", "more" and "percent of the house", which name nothing
  const name = BIRD[c.id].name;
  const label = (n: Element | null, t: string) => { if (n && n.getAttribute('aria-label') !== t) n.setAttribute('aria-label', t); };
  label(panelEl, `${name}, ${BIRD[c.id].means}`);
  label(document.getElementById('birdPanelLess'), `less ${name}`);
  label(document.getElementById('birdPanelMore'), `more ${name}`);
  label(panelSlider, `${name}, percent of the house`);
  const waiting = owned && (c.pulling || !birdLanded(c.bird, last.spell));
  // **Never blank** (Eugene, round K4: *"the bottom string should always carry
  // the musical explanation for the current value, the same way the desktop
  // bird tooltip does"*).
  //
  // **One line from one author** (round K9: *"while I drag it shows 'NO
  // HARDER', then a second later it turns to '49 beats in the minute' … I
  // thought we decided the bottom text explains the current % value in one
  // static string"*). While a hand is on the bird or its value waits for the
  // seam, the line is that value's reading — the end it stands towards, what it
  // does to the sound, and the reading of the theme it will play in (for Ember
  // the tempo it lands at) — worked out at once, never a pole word first and the
  // rest when a throttled plan catches up; the readout's own tick writes the
  // same words again. Only when nothing is pending does the playing value's
  // reading write it, and at the seam the two are the same theme.
  let handLine = '';
  if (waiting) {
    impliedDie(c, last, performance.now(), c.impliedR == null || Math.abs(c.value - c.impliedFor) >= 0.004);
    if (c.impliedR) handLine = valueLine(c, c.value, { ...(heldSpell() || {}) } as Partial<Spell>, c.impliedR, last);
  }
  set(panelNow, handLine || restLine(c, last));
  if (panelSteps) panelSteps.hidden = !controls;
  const pct = percentShown(c.bird, c.value);
  if (panelSlider && panelSlider.value !== String(pct)) panelSlider.value = String(pct);
  if (panelPct) {
    // over the knob, and nothing at the house: 100 % is never printed
    set(panelPct, owned && pct !== 100 ? `${pct}%` : '');
    panelPct.style.left = `calc(11px + (100% - 22px) * ${pct} / ${RIM_PERCENT})`;
  }
}

/**
 * **What the music is at a value, in five words at most** (Eugene, on round
 * K13: *"Tide says 'Dry, short · Shorter' — what does this even mean … when
 * dragging, the user should see human language explaining the CURRENT value
 * instead of computing it in their heads"*, and then, on the sentence in the
 * panel: *"more compact factual explanations that fit in 4-5 words"*). The
 * band's short line (`shortOf`, `bird-labels.ts`): no pole words, no
 * comparisons, no `now` and no `next`, and never the locked reading, which
 * is the subtitle's. The explanation along the track and the phone panel's
 * line read this; the screen reader reads the sentence (`restSentence`); under
 * a hand the theme is the one the value implies and the value is the hand's.
 */
function valueLine(c: CellNode, v: number, spell: Partial<Spell>, theme: Readout, r: Readout): string {
  // the reading at the theme's own tempo, not the grid's glide towards it
  return shortOf(c.bird, { ...theme, spell: spellAt(c, v, spell, theme) } as LabelTheme, labelStyle(r));
}
function restLine(c: CellNode, r: Readout): string {
  return valueLine(c, playingValue(r, c.bird), (r.spell || {}) as Partial<Spell>, r, r);
}
/** The same reading as one plain sentence, for the screen reader (and, later, an info tip). */
function restSentence(c: CellNode, r: Readout): string {
  const spell = (r.spell || {}) as Partial<Spell>;
  return sentenceOf(c.bird, { ...r, spell: spellAt(c, playingValue(r, c.bird), spell, r) } as LabelTheme, labelStyle(r));
}
function spellAt(c: CellNode, v: number, spell: Partial<Spell>, theme: Readout): Partial<Spell> {
  return { ...HOUSE, ...((theme.spell || {}) as Partial<Spell>), ...spell, [c.bird]: v } as Partial<Spell>;
}

/** Less or More, pressed — or the slider moved: the bird goes there at once, and the music at the phrase line after the hand stops. */
function panelSet(c: CellNode, v: number) {
  // (a second bird stepped inside the wait lets this one's commit go first)
  settleCommit(c);
  stepPull(c, v, last);
  armCommit(c, () => { endPull(c, last, false); paintPanel(); });
  paintPanel();
}
function panelStep(dir: number) {
  const c = panelCell;
  if (!c || !controls) return;
  panelSet(c, stepPercent(c.bird, c.value, dir));
  nudge(0.12);
}

/**
 * **The slider, for a fast change** (Eugene, round K3: *"buttons for
 * incremental, the slider for fast change"*). It snaps to the buttons' own
 * grid of `TAP_STEP` points — a touch slider drifts as the finger lifts, and a
 * grid is what makes the lift land where it was aimed — and the house is one
 * of its steps, landed on exactly, **with the magnet the drag has** (round
 * K11: *"a gravity for the 100 % value, for easy reset to the default"*): at
 * the house the knob stays until the finger is `HOUSE_HOLD` points away, and
 * off it the knob falls home inside `HOUSE_ZONE` (`magnet`).
 *
 * **It applies at the release, as the desktop's drag does** (round K11: *"on
 * mobile, dragging the dot applies the value live, the opposite of desktop. It
 * should apply only when I stop dragging; while dragging I should see the
 * updated label and value the bird will have if I leave it here"*). While the
 * finger is on it the knob moves the bird, its percent, its label and the
 * panel's line — a drawing, as a drag is — and nothing reaches the music or the
 * link; the finger off it commits at once, and the wait's fill starts there.
 * It used to arm the buttons' 300 ms commit on every notch, so a finger that
 * paused mid-slide applied the value it paused on. A change with no finger on
 * it (a key on the focused slider) commits as a key does, 300 ms after the
 * last one.
 */
let sliding = false;
/** The finger off the slider: the value it leaves is the one asked for, now. */
function slideCommit() {
  const c = panelCell;
  if (!c || !controls || !c.pulling) return;
  settleCommit(c);
  endPull(c, last, false);
  paintPanel();
}
if (panelSlider) {
  panelSlider.addEventListener('input', () => {
    const c = panelCell;
    if (!c || !controls) return;
    const p = magnet(Number(panelSlider.value), c.value === HOUSE[c.bird]);
    const snapped = p === 100 ? 100 : clamp(Math.round(p / TAP_STEP) * TAP_STEP, 0, RIM_PERCENT);
    panelSlider.value = String(snapped);
    const v = snapped === 100 ? HOUSE[c.bird] : pulled(valueOfPercent(c.bird, snapped));
    if (v === c.value) return;
    // a drawing until the release: the bird, its words and the panel follow
    // (another bird's commit still waiting goes first; this bird's own is
    // superseded by the release)
    settleCommit(c);
    stepPull(c, v, last);
    paintPanel();
  });
  // The finger off the slider: the value it landed on is read at once, and not
  // when the throttle's window next opens (R13), and — since round K11 — asked
  // for there and then.
  panelSlider.addEventListener('change', () => {
    const c = panelCell;
    if (!c || !controls || !last) return;
    impliedDie(c, last, performance.now(), 'now');
    if (sliding) { sliding = false; slideCommit(); return; }
    if (c.pulling) armCommit(c, () => { endPull(c, last, false); paintPanel(); });
    paintPanel();
  });
  panelSlider.addEventListener('pointerdown', () => { sliding = true; });
  for (const k of ['pointerup', 'pointercancel', 'touchend', 'touchcancel']) {
    panelSlider.addEventListener(k, () => { if (!sliding) return; sliding = false; slideCommit(); });
  }
  for (const k of ['pointerdown', 'pointermove', 'pointerup', 'touchstart']) panelSlider.addEventListener(k, (ev) => ev.stopPropagation());
}

for (const [id, dir] of [['birdPanelLess', -1], ['birdPanelMore', 1]] as const) {
  const b = document.getElementById(id);
  if (b) b.addEventListener('click', (ev) => { ev.preventDefault(); panelStep(dir); });
}

// ==========================================================================
// A hand on a bird (Eugene's list of 09-23, `notes/rounds/ring-k.md`)
//
//   mouse or pen   press — the explanation opens, and nothing else
//                  drag  — the bird lifts off the table, follows the hand along
//                          its spoke (and a little off it through the middle),
//                          and its value is asked for **at the drop**
//                  click — information only: nothing on the ring moves
//                  double click — that bird back to the house
//   finger         tap   — the bird is the active one and the panel under the
//                          ring opens: its name, what it means, Less and More
//                  drag along the bird's spoke — the mouse's drag (K14),
//                          the panel open on it following the hand
//                  swipe round the ring — the star's spin, from wherever it
//                          began: a bird, its words or the open face (K14)
//   either         a still press held on any bird — every bird let go, the
//                  same hold the die makes for its own reset

/** The last click on a bird: the other half of a double click. */
let lastClick: { cell: CellNode | null; at: number } = { cell: null, at: 0 };

/** Lift a bird off the table, or set it down: the node's size eases either way. */
function liftCell(c: CellNode, on: boolean) {
  const i = cellNodes.indexOf(c);
  if (i < 0) return;
  cellLiftTo[i] = on ? 1 : 0;
  // and set down, it floats back onto its own spoke: the play off the axis was
  // feel and never a value; and back into the star's wander
  if (!on) { cellSideTo[i] = 0; holdWander(i, false); }
  cellsMoved = true;
}

/**
 * **The still press on a bird that lets every bird go**, drawn as the die draws
 * its own: a ring closing round the bird the hand is on. Only while a bird is
 * held, because a hold that would let nothing go is not offered; and only after
 * the first quarter of a second, so a click draws nothing at all.
 */
const BIRD_HOLD_SHOW = 250;
let birdHoldDrawn = -1;
function runBirdHold(now: number) {
  const d = dragging;
  const on = !!d && (d.kind === 'pull' || (d.kind === 'finger' && !!d.cell)) && !d.moved && !d.fired
    && controls && heldValue.size > 0 && now - d.t0 >= BIRD_HOLD_SHOW;
  const i = on ? cellNodes.indexOf((d as PullDrag | FingerDrag).cell!) : -1;
  if (birdHoldDrawn >= 0 && birdHoldDrawn !== i && cellNodes[birdHoldDrawn]) put(cellNodes[birdHoldDrawn].holdArc, 'opacity', 0);
  birdHoldDrawn = i;
  if (i < 0) return;
  const hd = d as PullDrag | FingerDrag;
  const p = clamp((now - hd.t0) / HOLD_MS, 0, 1);
  const arc = cellNodes[i].holdArc;
  paintSweep(arc, p, birdR);
  if (p < 1) return;
  hd.fired = true;
  put(arc, 'opacity', 0);
  birdHoldDrawn = -1;
  nudge(0.6);
  releaseAll(last);
  paintPanel();
}

// **A finger anywhere but on the panel or a bird puts the panel away** (round
// K9: *"if I touch above the ring's rect it stays — it should hide in that case
// too: any touch outside the panel"*). Heard on the document before anything
// else is, so the page above and below the ring, the header, the footer and the
// view's mark close it as the ring does. The panel keeps its own touches (the
// slider, the buttons, the swipe down) and a bird keeps its tap — a second tap
// on the open bird still toggles, a tap on another moves the panel there. The
// touch that closes the panel does nothing else: it starts no drag on the ring
// and presses nothing under it.
document.addEventListener('pointerdown', (e: PointerEvent) => {
  if (e.pointerType !== 'touch' || !panelCell || !panelEl) return;
  const t = e.target as Node | null;
  if (t && panelEl.contains(t)) return;
  if (t && tiltEl.contains(t) && hitAt(e).kind === 'cell') return;
  closePanel();
  e.stopPropagation();
  e.preventDefault();
  const eat = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
  document.addEventListener('click', eat, { capture: true, once: true });
  setTimeout(() => document.removeEventListener('click', eat, { capture: true }), 500);
}, { capture: true });

tiltEl.addEventListener('pointerdown', (e: PointerEvent) => {
  // A press outside the field is the end of the edit and nothing else: it
  // takes what was typed and does not also start a drag under it. A press
  // inside the caption's own square is left alone, because a phone sends a
  // mouse press after a tap and it would close what the tap just opened.
  if (seedEditing) {
    if (seedBoxHit(toSvg(e, Z_INNER))) e.preventDefault();
    else closeSeedEditor(true);
    return;
  }
  aimTilt(e);
  const hit = hitAt(e);
  try { tiltEl.setPointerCapture(e.pointerId); } catch (err) { /* headless */ }
  if (hit.kind === 'action') {
    hoverAction(hit.action.id);
    dragging = { kind: 'action', action: hit.action };
    if (hit.action.id === 'cast') { hold.at = performance.now(); hold.fired = false; }
  }
  else if (hit.kind === 'seed') {
    // A cancelled press sends no mouse events after the touch, so the field
    // opens once and keeps the keyboard it was given.
    e.preventDefault();
    dragging = { kind: 'seed', x: e.clientX, y: e.clientY };
  }
  else if (hit.kind === 'cell') {
    if (e.pointerType === 'touch') {
      // **A finger decides by its motion** (K14): nothing is taken at the
      // touch — not the bird, not the panel, not the star.
      dragging = fingerDrag(hit.cell, hit.f, e);
    } else if (controls) {
      // **A cell is a control where a held bird reaches the plan**, and a press
      // on it is a pull rather than a throw of the star: the pointer is
      // captured above, so a hand that wanders off the spoke moves the value
      // and not the compass.
      const perUnit = ringPerUnit();
      const at = unturn(toSvg(e, Z_INNER));
      dragging = {
        kind: 'pull', cell: hit.cell, x: e.clientX, y: e.clientY, t0: performance.now(),
        moved: false, fired: false,
        r0: alongSpoke(hit.cell, at), a0: acrossSpoke(hit.cell, at),
        perUnit,
        R0: 0, S0: 0, cx: e.clientX, cy: e.clientY,
      };
      pointCell(hit.cell);
      // The line opens at the press and not at the lift, so a hand that is
      // about to move a bird can already read which bird it is and which way
      // is more — and it stays through the drag and after it, until the
      // pointer leaves the bird (`holdTell`).
      showTell(hit.cell);
    } else {
      // Under the record a cell is a reading: the press says what it reads,
      // and a mouse's drag is nothing at all (a finger took the branch above).
      dragging = { kind: 'none' };
      pointCell(hit.cell);
      showTell(hit.cell);
    }
  }
  else if (hit.kind === 'core') {
    const offered = releaseOffered();
    dragging = { kind: 'core', t0: performance.now(), armed: false, release: offered };
    // Nothing is armed while the offer already stands, and nothing is armed
    // with no bird held: the centre is then the transport and only that.
    coreHold.at = !offered && controls && heldValue.size > 0 ? performance.now() : -1;
  }
  else if (hit.kind === 'band') {
    dragFrac = hit.f;
    dragging = {
      kind: 'band', f0: hit.f, f: hit.f, acc: hit.f, t0: performance.now(), turn: 0, moved: false,
      // the last moments of the gesture, in screen pixels: a flick is decided
      // on those, so a click or a slow drag can never be one
      trail: [{ t: performance.now(), x: e.clientX, y: e.clientY, f: hit.f }],
    };
    control.seekTo(hit.f, false);
  // **Only a finger spins the ring** (Eugene, 09-23, round K3: *"swipe to spin
  // the birds' ring should be allowed on mobile; disable the drag-to-roll on
  // desktop completely — there is a big dice button anyway"*). A mouse's drag on
  // the open ring is nothing: it neither turns the star nor rolls a seed.
  } else if (hit.kind === 'spin' && e.pointerType === 'touch') dragging = fingerDrag(null, hit.f, e);
  else dragging = { kind: 'none' };
  tiltEl.style.cursor = cursorFor(hit);
});

window.addEventListener('pointermove', (e: PointerEvent) => dragMove(e));
function dragMove(e: PointerEvent): void {
  if (!dragging) return;   // hover is handled on the stage, which sees everything
  const { f } = polar(toSvg(e, Z_OUTER));
  if (dragging.kind === 'band') {
    // Angle alone, and only the change in it: the radius is nobody's business
    // once a drag has started, and a wobble across twelve o'clock stops at the
    // end of the theme instead of wrapping round to its start.
    const d = angleDelta(dragging.f, f);
    dragging.turn += d;
    dragging.f = f;
    dragging.acc = clamp(dragging.acc + d, 0, 1);
    dragging.moved = true;
    const now = performance.now();
    dragging.trail.push({ t: now, x: e.clientX, y: e.clientY, f });
    while (dragging.trail.length > 2 && now - dragging.trail[0].t > FLICK_WINDOW_MS) dragging.trail.shift();
    dragFrac = dragging.acc;
    control.seekTo(dragging.acc, false);
  } else if (dragging.kind === 'spin' || dragging.kind === 'cell') {
    const d = angleDelta(dragging.f, f);
    dragging.f = f;
    dragging.turn += d;
    dragging.spun += Math.abs(d);
    dragging.px += Math.hypot(e.clientX - dragging.lx, e.clientY - dragging.ly);
    dragging.lx = e.clientX;
    dragging.ly = e.clientY;
    const now = performance.now();
    dragging.trail.push({ t: now, turn: dragging.turn });
    while (dragging.trail.length > 2 && now - dragging.trail[0].t > SPIN_TRAIL_MS) dragging.trail.shift();
    // A cell is a reading, but it rides the star and the star is one object:
    // turn it far enough under the finger and the gesture is the star's, not
    // the cell's — eight of the things sit in the ring a throw is made in, and
    // a throw that started on one of them used to do nothing at all.
    if (dragging.kind === 'spin') spinAngle = dragging.base + dragging.turn * 360;
  } else if (dragging.kind === 'finger') {
    const d = dragging;
    if (d.fired || Math.hypot(e.clientX - d.x, e.clientY - d.y) <= FINGER_SLOP) return;
    decideFinger(d, e);
    // and the move that decided it is the first move of what it decided
    const now = dragging as Drag | null;
    if (now && now.kind !== 'finger' && now.kind !== 'none') dragMove(e);
    return;
  } else if (dragging.kind === 'pull') {
    const d = dragging;
    const at = unturn(toSvg(e, Z_INNER));
    d.cx = e.clientX;
    d.cy = e.clientY;
    if (!d.moved) {
      // **What tells a drag from a click**: whether the hand moved at all.
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) <= PULL_SLOP) return;
      d.moved = true;
      // The pull begins here and not at the press, so the four pixels that
      // told it from a press are not also the first four pixels of travel.
      d.r0 = alongSpoke(d.cell, at);
      d.a0 = acrossSpoke(d.cell, at);
      const i0 = cellNodes.indexOf(d.cell);
      d.R0 = cellR[i0];
      d.S0 = cellSide[i0];
      // the star's wander is held for this bird where it stands, so the hand
      // and nothing else moves it (`handWander`)
      holdWander(i0, true);
      // **The bird is lifted off the table** (Eugene: *"like I lift it off the
      // table"*): it grows a little as the drag begins and eases back to its
      // own size at the drop.
      liftCell(d.cell, true);
    }
    followHand(d);
    // the panel open on this bird follows the hand, its line and its slider (K14)
    if (panelCell === d.cell) paintPanel();
    // **The line stays up while the hand is on the bird**, and says what the
    // bird is doing rather than what it means: its percent, the end it is
    // heading for, and which half of the change is already sounding. Said
    // again, never started again, so it does not blink (`showTell`).
    showTell(d.cell);
  }
  tiltEl.style.cursor = cursorFor({ kind: dragging.kind });
}

window.addEventListener('pointerup', (e: PointerEvent) => {
  const d = dragging;
  dragging = null;
  if (e.pointerType === 'touch') { tiltTX = 0; tiltTY = 0; hoverAction(null); pointCell(panelCell); }
  if (!d) return;
  const hit = hitAt(e);
  switch (d.kind) {
    case 'action': {
      const held = d.action.id === 'cast' && hold.fired;
      hold.at = -1;
      // a hold has already done its work; its release is not also a tap
      if (!held && hit.kind === 'action' && hit.action.id === d.action.id) pressAction(d.action.id);
      hold.fired = false;
      break;
    }
    case 'core': {
      const onCore = Math.hypot(hit.inner.x - C, hit.inner.y - C) <= R_CORE + 20;
      // **Release all**, and the two presses it takes (`notes/archive/2026-09-plans/cited/PLAN-BIRDS-UX.md` §2). A
      // long press on the centre offers the word; the press that offered it is
      // not also a play, and neither is the press that takes the offer. With no
      // bird held the centre is exactly what it has always been.
      coreHold.at = -1;
      if (d.armed) break;
      if (d.release && onCore) { offerRelease(false); releaseAll(last); break; }
      if (onCore) runAction('play');
      break;
    }
    case 'pull': {
      const c = d.cell;
      // The hold has let every bird go, and its lift is not also a click.
      if (d.fired) break;
      if (!d.moved) {
        // **A click is information and nothing else** (Eugene, 09-23: *"a plain
        // click on a bird changes nothing on the ring; today it seems to reset
        // the bird"* — it did: a click on the filled centre let the bird go).
        // Two inside `DOUBLE_MS` on the same bird are a double click, which is
        // the one click that does something: that bird back to the house.
        const now = performance.now();
        if (lastClick.cell === c && now - lastClick.at <= DOUBLE_MS) {
          lastClick = { cell: null, at: 0 };
          if (c.held) releaseCell(c, last);
        } else lastClick = { cell: c, at: now };
        showTell(c);
        break;
      }
      lastClick = { cell: null, at: 0 };
      // **The drop.** The bird is set down, floats back onto its spoke, and
      // its value is asked for now and not before.
      liftCell(c, false);
      endPull(c, last);
      showTell(c);
      // A finger's drop with the panel open: the panel is the bird the hand
      // last had (K14). On its own bird it has followed the whole drag; on
      // another it moves there now, at the lift, and never under the hand.
      if (e.pointerType === 'touch' && panelCell) { if (panelCell !== c) openPanel(c); else paintPanel(); pointCell(panelCell); }
      break;
    }
    case 'finger': {
      // Never moved: a tap. On a bird it opens the bird's panel (or puts it
      // away when it is already this bird's); on the open face it is nothing,
      // and the star relaxes from nothing. The hold has done its own work.
      if (d.fired || !d.cell) break;
      // **Under the record there is no panel** (round K15d, Eugene: *"the
      // panel should not show in v1"* — a `v=1` link's birds are readings, and
      // a panel without its slider read as a fault): the tap says what the
      // bird reads, as a mouse's press does, and opens nothing.
      if (!controls) { showTell(d.cell); break; }
      if (panelCell === d.cell) closePanel();
      else openPanel(d.cell);
      pointCell(panelCell);
      break;
    }
    case 'seed':
      // The press is what chose the caption; the release only has to say that
      // the hand stayed still. Hit-testing it again would ask the ring where
      // it is now, and the ring leans a few pixels under a finger between a
      // touch going down and coming up.
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 14) openSeedEditor();
      break;
    case 'cell':
      // A cell is a reading, not a control: it only answers.
      showTell(d.cell!);
      break;
    case 'band': {
      // A flick along the band is the same action as the rune on the wheel,
      // but it has to be a real throw: a click, a tap or a slow drag seeks.
      const fl = flickOf(d);
      if (fl) {
        // A throw asks for the next theme, not for a position: the cursor
        // goes back to wherever the set actually is.
        control.endScrub();
        runAction(fl > 0 ? 'skip' : 'back');
        nudge(0.6);
      } else control.endScrub({ commit: true, fraction: d.acc == null ? hit.f : d.acc });
      dragFrac = null;
      break;
    }
    case 'spin': {
      // The turn was added up as it went, so a release casts on what the hand
      // actually did. **And only on a clear attempt**: forty degrees of turn
      // and sixty pixels of travel, or the star relaxes home and nothing is
      // rolled — a small drag that missed a bird turns the star under the hand
      // and is not a throw of the dice.
      const now = performance.now();
      d.trail.push({ t: now, turn: d.turn });
      while (d.trail.length > 2 && now - d.trail[0].t > SPIN_TRAIL_MS) d.trail.shift();
      const spun = d.spun * 360;
      if (spun < SPIN_CAST_DEG || d.px < SPIN_CAST_PX) { if (REDUCED) { spinAngle = 0; spinEase = null; } else spinHome(0); break; }
      const vel = throwSpeed(d);
      if (REDUCED) { spinAngle = 0; spinEase = null; } else spinHome(clamp(vel, -SPIN_VEL_MAX, SPIN_VEL_MAX));
      castPlain(spun, vel);
      break;
    }
    default: break;
  }
  tiltEl.style.cursor = cursorFor(hit);
});

// A gesture that ends without a lift — the system taking the pointer away, a
// capture lost to a scroll or a call — has to put the transport back exactly
// as a lift does, or the cursor stays under a hand that is no longer there.
function abandonDrag() {
  if (dragging && dragging.kind === 'band') control.endScrub();
  // A pull that ends without a lift **commits where the hand left it**, which
  // is what a lift does: the node is drawn at that radius, and a drawing the
  // spell does not carry is the one thing a ring of readings may not have.
  if (dragging && dragging.kind === 'pull' && dragging.moved && !dragging.fired) {
    liftCell(dragging.cell, false);
    endPull(dragging.cell, last);
  }
  dragging = null;
  dragFrac = null;
  hold.at = -1;
  hold.fired = false;
  coreHold.at = -1;
  tiltEl.style.cursor = 'default';
}

window.addEventListener('pointercancel', abandonDrag);
tiltEl.addEventListener('lostpointercapture', () => { if (dragging) abandonDrag(); });
stage.addEventListener('pointerleave', () => { hoverAction(null); pointCell(panelCell); tiltEl.style.cursor = 'default'; });

// ==========================================================================
const say = (() => {
  const box = $('say');
  let saidTheme = '';
  let saidPlay: boolean | null = null;
  const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  return (r: Readout) => {
    if (!box) return;
    const theme = `${r.mix.themeNumber}|${r.key}|${r.bpm}`;
    if (theme !== saidTheme) {
      saidTheme = theme;
      box.textContent = `Theme ${WORDS[r.mix.themeNumber] || r.mix.themeNumber}, ${r.key}, ${r.bpm}`;
      saidPlay = null;
      return;
    }
    if (r.playing !== saidPlay) {
      saidPlay = r.playing;
      box.textContent = r.playing ? 'Playing' : 'Paused';
    }
  };
})();

/**
 * One line into the live region the readout already has: what a hand just did,
 * said **once per release and never per frame** (`notes/archive/2026-09-plans/cited/PLAN-BIRDS-UX.md` §6). The next
 * theme or the next press says its own thing over the top of it, which is what
 * a live region is for.
 */
const sayBox = $('say');
const announce = (text: string) => { if (sayBox && text) sayBox.textContent = text; };

/**
 * **A stop or a play ends every wait** (Eugene, round K12d: *"moved a bird, saw
 * the progress, too long to wait, stopped the player, pressed play — the music
 * plays with all changes, but the progress never leaves the bird circle"*).
 * The fill is the time until a value is heard. A stop drops the seam a move
 * was waiting on, and on a silent set an ask is the plan at once, so nothing is
 * waiting; a play starts from the plan, the asked values in it, heard on the
 * first note. So at both edges every fill, every consequence and the drop's
 * clock are let go, and the cells are read again from what the set now plays
 * — a stop, a bird moved while stopped, then a play shows nothing stale.
 */
let wasPlaying: boolean | null = null;
function transportFlipped(r: Readout) {
  dropAt = -1;
  for (const c of cellNodes) {
    c.fillFrom = -1;
    c.fillP = 0;
    c.consequent = false;
    // a state and not a hand's gesture: the ornament goes at once, not over
    // its ease (the phone's selected bird keeps its own, which is selection)
    c.ornAt = 0;
    c.markSaid = '';
    if (c.saidArc !== '') { c.saidArc = ''; put(c.pendFill, 'd', ''); }
  }
  if (cellNodes.length) { paintAll(r); paintHeld(r); runBirdMarks(performance.now()); }
}

function onReadout(r: Readout) {
  last = r;
  coverDue(r);
  if (wasPlaying !== null && wasPlaying !== r.playing) transportFlipped(r);
  wasPlaying = r.playing;
  if (!tapPrep || tapPrep.key !== tapKey()) prepTap();
  if (r.playing && !started) { started = true; paintLinkNote(); }
  // Which engine is playing decides whether the cells are controls at all, and
  // the engine can change under a set (the machine view's one control, and the
  // preview's toggle). A ring that has just become the record's puts every
  // held bird back, because the record's page has no control on it.
  if (cellsControl(r.strategy) !== controls) {
    controls = !controls;
    // a panel open when the engine turns to the record goes with it (K15d)
    if (!controls) closePanel();
    // The birds a hand is holding are **not** let go and the link is not
    // rewritten: under the record they are simply not drawn and not touchable,
    // and the eight cells stand where they always stood. Flipping back is
    // where the hand's ring comes back, which is the same ring the link is.
    layoutCells();
    if (cellNodes.length) { repaintCells(r); paintHeld(r); }
  }
  // A spell asked from outside the ring stands the birds where it is (K21).
  if (controls && cellNodes.length) followOutsideAsk(r);
  // A recipe's roll the unheld birds rest at (R58): laid out again only when
  // the roll itself moves — a new cast, a new seed — and never on a frame.
  if (takeRoll(r) && cellNodes.length) { layoutCells(); repaintCells(r); }
  // The colour the set was cast under, put on where the rule allows: at a
  // theme boundary, at a seam, or with nothing playing — and never on a frame.
  runColour(r, r.change.n !== lastChange);
  paintGlyphLevels(r);
  // The node's glow and its word are held for as long as the press has not
  // landed; the fill is the transport's own and is drawn for whichever gesture
  // asked, whether a node was pressed or the star was thrown.
  if (!(r.mix && r.mix.cutting) || r.mix.themeNumber !== cutTheme) cutLanded();
  runCutFill(r);
  say(r);
  if (r.change.n !== lastChange) {
    const reason = r.change.reason;
    lastChange = r.change.n;
    // The plan's key is taken at once (R61): the next readout found it changed
    // and rebuilt the whole ring in the collapse, and then again at its end.
    if (reason === 'seed') { lastPlanKey = planKeyOf(r); startCast('full', () => redrawAll(r)); return; }
    if (reason === 'theme') { redrawAll(r); startFlash(); return; }
    if (reason === 'refused') { startFlash(); return; }
    // **A pull is not a new theme** (Eugene, 09-20: *"the ring re-renders and
    // resets the bird's position on click end"*). A spell set while the set is
    // stopped replans what will play, so everything the ring *says* changes —
    // but the ring has not been handed a different set, and rebuilding it tore
    // down all eight cells at the moment the hand let go, put every glyph back
    // to its sigil, remeasured every word box and flashed the whole ring. It is
    // restated now: the node stays where the hand left it, the filled centre
    // appears, and the only motion after a lift is the sway the star has
    // anyway.
    if (reason === 'spell') { restate(r); return; }
    redrawAll(r);
    startFlash();
    return;
  }
  if (planKeyOf(r) !== lastPlanKey) redrawAll(r);
  repaintCore(r);
  if (r.bar !== lastBar) { lastBar = r.bar; repaintCells(r); }
}

/**
 * **The same ring, saying something else.** Every mark that carries a value is
 * written again; not one is built again. The plan really is another plan — a
 * held bird changes the bars, the sections and the lanes of the theme that is
 * coming — so the timeline is drawn from it, and that is the only group here
 * that is cleared. The eight cells, the star, the wheel and the core keep the
 * elements they have, so a node keeps its radius across the moment a hand
 * lets go.
 */
/** What names the plan the ring is drawn from: worked out once per plan, since a readout's plan is kept (R98). */
let planKeyFor: { plan: Readout['plan']; seed: string; theme: number; bars: number; key: string } | null = null;
function planKeyOf(r: Readout): string {
  const f = planKeyFor;
  if (f && f.plan === r.plan && f.seed === r.seed && f.theme === r.mix.themeNumber && f.bars === r.bars) return f.key;
  const key = `${r.seed}:${r.mix.themeNumber}:${r.bars}:${r.plan.map((s) => s.kind + s.bars).join('')}`;
  planKeyFor = { plan: r.plan, seed: r.seed, theme: r.mix.themeNumber, bars: r.bars, key };
  return key;
}

function restate(r: Readout) {
  lastPlanKey = planKeyOf(r);
  nextDrawnFor = null;
  buildTimeline(r);
  repaintCells(r);
  paintHeld(r);
  repaintCore(r);
  lastBar = -1;
  lastShadeF = -1;
}

function redrawAll(r: Readout) {
  lastPlanKey = planKeyOf(r);
  nextDrawnFor = null;
  buildTimeline(r);
  buildSpin(r);
  buildCells(r);
  buildCore(r);
  buildActions(r);
  lastBar = -1;
  lastBeatDrawn = -1;
  lastShadeF = -1;
  repaintCore(r);
}

// ==========================================================================
const deltas = new Float32Array(900);
let dIdx = 0, dCount = 0, lastFrame = 0;

// A phone draws the live layer every other frame. Everything in it is a
// slow ease — the breathing, the halos, the cursor — and at DPR 3 the layer is
// a 1100 px square repainted in software on every write, so half the frames
// is half the main thread handed back to the scheduler.
// what the resting pulse was last written for, under reduced motion ('' is not at rest)
let pulseRestKey = '';

// Holding still, for a picture.
//
// Everything on the ring that eases — a halo settling onto its layer, the big
// mark fading out — is a spring with no end
// point in time, so two runs of the same source stop a hair apart and two
// screenshots of one ring differ in a handful of pixels. `still()` snaps every
// one of them onto its own target, takes one more frame and then stops asking
// for another, which is what makes a byte-for-byte compare of two builds
// something that can be done at all. A bench hook, like `freezeCast`: nothing
// on the page calls it.
let frozen = false;

function snapStill() {
 
  spinEase = null;
  spinAngle = 0;
  sway = null;                 // the next frame takes the reading as it stands
  starShown = null;
  swayDeg = 0;
  // The slide is a spring like every other: a held cell is snapped onto the
  // radius its value maps to, so two runs of one ring stop in one place.
  for (let i = 0; i < cellR.length; i++) if (cellR[i] !== cellTo[i]) { cellR[i] = cellTo[i]; cellsMoved = true; }
  if (cellsMoved) { flexAt = 0; flexStar(performance.now()); }
  tiltX = 0; tiltY = 0; tiltTX = 0; tiltTY = 0; wobA = 0;
  // a line is only up because `showTell` drew one, which makes the text
  if (tell.at >= 0) { tell.at = -1; tell.hold = false; put(tellText!, 'opacity', '0.900'); }
  if (bigPlay) { bigPlayOp = reading(last) ? 0 : 1; put(bigPlay, 'opacity', bigPlayOp.toFixed(3)); }
  for (let i = 0; i < haloOn.length; i++) {
    const want = last && last.active[CELLS[i].layer] ? 0.5 : 0;
    haloLit[i] = want;
    haloOn[i].crisp.setAttribute('opacity', want.toFixed(3));
    haloOn[i].wide.setAttribute('opacity', (want * 0.26).toFixed(3));
  }
  // The beat dots are not a spring and are here for the same reason: a paused
  // set holds the dot that was lit when the hand came off the transport, which
  // is a moment no build decides. A still picture shows the beat the cursor is
  // actually on, and two runs then light the same dot. A ring that has never
  // played is left exactly as it is: its four dots are a quiet ring and lighting
  // one of them would be the hook changing the picture rather than settling it.
  if (last && beatDots.length && lastBeatDrawn >= 0) {
    lastBeatDrawn = last.beatInBar;
    for (let i = 0; i < beatDots.length; i++) beatDots[i].setAttribute('opacity', i === last.beatInBar ? 0.95 : 0.2);
  }
}

/**
 * **The preference, changed with the page open** (R53). Turned on, everything
 * decorative is put at rest where it would rest — the star north, no lean, no
 * wobble, no spin, no flash, the words placed for a star that stands still —
 * and nothing slow is cut short that was a reading: a seam's fill, the colour
 * and the birds a hand has moved are drawn as the state they are in. Turned
 * off, the sway takes up again from north at the star's own speed ceiling, so
 * motion arriving is itself an ease and never a jump.
 */
function reducedChanged(on: boolean) {
  REDUCED = on;
  sway = 0;
  starShown = 0;
  swayAt = 0;
  if (!on) return;
  spinAngle = 0; spinEase = null;
  tiltTX = 0; tiltTY = 0; wobA = 0;
  swayDeg = 0;
  if (flash.t0 >= 0) { flash.t0 = -1; for (const f of haloFlash) f.setAttribute('opacity', 0); }
  if (starDeg !== 0) {
    starDeg = 0;
    starSvg.style.transform = `translateZ(${Z_INNER}px) rotate(0deg)`;
    if (coronaG) put(coronaG, 'transform', '');
    uprightGlyphs();
    wordStep = 0;
    placeWords(0);
  }
  put(gSpin, 'transform', '');
  cellsMoved = true;
  flexAt = 0;
}

/** A finger arriving or leaving: the words and the tell are a finger's or a mouse's, so the ring is drawn again. */
function coarseChanged(on: boolean) {
  COARSE = on;
  if (last) redrawAll(last);
}

/** The corona's rays for a reach of `trace` units: slivers out of the rim, none over an action's node. */
function paintRays(trace: number) {
  const key = `${trace.toFixed(1)}|${ctrlR.toFixed(2)}`;
  if (!coronaRays || key === raysFor) return;
  raysFor = key;
  const clearA = (ctrlR + 4) / R_CORE;
  const acts = [0, 0.25, 0.5, 0.75].map((f) => ang(f));
  // the gradient every ray fades along: the rim's light to nothing at the reach
  if (coronaFade) {
    put(coronaFade, 'r', (R_CORE + trace).toFixed(2));
    put(coronaFadeIn, 'offset', (R_CORE / (R_CORE + trace)).toFixed(4));
    put(coronaFadeMid, 'offset', ((R_CORE + RAY_MID * trace) / (R_CORE + trace)).toFixed(4));
  }
  clear(coronaRays);
  const p = (r: number, t: number) => `${(C + Math.cos(t) * r).toFixed(2)} ${(C + Math.sin(t) * r).toFixed(2)}`;
  for (const ray of RAY_SET) {
    if (acts.some((x) => Math.abs(Math.atan2(Math.sin(ray.a - x), Math.cos(ray.a - x))) < clearA)) continue;
    // a wedge from the rim, narrowing to its tip: wide at the root, where the
    // corona is brightest, and gone by its end along the gradient
    const w = ray.w;
    const tip = R_CORE + trace * ray.len;
    el('path', { d: `M${p(R_CORE, ray.a - w)} L${p((R_CORE + tip) / 2, ray.a - w * 0.55)} L${p(tip, ray.a)} L${p((R_CORE + tip) / 2, ray.a + w * 0.55)} L${p(R_CORE, ray.a + w)} Z`, 'fill-opacity': ray.op.toFixed(2) }, coronaRays);
  }
}

/**
 * The corona, the wave and the breath under the reading, at a point `e` of the
 * swell, `q` beats after the pulse, for a pulse every `every` beats.
 */
function paintPulse(e: number, k: number, soft: number, every = 4, hard = 0) {
  // above ninety the corona rests, faint, under the beat; below, it breathes
  const ec = every === 1 ? 0 : e;
  const weight = every === 1 ? 1 : every === 3 ? BEAT_MID : 0;
  paintBeat(k, weight, REDUCED ? 0 : hard);
  paintCorona(ec, k, soft);
  // above ninety the beat's crisp ring is the rim itself, as it first was
  if (weight === 1) put(pulseRing2, 'opacity', 0);
  // **The breath under the reading keeps the beat at every tempo** (K19: *"we
  // lost the pulsation on the inner ring of the player circle"* — K17 held it
  // at the corona's resting floor above ninety): the disc's gold wash, out to
  // the inner ring, swells with the pulse's own envelope in every band.
  const eb = every === 1 ? (REDUCED ? 0 : hard) : e;
  put(breathDisc, 'r', (R_CORE_IN * (1 + 0.05 * eb)).toFixed(2));
  put(breathDisc, 'opacity', (0.03 + 0.07 * eb).toFixed(3));
}
/** The ring's first beat: lifted off the rim by `7 e` on the beat's hard envelope, at `weight` of its light. */
function paintBeat(k: number, weight: number, e: number) {
  const r = (R_CORE + 7 * k * e).toFixed(2);
  put(waveRings[0], 'stroke-width', (9 * k).toFixed(2));
  put(waveRings[0], 'opacity', (weight * (0.05 + 0.26 * e)).toFixed(3));
  put(waveRings[1], 'opacity', (weight * (0.14 + 0.52 * e)).toFixed(3));
  for (const w of waveRings) put(w, 'r', r);
}
function paintCorona(e: number, k: number, soft: number) {
  const trace = PULSE_FAST.trace * k * (1 + (CORONA_REACH_SLOW - 1) * soft * soft);
  const reach = trace * (CORONA_REST + (1 - CORONA_REST) * e);
  coronaOpacities(0.05 + 0.26 * e, pulseAlpha);
  // Written through `put`: every stroke stands on the rim and reaches `reach`
  // of it at its share, so only its width and its light move — nothing travels
  for (let j = 0; j < pulseRings.length; j++) {
    const w = reach * PULSE_LAYERS[j];
    put(pulseRings[j], 'opacity', pulseAlpha[j].toFixed(3));
    put(pulseRings[j], 'stroke-width', w.toFixed(2));
    put(pulseRings[j], 'r', (R_CORE + w / 2).toFixed(2));
  }
  // the rim itself, where the light is strongest, breathing where it is
  put(pulseRing2, 'r', R_CORE);
  put(pulseRing2, 'opacity', (0.16 + 0.44 * e).toFixed(3));
  paintRays(trace);
  if (coronaRays) put(coronaRays, 'opacity', (RAY_OP * (0.2 + 0.8 * e) * (0.5 + 0.5 * soft)).toFixed(3));
}

/**
 * **The loop's pace** (round K30, the reviews of 09-26). On a 120 Hz screen the
 * frame ran 120 times a second, and a stopped ring cost 84 % of a playing one.
 * Every motion on the ring steps by the clock (`FRAME_STEP`, the eases' `dt`),
 * so a frame skipped cuts nothing short: the loop does its work at 60 a second
 * at most, and at 30 while the set is stopped and nothing is moving under a
 * hand or on its own — the wander, the halos and the words still breathe, half
 * as often. The margins take a screen's jitter: a 60 Hz frame is never skipped.
 */
const FRAME_MIN_MS = 1000 / 60 - 3;
const FRAME_REST_MS = 1000 / 30 - 3;
/** the screen's own frame gap, eased (a 120 Hz screen's is 8.3 ms) */
let rawAt = 0, rawGap = 1000 / 60;
function atRest(now: number): boolean {
  return !!last && !last.playing && !dragging && now - handAt > 1500 && !spinEase && !playOut
    && cast.t0 < 0 && castFreeze == null && wobA <= 0.001 && !cellNodes.some((c) => c.glyphOut || c.linesOut)
    // and no bird still travelling to where its value puts it, with its words following
    && !cellR.some((r, i) => Math.abs(r - cellTo[i]) > 0.05);
}

function frame(now: number) {
  if (frozen) return;                 // the ring is being photographed
  // (a phone draws every other frame of its screen — 30 a second at 60 Hz, 60
  // at 120, as before K30 — but every frame while a hand pulls a bird; the
  // screen's own rate is read off the gaps between its frames)
  const pulling = !!dragging && dragging.kind === 'pull' && dragging.moved;
  if (rawAt) rawGap += ((now - rawAt) - rawGap) * 0.1;
  rawAt = now;
  const fast = rawGap < 12;
  // **A hand on the ring runs at the screen's own rate** (K31): a drag, a spin
  // and the throw's ease after it are the picture following the hand, and the
  // 60 a second the rest of the loop keeps put the drawn star a frame behind
  // the hand on a faster screen (a glyph 8.4° off its circle through a whirl,
  // a dragged bird's halo and ornament a step behind their ease). A phone keeps
  // its own rule, every frame only while it pulls a bird, as before K30.
  const handDriven = !!dragging || !!spinEase;
  const gap = COARSE
    ? (atRest(now) ? FRAME_REST_MS : !pulling && !fast ? FRAME_REST_MS : pulling ? 0 : FRAME_MIN_MS)
    : handDriven ? 0 : atRest(now) ? FRAME_REST_MS : FRAME_MIN_MS;
  if (lastFrame && now - lastFrame < gap) { requestAnimationFrame(frame); return; }
  if (lastFrame) { deltas[dIdx % deltas.length] = now - lastFrame; dIdx++; dCount = Math.min(dCount + 1, deltas.length); }
  lastFrame = now;
  // the square, while a hand is about, before this frame writes anything
  frameNo += 1;
  if (now - handAt < 250) { square = readSquare(); squareFrame = frameNo; }

  const free = !(dragging && (dragging.kind === 'band' || dragging.kind === 'spin'));
  // the lean under a hand is held while it pulls a bird, so the ring under
  // the bird does not move under the hand (round K8)
  // (and under reduced motion there is no lean at all: it is ornament)
  if (!pulling) {
    tiltX += ((free && !REDUCED ? tiltTX : 0) - tiltX) * 0.11;
    tiltY += ((free && !REDUCED ? tiltTY : 0) - tiltY) * 0.11;
    if (REDUCED) { tiltX = 0; tiltY = 0; }
  }
  let wx = 0, wy = 0;
  if (wobA > 0.001 && !REDUCED) {
    const t = (now - wobT) / 1000;
    wobA *= 0.94;
    wx = wobA * Math.sin(t * 17) * 3;
    wy = wobA * Math.cos(t * 13) * 3;
  }
  // Only touch the transform when it has actually moved: a settled spring
  // that keeps writing the same string still costs a composite every frame.
  const rx = +(tiltX + wx).toFixed(2);
  const ry = +(tiltY + wy).toFixed(2);
  if (rx !== tiltWX || ry !== tiltWY) {
    tiltWX = rx;
    tiltWY = ry;
    tiltEl.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
  }

  // The throw the star was given: one ease from the speed it was let go at
  // onto a whole turn (`spinHome`), which is the same picture as none — so how
  // hard the dice were thrown is something that can be watched. Reduced motion
  // takes the angle away at the release and nothing here runs.
  if (!(dragging && dragging.kind === 'spin')) {
    if (spinEase) {
      const e = spinEase;
      const p = clamp((now - e.t0) / 1000 / e.dur, 0, 1);
      spinAngle = e.a0 + e.d * (1 - Math.pow(1 - p, 3));
      // on the turn: a whole number of turns is the star at home, so the
      // angle is nought again — the same drawing to the last digit
      if (p >= 1) { spinAngle = 0; spinEase = null; }
    } else if (spinAngle) spinHome(0);
  }

  if (heldAction && now > heldUntil) {
    const was = heldAction;
    heldAction = null;
    hoverAction(hoveredAction === was ? null : hoveredAction);
  }
  // the large play mark fades out when the set first starts and does not come
  // back; it lives outside the bloom, so this is free
  if (bigPlay) {
    const want = reading(last) ? 0 : 1;
    if (Math.abs(bigPlayOp - want) > 0.002) {
      const dt = Math.min(FRAME_STEP, now - (bigPlayPrev || now));
      bigPlayOp = REDUCED ? want : bigPlayOp + (want - bigPlayOp) * (1 - Math.exp(-dt / 130));
      put(bigPlay, 'opacity', bigPlayOp.toFixed(3));
    }
  }
  bigPlayPrev = now;
  runTell(now);

  // the birds now, their words once the star has turned (below)
  let wordsDue = flexStar(now, false);
  runHold(now);
  runBirdHold(now);
  runBirdMarks(now);
  runLinks(now);
  runGlyphFade(now);
  runPlayFade(now);
  runLinesFade(now);
  runCoreHold(now);
  // The promise, closing on the seam's own clock: the same two numbers the
  // pressed node's fill is drawn from, and nothing at all with no bird held.
  if (last && (heldValue.size || (last.mix && last.mix.cutting) || cellNodes.some((c) => c.fillFrom >= 0))) paintHeld(last);
  const casting = runCast(now);
  runFlash(now);
  runCross(now);

  if (!casting && last) {
    paintNext(last);
    // While a scrub is running the cursor belongs to the hand, not to the
    // playhead, which would otherwise pull it back between two moves.
    const f = dragFrac == null ? last.progress : dragFrac;
    put(cursorG, 'transform', `rotate(${deg(f).toFixed(2)} ${C} ${C})`);
    if (Math.abs(f - lastShadeF) > 0.0009) {
      lastShadeF = f;
      setPlayedSplit(f);
      const top = Math.sin(ang(f)) < 0.02;
      const rr = top ? R_ENGRAVE : R_ENGRAVE + 18;
      const w = 0.075;
      engravePath.setAttribute('d', top ? arcPath(rr, f - w, f + w, 1) : arcPath(rr, f + w, f - w, 0));
    }
    const cut = last.mix.cutInBars;
    const label = cut
      ? `${last.time} · ${last.bar + 1}/${last.bars} · cut in ${cut}`
      : `${last.time} · ${last.bar + 1}/${last.bars}`;
    const up = label.toUpperCase();
    if (engraveTP.textContent !== up) engraveTP.textContent = up;

    if (last.playing) {
      // How far the pulse reaches is a curve of the tempo (`pulseTrace`): the
      // pulse the ring has always had at a house tempo and above, and a wide,
      // slow swell under sixty — rising and falling on a logarithm and fading
      // at its edges there (`pulseEnvelope`, `PULSE_LAYERS`).
      const bpm = pulseBpmAsked ?? tempoNow(last);
      const soft = pulseSoft(bpm);
      const every = pulseEvery(bpm);
      const e = pulseEnvelope(last.beatPhase, last.barPhase, soft, every, (last.bar * 4 + last.beatInBar) % every);
      // the beat's own hard envelope, on the pulse's rate, for the ring's first beat
      const hard = pulseEnvelope(last.beatPhase, last.barPhase, 0, every, (last.bar * 4 + last.beatInBar) % every);
      const k = pulseTrace(bpm) / PULSE_FAST.trace;
      // **Under reduced motion the pulse rests** at the floor of its own swell:
      // the rings stand at the core's edge with their resting light and the
      // breath holds still, written once a tempo and not once a frame; the
      // beat is still told by the dot, which steps and does not move.
      const restKey = REDUCED ? `${k.toFixed(4)}:${soft.toFixed(4)}` : '';
      if (!restKey || restKey !== pulseRestKey) {
        pulseRestKey = restKey;
        paintPulse(REDUCED ? 0 : e, k, soft, every, hard);
      }
      if (cursorFaded !== 1) { cursorFaded = 1; cursorG.setAttribute('opacity', 1); }
      if (last.beatInBar !== lastBeatDrawn) {
        lastBeatDrawn = last.beatInBar;
        for (let i = 0; i < beatDots.length; i++) beatDots[i].setAttribute('opacity', i === last.beatInBar ? 0.95 : 0.2);
      }
    } else {
      if (cursorFaded !== 0.6) {
        cursorFaded = 0.6;
        pulseRestKey = '';
        for (const p of pulseRings) put(p, 'opacity', '0.000');
        for (const w of waveRings) put(w, 'opacity', '0.000');
        if (coronaRays) put(coronaRays, 'opacity', 0);
        put(pulseRing2, 'opacity', 0.16);
        put(pulseRing2, 'r', R_CORE);
        put(breathDisc, 'opacity', 0);
        cursorG.setAttribute('opacity', 0.6);
      }
    }

    for (let i = 0; i < haloOn.length; i++) {
      const want = last.active[CELLS[i].layer] ? 0.5 : 0;
      const h = haloOn[i];
      // the light as last written, kept as a number (R122: eight attribute
      // reads a frame, after the frame's own writes)
      const cur = haloLit[i];
      if (Math.abs(cur - want) > 0.005) {
        const v = REDUCED ? want : cur + (want - cur) * 0.14;
        haloLit[i] = +v.toFixed(3);
        h.crisp.setAttribute('opacity', v.toFixed(3));
        h.wide.setAttribute('opacity', (v * 0.26).toFixed(3));
      }
    }
  }

  // Inside the bloomed star: written only when the star has actually turned.
  // The star turns with the theme. It is a transform on its own sheet, so
  // WebKit composites it and nothing inside the bloom is ever written.
  if (!REDUCED) {
    // a sway about north across the theme, with a slow drift over it so it
    // never reads as a mechanism: two sines, seven and thirteen seconds, a
    // degree and a half and four fifths of one
    const dtS = Math.min(FRAME_STEP, now - (swayAt || now));
    swayAt = now;
    const k = 1 - Math.exp(-dtS / SWAY_EASE);
    const want = swayOf(last ? tempoNow(last) : SWAY_FAST.bpm);
    swayCurve = swayCurve == null ? want : {
      sway: swayCurve.sway + (want.sway - swayCurve.sway) * k,
      drift: swayCurve.drift + (want.drift - swayCurve.drift) * k,
      pace: swayCurve.pace + (want.pace - swayCurve.pace) * k,
    };
    // the wander's own clock runs at the curve's pace, so a slower tempo is a
    // slower wander and a change of tempo never jumps its phase
    driftT += (dtS / 1000) * swayCurve.pace;
    const drift = (swayCurve.drift / 2.3)
      * (1.5 * Math.sin((TAU * driftT) / 7 + 0.9) + 0.8 * Math.sin((TAU * driftT) / 13 + 2.3));
    if (dragFrac == null && last) starFrac = last.progress;
    // Out to the right, home at the half, out to the left, home at the seam —
    // and **eased onto that reading, never stepped to it** (Eugene, 09-23:
    // *"changing one bird resets the whole ring track and the other birds
    // move"*). A pull hands over at the next phrase line into the next theme,
    // whose progress starts at nought, so the excursion the reading asks for
    // falls from wherever the old theme had got to — MEASURED on seed 15576
    // under house-v2, a pull a quarter of the way through a theme turned the
    // whole star, and every bird on it, 11.5 degrees in one frame at the seam.
    // A bird's position is never moved by what the birds themselves caused, so
    // the sway keeps its phase and glides: the reading moves a third of a
    // degree a second, which the ease follows to within half a degree, and a
    // seam, a skip, a seek or a cast that moves the reading at once is met at
    // a sixth of a degree a frame.
    const aim = swayCurve.sway * Math.sin(TAU * starFrac);
    sway = sway == null ? aim : sway + (aim - sway) * k;
    // **How the clamp and a spin live together** (round K3). The continuous
    // motion — the sway, its ease, the drift — is held inside the birds'
    // domains and under the speed ceiling: `starShown`, never more than
    // fourteen degrees and twenty degrees a second. **A finger's spin is its
    // own additive turn on top of it**, `spinAngle`: a real whirl, as fast and
    // as long as the swipe was hard, outside the clamp and the ceiling because
    // it is deliberate, and it always decelerates onto a whole turn and is
    // dropped — so at its end every bird is back in its house, the domain
    // exactly as the sway left it.
    const want2 = clamp(sway + drift, -(BIRD_DOMAIN - 1), BIRD_DOMAIN - 1);
    const step = (STAR_SPEED * dtS) / 1000;
    starShown = starShown == null ? want2 : starShown + clamp(want2 - starShown, -step, step);
    swayDeg = +starShown.toFixed(2);
    const turn = starShown + spinAngle;
    const d = +turn.toFixed(2);
    if (d !== starDeg) {
      starDeg = d;
      starSvg.style.transform = `translateZ(${Z_INNER}px) rotate(${d}deg)`;
      if (coronaG) put(coronaG, 'transform', d ? `rotate(${(-d).toFixed(2)} ${C} ${C})` : '');
      uprightGlyphs();
      // the words are held upright against it, and their clear space is
      // reckoned again every fifteen degrees
      const step = Math.round(d / 15);
      if (step !== wordStep) { wordStep = step; placeWords(d); }
      else turnWords(d, false);
      wordsDue = false;
    }
  } else {
    put(gSpin, 'transform', spinAngle ? `rotate(${spinAngle.toFixed(2)} ${C} ${C})` : '');
  }
  if (wordsDue) turnWords(starDeg, false);

  requestAnimationFrame(frame);
}

/**
 * **The control size, read off the ring's square** (`CTRL_R`, round K3). A
 * change of class — the phone turned, a window narrowed past the threshold,
 * the machine view taking the ring into its corner and giving it back — draws
 * the ring again at the new size, and the few marks the live layer keeps at a
 * control's size are resized in place.
 */
function sizeControls(redraw = true) {
  // the square as laid out, and not its rect, which the lean tilts (R123)
  const side = tiltEl.offsetWidth || tiltEl.getBoundingClientRect().width || 1000;
  square = null;
  unitPx = side / 1000;
  const next = CTRL_R * (side < CTRL_SMALL_SIDE ? CTRL_SMALL_K : 1);
  if (next === ctrlR && redraw) return;
  ctrlR = next;
  birdR = side < CTRL_SMALL_SIDE ? +(ctrlR * BIRD_SMALL_OF_CTRL).toFixed(3) : BIRD_R;
  starK = side < CTRL_SMALL_SIDE ? STAR_SMALL_K : 1;
  if (side < CTRL_SMALL_SIDE) {
    const zero = R_STAR * PULL_IN;
    const rim = R_BAND_IN - BIRD_BAND_CLEAR - birdR * SIZE_RIM;
    starR = zero + (rim - zero) / (RIM_PERCENT / 100);
    pullIn = zero / starR;
  } else {
    starR = R_STAR;
    pullIn = PULL_IN;
  }
  if (holdDim) put(holdDim, 'r', ctrlR);
  if (holdRing) put(holdRing, 'r', sweepR(ctrlR).toFixed(2));
  for (const h of actionHalos) { put(h.wide, 'r', ctrlR); put(h.crisp, 'r', ctrlR); }
  if (seedBox) put(seedBox, 'y', C + R_ACT + ctrlR - 3);
  cutDrawnFor = null;
  if (gCutFill) { clear(gCutFill); }
  if (redraw && last) redrawAll(last);
}
if (typeof ResizeObserver === 'function') new ResizeObserver(() => sizeControls(true)).observe(tiltEl);

/**
 * **The viewport the ring is seen in** (round K14: *"the ring on mobile is
 * off-centre … the ring should be exactly in the centre of the viewport"*).
 * The stage is laid over the visual viewport — its top, left, width and height
 * written as four variables on the root, and the ring's square off the
 * smaller side — on load, on every resize of the window and of the visual
 * viewport and on its scroll, which is how iOS says its bars came or went. A
 * pinch-zoom is the reader looking closer and moves nothing. The machine view
 * lays its own box over these (`machine/look.ts`).
 */
function fitViewport() {
  const vv = window.visualViewport;
  const root = document.documentElement.style;
  if (vv && Math.abs(vv.scale - 1) > 0.01) return;
  const w = vv ? vv.width : window.innerWidth;
  const h = vv ? vv.height : window.innerHeight;
  const set = (k: string, v: string) => { if (root.getPropertyValue(k) !== v) root.setProperty(k, v); };
  set('--vv-top', `${(vv ? vv.offsetTop : 0).toFixed(2)}px`);
  set('--vv-left', `${(vv ? vv.offsetLeft : 0).toFixed(2)}px`);
  set('--vv-w', `${w.toFixed(2)}px`);
  set('--vv-h', `${h.toFixed(2)}px`);
  set('--vv-min', `${Math.min(w, h).toFixed(2)}px`);
}
/**
 * **The lock screen's cover is the ring as it stands** (round K15, Eugene:
 * *"only if it doesn't degrade performance: … show the actual ring in its
 * current colour setting, redone only when a drastic change to the ring
 * happened"*). The ring at rest — the rim, the star with its birds and words,
 * the transport, in the colour it wears; no corona, no halos, no live marks —
 * drawn once into a 512 and a 256 square and handed to the lock screen
 * (`control.setCover`). Drawn only when something drastic changed: the first
 * start, a new seed, another engine, or the colour the ring wears travelling
 * `COVER_HUE_STEP` or more from the last cover's; never on a bird's move, never
 * on a frame; `COVER_WAIT` after the change, in an idle callback, outside the
 * hand's task and the transport's tick. Only where there is a media session.
 * Anything failing leaves the static cover. `COVER_REDUCED` draws it without
 * the bloom's blur and without the dashes (the cheap ring the gate allows).
 */
const COVER_WAIT = 1500;
const COVER_HUE_STEP = 24;
const COVER_REDUCED = false;
let coverFor: { seed: string; strategy: string; hex: string } | null = null;
let coverTimer = 0;
let coverUrls: string[] = [];
let coverFont: string | null = null;
/** What each render cost, for the bench: the serialising and each square's raster, in ms. */
const coverCost: { renders: number; serialise: number[]; raster: number[]; bytes: number; failed: number } = { renders: 0, serialise: [], raster: [], bytes: 0, failed: 0 };
const hexDist = (a: string, b: string) => {
  const p = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
  const [x, y] = [p(a), p(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
function coverDue(r: Readout) {
  if (typeof navigator === 'undefined' || !navigator.mediaSession || !control.state.userStarted) return;
  const seed = String(r.seed), strategy = String(r.strategy), hex = colour.hex;
  if (coverFor && coverFor.seed === seed && coverFor.strategy === strategy && hexDist(coverFor.hex, hex) < COVER_HUE_STEP) return;
  coverFor = { seed, strategy, hex };
  clearTimeout(coverTimer);
  const idle = (fn: () => void) => ((window as any).requestIdleCallback ? (window as any).requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 0));
  coverTimer = window.setTimeout(() => idle(() => { renderCover().catch(() => { coverCost.failed += 1; control.setCover(null); }); }), COVER_WAIT);
}
/** The ring's sheets as one drawing, at rest. */
function coverSvg(): string {
  const cs = getComputedStyle(document.documentElement);
  const vars = ['--gold', '--pale', '--ink'].map((k) => `${k}:${cs.getPropertyValue(k).trim() || 'initial'}`).join(';');
  const css = [...document.querySelectorAll('style')].map((n) => n.textContent || '').join('\n').replace(/url\(\.\/fonts\/jost\.woff2\)/g, coverFont ? `url(${coverFont})` : 'local("Jost")');
  const sheet = (id: string, drop: string[]) => {
    const svg = document.getElementById(id);
    if (!svg) return '';
    const c = svg.cloneNode(true) as Element;
    for (const q of drop) for (const n of c.querySelectorAll(q)) n.remove();
    if (COVER_REDUCED) { for (const n of c.querySelectorAll('[filter]')) n.removeAttribute('filter'); for (const n of c.querySelectorAll('path.dot')) n.remove(); }
    return c.innerHTML;
  };
  // the page's face is set on its body, which a drawing on its own has not got
  const face = getComputedStyle(document.body);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000"><style>:root{${vars}}${css}svg{font-family:${face.fontFamily};font-weight:${face.fontWeight}}</style>`
    + `<rect width="1000" height="1000" fill="#000"/>`
    + sheet('outer', ['#outerLive'])
    + `<g transform="rotate(${starDeg.toFixed(2)} ${C} ${C})">${sheet('star', ['#starLive', '.lit', '.trace'])}</g>`
    + sheet('inner', ['#corona', '#innerLive', '#seedEdit'])
    + `</svg>`;
}
async function renderCover() {
  if (!coverFont) {
    try {
      const b = await (await fetch('./fonts/jost.woff2')).blob();
      coverFont = await new Promise<string>((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result)); f.onerror = rej; f.readAsDataURL(b); });
    } catch (e) { coverFont = null; }
  }
  const t0 = performance.now();
  const text = coverSvg();
  coverCost.serialise.push(+(performance.now() - t0).toFixed(1));
  coverCost.bytes = text.length;
  const src = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  const out: { src: string; sizes: string; type: string }[] = [];
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    for (const size of [512, 256]) {
      // each square in a task of its own
      await new Promise((res) => setTimeout(res, 0));
      const cv = document.createElement('canvas');
      cv.width = cv.height = size;
      const g = cv.getContext('2d')!;
      const a = performance.now();
      g.fillStyle = '#000';
      g.fillRect(0, 0, size, size);
      g.drawImage(img, 0, 0, size, size);
      coverCost.raster.push(+(performance.now() - a).toFixed(1));
      const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, 'image/png'));
      if (!blob) throw new Error('no cover');
      out.push({ src: URL.createObjectURL(blob), sizes: `${size}x${size}`, type: 'image/png' });
    }
  } finally {
    URL.revokeObjectURL(src);
  }
  const old = coverUrls;
  coverUrls = out.map((o) => o.src);
  control.setCover(out);
  for (const u of old) URL.revokeObjectURL(u);
  coverCost.renders += 1;
}

/** The viewport changed: the stage, and then the panel over it (K14b). */
function viewportChanged() {
  fitViewport();
  // the ring's square follows the variables on the next layout; read it there
  requestAnimationFrame(layPanel);
}
fitViewport();
window.addEventListener('resize', viewportChanged);
window.addEventListener('orientationchange', viewportChanged);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', viewportChanged);
  window.visualViewport.addEventListener('scroll', viewportChanged);
}
if (panelEl && typeof ResizeObserver === 'function') new ResizeObserver(() => layPanel()).observe(panelEl);

// ==========================================================================
buildRim();
buildLive();
sizeControls(false);
// The one place a readout crosses into the ring: `Readout` above is this file's
// own account of what it reads off the transport, so it is named here rather
// than asserted again at every field.
const first = control.readout() as Readout;
if (first.playing) started = true;
// and a link the page would not play in full is said once to a screen reader,
// in the whole sentence the ring's one line is short for
if (control.linkProblems.length) announce(control.linkProblems.map((p) => p.long).join('. '));
// **A held ring is a link** (`notes/archive/2026-09-plans/cited/PLAN-BIRDS-UX.md` §4), so a link is where the ring
// reads one back: a bird the address bar names away from the house is a bird a
// hand was holding when the link was made, and a bird it does not name is at
// the house and is not held. Nothing else is consulted — a spell rolled inside
// a recipe is the set's and not a hand's, and a page that carries one opens
// with eight readings, exactly as it always has.
controls = cellsControl(first.strategy);
// Read whatever engine the page opens under: under the record they are not
// drawn and not touchable, but they are still what the link says, so a flip to
// an engine that reads them finds the ring the link is — and a pull after that
// flip writes the whole spell back and not only the bird it moved.
handSpell = !!linkHere().spell;
ringAsked = (linkHere().spell || null) as Partial<Spell> | null;
takeRoll(first);
if (first.spell && handSpell) {
  for (const b of BIRDS) {
    const v = (first.spell as Partial<Spell>)[b];
    if (typeof v === 'number' && v !== HOUSE[b]) heldValue.set(b, pulled(v));
  }
}
// The colour the set was cast under, put on before anything is drawn in it: at
// the house this writes nothing at all, and with a spell it saves the ring a
// frame of gold before the tint arrives.
runColour(first, true);
redrawAll(first);
lastChange = first.change.n;
last = first;
control.subscribe(onReadout);
// the ledger's lines the transport has and does not say, written from now on
// whether the view is ever opened or not
startScribe(control);

/**
 * **The words' boxes are measured in the face they are drawn in** (R126). A
 * cell measures its words once, at build, and the build runs as the module
 * does — which on a cold visit can be before the page's own face has arrived,
 * so the clear space the words were placed by was the fallback's. When the
 * fonts finish loading the boxes are measured again, at the same widest title,
 * and the words placed round the new ones; with the face already there this
 * measures what it measured and moves nothing.
 */
function remeasureWords() {
  seedBoxFor = null;
  if (!cellNodes.length) return;
  let moved = false;
  for (const c of cellNodes) {
    const said = c.title.textContent;
    c.title.textContent = COARSE ? `${RIM_PERCENT}%` : `${BIRD[c.id].name} ${RIM_PERCENT}%`;
    let bb: DOMRect;
    try { bb = c.gt.getBBox(); } catch (e) { bb = c.bb; }
    c.title.textContent = said;
    if (bb.width !== c.bb.width || bb.height !== c.bb.height || bb.x !== c.bb.x || bb.y !== c.bb.y) { c.bb = bb; moved = true; }
  }
  if (moved) placeWords(starDeg);
}
if (typeof document !== 'undefined' && document.fonts) {
  if (document.fonts.status !== 'loaded') document.fonts.ready.then(remeasureWords).catch(() => {});
  document.fonts.addEventListener('loadingdone', remeasureWords);
}
reducedMotion.watch(reducedChanged);
coarsePointer.watch(coarseChanged);
resetCastState();
startCast('short', null);
requestAnimationFrame(frame);

// The engineer's face, for ?view=machine only — the same chunk the panel mark
// fetches, asked for after the ring has drawn itself once so the sigil that
// moves into the panel is a ring that is already up. A link and not a key: a
// query string is how every other state of this page is shared.
if (linkHere().view === 'machine') {
  openMachine();
}

/**
 * The ring's own handle, which the page hangs on `window.ring`. The headless
 * checks drive the face through it and nothing on the
 * page calls a line of it: every member is a way in to something the sigil
 * already does — a cast, the pointer, the colour, holding still for a picture —
 * and never a second path through any of it. The returns that belong to the
 * transport are named off the transport, so this cannot drift from what it
 * hands back.
 */
export interface RingHandle {
  control: ReturnType<typeof createControl>;
  /** the error reports' switch as this browser has it, and whether a client runs (K25) */
  reports(): { wanted: boolean; running: boolean };
  nudge: (amount?: number) => void;
  newMix: () => ReturnType<typeof newMix>;
  cast: (kind?: string) => void;
  reset: () => ReturnType<typeof resetAll>;
  /** which cell the pointer is on, or nothing at all */
  point(i: number | null): void;
  /** the ink the ring is wearing, with its gradient flattened to four hexes */
  colour: () => Omit<RingColour, 'stops'> & { stops: string[] };
  wear(spell: Partial<Spell> | null, step?: boolean): string;
  toned: (e: number) => void;
  /**
   * The eight, as controls: where each one stands, what it is holding and
   * whether its promise has landed. A reading of the cells and never a second
   * copy of them — every number here is the one the cell is drawn from.
   */
  cells(): {
    id: CellId; bird: Bird; name: string; value: number; house: number;
    /** the whole percent of the house the title line prints */
    percent: number;
    held: boolean; pulling: boolean; pending: boolean;
    radius: number; rest: number; controls: boolean; implied: string;
    /** the reading printed under the bird, its word and the line under it; whether it is cross-fading; whether the wait's fill is drawn (round K11) */
    reading: string; fading: boolean; filled: boolean;
    /** the big word and the subtitle alone, as printed (round K13) */
    word: string; sub: string;
    /** whether its reading is another bird's move's consequence, not the set's (round K11b) */
    consequent: boolean;
    /** the wait's fill: whether it is running and how far (round K12c) */
    fill: { on: boolean; p: number };
    /** the hover and in-action halo and the ornament: how lit, as drawn, and the ornament's width on the screen and radius in units (round K12) */
    marks: { halo: number; orn: number; wide: number; crisp: number; wideW: number; crispW: number; ornPx: number; ornR: number };
    /** how far off its spoke it stands, in ring units; how far it is lifted, 0..1; the size it is drawn at */
    side: number; lift: number; size: number;
    /** where its words stand, upright in ring units, the bird they stand off, the side and what the spot cost */
    words: { box: Box; bird: { x: number; y: number; r: number }; side: number; cost: number; below: number } | null;
  }[];
  /**
   * The lines between birds the ring draws besides the frame's (round K13):
   * every pair joined by function or by the frame, its line, whether the model
   * declares it, whether it is drawn dotted, and how lit it is.
   */
  links(): { a: number; b: number; kind: 'square' | 'octagon' | 'dotted'; declared: boolean; dotted: boolean; lit: number; traced: number; traceOp: number; into: string[]; dotPx: number; dotOp: number }[];
  /** A pull, by hand: the same two calls a finger makes, in one. */
  radiusAt(i: number, v: number): number;
  pull(i: number, v: number): void;
  /** and letting one go, or all of them */
  release(i: number | null): void;
  /** the bird the hit test would pick for a pointer at this place on the screen, or nothing */
  pick(clientX: number, clientY: number, touch?: boolean): string | null;
  /** the star's turn in its two parts: the clamped continuous sway and a finger's spin on top */
  turn(): { sway: number; spin: number; star: number };
  still(on?: boolean): void;
  /** the tempo the pulse is drawn at, for a test; null gives it back to the grid */
  pulseAt(bpm: number | null): void;
  /**
   * What reduced motion rests and what it still draws, read off the drawing:
   * the star's turn, the lean, the pulse and the breath, the flash, the cast's
   * layer — and the beat dot and the cursor, which are state.
   */
  motion(): {
    reduced: boolean; star: number; tilt: string; pulseR: string | null; breathR: string | null;
    breathOp: string | null; flash: number; inner: string; castRing: string | null; coronaReach: number; cover: { renders: number; serialise: number[]; raster: number[]; bytes: number; failed: number; shown: string[]; hex: string | null }; beat: number; cursor: string | null;
  };
  /** the plan a held bird's promise was read off, and the theme it is about */
  impliedPlan(i: number): { plan: unknown; about: number } | null;
  /** a bird's words' box as the placer keeps it, and as the words measure now */
  wordBox(i: number): { kept: { w: number; h: number }; now: { w: number; h: number } } | null;
  /** the coming theme's lanes as drawn: whether they are the coming plan's own, and how much is drawn */
  nextDrawn(): { own: boolean; marks: number; shown: number; sig: number };
  cross: () => void;
  skip: () => ReturnType<typeof control.skip>;
  back: () => ReturnType<typeof control.back>;
  prepareNext: (seed?: number | null) => ReturnType<typeof control.prepareNext>;
  setTransition(p: number): void;
  /** hold the cast at one point of its run, or let it go */
  freezeCast(p: number | null): void;
  timings(): {
    frames: number; meanMs: number; medianMs: number;
    p95Ms: number; maxMs: number; fps: number; over20ms: number;
  } | null;
  resetTimings(): void;
  /** what the word placer has cost since the last reset: calls, milliseconds, birds asked afresh and birds kept cheaply */
  placer(): { calls: number; ms: number; full: number; kept: number };
  resetPlacer(): void;
  /** the die's candidates planned ahead: for which set, how many of how many, and whether a tap has taken them */
  tapPrepared(): { key: string; seeds: number; done: number; spent: boolean; now: string } | null;
  /**
   * The flip and what is behind it, for the checks and the headless export.
   * `open` and `toggle` answer a promise because the first one fetches the
   * chunk; `snapshot` is the value the view is drawing, which is how a
   * scenario asks what is on the screen without reading the screen.
   */
  machine: {
    open(): Promise<unknown>;
    close(): void;
    toggle(): Promise<unknown>;
    readonly on: boolean;
    snapshot(): unknown;
    svg(): string;
    facts(): unknown;
  };
}

window.ring = {
  control,
  reports: () => ({ wanted: reportsWanted(), running: reportsRunning() }),
  nudge,
  newMix,
  cast: (kind = 'full') => startCast(kind, () => redrawAll(control.readout() as Readout)),
  reset: resetAll,
  // The bench's hook on the pointer: which cell it is on, which is what the
  // tell answers.
  point(i: number | null) {
    pointed = i == null ? -1 : clamp(Math.round(Number(i)), 0, cellNodes.length - 1);
    if (pointed >= 0) showTell(cellNodes[pointed]);
  },
  // The colour, asked for by hand: the bench's way into the one path a held
  // bird will take when a cell becomes a control.
  colour: () => ({ ...colour, stops: colour.stops.map((x) => x.hex) }),
  wear(spell: Partial<Spell> | null, step = true) {
    const next = ringColour(spell);
    if (step) { wearColour(next); return next.hex; }
    asked = next;
    askedTone.clear();
    return next.hex;
  },
  toned: (e: number) => paintToned(clamp(Number(e), 0, 1)),
  cells: () => cellNodes.map((c, i) => ({
    id: c.id,
    bird: c.bird,
    name: BIRD[c.id].name,
    value: c.value,
    house: HOUSE[c.bird],
    percent: percentShown(c.bird, c.value),
    held: c.held,
    pulling: c.pulling,
    pending: c.held && !!last && !birdLanded(c.bird, last.spell),
    radius: +(cellR[i] / R_STAR).toFixed(4),
    rest: +(starR / R_STAR).toFixed(4),
    ctrl: ctrlR,
    birdR,
    controls,
    implied: c.implied ? `${c.implied.word} ${c.implied.sub}`.trim() : '',
    reading: `${c.word.textContent} ${c.sub.textContent}`.trim(),
    word: c.word.textContent || '', sub: c.sub.textContent || '',
    fading: !!c.linesOut,
    consequent: c.consequent,
    fill: { on: c.fillFrom >= 0, p: +c.fillP.toFixed(4) },
    marks: { halo: +c.markAt.toFixed(3), orn: +c.ornAt.toFixed(3), wide: +(c.markWide.getAttribute('opacity') || 0), crisp: +(c.markCrisp.getAttribute('opacity') || 0),
      wideW: +(c.markWide.getAttribute('stroke-width') || 0), crispW: +(c.markCrisp.getAttribute('stroke-width') || 0), ornPx: +(ornW() * unitPx).toFixed(2), ornR: +ornR().toFixed(2) },
    filled: !!c.pendFill.getAttribute('d'),
    side: +cellSide[i].toFixed(3),
    lift: +cellLift[i].toFixed(3),
    size: +drawnSize(i).toFixed(4),
    words: wordReading(i),
    active: pointed === i || panelCell === c,
  })),
  links: () => linkLines.map((l) => ({ a: l.a, b: l.b, kind: l.kind, declared: l.declared, dotted: !!l.dot, lit: +l.lit.toFixed(3),
    traced: +l.traced.toFixed(3), traceOp: Number(l.trace.getAttribute('opacity')), into: [l.aToB ? `${l.a}>${l.b}` : '', l.bToA ? `${l.b}>${l.a}` : ''].filter(Boolean),
    dotPx: l.dot ? +(Number(l.dot.getAttribute('stroke-width')) * unitPx).toFixed(2) : 0, dotOp: l.dot ? Number(l.dot.getAttribute('opacity')) : 0 })),
  /** The radius, in the ring's units, a bird is drawn at for a value on this square. */
  radiusAt: (i: number, v: number) => {
    const c = cellNodes[clamp(Math.round(Number(i)), 0, cellNodes.length - 1)];
    return c ? radiusFor(c.bird, clamp(Number(v), 0, 1)) : 0;
  },
  pull(i: number, v: number) {
    const c = cellNodes[clamp(Math.round(Number(i)), 0, cellNodes.length - 1)];
    if (!c || !controls) return;
    setPull(c, clamp(Number(v), 0, 1), last);
    endPull(c, last);
  },
  release(i: number | null) {
    if (i == null) { releaseAll(last); return; }
    const c = cellNodes[clamp(Math.round(Number(i)), 0, cellNodes.length - 1)];
    if (c) releaseCell(c, last);
  },
  pick(clientX: number, clientY: number, touch = false) {
    const hit = hitAt({ clientX, clientY, pointerType: touch ? 'touch' : 'mouse' } as PointerEvent);
    return hit.kind === 'cell' ? BIRD[hit.cell.id].name : null;
  },
  turn: () => ({ sway: swayDeg, spin: +spinAngle.toFixed(3), star: starDeg }),
  pulseAt(bpm: number | null) { pulseBpmAsked = bpm; pulseRestKey = ''; },
  still(on = true) {
    if (!on) { if (frozen) { frozen = false; requestAnimationFrame(frame); } return; }
    snapStill();
    frozen = false;
    frame(performance.now());          // one pass over the snapped values
    frame(performance.now() + 16);     // and its other half, on a coarse pointer
    frozen = true;
  },
  motion: () => ({
    reduced: REDUCED,
    star: starDeg,
    tilt: tiltEl.style.transform,
    pulseR: pulseRing2 ? pulseRing2.getAttribute('r') : null,
    breathR: breathDisc ? breathDisc.getAttribute('r') : null,
    breathOp: breathDisc ? breathDisc.getAttribute('opacity') : null,
    flash: haloFlash.reduce((m, f) => Math.max(m, Number(f.getAttribute('opacity')) || 0), 0),
    inner: innerSvg.style.transform,
    castRing: castRing ? castRing.getAttribute('opacity') : null,
    coronaReach: +(PULSE_FAST.trace * CORONA_REACH_SLOW * PULSE_SLOW.trace / PULSE_FAST.trace).toFixed(2),
    cover: { ...coverCost, shown: control.coverShown(), hex: coverFor ? coverFor.hex : null },
    beat: lastBeatDrawn,
    cursor: cursorG.getAttribute('transform'),
  }),
  impliedPlan(i: number) {
    const c = cellNodes[clamp(Math.round(Number(i)), 0, cellNodes.length - 1)];
    return c && c.impliedR ? { plan: c.impliedR.track, about: c.impliedTheme } : null;
  },
  wordBox(i: number) {
    const c = cellNodes[clamp(Math.round(Number(i)), 0, cellNodes.length - 1)];
    if (!c) return null;
    const said = c.title.textContent;
    c.title.textContent = COARSE ? `${RIM_PERCENT}%` : `${BIRD[c.id].name} ${RIM_PERCENT}%`;
    const now = c.gt.getBBox();
    c.title.textContent = said;
    return { kept: { w: c.bb.width, h: c.bb.height }, now: { w: now.width, h: now.height } };
  },
  nextDrawn: () => ({
    own: !!last && !!last.mix.next && nextDrawnFor === last.mix.next.lanes,
    marks: nextLaneG ? nextLaneG.querySelectorAll('*').length : 0,
    shown: nextLaneG ? Number(nextLaneG.getAttribute('opacity')) || 0 : 0,
    // a digest of what is drawn, so two plans' lanes can be told apart
    sig: nextLaneG ? [...nextLaneG.innerHTML].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7) : 0,
  }),
  cross: () => { control.prepareNext(); startCross(); },
  skip: () => control.skip(),
  back: () => control.back(),
  prepareNext: (seed?: number | null) => control.prepareNext(seed),
  setTransition(p: number) { transition = clamp(Number(p) || 0, 0, 1); if (last) paintNext(last); },
  freezeCast(p: number | null) {
    if (p == null) { castFreeze = null; cast.t0 = -1; resetCastState(); return; }
    if (castFreeze == null) {
      cast.kind = 'full';
      cast.dur = 1550;
      cast.collapse = 0.17;
      cast.swapped = false;
      cast.pending = () => redrawAll(control.readout() as Readout);
      cast.t0 = performance.now();
    }
    castFreeze = clamp(Number(p), 0, 0.999);
  },
  timings() {
    const n = dCount;
    if (!n) return null;
    const a = Array.from(deltas.slice(0, n)).sort((x, y) => x - y);
    const sum = a.reduce((s, v) => s + v, 0);
    return {
      frames: n,
      meanMs: +(sum / n).toFixed(2),
      medianMs: +a[Math.floor(n / 2)].toFixed(2),
      p95Ms: +a[Math.floor(n * 0.95)].toFixed(2),
      maxMs: +a[n - 1].toFixed(2),
      fps: +(1000 / (sum / n)).toFixed(1),
      over20ms: a.filter((v) => v > 20).length,
    };
  },
  resetTimings() { dIdx = 0; dCount = 0; lastFrame = 0; },
  placer: () => ({ ...placer, ms: +placer.ms.toFixed(3) }),
  tapPrepared: () => (tapPrep ? { key: tapPrep.key, seeds: tapPrep.seeds.length, done: tapPrep.done, spent: tapPrep.spent, now: tapKey() } : null),
  resetPlacer() { placer.calls = 0; placer.ms = 0; placer.full = 0; placer.kept = 0; },
  machine: {
    open: () => openMachine(),
    close: closeMachine,
    toggle: () => toggleMachine(),
    get on() { return !!machine; },
    snapshot: () => (machine ? machine.snapshot() : null),
    svg: () => (machine ? machine.svg() : ''),
    facts: () => (machine ? machine.store.facts() : null),
  },
} satisfies RingHandle;

// --- the app's own name ----------------------------------------------------
//
// **The top of the page is the app's name and nothing else** (Eugene, 09-20).
// Step 1c put a `v1 | v2` toggle there under the dev flag, before the machine
// view had its own switch; the view's selector is the one switch now, so two
// controls for one value was one too many and the toggle is gone. What a bare
// link plays is not a build's business either: it is `DEFAULT_VER` in
// `src/link-table.ts`, house-v2, in every build — the dev server, the preview
// and the published page alike.
//
// What stands there instead is the name, and it is **not** under a flag: it
// ships. It is the page's own `<h1>` made visible rather than a second mark
// beside a hidden one — the heading a search engine reads and the name a
// listener sees are one element — set as a **title**: the family's heaviest
// weight, sized off `vmin` the way the ring is, on one line, and **white**,
// which is `text.tell`'s own ink and the one on this page that reads the same
// whatever the derived colour does. Everything gold on this ring is a value
// and the gold walks with the spell; the name of the thing is not a value.
// Top-left on a desktop, centred at the top on a phone, out of the way under
// the engineer's face. `src/index.html` is where it is, because it is the
// page's heading and not something the ring draws.

// What the last cast did, for the bench: the seed it landed on and, for a tap
// on the die, the pool it drew and the one it picked. Reading it casts
// nothing; only `throw` and `tap` do.
if (window.deepHouse) {
  window.deepHouse.cast = {
    get last() { return lastCast; },
    weights: WEIGHTS,
    // how far a drag has to go before its release casts
    threshold: { deg: SPIN_CAST_DEG, px: SPIN_CAST_PX },
    // score a tap's pool and pick from it without touching the set
    look(dir = 0) {
      const pool = castPoolHere(dir, throwStream(0, 0, performance.now()));
      const bare = (c: Candidate | null) => (c ? { seed: c.seed, distance: c.distance, differs: c.differs, parts: c.parts } : null);
      return { band: TAP_BAND, pick: bare(pickCast(pool, TAP_BAND, FLOOR.fresh)), pool: pool.map(bare) };
    },
    // a throw, cast for real: a plain random seed
    throw(spun = SPIN_CAST_DEG, vel = 0) { return castPlain(spun, vel); },
    // and a tap on the die
    tap() { return newMix(); },
    distanceTo(seed: string | number) {
      return styleDistance(last && (last.track as unknown as PlannedTheme), candidatePlan(String(seed)));
    },
  };
}
