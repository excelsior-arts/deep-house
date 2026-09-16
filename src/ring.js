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
// Everything it knows comes from control.js; nothing here touches audio.

// The ?v stamp travels with index.html's, so one bump refreshes the whole
// module graph and no tab can keep an old ring alive.
import { createControl, LANES } from './control.js';
import { installDebug } from './debug.js';
// Planning a theme is arithmetic and no audio, so the ring can plan a dozen
// candidate seeds inside one frame and cast onto the one it wants.
import { planTheme } from './mix.js';
import { styleDistance, FLOOR, WEIGHTS } from './style.js';

const NS = 'http://www.w3.org/2000/svg';
const C = 500;
const TAU = Math.PI * 2;

// --- radii, outward -------------------------------------------------------
const R_CORE_IN = 137;
const R_CORE = 150;
const R_PROG = 150;      // the chord loop, marked on the centre's own rim
const R_ACT = 150;       // the four actions sit ON the centre circle's stroke
const R_ACT_G = 35;      // the four actions, big enough to read at arm's length
const R_STAR = 316;      // the eight parameter cells
const R_NODE = 20;       // a cell is an engraving now, not a button
const R_WORD = 244;      // each cell's value, printed inside its point
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

const el = (tag, attrs, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
};
const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };
// Write an attribute only when it changes. The two bloomed layers re-run
// their gaussian blur for any write inside them, an unchanged value included:
// on WebKit that was 12 ms a frame for a spin transform that never moved. What
// is not written is not rasterised.
const put = (n, k, v) => {
  const s = String(v);
  const a = n.__a || (n.__a = {});
  if (a[k] === s) return;
  a[k] = s;
  n.setAttribute(k, s);
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ang = (frac) => -Math.PI / 2 + frac * TAU;      // 0 = top, clockwise
const px = (frac, r) => C + Math.cos(ang(frac)) * r;
const py = (frac, r) => C + Math.sin(ang(frac)) * r;
const deg = (frac) => frac * 360;

function arcPath(r, f0, f1, sweep = 1) {
  const a0 = ang(f0);
  const a1 = ang(f1);
  const span = sweep ? f1 - f0 : f0 - f1;
  const large = ((span % 1) + 1) % 1 > 0.5 ? 1 : 0;
  return `M${(C + Math.cos(a0) * r).toFixed(2)} ${(C + Math.sin(a0) * r).toFixed(2)}` +
    `A${r} ${r} 0 ${large} ${sweep} ${(C + Math.cos(a1) * r).toFixed(2)} ${(C + Math.sin(a1) * r).toFixed(2)}`;
}

// An arc in a glyph's own coordinates, centred on the glyph's origin.
function arcAt(r, f0, f1) {
  const a0 = -Math.PI / 2 + f0 * TAU;
  const a1 = -Math.PI / 2 + f1 * TAU;
  const large = f1 - f0 > 0.5 ? 1 : 0;
  return `M${(Math.cos(a0) * r).toFixed(2)} ${(Math.sin(a0) * r).toFixed(2)}` +
    `A${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} 1 ${(Math.cos(a1) * r).toFixed(2)} ${(Math.sin(a1) * r).toFixed(2)}`;
}

// A quadrilateral with its corners rounded: each corner is cut back along both
// of its own edges and the corner itself becomes the control point of the
// curve that replaces it, so a face seen at a slant rounds the way a square
// one does. The die is built out of these.
function roundQuad(pts, r) {
  const n = pts.length;
  const back = (p, q) => {
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const len = Math.hypot(dx, dy) || 1;
    const t = Math.min(r, len / 2) / len;
    return [p[0] + dx * t, p[1] + dy * t];
  };
  const f = (p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
  let d = '';
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    d += `${i ? ' L' : 'M'}${f(back(p, pts[(i + n - 1) % n]))} Q${f(p)} ${f(back(p, pts[(i + 1) % n]))}`;
  }
  return `${d} Z`;
}

// A full circle drawn as a path, starting at the top and running clockwise —
// so bar 0 is at twelve o'clock and a dash pattern maps straight onto bars.
function circlePath(r) {
  return `M${C} ${C - r}A${r} ${r} 0 1 1 ${C} ${C + r}A${r} ${r} 0 1 1 ${C} ${C - r}`;
}

// An annular wedge: used once, for the shadow over the part already played.
function wedge(r0, r1, f0, f1) {
  const large = f1 - f0 > 0.5 ? 1 : 0;
  return `M${px(f0, r1).toFixed(1)} ${py(f0, r1).toFixed(1)}` +
    `A${r1} ${r1} 0 ${large} 1 ${px(f1, r1).toFixed(1)} ${py(f1, r1).toFixed(1)}` +
    `L${px(f1, r0).toFixed(1)} ${py(f1, r0).toFixed(1)}` +
    `A${r0} ${r0} 0 ${large} 0 ${px(f0, r0).toFixed(1)} ${py(f0, r0).toFixed(1)}Z`;
}

function txt(parent, s, x, y, size, o = {}) {
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

const ROMAN = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'];
const roman = (n) => ROMAN[n] || String(n);
const fmt = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

// --- the dice, as masks ---------------------------------------------------
function maskBits(m) {
  if (Array.isArray(m)) return m.slice(0, 16).map((v) => (v ? 1 : 0));
  if (typeof m === 'string') return m.slice(0, 16).split('').map((ch) => (ch === 'x' || ch === 'X' || ch === '1' ? 1 : 0));
  if (typeof m === 'number') { const o = []; for (let i = 0; i < 16; i++) o.push((m >> i) & 1); return o; }
  return new Array(16).fill(0);
}
function maskSig(m) {
  const b = maskBits(m);
  let out = '';
  for (let i = 0; i < 16; i += 4) out += ((b[i] << 3) | (b[i + 1] << 2) | (b[i + 2] << 1) | b[i + 3]).toString(16);
  return out;
}
const maskCount = (m) => maskBits(m).reduce((a, b) => a + b, 0);

// What a sixteen-step figure sounds like, said in a word. The offbeat eighths
// are steps 2, 6, 10 and 14; anything on an even step is on the eighth grid.
function hatCharacter(mask) {
  const b = maskBits(mask);
  const steps = [];
  for (let i = 0; i < 16; i++) if (b[i]) steps.push(i);
  if (!steps.length) return 'silent';
  if (steps.length <= 3) return 'sparse';
  if (steps.every((x) => x === 2 || x === 6 || x === 10 || x === 14)) return 'offbeat';
  if (steps.every((x) => x % 2 === 0)) return 'eighths';
  if (steps.length >= 10) return 'sixteenths';
  return 'broken';
}

// How the bass line moves: one note a bar is held, a few is walking, more is
// a pulse.
function bassMotion(mask) {
  const n = maskCount(mask);
  if (n <= 1) return 'held';
  if (n <= 3) return 'walking';
  return 'pulsing';
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// --- cell glyphs ----------------------------------------------------------
// Every glyph is a picture of its own value, not an ornament: the preset glyph
// changes with the preset, the mask glyphs are the mask, the key glyph is the
// scale, the bpm glyph is the beat division.
const GLYPH = {
  // --- the two figures, in one cell -------------------------------------
  // Outer ring: the sixteen steps of the bar, the ones the hats strike long
  // and bright, the rests short and faint. Inner ring: where the bass changes
  // note, with the held note drawn as an arc running to the next change.
  figures(g, R, hat, bass) {
    const hb = maskBits(hat);
    const rMid = R * 0.72;
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + (i / 16) * TAU;
      const on = hb[i];
      const r0 = on ? R * 0.58 : R * 0.68;
      const r1 = on ? R * 0.86 : R * 0.77;
      el('path', {
        class: 'ln', 'stroke-width': on ? 1.5 : 1,
        opacity: on ? 0.95 : 0.22,
        d: `M${(Math.cos(a) * r0).toFixed(2)} ${(Math.sin(a) * r0).toFixed(2)} L${(Math.cos(a) * r1).toFixed(2)} ${(Math.sin(a) * r1).toFixed(2)}`,
      }, g);
    }
    const bb = maskBits(bass);
    const steps = [];
    for (let i = 0; i < 16; i++) if (bb[i]) steps.push(i);
    const rIn = R * 0.4;
    if (!steps.length) {
      el('circle', { class: 'ln hair', cx: 0, cy: 0, r: rIn, opacity: 0.3 }, g);
      return;
    }
    steps.forEach((st, k) => {
      const f = st / 16;
      const nxt = k + 1 < steps.length ? steps[k + 1] : steps[0] + 16;
      // the note held from this change to the next
      if (nxt - st > 0.5) {
        el('path', {
          class: 'ln', 'stroke-width': 1.3, opacity: 0.5,
          d: arcAt(rIn, f + 0.012, nxt / 16 - 0.012),
        }, g);
      }
      // the change itself
      const a = -Math.PI / 2 + f * TAU;
      el('path', {
        class: 'ln', 'stroke-width': 1.6, opacity: 0.95,
        d: `M${(Math.cos(a) * (rIn - R * 0.13)).toFixed(2)} ${(Math.sin(a) * (rIn - R * 0.13)).toFixed(2)} L${(Math.cos(a) * (rIn + R * 0.13)).toFixed(2)} ${(Math.sin(a) * (rIn + R * 0.13)).toFixed(2)}`,
      }, g);
    });
  },

  // --- the key: the chromatic circle, tonic at the top -------------------
  // Twelve marks; the ones in the scale are lit, so minor and dorian differ by
  // which mark burns. The loop's chord roots stand outside as short strokes.
  key(g, R, track, chords) {
    const scale = (track && track.key && track.key.scale) || [0, 2, 3, 5, 7, 8, 10];
    const rootPc = track && track.key ? track.key.root : 0;
    const inScale = new Set(scale.map((v) => ((v % 12) + 12) % 12));
    const r = R * 0.6;
    for (let i = 0; i < 12; i++) {
      const a = -Math.PI / 2 + (i / 12) * TAU;
      const on = inScale.has(i);
      el('circle', {
        cx: (Math.cos(a) * r).toFixed(2), cy: (Math.sin(a) * r).toFixed(2),
        r: i === 0 ? 2.8 : on ? 1.8 : 0.8,
        fill: 'url(#gold)', opacity: i === 0 ? 1 : on ? 0.9 : 0.2,
      }, g);
    }
    for (const pc of chords || []) {
      const i = (((pc - rootPc) % 12) + 12) % 12;
      const a = -Math.PI / 2 + (i / 12) * TAU;
      el('path', {
        class: 'ln', 'stroke-width': 1.3, opacity: 0.75,
        d: `M${(Math.cos(a) * R * 0.74).toFixed(2)} ${(Math.sin(a) * R * 0.74).toFixed(2)} L${(Math.cos(a) * R * 0.92).toFixed(2)} ${(Math.sin(a) * R * 0.92).toFixed(2)}`,
      }, g);
    }
  },

  // --- the tempo: a pendulum, hanging further over the faster it runs -----
  tempo(g, R, bpm) {
    const t = clamp((bpm - 100) / 25, 0, 1);
    const deg = -32 + t * 64;
    const a = (deg * Math.PI) / 180 - Math.PI / 2;
    const pivotY = -R * 0.66;
    const len = R * 1.18;
    const bx = Math.cos(a - Math.PI / 2) * 0 + Math.sin((deg * Math.PI) / 180) * len;
    const by = pivotY + Math.cos((deg * Math.PI) / 180) * len;
    el('path', {
      class: 'ln hair', opacity: 0.4,
      d: `M${(-Math.sin((32 * Math.PI) / 180) * len).toFixed(2)} ${(pivotY + Math.cos((32 * Math.PI) / 180) * len).toFixed(2)}` +
        ` A${len.toFixed(2)} ${len.toFixed(2)} 0 0 1 ${(Math.sin((32 * Math.PI) / 180) * len).toFixed(2)} ${(pivotY + Math.cos((32 * Math.PI) / 180) * len).toFixed(2)}`,
    }, g);
    el('path', { class: 'ln thin', d: `M0 ${pivotY.toFixed(2)} L${bx.toFixed(2)} ${by.toFixed(2)}` }, g);
    el('circle', { cx: bx.toFixed(2), cy: by.toFixed(2), r: 2.6, fill: 'url(#gold)' }, g);
    el('circle', { cx: 0, cy: pivotY.toFixed(2), r: 1.4, fill: 'url(#gold)', opacity: 0.8 }, g);
  },

  // --- the voice the keys speak in, one emblem a family ------------------
  timbre(g, R, which) {
    const k = String(which || '').toLowerCase();
    if (k === 'piano') {
      for (let i = 0; i < 5; i++) {
        const x = (-0.5 + i * 0.25) * R * 1.1;
        el('path', { class: 'ln thin', d: `M${x.toFixed(2)} ${(-R * 0.42).toFixed(2)} L${x.toFixed(2)} ${(R * 0.2).toFixed(2)}` }, g);
      }
      el('path', { class: 'ln thin', d: `M${(-R * 0.62).toFixed(2)} ${(R * 0.2).toFixed(2)} L${(R * 0.62).toFixed(2)} ${(R * 0.2).toFixed(2)}` }, g);
      return;
    }
    if (k === 'strings') {
      for (let i = 0; i < 3; i++) {
        const y = (-0.28 + i * 0.28) * R;
        el('path', { class: 'ln thin', d: `M${(-R * 0.6).toFixed(2)} ${y.toFixed(2)} q${(R * 0.6).toFixed(2)} ${(-R * 0.12).toFixed(2)} ${(R * 1.2).toFixed(2)} 0` }, g);
      }
      el('path', { class: 'ln thin', opacity: 0.8, d: `M${(-R * 0.42).toFixed(2)} ${(R * 0.56).toFixed(2)} L${(R * 0.42).toFixed(2)} ${(-R * 0.56).toFixed(2)}` }, g);
      return;
    }
    if (k === 'rhodes' || k === 'ep' || k === 'electric') {
      el('path', { class: 'ln thin', d: `M${(-R * 0.5).toFixed(2)} ${(-R * 0.34).toFixed(2)} L${(R * 0.34).toFixed(2)} ${(-R * 0.34).toFixed(2)}` }, g);
      el('circle', { cx: (R * 0.48).toFixed(2), cy: (-R * 0.34).toFixed(2), r: 2.6, fill: 'none', stroke: 'url(#gold)', 'stroke-width': 1.5 }, g);
      el('path', { class: 'ln thin', d: `M${(-R * 0.56).toFixed(2)} ${(R * 0.3).toFixed(2)} q${(R * 0.28).toFixed(2)} ${(-R * 0.34).toFixed(2)} ${(R * 0.56).toFixed(2)} 0 q${(R * 0.28).toFixed(2)} ${(R * 0.34).toFixed(2)} ${(R * 0.56).toFixed(2)} 0` }, g);
      return;
    }
    if (k === 'organ') {
      for (let i = 0; i < 3; i++) {
        const x = (-0.34 + i * 0.34) * R;
        const h = R * (0.22 + i * 0.2);
        el('path', { class: 'ln thin', d: `M${x.toFixed(2)} ${(R * 0.5).toFixed(2)} L${x.toFixed(2)} ${(-h).toFixed(2)}` }, g);
      }
      el('path', { class: 'ln hair', opacity: 0.6, d: `M${(-R * 0.52).toFixed(2)} ${(R * 0.5).toFixed(2)} L${(R * 0.52).toFixed(2)} ${(R * 0.5).toFixed(2)}` }, g);
      return;
    }
    if (k === 'pluck') {
      el('path', { class: 'ln thin', d: `M${(-R * 0.6).toFixed(2)} 0 L${(-R * 0.1).toFixed(2)} 0 L${(R * 0.05).toFixed(2)} ${(-R * 0.3).toFixed(2)} L${(R * 0.2).toFixed(2)} 0 L${(R * 0.6).toFixed(2)} 0` }, g);
      return;
    }
    // glass and anything FM: two nested arcs
    for (let i = 1; i <= 2; i++) {
      const r = R * 0.26 * i;
      el('path', { class: 'ln thin', d: `M${(-r * 0.5).toFixed(2)} ${(-r).toFixed(2)} A${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${(-r * 0.5).toFixed(2)} ${r.toFixed(2)}` }, g);
    }
  },

  // --- the effects palette: what the filter does at the seam -------------
  fx(g, R, name) {
    const BEND = { open: 0, deep: 0.18, dry: 0.5, tight: 0.85 };
    const RISER = { open: true, deep: true, dry: false, tight: false };
    const bend = BEND[name] ?? 0.3;
    const w = R * 0.62;
    const h = R * 0.5;
    el('path', {
      class: 'ln thin',
      d: `M${(-w).toFixed(2)} 0 L${(w * 0.05).toFixed(2)} 0 Q${(w * 0.55).toFixed(2)} 0 ${w.toFixed(2)} ${(bend * h).toFixed(2)}`,
    }, g);
    if (RISER[name]) el('circle', { cx: (w * 0.55).toFixed(2), cy: (-h * 0.62).toFixed(2), r: 2.2, fill: 'url(#gold)', opacity: 0.85 }, g);
  },

  // --- how much is going on: one arc to three ---------------------------
  density(g, R, level) {
    const n = clamp(Math.round(level), 1, 3);
    for (let i = 1; i <= n; i++) {
      const r = R * 0.2 * i + R * 0.12;
      el('path', {
        class: 'ln thin', opacity: (1.05 - i * 0.16).toFixed(2),
        d: arcAt(r, 0.075, 0.925),
      }, g);
    }
  },

  // --- how wet the harmonic layer is: ripples from one source -----------
  wet(g, R, level) {
    const n = clamp(Math.round(level), 1, 4);
    el('circle', { cx: (-R * 0.52).toFixed(2), cy: 0, r: 2, fill: 'url(#gold)' }, g);
    for (let i = 1; i <= n; i++) {
      const r = R * 0.22 * i;
      el('path', {
        class: 'ln thin', opacity: (0.95 - i * 0.15).toFixed(2),
        d: `M${(-R * 0.52 + r * 0.42).toFixed(2)} ${(-r).toFixed(2)} A${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${(-R * 0.52 + r * 0.42).toFixed(2)} ${r.toFixed(2)}`,
      }, g);
    }
  },

  // --- a count, said as marks round the cell ----------------------------
  ticks(g, R, n) {
    const count = clamp(Math.round(n), 1, 24);
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (i / count) * TAU;
      el('path', {
        class: 'ln', 'stroke-width': 1.2, opacity: 0.7,
        d: `M${(Math.cos(a) * R * 0.5).toFixed(2)} ${(Math.sin(a) * R * 0.5).toFixed(2)} L${(Math.cos(a) * R * 0.74).toFixed(2)} ${(Math.sin(a) * R * 0.74).toFixed(2)}`,
      }, g);
    }
  },

  // --- roll a new set: two dice, mid-throw ------------------------------
  // A moon is a phase of something that goes round; casting a seed is a
  // throw. Square to the axes it was a box with dots in it, so the pair is
  // turned off them and given the depth it would have in the air, and every
  // corner is rounded like a real die's rather than cut: the far one tumbling
  // corner-on with its one showing and two sides under it, the near one
  // almost face on with its five and a sliver of its top face above it. The
  // near one knocks the far one out where they cross, the way a label does.
  die(g, R) {
    const U = R * 1.12;                       // the pair fills the node the way the chevrons do
    const rr = U * 0.075;                     // a fifth of a face, near enough
    // the tumbling one: the rhombus is its top face, the two quads its sides
    const w = U * 0.27;
    const hT = w * 0.56;
    const d = U * 0.24;
    const bx = -U * 0.15;
    const by = -U * 0.12;
    const T = (x, y) => [bx + x, by + y];
    // the near one: a face turned a few degrees, with its top face on edge
    const hb = U * 0.185;
    const tb = 11 * Math.PI / 180;
    const cb = Math.cos(tb);
    const sb = Math.sin(tb);
    const fx = U * 0.2;
    const fy = U * 0.14;
    const F = (x, y) => [fx + x * cb - y * sb, fy + x * sb + y * cb];
    const lift = (p, dx, dy) => [p[0] + dx, p[1] + dy];
    const sd = U * 0.075;                     // how much of the top face shows
    const sx = -U * 0.035;
    const tl = F(-hb, -hb);
    const tr = F(hb, -hb);
    const pipF = hb * 0.52;
    const shapes = [
      { pts: [T(-w, 0), T(0, hT), T(0, hT + d), T(-w, d)] },
      { pts: [T(0, hT), T(w, 0), T(w, d), T(0, hT + d)] },
      { pts: [T(0, -hT), T(w, 0), T(0, hT), T(-w, 0)], pips: [T(0, 0)], pr: U * 0.05 },
      { pts: [tl, tr, lift(tr, sx, -sd), lift(tl, sx, -sd)], cut: true },
      {
        pts: [tl, tr, F(hb, hb), F(-hb, hb)], cut: true, pr: U * 0.038,
        pips: [F(0, 0), F(-pipF, -pipF), F(pipF, -pipF), F(-pipF, pipF), F(pipF, pipF)],
      },
    ];
    // the pair is centred on the node by the ground it covers, so tuning any
    // of the numbers above cannot leave it leaning
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const s of shapes) for (const p of s.pts) {
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
      y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
    }
    const gg = el('g', {
      transform: `translate(${(-(x0 + x1) / 2).toFixed(2)} ${(-(y0 + y1) / 2).toFixed(2)})`,
    }, g);
    for (const s of shapes) {
      const path = roundQuad(s.pts, rr);
      if (s.cut) el('path', { d: path, fill: '#000000' }, gg);
      el('path', { class: 'ln thin', d: path }, gg);
      for (const p of s.pips || []) {
        el('circle', { cx: p[0].toFixed(2), cy: p[1].toFixed(2), r: s.pr.toFixed(2), fill: 'url(#gold)' }, gg);
      }
    }
  },

  // --- the room the seed rolled ----------------------------------------
  room(g, R, which) {
    const k = String(which || '').toLowerCase();
    const w = R * 0.62;
    if (k === 'growl') {
      el('path', { class: 'ln thin', d: `M${(-w).toFixed(2)} 0 L${(-w * 0.5).toFixed(2)} ${(-R * 0.42).toFixed(2)} L${(-w * 0.1).toFixed(2)} ${(R * 0.38).toFixed(2)} L${(w * 0.3).toFixed(2)} ${(-R * 0.4).toFixed(2)} L${(w * 0.68).toFixed(2)} ${(R * 0.3).toFixed(2)} L${w.toFixed(2)} 0` }, g);
      return;
    }
    // sub: one deep crest under the line
    el('path', { class: 'ln hair', opacity: 0.5, d: `M${(-w).toFixed(2)} 0 L${w.toFixed(2)} 0` }, g);
    el('path', { class: 'ln thin', d: `M${(-w).toFixed(2)} 0 q${(w * 0.5).toFixed(2)} ${(R * 0.72).toFixed(2)} ${w.toFixed(2)} 0` }, g);
  },

  // play, and the same mark as a pause while the mix runs
  play(g, R, playing) {
    if (playing) {
      const h = R * 0.46;
      const x = R * 0.2;
      el('path', { class: 'ln thin', d: `M${-x.toFixed(1)} ${-h.toFixed(1)} L${-x.toFixed(1)} ${h.toFixed(1)} M${x.toFixed(1)} ${-h.toFixed(1)} L${x.toFixed(1)} ${h.toFixed(1)}` }, g);
    } else {
      const h = R * 0.46;
      const w = R * 0.46;
      el('path', { class: 'ln thin', d: `M${(-w * 0.6).toFixed(1)} ${-h.toFixed(1)} L${w.toFixed(1)} 0 L${(-w * 0.6).toFixed(1)} ${h.toFixed(1)} Z` }, g);
    }
  },
  // The theme after this one, and its mirror for the theme before. The pair
  // is built outward from the hair between the two marks, which is where the
  // eye puts a double chevron's centre: laying the first mark down at a fixed
  // offset and stepping the second one along left the pair 1.75 units off the
  // node's middle, and the beat dot that used to sit inside the node made the
  // lean look twice that.
  step(g, R, dir) {
    const h = R * 0.44;
    const w = R * 0.4;
    const gap = w * 0.05;
    let d = '';
    for (let i = 0; i < 2; i++) {
      const x = dir * (i === 0 ? -(w + gap / 2) : gap / 2);   // the mark's back
      d += `M${x.toFixed(2)} ${(-h).toFixed(2)} L${(x + dir * w).toFixed(2)} 0 L${x.toFixed(2)} ${h.toFixed(2)} `;
    }
    el('path', { class: 'ln thin', d }, g);
  },
};

// --- the eight cells ------------------------------------------------------
// One point per die, and one layer per point: the cell lights while the part
// it stands for is playing.
// Nothing on the star is touchable: the preset is locked to auto for the
// release, so every cell is a reading of a die, and the actions live on the
// wheel inside.
const CELLS = [
  { id: 'preset', layer: 'kick' },
  { id: 'key', layer: 'pad' },
  { id: 'bpm', layer: 'clap' },
  { id: 'timbre', layer: 'keys' },
  { id: 'density', layer: 'sixteenths' },
  { id: 'fx', layer: 'hatOpen' },
  { id: 'wet', layer: 'hatClosed' },
  { id: 'figures', layer: 'bass' },
];

// The two new dice arrive as { value, label }; read either shape.
const dieLabel = (d) => (d && typeof d === 'object' ? d.label ?? d.value : d);
const dieValue = (d) => (d && typeof d === 'object' ? d.value : d);
const DENSITY_LEVEL = { minimal: 1, medium: 2, busy: 3 };
const WET_LEVEL = { dry: 1, damp: 2, wet: 3, drowned: 4 };

function cellValue(id, r) {
  const d = r.dice || {};
  switch (id) {
    case 'preset': return { word: r.presetName || r.preset, sub: r.preset };
    case 'key': return { word: String(r.key).replace('minor', 'min').replace('dorian', 'dor'), sub: d.progression || '' };
    case 'bpm': return { word: String(r.bpm), sub: 'bpm' };
    case 'timbre': return { word: d.keysPreset || '', sub: 'keys' };
    // Until the sound engine exposes the density and wetness dice, these two
    // cells carry the theme's length and how many sections it has.
    case 'density': return d.density
      ? { word: dieLabel(d.density), sub: 'density' }
      : { word: String(r.bars), sub: 'bars' };
    case 'fx': return { word: d.fxPalette || '', sub: 'fx' };
    case 'wet': return d.wetness
      ? { word: dieLabel(d.wetness), sub: d.wetnessDb != null ? `${d.wetnessDb} db` : 'wet' }
      : { word: String(r.plan.length), sub: 'sections' };
    // one cell, two figures: what the hats do, and what the bass does
    case 'figures': return {
      word: hatCharacter(d.hatMask),
      sub: plural(maskCount(d.hatMask), 'hit'),
      sub2: `${bassMotion(d.bassMask)} · ${plural(maskCount(d.bassMask), 'move')}`,
    };
    default: return { word: '', sub: '' };
  }
}

function chordRootPcs(r) {
  const chords = (r.track && r.track.progression && r.track.progression.chords) || [];
  const out = [];
  for (const ch of chords) {
    const pc = ch.root != null ? ch.root : (ch.notes && ch.notes.length ? ch.notes[0] : (ch.voicing && ch.voicing.length ? ch.voicing[0] : null));
    if (pc == null) continue;
    const v = ((pc % 12) + 12) % 12;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

function drawCellGlyph(g, id, r, R) {
  const d = r.dice || {};
  switch (id) {
    case 'preset': return GLYPH.room(g, R, r.presetName || r.preset);
    case 'key': return GLYPH.key(g, R, r.track, chordRootPcs(r));
    case 'bpm': return GLYPH.tempo(g, R, r.bpm);
    case 'timbre': return GLYPH.timbre(g, R, d.keysPreset);
    case 'density': return GLYPH.density(g, R, d.density
      ? (DENSITY_LEVEL[dieValue(d.density)] ?? DENSITY_LEVEL[dieLabel(d.density)] ?? 2)
      : clamp(Math.round(r.bars / 96) + 1, 1, 3));
    case 'fx': return GLYPH.fx(g, R, d.fxPalette);
    case 'wet': return d.wetness
      ? GLYPH.wet(g, R, WET_LEVEL[dieValue(d.wetness)] ?? WET_LEVEL[dieLabel(d.wetness)] ?? 2)
      : GLYPH.ticks(g, R, r.plan.length);
    case 'figures': return GLYPH.figures(g, R, d.hatMask, d.bassMask);
    default: return null;
  }
}

// A cell is a reading, so touching it explains the reading rather than
// changing it. Every line comes from the same readout the cell is drawn from.
function tellFor(id, r) {
  const d = r.dice || {};
  switch (id) {
    case 'preset': return `room · ${r.presetName || r.preset}, rolled by the set`;
    case 'key': {
      const ch = String(d.progression || '').split('-').filter(Boolean);
      return `key · ${r.key}${ch.length ? ' · chords ' + ch.join(' and ') : ''}`;
    }
    case 'bpm': return `tempo · ${r.bpm} beats a minute`;
    case 'timbre': {
      const over = d.padTimbre && d.padTimbre !== d.keysPreset ? ` over ${d.padTimbre}` : '';
      return `keys · ${d.keysPreset || 'unknown'}${over}`;
    }
    case 'density': return d.density
      ? `density · ${dieLabel(d.density)}`
      : `this theme · ${r.bars} bars, ${r.durationLabel}`;
    case 'fx': return `effects · ${d.fxPalette || 'unknown'} filter`;
    case 'wet': return d.wetness
      ? `wetness · ${dieLabel(d.wetness)}${d.wetnessDb != null ? `, ${d.wetnessDb} db` : ''}`
      : `plan · ${r.plan.length} sections`;
    case 'figures': return `hats ${hatCharacter(d.hatMask)}, ${plural(maskCount(d.hatMask), 'hit')}` +
      ` · bass ${bassMotion(d.bassMask)}, ${plural(maskCount(d.bassMask), 'move')}`;
    default: return '';
  }
}

// --- the section plan -----------------------------------------------------
const SECTION = {
  intro: { short: 'int', dash: '3 9', op: 0.45 },
  build: { short: 'bld', dash: '9 6', op: 0.72 },
  main: { short: 'grv', dash: null, op: 0.82 },
  breakdown: { short: 'brk', dash: '2 9', op: 0.34 },
  drop: { short: 'drp', dash: null, op: 1 },
  outro: { short: 'out', dash: '14 8', op: 0.5 },
};

// ==========================================================================
const control = createControl();
installDebug(control);

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const tiltEl = $('tilt');
const outerSvg = $('outer');
const innerSvg = $('inner');
const glowSvg = $('glow');
const gRim = $('rim');
const gTimeline = $('timeline');
const gSpin = $('spin');
const gCells = $('starCells');
const gCore = $('core');
const gLive = $('live');
const gOuterLive = $('outerLive');
const gInnerLive = $('innerLive');
const starSvg = $('star');
const gStarLive = $('starLive');
const gStarLines = $('starLines');
const gStarCells = $('starCells');

// The mandala: one turn of the star for one theme, read off the same clock as
// the cursor. 1 = a turn a theme, 0 = still. A system that asks for less
// motion gets none.
//
// The whole star turns as one sheet — geometry and cells together, so the
// lines keep running through the nodes that sit on them. The words ride the
// same sheet on its unfiltered sibling and are each held upright by a rotation
// of their own, which is why nothing inside the bloom is ever written.
const STAR_TURN = 1;
// How far a cell and its vertex wander from their place. 0 is a rigid drawing;
// six gives about twelve units peak to peak, enough that no square is ever
// quite true and the shape keeps changing, and far short of the hundred units
// of clear ground between a cell and anything else.
const STAR_FLEX = 6;
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
let starDeg = -1;
let wordStep = 0;

let last = null;
let lastChange = -1;
let lastBar = -1;
let lastPlanKey = '';
let spinAngle = 0;
let spinVel = 0;          // degrees a second, while the star coasts on a throw
let spinAt = 0;           // when the coast was last stepped
let dragFrac = null;     // where a scrub is holding the cursor, while it lasts
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
let lanePaths = [];
// The coming theme's lanes and its line of text live beside the bloomed rim,
// not inside it: they move every frame through a seam, and a move inside the
// filtered group re-blurred the whole band each time.
let nextLaneG = null;
let nextInfoText = null;

// One lane is drawn as three circles of the same radius, one per loudness
// step, each with a dash pattern that is literally the bars it plays.
function laneDashes(levels, bars, r, want) {
  const per = (TAU * r) / bars;
  const runs = [];
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
function drawLanes(parent, lanes, bars, { rOffset = 0, scale = 1, dim = 1, initials = true, halo = false } = {}) {
  const out = [];
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

function buildTimeline(r) {
  clear(gTimeline);
  // The lanes are drawn once and bloomed once. The part already played is
  // dimmed by a shade in the live layer (setPlayedSplit), not by a clip in
  // here: a clip that moved with the cursor re-blurred the whole rim every
  // half second, which on WebKit was a 125 ms frame each time.
  lanePaths = drawLanes(gTimeline, r.lanes, r.bars, {});
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
  const minuteFracs = [];
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

let nextDrawnFor = null;
function paintNext(r) {
  if (!nextLaneG) return;
  // The coming theme shows through as the seam nears, then crosses over it.
  const approach = r ? (r.mix.approach || 0) * 0.45 : 0;
  const t = Math.max(transition, r ? r.mix.transition : 0, approach);
  const info = r && r.mix.next;
  if (!info || t <= 0.001) {
    put(nextLaneG, 'opacity', 0);
    put(nextInfoText, 'opacity', 0);
    // give the band its own brightness back: a seam that came and went, or a
    // seek away from one, must not leave the lanes dimmed
    put(shadeAll, 'fill-opacity', 0);
    return;
  }
  if (nextDrawnFor !== info.seed) {
    nextDrawnFor = info.seed;
    clear(nextLaneG);
    // the coming theme's lanes, so the next minutes are visible before they play
    drawLanes(nextLaneG, info.lanes, info.bars, { rOffset: -5, scale: 0.42, dim: 1, initials: false, halo: true });
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
  if (nextInfoText.textContent !== label.toUpperCase()) nextInfoText.textContent = label.toUpperCase();
  put(nextInfoText, 'opacity', (0.25 + 0.5 * t).toFixed(3));
}

// ==========================================================================
// the star: it binds the eight cells, and carries the chord loop
let progNodes = [];

// Where a vertex of the star stands at this moment: its place, plus a slow
// wander on two sines an axis, a different pace for every corner.
const FLEX = [];
for (let i = 0; i < 8; i++) {
  FLEX.push({
    px: 5 + ((i * 2.7) % 6), py: 7 + ((i * 1.9) % 4),
    ax: (i * 1.13) % TAU, ay: (i * 2.41) % TAU,
    qx: 9 + ((i * 1.3) % 2), qy: 11 - ((i * 0.9) % 3),
    bx: (i * 0.71) % TAU, by: (i * 1.77) % TAU,
  });
}

function vertexAt(i, t) {
  const f = FLEX[i];
  let x = px(i / 8, R_STAR);
  let y = py(i / 8, R_STAR);
  if (STAR_FLEX && !REDUCED) {
    const A = STAR_FLEX * 0.6;
    x += A * Math.sin((TAU * t) / f.px + f.ax) + A * 0.7 * Math.sin((TAU * t) / f.qx + f.bx);
    y += A * Math.sin((TAU * t) / f.py + f.ay) + A * 0.7 * Math.sin((TAU * t) / f.qy + f.by);
  }
  return [x, y];
}

function starPaths(t) {
  const v = [];
  for (let i = 0; i < 8; i++) { const [x, y] = vertexAt(i, t); v.push(`${x.toFixed(2)} ${y.toFixed(2)}`); }
  return [
    `M${v[0]} L${v[2]} L${v[4]} L${v[6]} Z`,
    `M${v[1]} L${v[3]} L${v[5]} L${v[7]} Z`,
    `M${v[0]} L${v[1]} L${v[2]} L${v[3]} L${v[4]} L${v[5]} L${v[6]} L${v[7]} Z`,
  ];
}

let flexLines = [];

function buildSpin(r) {
  clear(gSpin);
  clear(gStarLines);
  progNodes = [];
  // the circle the eight cells sit on: it does not move, so it keeps the bloom
  el('path', { class: 'ln hair', d: circlePath(R_STAR), opacity: 0.6 }, gSpin);

  // The two squares bind opposite cells and the octagon is the order the dice
  // are rolled in. They breathe, so each is drawn twice: a wide faint stroke
  // standing in for the bloom, and the line itself over it.
  flexLines = [];
  const style = [
    { w: 1.6, op: 0.75, hw: 5.5, hop: 0.1 },
    { w: 1.6, op: 0.75, hw: 5.5, hop: 0.1 },
    { w: 1.1, op: 0.4, hw: 4.5, hop: 0.06 },
  ];
  const ds = starPaths(0);
  ds.forEach((d, i) => {
    const st = style[i];
    const wide = el('path', { d, fill: 'none', stroke: '#f2c14e', 'stroke-width': st.hw, opacity: st.hop, 'stroke-linejoin': 'round' }, gStarLines);
    const crisp = el('path', { class: 'ln', d, 'stroke-width': st.w, opacity: st.op }, gStarLines);
    flexLines.push({ wide, crisp, put: d });
  });
}

// The lines are rewritten at half rate at most: the wander is slow, and this
// is the only path data that moves at all.
let flexAt = 0;

function flexStar(now) {
  if (!STAR_FLEX || REDUCED || !flexLines.length) return;
  if (now - flexAt < 33) return;
  flexAt = now;
  const t = now / 1000;
  const ds = starPaths(t);
  for (let i = 0; i < flexLines.length; i++) {
    const L = flexLines[i];
    if (L.put === ds[i]) continue;
    L.put = ds[i];
    L.wide.setAttribute('d', ds[i]);
    L.crisp.setAttribute('d', ds[i]);
  }
  // the cells go where their vertices went, and their lights with them
  for (let i = 0; i < cellNodes.length; i++) {
    const c = cellNodes[i];
    const [vx, vy] = vertexAt(i, t);
    c.dx = vx - c.x;
    c.dy = vy - c.y;
    const tr = `translate(${vx.toFixed(2)} ${vy.toFixed(2)})`;
    if (c.putKnot !== tr) { c.knot.setAttribute('transform', tr); c.putKnot = tr; }
    const ht = `translate(${c.dx.toFixed(2)} ${c.dy.toFixed(2)})`;
    if (c.putHalo !== ht) { c.hg.setAttribute('transform', ht); c.putHalo = ht; }
  }
  turnWords(starDeg > 0 ? starDeg : 0, false);
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
const LABEL_UP = C - 95;
const LABEL_DOWN = C + 100;
const LABEL_SIDE_X = 112;
const LABEL_SIDE_Y = C - 22;

const ACTIONS = [
  { id: 'play', f: 0, word: 'play', lx: C, ly: LABEL_UP, la: 'middle' },
  { id: 'skip', f: 0.25, word: 'skip', lx: C + LABEL_SIDE_X, ly: LABEL_SIDE_Y, la: 'end' },
  { id: 'cast', f: 0.5, word: 'cast', lx: C, ly: LABEL_DOWN, la: 'middle' },
  { id: 'back', f: 0.75, word: 'back', lx: C - LABEL_SIDE_X, ly: LABEL_SIDE_Y, la: 'start' },
];

let gActions = null;
let gLabels = null;
const actionNodes = [];
let playGlyphG = null;
let playDrawn = null;

function buildActions(r) {
  if (!gActions) gActions = el('g', { id: 'actions' }, gCore.parentNode);
  // The words sit on the unfiltered sheet with the beat and the big mark: a
  // hover writes their opacity, and a write inside a bloomed group makes
  // WebKit run the blur over the whole layer again.
  if (!gLabels || !gLabels.isConnected) gLabels = el('g', { id: 'actionLabels' }, gInnerLive);
  clear(gActions);
  clear(gLabels);
  actionNodes.length = 0;
  for (const a of ACTIONS) {
    const x = px(a.f, R_ACT);
    const y = py(a.f, R_ACT);
    const g = el('g', {
      'data-action': a.id, transform: `translate(${x} ${y})`,
      role: 'button', tabindex: '0', 'aria-label': a.word,
    }, gActions);
    g.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
      ev.preventDefault();
      ev.stopPropagation();
      runAction(a.id);
    });
    g.addEventListener('focus', () => hoverAction(a.id));
    g.addEventListener('blur', () => hoverAction(null));
    // The node knocks out its own ground first, so the circle's double stroke
    // and any line of the star behind it stop at the node's edge and the glyph
    // sits in clean black — the same idea as a label's halo.
    el('circle', { cx: 0, cy: 0, r: R_ACT_G, fill: '#000000' }, g);
    el('circle', { class: 'ln thin', cx: 0, cy: 0, r: R_ACT_G, fill: 'none' }, g);
    const gl = el('g', {}, g);
    if (a.id === 'play') { playGlyphG = gl; playDrawn = null; }
    else if (a.id === 'skip') GLYPH.step(gl, R_ACT_G, 1);
    else if (a.id === 'back') GLYPH.step(gl, R_ACT_G, -1);
    else GLYPH.die(gl, R_ACT_G);
    // What it does, said only while the finger is on it, and said inside the
    // centre disc where there is room for it: out on the ring the word had to
    // thread the star's chords and the lane band, and the disc has a clear
    // band above the reading and another below it.
    const label = txt(gLabels, a.word, a.lx, a.ly, LABEL_SIZE, { op: 0, ls: 0.26, anchor: a.la });
    label.style.transition = 'opacity 160ms ease';
    actionNodes.push({ ...a, g, glyph: gl, label, x, y });
  }
  setPlayGlyph(r.playing);
  labelPlay(r.playing);
  hoverAction(hoveredAction);
}

function labelPlay(playing) {
  const n = actionNodes.find((a) => a.id === 'play');
  if (n && n.g) put(n.g, 'aria-label', playing ? 'pause' : 'play');
}

function setPlayGlyph(playing) {
  if (!playGlyphG || playDrawn === playing) return;
  playDrawn = playing;
  // the node at twelve is the whole of the transport once the set has run, so
  // what a screen reader is told turns over with the mark
  labelPlay(playing);
  clear(playGlyphG);
  GLYPH.play(playGlyphG, R_ACT_G, playing);
  const n = actionNodes.find((a) => a.id === 'play');
  if (n) n.label.textContent = playing ? 'PAUSE' : 'PLAY';
  paintActionGlow();
}

let hoveredAction = null;

let heldAction = null;
let heldUntil = 0;

// The node that asked for a cut the music has not reached yet. Forward and
// back are a DJ cut, not a jump: the mix starts one on the next bar and blends
// over the bars after it, so a press is four seconds from anything a hand can
// hear. The node keeps its light and its word for the whole of that wait,
// because the only other answer to a press is silence, and a hand that is
// given silence presses again. control.js has been publishing the wait all
// along, as mix.cutting and mix.cutInBars; nothing was reading it.
let cutAsked = null;
let cutTheme = null;
// the wait, drawn: how long it was when it started, and the marks that draw it
let cutTotal = 0;
let gCutFill = null;
let cutWedge = null;
let cutDrawnFor = null;

function askCut(id) {
  cutAsked = id;
  cutTheme = last ? last.mix.themeIndex : null;
  cutTotal = 0;
  hoverAction(id);
}

function cutLanded() {
  if (!cutAsked) return;
  const was = cutAsked;
  cutAsked = null;
  cutTotal = 0;
  if (gCutFill) put(gCutFill, 'opacity', 0);
  hoverAction(hoveredAction === was ? null : hoveredAction);
}

// The node that asked, made ready to fill: a bar sweeping across the disc the
// way the theme is going — out to the right under the forward chevrons, back
// to the left under the others — clipped to the node's own circle, with the
// node's mark drawn again over it. The same stroke laid twice over itself is
// the same stroke, so the copy costs nothing to look at and what lies between
// them is under the chevron rather than washed across it. It is all on the
// unfiltered sheet: the bar is written every frame, and a write inside a
// bloomed group re-runs the blur over the whole layer.
const CUT_R = R_ACT_G - 1.5;
function cutFillFor(id) {
  if (!gCutFill || !gCutFill.isConnected) {
    gCutFill = el('g', { id: 'cutFill', opacity: 0 }, gInnerLive);
    cutDrawnFor = null;
  }
  if (cutDrawnFor === id) return;
  cutDrawnFor = id;
  clear(gCutFill);
  cutWedge = null;
  const a = actionNodes.find((x) => x.id === id);
  if (!a) return;
  const g = el('g', { transform: `translate(${a.x} ${a.y})` }, gCutFill);
  const clip = el('clipPath', { id: 'cutFillClip' }, g);
  el('circle', { cx: 0, cy: 0, r: CUT_R }, clip);
  cutWedge = el('rect', {
    x: -CUT_R, y: -CUT_R, width: 0, height: CUT_R * 2,
    fill: '#f2c14e', opacity: 0.18, 'clip-path': 'url(#cutFillClip)',
  }, g);
  GLYPH.step(g, R_ACT_G, id === 'skip' ? 1 : -1);
}

// The wait itself, read off the set's own clock: control publishes the seconds
// left until the low end changes hands, and the first one of those is the
// whole of it. The wedge closes exactly as the theme turns over, because both
// are the same moment.
function runCutFill(r) {
  const on = !!(cutAsked && r.mix && r.mix.cutting && !REDUCED);
  if (!on) {
    if (gCutFill && cutDrawnFor) put(gCutFill, 'opacity', 0);
    return;
  }
  const left = Math.max(0, Number(r.mix.cutIn) || 0);
  if (!cutTotal) cutTotal = left || 0.001;
  cutFillFor(cutAsked);
  if (!cutWedge) return;
  const w = clamp(1 - left / cutTotal, 0, 1) * CUT_R * 2;
  put(gCutFill, 'opacity', 1);
  put(cutWedge, 'width', w.toFixed(2));
  put(cutWedge, 'x', (cutAsked === 'back' ? CUT_R - w : -CUT_R).toFixed(2));
}

// A tap the music will only obey on the next bar still has to look taken: the
// node holds its glow and its word for a moment.
function pulseAction(id, ms = 1100) {
  heldAction = id;
  heldUntil = performance.now() + ms;
  hoverAction(id);
}

function hoverAction(id) {
  hoveredAction = id || cutAsked || (performance.now() < heldUntil ? heldAction : null);
  for (const a of actionNodes) a.label.setAttribute('opacity', a.id === hoveredAction ? 0.8 : 0);
  paintActionGlow();
}

// The same trick the cells use: a wide soft stroke under a crisp one, in the
// layer that carries no filter, so a hover never re-runs the bloom.
function paintActionGlow() {
  for (let i = 0; i < actionHalos.length; i++) {
    const a = ACTIONS[i];
    const on = a.id === hoveredAction || (a.id === 'play' && last && last.playing);
    const h = actionHalos[i];
    h.crisp.setAttribute('opacity', on ? 0.8 : 0);
    h.wide.setAttribute('opacity', on ? 0.22 : 0);
  }
}

// The lines a label must not sit on: the two squares and the octagon that bind
// the eight cells, plus the centre circle.
function ringSegments() {
  const v = (i) => [px(i / 8, R_STAR), py(i / 8, R_STAR)];
  const segs = [];
  const add = (a, b) => segs.push([a[0], a[1], b[0], b[1]]);
  for (let i = 0; i < 4; i++) add(v(i * 2), v(((i + 1) % 4) * 2));
  for (let i = 0; i < 4; i++) add(v(i * 2 + 1), v(((i + 1) % 4) * 2 + 1));
  for (let i = 0; i < 8; i++) add(v(i), v((i + 1) % 8));
  for (let i = 0; i < 32; i++) {
    add([px(i / 32, R_CORE), py(i / 32, R_CORE)], [px((i + 1) / 32, R_CORE), py((i + 1) / 32, R_CORE)]);
  }
  return segs;
}

const boxEdges = (b) => [
  [b.x, b.y, b.x + b.w, b.y],
  [b.x + b.w, b.y, b.x + b.w, b.y + b.h],
  [b.x + b.w, b.y + b.h, b.x, b.y + b.h],
  [b.x, b.y + b.h, b.x, b.y],
];

function segsCross(a, b) {
  const d = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const p1 = [a[0], a[1]], p2 = [a[2], a[3]], p3 = [b[0], b[1]], p4 = [b[2], b[3]];
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

// How many lines run through this text box.
function boxHits(box, segs) {
  let n = 0;
  const edges = boxEdges(box);
  for (const s of segs) {
    const inside = (x, y) => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
    if (inside(s[0], s[1]) || inside(s[2], s[3])) { n++; continue; }
    if (edges.some((e) => segsCross(s, e))) n++;
  }
  return n;
}

// ==========================================================================
const cellNodes = [];

function buildCells(r) {
  clear(gCells);
  clear(gStarLive);
  cellNodes.length = 0;
  CELLS.forEach((c, i) => {
    const f = i / 8;
    const x = px(f, R_STAR);
    const y = py(f, R_STAR);
    const g = el('g', { class: 'cell', 'data-id': c.id, opacity: 1 }, gCells);
    const knot = el('g', { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` }, g);
    // the cell itself, with a wide faint stroke standing in for the bloom it
    // left behind; it lights while its part is playing
    el('circle', { cx: 0, cy: 0, r: R_NODE, fill: '#000000' }, knot);
    el('circle', { cx: 0, cy: 0, r: R_NODE, fill: 'none', stroke: '#f2c14e', 'stroke-width': 5, opacity: 0.09 }, knot);
    el('circle', { class: 'ln thin', cx: 0, cy: 0, r: R_NODE, fill: 'none' }, knot);
    const gl = el('g', {}, knot);
    drawCellGlyph(gl, c.id, r, R_NODE);

    // The words live on the sheet's live sibling: they turn with the star and
    // are held upright by their own rotation, and they carry the knockout
    // halo that always did their reading for them, so they need no bloom.
    const v = cellValue(c.id, r);
    const gt = el('g', {}, gStarLive);
    const word = txt(gt, v.word, 0, 5, 16, { ls: 0.2 });
    const sub = txt(gt, v.sub, 0, 22, 10, { op: 0.45, ls: 0.22 });
    const sub2 = txt(gt, v.sub2 || '', 0, 36, 10, { op: 0.35, ls: 0.22 });
    const bb = gt.getBBox();
    // its light, built with it so it wanders with it
    const hg = el('g', {}, gStarLive);
    const wide = el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: R_NODE + 1, fill: 'none', stroke: '#f2c14e', 'stroke-width': 7, opacity: 0 }, hg);
    const crisp = el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: R_NODE + 1, fill: 'none', stroke: '#ffd97a', 'stroke-width': 1.2, opacity: 0 }, hg);
    const flash = el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: R_NODE, fill: 'none', stroke: '#fff8dc', 'stroke-width': 2.4, opacity: 0 }, hg);
    haloOn[i] = { wide, crisp };
    haloFlash[i] = flash;
    cellNodes.push({ ...c, g, knot, glyph: gl, word, sub, sub2, gt, bb, hg, x, y, f,
      dx: 0, dy: 0, spot: null, put: '', putKnot: '', putHalo: '' });
  });
  placeWords(0);
}

// Straight out from the centre first; if a line of the sigil runs through the
// words there, a small nudge along the ring or a little further out. The star
// turns, so the answer is recomputed every fifteen degrees — the geometry is
// rigid but the words stay upright inside it, so their boxes meet the lines at
// a different angle as it goes round.
const WORD_SPOTS = [];
for (const rr of [R_WORD, R_WORD + 13, R_WORD - 11]) {
  for (const df of [0, -0.028, 0.028, -0.05, 0.05]) WORD_SPOTS.push({ dr: rr, df });
}

function placeWords(turnDeg) {
  const t = (turnDeg / 360) % 1;
  const segs = ringSegments().map((sg) => [...rot(sg[0], sg[1], t), ...rot(sg[2], sg[3], t)]);
  const placed = [];
  const pad = 3;
  for (const c of cellNodes) {
    let best = null;
    for (let k = 0; k < WORD_SPOTS.length; k++) {
      const sp = WORD_SPOTS[k];
      const cx = px(c.f + sp.df + t, sp.dr);
      const cy = py(c.f + sp.df + t, sp.dr);
      const box = { x: cx + c.bb.x - pad, y: cy + c.bb.y - pad, w: c.bb.width + pad * 2, h: c.bb.height + pad * 2 };
      const hits = boxHits(box, segs) + boxHits(box, placed.flatMap(boxEdges));
      if (!best || hits < best.hits) best = { hits, sp, box };
      if (hits === 0) break;
    }
    c.spot = best.sp;
    placed.push(best.box);
  }
  turnWords(turnDeg, true);
}

// One short transform a word a frame, on a sheet with no filter on it.
function turnWords(turnDeg, force) {
  const t = (turnDeg / 360) % 1;
  for (const c of cellNodes) {
    if (!c.spot) continue;
    const lx = px(c.f + c.spot.df, c.spot.dr) + c.dx;
    const ly = py(c.f + c.spot.df, c.spot.dr) + c.dy;
    const tr = `translate(${lx.toFixed(1)} ${ly.toFixed(1)}) rotate(${(-turnDeg).toFixed(2)})`;
    if (force || c.put !== tr) { c.gt.setAttribute('transform', tr); c.put = tr; }
  }
}

function rot(x, y, t) {
  const a = t * TAU;
  const dx = x - C;
  const dy = y - C;
  return [C + dx * Math.cos(a) - dy * Math.sin(a), C + dx * Math.sin(a) + dy * Math.cos(a)];
}

function repaintCells(r) {
  for (const c of cellNodes) {
    const v = cellValue(c.id, r);
    const up = String(v.word).toUpperCase();
    if (c.word.textContent !== up) {
      clear(c.glyph);
      drawCellGlyph(c.glyph, c.id, r, R_NODE);
      c.word.textContent = up;
    }
    const su = String(v.sub).toUpperCase();
    if (c.sub.textContent !== su) c.sub.textContent = su;
    const su2 = String(v.sub2 || '').toUpperCase();
    if (c.sub2.textContent !== su2) c.sub2.textContent = su2;
  }
}

// ==========================================================================
// Has the set ever run in this page? The big mark belongs to the untouched
// state alone: it says what the circle is for before anything has happened.
// Once the set has played, a pause is a held position and not an empty
// machine, so the reading stays and the node at twelve o'clock is the play
// and pause control on its own. A reload restores the seed and the position
// but starts nothing, so it counts as untouched and the mark is there again.
let started = false;
const reading = (r) => started || !!(r && r.playing);

let seedText, chordText, notesText, sectionText, themeText, coreScale, coreTextG;
// The four beat dots light in turn, four times a bar: they sit beside the
// bloomed star, because a write inside it re-blurred the whole star.
let gBeat = null, beatDots = [];

function buildCore(r) {
  clear(gCore);
  coreScale = el('g', {}, gCore);
  // touch inside this circle to start or stop
  el('circle', { class: 'ln thin', cx: C, cy: C, r: R_CORE }, coreScale);
  el('circle', { class: 'ln hair', cx: C, cy: C, r: R_CORE_IN, opacity: 0.5 }, coreScale);
  // Before the first start the circle holds one mark and no words: what it is
  // for. The reading below appears once there is something to read, and from
  // then on it stays through a pause.
  coreTextG = el('g', { opacity: reading(r) ? 1 : 0 }, coreScale);
  // which theme of the mix this is, and how long it runs
  themeText = txt(coreTextG, `${roman(r.mix.themeIndex)} · ${r.durationLabel}`, C, C - 46, 14, { op: 0.6, ls: 0.28 });
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
  seedText = txt(coreScale, `seed ${r.seed}`, C, C + 196, 9, { op: 0.55, ls: 0.26 });
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
let gSeedEdit = null;
let seedInput = null;
let seedEditing = false;
let seedWas = '';

function seedEditor() {
  if (gSeedEdit && gSeedEdit.isConnected) return;
  gSeedEdit = el('g', { id: 'seedEdit' }, innerSvg);
  // Deep enough to hold the caption's own line, wide enough that the pair
  // never has to reflow; the box takes no pointer of its own, only the field
  // inside it does, so the ring under it is still the ring.
  const box = el('foreignObject', {
    x: C - 120, y: C + 182, width: 240, height: 22,
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
    const clean = seedInput.value.replace(/\D/g, '').slice(0, SEED_DIGITS);
    if (clean !== seedInput.value) seedInput.value = clean;
  });
  // The page answers space and the arrows; while a number is being typed it
  // may not hear any of it.
  seedInput.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Enter') { ev.preventDefault(); closeSeedEditor(true); }
    else if (ev.key === 'Escape') { ev.preventDefault(); closeSeedEditor(false); }
  });
  seedInput.addEventListener('keyup', (ev) => ev.stopPropagation());
  seedInput.addEventListener('blur', () => closeSeedEditor(true));
  for (const k of ['pointerdown', 'pointerup', 'pointermove', 'click', 'touchstart'])
    seedInput.addEventListener(k, (ev) => ev.stopPropagation());
  gSeedEdit.style.display = 'none';
}

function openSeedEditor() {
  if (seedEditing || !seedText || !last) return;
  seedEditor();
  seedEditing = true;
  seedWas = String(last.seed).replace(/\D/g, '').slice(0, SEED_DIGITS) || '1';
  seedInput.value = seedWas;
  seedText.setAttribute('opacity', 0);
  gSeedEdit.style.display = '';
  // inside the tap, so a phone opens its keypad on the same gesture
  try { seedInput.focus({ preventScroll: true }); } catch (err) { seedInput.focus(); }
  seedInput.select();
}

function closeSeedEditor(commit) {
  if (!seedEditing) return;
  seedEditing = false;
  const typed = (seedInput.value || '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  gSeedEdit.style.display = 'none';
  seedInput.blur();
  if (seedText) seedText.setAttribute('opacity', 0.55);
  if (commit && typed && typed !== seedWas) castTypedSeed(typed);
}

// A seed that was asked for by name is the seed that plays: no pool is drawn
// and nothing is scored, and it goes through the one door every other cast
// uses. The rest — the collapse, the rebuild, the reading — follows from
// control.js exactly as a throw's does.
function castTypedSeed(seed) {
  spinAngle = 0;
  spinVel = 0;
  nudge(0.9);
  if (control.resumeContext) control.resumeContext();
  lastCast = { seed: String(seed), from: last && last.seed, typed: true, distance: null, differs: [] };
  console.info(`[cast] seed ${seed} · typed`);
  control.setSeed(String(seed));
  return String(seed);
}

function setText(node, v) {
  const s = String(v).toUpperCase();
  if (node.textContent !== s) node.textContent = s;
}

let lastChordDrawn = null;

function repaintCore(r) {
  setPlayGlyph(r.playing);
  // one write, at the moment the set first starts — never during playback
  put(coreTextG, 'opacity', reading(r) ? 1 : 0);
  setText(seedText, `seed ${r.seed}`);
  setText(themeText, `${roman(r.mix.themeIndex)} · ${r.durationLabel}`);
  setText(sectionText, r.section || '');
  setText(chordText, r.chord || '');
  setText(notesText, (r.chordNotes || []).join(' '));
  if (r.chord !== lastChordDrawn) {
    lastChordDrawn = r.chord;
    /* the chord itself is engraved in the middle; the loop is on the key cell */
  }
}

// ==========================================================================
// everything that moves every frame; no filter here, so the browser never
// re-runs a blur for a cursor that has shifted a degree
let cursorG, pulseRing, pulseRing2, castRing, breathDisc, holdRing, holdDim;
const HOLD_MS = 700;
const hold = { at: -1, fired: false };
let bigPlay = null, bigPlayOp = 1, bigPlayPrev = 0;
let tellPath = null, tellText = null, tellTP = null;
const tell = { at: -1, dur: 2400 };
let shadeAll, shadePlayed;
let lastBeatDrawn = -1;
let lastShadeF = -1;
let cursorFaded = -1;
let engravePath, engraveText, engraveTP;
let haloOn = [], haloFlash = [], actionHalos = [];

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
    r: R_ACT_G, fill: '#000', opacity: 0 }, gLive);
  holdRing = el('circle', { cx: px(0.5, R_ACT).toFixed(1), cy: py(0.5, R_ACT).toFixed(1),
    r: R_ACT_G + 6, fill: 'none', stroke: '#ffe9a8', 'stroke-width': 2.2, opacity: 0,
    transform: `rotate(-90 ${px(0.5, R_ACT).toFixed(1)} ${py(0.5, R_ACT).toFixed(1)})` }, gLive);

  // the cast: one ring leaving the circle when a new mix is rolled
  castRing = el('circle', { cx: C, cy: C, r: 200, fill: 'none', stroke: '#ffe9a8', 'stroke-width': 2, opacity: 0 }, gLive);

  // What the circle is for, said once and plainly: a single outlined triangle
  // at two fifths of the centre's width while the set is stopped, fading out
  // over 400 ms when it starts. It lives on the unfiltered sheet, so the fade
  // never asks WebKit to re-run the bloom.
  const TRI = `M${C - 26} ${C - 37} L${C + 41} ${C} L${C - 26} ${C + 37} Z`;
  bigPlay = el('g', { opacity: 1 }, gInnerLive);
  el('path', { d: TRI, fill: 'none', stroke: '#ffe0a0', 'stroke-width': 9, opacity: 0.13, 'stroke-linejoin': 'round' }, bigPlay);
  el('path', { d: TRI, fill: 'none', stroke: 'url(#gold)', 'stroke-width': 2.4, 'stroke-linejoin': 'round' }, bigPlay);

  // a cell, answering a tap: one line engraved along the ring beside it
  tellPath = el('path', { id: 'tellPath', d: '', fill: 'none' }, gInnerLive);
  tellText = el('text', { 'font-size': 12, 'letter-spacing': 2.6, fill: 'url(#gold)', opacity: 0,
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
  breathDisc = el('circle', { cx: C, cy: C, r: R_CORE_IN, fill: '#ffd97a', opacity: 0 }, gLive);
  // the action under the finger, and play while the mix runs
  actionHalos = [];
  for (const a of ACTIONS) {
    const x = px(a.f, R_ACT);
    const y = py(a.f, R_ACT);
    const g = el('g', {}, gLive);
    const wide = el('circle', { cx: x, cy: y, r: R_ACT_G, fill: 'none', stroke: '#ffe0a0', 'stroke-width': 6, opacity: 0 }, g);
    const crisp = el('circle', { cx: x, cy: y, r: R_ACT_G, fill: 'none', stroke: '#ffeec0', 'stroke-width': 1.3, opacity: 0 }, g);
    actionHalos.push({ wide, crisp });
  }

  pulseRing = el('circle', { cx: C, cy: C, r: R_CORE, fill: 'none', stroke: '#ffe0a0', 'stroke-width': 9, opacity: 0 }, gLive);
  pulseRing2 = el('circle', { cx: C, cy: C, r: R_CORE, fill: 'none', stroke: '#ffe9a8', 'stroke-width': 1.6, opacity: 0 }, gLive);

  // where you are in the theme
  cursorG = el('g', { opacity: 0.95 }, gLive);
  el('path', { d: `M${C} ${C - R_BAND_IN + 2} L${C} ${C - R_SEC - 8}`, stroke: '#ffe0a0', 'stroke-width': 12, opacity: 0.14, fill: 'none', 'stroke-linecap': 'round' }, cursorG);
  el('path', { d: `M${C} ${C - R_BAND_IN} L${C} ${C - R_SEC - 10}`, stroke: '#ffeec0', 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round' }, cursorG);
  el('circle', { cx: C, cy: C - R_SEC, r: 10, fill: 'none', stroke: '#ffe0a0', 'stroke-width': 6, opacity: 0.18 }, cursorG);
  el('circle', { cx: C, cy: C - R_SEC, r: 4.2, fill: '#ffeec0' }, cursorG);

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
function setPlayedSplit(f) {
  if (!shadePlayed) return;
  put(shadePlayed, 'd', f <= 0.002 ? '' : wedge(SHADE_LO, SHADE_HI, 0, Math.min(f, 0.9999)));
}

// The explanation runs along the ring just outside its own cell, upright on
// either half, on the unfiltered sheet so its fade costs nothing.
function showTell(cell) {
  if (!last || !tellPath) return;
  const line = tellFor(cell.id, last);
  if (!line) return;
  const f = cell.f + (starDeg > 0 ? starDeg / 360 : 0);
  const top = Math.sin(ang(f)) < 0.02;
  const rr = top ? 338 : 350;
  const w = 0.135;
  put(tellPath, 'd', top ? arcPath(rr, f - w, f + w, 1) : arcPath(rr, f + w, f - w, 0));
  const up = line.toUpperCase();
  if (tellTP.textContent !== up) tellTP.textContent = up;
  tell.at = performance.now();
}

function runTell(now) {
  if (tell.at < 0) return;
  const e = now - tell.at;
  let op;
  if (e < 150) op = e / 150;
  else if (e < tell.dur) op = 1;
  else if (e < tell.dur + 400) op = 1 - (e - tell.dur) / 400;
  else { tell.at = -1; op = 0; }
  put(tellText, 'opacity', (op * 0.9).toFixed(3));
}

// ==========================================================================
// the cast
const cast = { t0: -1, dur: 1550, collapse: 0.17, swapped: true, pending: null, kind: 'full' };
const flash = { t0: -1, dur: 460 };
const cross = { t0: -1, dur: 1100 };

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
const easeInOutQuart = (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);
function easeOutBack(t, s = 1.7) {
  const p = t - 1;
  return 1 + (s + 1) * p * p * p + s * p * p;
}

// Half the depth they had: enough parallax to feel like three sheets of
// glass, little enough that the rim and the star stay one object.
const Z_OUTER = -13;
const Z_INNER = 17;
const PERSPECTIVE = 1500;

function layerTransform(svg, z, rot, scale) {
  svg.style.transform = `translateZ(${z}px) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
}

function startCast(kind, rebuild) {
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
  for (const c of cellNodes) c.g.setAttribute('opacity', 1);
  for (const f of haloFlash) f.setAttribute('opacity', 0);
  gCore.setAttribute('opacity', 1);
  gBeat.setAttribute('opacity', 1);
  castRing.setAttribute('opacity', 0);
  glowSvg.style.opacity = '1';
  if (coreScale) coreScale.removeAttribute('transform');
}

// The band draws itself into being clockwise: one dash offset per lane path,
// which is a style change on about twenty elements, not a redraw.
// Clipped on the layer element, not inside the filtered group, so the bloom is
// rasterised once and the sweep is a compositor job.
function sweepTo(sw) {
  outerSvg.style.clipPath = sw >= 1 ? '' : `polygon(${sweepPolygon(sw)})`;
}

// A pie wedge in percentages of the box, opening clockwise from the top.
function sweepPolygon(sw) {
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
let castFreeze = null;

function runCast(now) {
  if (cast.t0 < 0 && castFreeze == null) return false;
  const p = castFreeze == null ? clamp((now - cast.t0) / cast.dur, 0, 1) : castFreeze;
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
    for (const cn of cellNodes) cn.g.setAttribute('opacity', 0);
    gCore.setAttribute('opacity', 0);
    gBeat.setAttribute('opacity', 0);
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
    haloFlash[i].setAttribute('r', (R_NODE + 20 * (1 - local)).toFixed(1));
  }

  // the seed is engraved last
  const cp = clamp((q - 0.66) / 0.34, 0, 1);
  gCore.setAttribute('opacity', easeOutCubic(cp).toFixed(3));
  gBeat.setAttribute('opacity', easeOutCubic(cp).toFixed(3));
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

function runFlash(now) {
  if (flash.t0 < 0) return;
  const p = clamp((now - flash.t0) / flash.dur, 0, 1);
  for (let i = 0; i < haloFlash.length; i++) {
    const local = clamp((p - i * 0.06) / 0.3, 0, 1);
    haloFlash[i].setAttribute('opacity', (Math.sin(Math.PI * local) * 0.7).toFixed(3));
    haloFlash[i].setAttribute('r', (R_NODE + 14 * (1 - local)).toFixed(1));
  }
  if (p >= 1) { flash.t0 = -1; for (const f of haloFlash) f.setAttribute('opacity', 0); }
}

function runCross(now) {
  if (cross.t0 < 0) return;
  const p = clamp((now - cross.t0) / cross.dur, 0, 1);
  transition = easeInOutQuart(p);
  if (p >= 1) { cross.t0 = -1; transition = 0; }
}

// ==========================================================================
// tilt
let tiltX = 0, tiltY = 0, tiltTX = 0, tiltTY = 0, tiltWX = 999, tiltWY = 999;
let wobA = 0, wobT = 0;
let dragging = null;

function nudge(amount = 1) {
  wobA = clamp(wobA + amount, 0, 1.6);
  wobT = performance.now();
}

// Four degrees, and the ring leans into the pointer: the side the finger is on
// is the side that comes up. (In CSS a positive rotateY sinks the right edge
// and a positive rotateX sinks the top, so both signs are negated here.)
const TILT_MAX = 4;

function aimTilt(e) {
  const r = tiltEl.getBoundingClientRect();
  const nx = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2), -1, 1);
  const ny = clamp((e.clientY - (r.top + r.height / 2)) / (r.height / 2), -1, 1);
  tiltTY = -nx * TILT_MAX;
  tiltTX = ny * TILT_MAX;
}

stage.addEventListener('pointermove', (e) => {
  if (!(dragging && (dragging.kind === 'band' || dragging.kind === 'spin'))) aimTilt(e);
  if (dragging) return;
  // The whole viewport reports here, so the arrow goes back to normal when the
  // pointer leaves the sigil as well as when it lands on something.
  const hit = hitAt(e);
  hoverAction(hit.kind === 'action' ? hit.action.id : null);
  tiltEl.style.cursor = cursorFor(hit);
});
stage.addEventListener('pointerleave', () => { tiltTX = 0; tiltTY = 0; });

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (seedEditing) return;   // a number is being typed; the page hears none of it
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  // a focused action node answers Enter and Space itself
  if (t && t.closest && t.closest('#actions g[tabindex]') && (e.key === ' ' || e.key === 'Enter')) return;
  if (e.key === 'R' && e.shiftKey) { resetAll(); e.preventDefault(); return; }
  if (e.shiftKey) return;
  switch (e.key) {
    case ' ':
    case 'Spacebar':
      runAction('play');
      break;
    case 'ArrowRight':
      runAction('skip');
      break;
    case 'ArrowLeft':
      runAction('back');
      break;
    case 'n':
    case 'N':
      runAction('cast');
      break;
    case 'Home':
      control.seekTo(0, true);
      nudge(0.2);
      break;
    default:
      return;
  }
  e.preventDefault();
});

// ==========================================================================
// pointers
function toSvg(e, z = 0) {
  const s = stage.getBoundingClientRect();
  const w = tiltEl.offsetWidth || 1;
  const h = tiltEl.offsetHeight || 1;
  const cx = s.left + tiltEl.offsetLeft + w / 2;
  const cy = s.top + tiltEl.offsetTop + h / 2;
  const k = PERSPECTIVE / (PERSPECTIVE - z);
  return { x: C + ((e.clientX - cx) / (w * k)) * 1000, y: C + ((e.clientY - cy) / (h * k)) * 1000 };
}
function polar(pt) {
  const dx = pt.x - C;
  const dy = pt.y - C;
  let f = (Math.atan2(dy, dx) + Math.PI / 2) / TAU;
  return { r: Math.hypot(dx, dy), f: ((f % 1) + 1) % 1 };
}
// The star has turned, so the finger is turned back by the same amount before
// it is matched against the cells' own places.
function unturn(pt) {
  if (!starDeg || starDeg < 0) return pt;
  const [x, y] = rot(pt.x, pt.y, -starDeg / 360);
  return { x, y };
}

function hitCell(pt) {
  const q = unturn(pt);
  for (const c of cellNodes) if (Math.hypot(q.x - c.x - c.dx, q.y - c.y - c.dy) <= R_NODE + 9) return c;
  return null;
}
function hitAction(pt) {
  for (const a of actionNodes) if (Math.hypot(pt.x - a.x, pt.y - a.y) <= R_ACT_G + 6) return a;
  return null;
}
function angleDelta(a, b) {
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

function flickOf(d) {
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
function spinDrag(kind, f, cell) {
  spinVel = 0;
  return { kind, cell, f, turn: 0, spun: 0, base: spinAngle, trail: [{ t: performance.now(), turn: 0 }] };
}

// How fast the star was going when it was let go, in degrees a second, read
// over the last moments of the gesture — a hand that stops and then lifts has
// thrown nothing.
function throwSpeed(d) {
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
function seedBoxHit(pt) {
  if (!seedText) return false;
  let b;
  try { b = seedText.getBBox(); } catch (err) { return false; }
  if (!b || !b.width) return false;
  const w = Math.max(b.width + 24, SEED_HIT_W) / 2;
  const h = Math.max(b.height + 24, SEED_HIT_H) / 2;
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  return Math.abs(pt.x - cx) <= w && Math.abs(pt.y - cy) <= h;
}
const hitSeed = (pt) => !seedEditing && seedBoxHit(pt);

// One hit test, used by the pointer handlers and by the cursor, so what the
// arrow promises is exactly what the finger gets.
function hitAt(e) {
  const pt = toSvg(e, Z_OUTER);       // the rim and the band
  const inner = toSvg(e, Z_INNER);    // the star, the wheel, the core
  const { r, f } = polar(pt);
  const ri = polar(inner).r;
  const action = hitAction(inner);
  if (action) return { kind: 'action', action, f, inner };
  const cell = hitCell(inner);
  if (cell) return { kind: 'cell', cell, f, inner };
  if (hitSeed(inner)) return { kind: 'seed', f, inner };
  if (ri <= R_CORE) return { kind: 'core', f, inner };
  if (r >= R_BAND_IN - 8 && r <= R_SEC + 12) return { kind: 'band', f, inner };
  if (ri > R_CORE && r < R_BAND_IN - 8) return { kind: 'spin', f, inner };
  return { kind: 'none', f, inner };
}

function cursorFor(hit) {
  if (dragging) {
    if (dragging.kind === 'band' || dragging.kind === 'spin') return 'grabbing';
    return 'pointer';
  }
  switch (hit.kind) {
    case 'action':
    case 'core':
      return 'pointer';
    case 'seed':
      return 'text';      // the one reading on the ring you can write back
    case 'cell':
      return 'default';   // cells are readings; nothing on the star is touched
    case 'band':
    case 'spin':
      return 'grab';
    default:
      return 'default';
  }
}

// ==========================================================================
// The throw
//
// A drag anywhere on the star is a throw of the dice: let go, it lands on a new
// master seed, and how hard it was thrown decides how far the record it lands
// on stands from the one playing. That distance is a distance in style and not
// in seed number — the dice are independent, so the seed after this one can
// roll the same room, the same key and the same figures, which is why casting
// five times in a row could land on five versions of the same record. So the
// ring plans a dozen candidates, scores each against what is playing with
// style.js, and the throw picks how far down that ranking to reach.
const SPIN_CAST_DEG = 5;        // past this much turn, a release casts
const SPIN_CLAIM_DEG = 5;       // and past this much, a cell's drag is the star's
const SPIN_TRAIL_MS = 140;      // the window the release speed is read over
const SPIN_VEL_WEIGHT = 0.06;   // a second of that speed, counted as degrees of turn
const SPIN_VEL_MAX = 2000;      // degrees a second: past this it is a slip, not a throw
const SPIN_COAST = 0.45;        // seconds for the coast to fall by e
const SPIN_SETTLE = 0.22;       // and seconds to relax onto a whole turn
const CANDIDATES = 12;          // seeds planned and measured for one throw
const TAP_BAND = 0.5;           // where a tap on the die reaches into them
const SEED_MIN = 1;
const SEED_MAX = 99999;

// How far into the ranking a throw reaches: a flick takes the nearest record
// that is still a different one, a turn takes the middle of them, three turns
// take the furthest the dice can offer. Read between the marks in the log of
// the power, so each further turn buys less than the one before it.
const BANDS = [[15, 0], [90, 0.25], [360, 0.55], [1080, 1]];
function bandOf(power) {
  if (!(power > BANDS[0][0])) return 0;
  for (let i = 1; i < BANDS.length; i++) {
    const [p0, q0] = BANDS[i - 1];
    const [p1, q1] = BANDS[i];
    if (power <= p1) return q0 + ((q1 - q0) * Math.log(power / p0)) / Math.log(p1 / p0);
  }
  return 1;
}

const powerOf = (spun, vel) => spun + Math.min(Math.abs(vel), SPIN_VEL_MAX) * SPIN_VEL_WEIGHT;

// A stream of numbers the throw itself decides — the turn, the speed and the
// moment it was let go — so two flicks that felt the same do not draw the same
// twelve candidates. Mulberry32, the same one the generator uses.
function throwStream(spun, vel, t) {
  let h = (Math.round(spun * 97) ^ Math.round(vel * 13) ^ Math.round(t * 1000)) >>> 0;
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let x = Math.imul(h ^ (h >>> 15), 1 | h);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// The candidates, planned and scored against what is playing. The side of the
// current seed they are drawn from is the side the drag was going, so a throw
// backwards is not the same throw as one forwards.
function castPool(dir, rnd) {
  const cur = last && last.track;
  const from = Number(last && last.seed);
  const here = Number.isFinite(from) ? Math.round(from) : SEED_MIN;
  let lo = SEED_MIN;
  let hi = SEED_MAX;
  if (dir > 0 && SEED_MAX - here > CANDIDATES * 8) lo = here + 1;
  else if (dir < 0 && here - SEED_MIN > CANDIDATES * 8) hi = here - 1;
  const preset = (last && last.preset) || 'auto';
  const seen = new Set([String(here)]);
  const pool = [];
  for (let i = 0; i < CANDIDATES; i++) {
    const seed = String(lo + Math.floor(rnd() * (hi - lo + 1)));
    if (seen.has(seed)) continue;
    seen.add(seed);
    let plan = null;
    try { plan = planTheme(seed, 0, { masterSeed: seed, preset }); } catch (err) { continue; }
    const d = styleDistance(cur, plan);
    pool.push({ seed, distance: d.distance, differs: d.differs, parts: d.parts });
  }
  pool.sort((a, b) => a.distance - b.distance);
  return pool;
}

// Which one the throw asks for: the floor first — a record that moves nothing a
// listener would name is not a new record, whatever its number says — and then
// the band.
function pickCast(pool, band, floor) {
  if (!pool.length) return null;
  let up = pool.filter((c) => floor(c.parts));
  if (!up.length) up = pool.filter((c) => FLOOR.loud(c.parts));
  if (!up.length) up = pool;
  return up[clamp(Math.round(band * (up.length - 1)), 0, up.length - 1)];
}

let lastCast = null;

// One door for every cast the ring makes — the tap on the die and the throw of
// the star both come through here, and control.setSeed is the only entry used.
function castNewSeed(o) {
  const rnd = throwStream(o.spun || 0, o.vel || 0, performance.now());
  const pool = castPool(o.dir || 0, rnd);
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
    power: Math.round(o.power || 0),
    spun: Math.round(o.spun || 0),
    vel: Math.round(o.vel || 0),
    pool: pool.map((c) => ({ seed: c.seed, d: +c.distance.toFixed(3) })),
  };
  console.info(`[cast] seed ${pick.seed} · ${lastCast.distance} away · ${pick.differs.join(' ') || 'nothing named'}`);
  control.setSeed(pick.seed);
  return pick.seed;
}

function newMix() {
  spinAngle = 0;
  spinVel = 0;
  // A tap is a throw of middling power that has to move the room or the key:
  // those are the two nothing else can disguise, so two taps in a row can
  // never sound like one another.
  return castNewSeed({ band: TAP_BAND, floor: FLOOR.fresh, dir: 0, power: 0 });
}

function runAction(id) {
  // A cut in flight is not put back: mix.js lands one that is already moving
  // and then starts the next, so a second press — on this node or the other
  // one — arrives a theme further off than the hand meant. While one is
  // running the node fills, and the fill is the whole of the answer.
  if (cutAsked && (id === 'skip' || id === 'back')) return;
  pulseAction(id);
  if (id === 'play') { control.toggle(); nudge(0.35); }
  else if (id === 'skip') { askCut(id); control.skip(); nudge(0.5); }
  else if (id === 'back') { askCut(id); control.back(); nudge(0.3); }
  else if (id === 'cast') newMix();
}

// Holding the die starts the whole set again from its first seed.
function resetAll() {
  spinAngle = 0;
  spinVel = 0;
  nudge(1.1);
  if (control.resumeContext) control.resumeContext();
  return control.resetToStart();
}

function runHold(now) {
  if (!holdRing) return;
  if (hold.at < 0) {
    if (holdDim.getAttribute('opacity') !== '0') { put(holdDim, 'opacity', 0); put(holdRing, 'opacity', 0); }
    return;
  }
  const p = clamp((now - hold.at) / HOLD_MS, 0, 1);
  const c = TAU * (R_ACT_G + 6);
  put(holdDim, 'opacity', (p * 0.55).toFixed(3));
  put(holdRing, 'opacity', (0.3 + 0.7 * p).toFixed(3));
  holdRing.style.strokeDasharray = c;
  holdRing.style.strokeDashoffset = (c * (1 - p)).toFixed(1);
  if (p >= 1 && !hold.fired) {
    hold.fired = true;
    hold.at = -1;
    put(holdDim, 'opacity', 0);
    put(holdRing, 'opacity', 0);
    resetAll();
  }
}

tiltEl.addEventListener('pointerdown', (e) => {
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
  else if (hit.kind === 'cell') dragging = spinDrag('cell', hit.f, hit.cell);
  else if (hit.kind === 'core') dragging = { kind: 'core' };
  else if (hit.kind === 'band') {
    dragFrac = hit.f;
    dragging = {
      kind: 'band', f0: hit.f, f: hit.f, acc: hit.f, t0: performance.now(), turn: 0, moved: false,
      // the last moments of the gesture, in screen pixels: a flick is decided
      // on those, so a click or a slow drag can never be one
      trail: [{ t: performance.now(), x: e.clientX, y: e.clientY, f: hit.f }],
    };
    control.seekTo(hit.f, false);
  } else if (hit.kind === 'spin') dragging = spinDrag('spin', hit.f, null);
  else dragging = { kind: 'none' };
  tiltEl.style.cursor = cursorFor(hit);
});

window.addEventListener('pointermove', (e) => {
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
    const now = performance.now();
    dragging.trail.push({ t: now, turn: dragging.turn });
    while (dragging.trail.length > 2 && now - dragging.trail[0].t > SPIN_TRAIL_MS) dragging.trail.shift();
    // A cell is a reading, but it rides the star and the star is one object:
    // turn it far enough under the finger and the gesture is the star's, not
    // the cell's — eight of the things sit in the ring a throw is made in, and
    // a throw that started on one of them used to do nothing at all.
    if (dragging.kind === 'cell' && dragging.spun * 360 > SPIN_CLAIM_DEG) dragging.kind = 'spin';
    if (dragging.kind === 'spin') spinAngle = dragging.base + dragging.turn * 360;
  }
  tiltEl.style.cursor = cursorFor({ kind: dragging.kind });
});

window.addEventListener('pointerup', (e) => {
  const d = dragging;
  dragging = null;
  if (e.pointerType === 'touch') { tiltTX = 0; tiltTY = 0; hoverAction(null); }
  if (!d) return;
  const hit = hitAt(e);
  switch (d.kind) {
    case 'action': {
      const held = d.action.id === 'cast' && hold.fired;
      hold.at = -1;
      // a hold has already done its work; its release is not also a tap
      if (!held && hit.kind === 'action' && hit.action.id === d.action.id) runAction(d.action.id);
      hold.fired = false;
      break;
    }
    case 'core':
      if (Math.hypot(hit.inner.x - C, hit.inner.y - C) <= R_CORE + 20) runAction('play');
      break;
    case 'seed':
      // The press is what chose the caption; the release only has to say that
      // the hand stayed still. Hit-testing it again would ask the ring where
      // it is now, and the ring leans a few pixels under a finger between a
      // touch going down and coming up.
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 14) openSeedEditor();
      break;
    case 'cell':
      showTell(d.cell);   // a cell is a reading, not a control: it only answers
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
      // actually did: twenty-two degrees of *net* angle used to be the price,
      // which a drag through half a turn could not pay at all, since the angle
      // from where it began wraps and reads as nothing.
      const now = performance.now();
      d.trail.push({ t: now, turn: d.turn });
      while (d.trail.length > 2 && now - d.trail[0].t > SPIN_TRAIL_MS) d.trail.shift();
      const spun = d.spun * 360;
      if (spun < SPIN_CAST_DEG) { spinVel = 0; if (REDUCED) spinAngle = 0; break; }
      const vel = throwSpeed(d);
      const power = powerOf(spun, vel);
      const dir = Math.sign(d.turn) || Math.sign(vel) || 1;
      spinVel = REDUCED ? 0 : clamp(vel, -SPIN_VEL_MAX, SPIN_VEL_MAX);
      if (REDUCED) spinAngle = 0;
      castNewSeed({ band: bandOf(power), floor: FLOOR.loud, dir, power, spun, vel });
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
  dragging = null;
  dragFrac = null;
  hold.at = -1;
  hold.fired = false;
  tiltEl.style.cursor = 'default';
}

window.addEventListener('pointercancel', abandonDrag);
tiltEl.addEventListener('lostpointercapture', () => { if (dragging) abandonDrag(); });
stage.addEventListener('pointerleave', () => { hoverAction(null); tiltEl.style.cursor = 'default'; });

// ==========================================================================
const say = (() => {
  const box = $('say');
  let saidTheme = '';
  let saidPlay = null;
  const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  return (r) => {
    if (!box) return;
    const theme = `${r.mix.themeIndex}|${r.key}|${r.bpm}`;
    if (theme !== saidTheme) {
      saidTheme = theme;
      box.textContent = `Theme ${WORDS[r.mix.themeIndex] || r.mix.themeIndex}, ${r.key}, ${r.bpm}`;
      saidPlay = null;
      return;
    }
    if (r.playing !== saidPlay) {
      saidPlay = r.playing;
      box.textContent = r.playing ? 'Playing' : 'Paused';
    }
  };
})();

function onReadout(r) {
  last = r;
  if (r.playing) started = true;
  // the wait is over when the theme it was asking for has arrived, or when the
  // mix says it has no cut left to make
  if (!(r.mix && r.mix.cutting) || r.mix.themeIndex !== cutTheme) cutLanded();
  else runCutFill(r);
  say(r);
  if (r.change.n !== lastChange) {
    const reason = r.change.reason;
    lastChange = r.change.n;
    if (reason === 'seed') { startCast('full', () => redrawAll(r)); return; }
    if (reason === 'theme') { redrawAll(r); startFlash(); return; }
    if (reason === 'refused') { startFlash(); return; }
    redrawAll(r);
    startFlash();
    return;
  }
  const planKey = `${r.seed}:${r.mix.themeIndex}:${r.bars}:${r.plan.map((s) => s.kind + s.bars).join('')}`;
  if (planKey !== lastPlanKey) redrawAll(r);
  repaintCore(r);
  if (r.bar !== lastBar) { lastBar = r.bar; repaintCells(r); }
}

function redrawAll(r) {
  lastPlanKey = `${r.seed}:${r.mix.themeIndex}:${r.bars}:${r.plan.map((s) => s.kind + s.bars).join('')}`;
  nextDrawnFor = null;
  buildTimeline(r);
  buildSpin(r);
  buildCells(r);
  buildCore(r);
  buildActions(r);
  lastBar = -1;
  lastChordDrawn = null;
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
const HALF_RATE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
let oddFrame = false;

function frame(now) {
  if (HALF_RATE && (oddFrame = !oddFrame)) { requestAnimationFrame(frame); return; }
  if (lastFrame) { deltas[dIdx % deltas.length] = now - lastFrame; dIdx++; dCount = Math.min(dCount + 1, deltas.length); }
  lastFrame = now;

  const free = !(dragging && (dragging.kind === 'band' || dragging.kind === 'spin'));
  tiltX += ((free ? tiltTX : 0) - tiltX) * 0.11;
  tiltY += ((free ? tiltTY : 0) - tiltY) * 0.11;
  let wx = 0, wy = 0;
  if (wobA > 0.001) {
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

  // The throw the star was given: it coasts on the speed it was let go at and
  // then relaxes onto a whole turn, which is the same picture as none — so how
  // hard the dice were thrown is something that can be watched. Reduced motion
  // takes the angle away at the release and nothing here runs.
  if (!(dragging && dragging.kind === 'spin')) {
    const dt = Math.min(64, now - (spinAt || now)) / 1000;
    spinAt = now;
    if (spinVel) {
      spinAngle += spinVel * dt;
      spinVel *= Math.exp(-dt / SPIN_COAST);
      if (Math.abs(spinVel) < 20) spinVel = 0;
    } else if (spinAngle) {
      const to = Math.round(spinAngle / 360) * 360;
      spinAngle += (to - spinAngle) * (1 - Math.exp(-dt / SPIN_SETTLE));
      if (Math.abs(spinAngle - to) < 0.2) spinAngle = 0;
    }
  } else spinAt = now;

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
      const dt = Math.min(64, now - (bigPlayPrev || now));
      bigPlayOp += (want - bigPlayOp) * (1 - Math.exp(-dt / 130));
      put(bigPlay, 'opacity', bigPlayOp.toFixed(3));
    }
  }
  bigPlayPrev = now;
  runTell(now);

  flexStar(now);
  runHold(now);
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
      const env = Math.exp(-4.2 * last.beatPhase);
      const e = env * 0.72 + Math.exp(-3 * last.barPhase) * 0.28;
      pulseRing.setAttribute('r', (R_CORE + 7 * e).toFixed(2));
      pulseRing.setAttribute('opacity', (0.05 + 0.26 * e).toFixed(3));
      pulseRing2.setAttribute('r', (R_CORE + 7 * e).toFixed(2));
      pulseRing2.setAttribute('opacity', (0.14 + 0.52 * e).toFixed(3));
      breathDisc.setAttribute('r', (R_CORE_IN * (1 + 0.05 * e)).toFixed(2));
      breathDisc.setAttribute('opacity', (0.03 + 0.07 * e).toFixed(3));
      if (cursorFaded !== 1) { cursorFaded = 1; cursorG.setAttribute('opacity', 1); }
      if (last.beatInBar !== lastBeatDrawn) {
        lastBeatDrawn = last.beatInBar;
        for (let i = 0; i < beatDots.length; i++) beatDots[i].setAttribute('opacity', i === last.beatInBar ? 0.95 : 0.2);
      }
    } else {
      if (cursorFaded !== 0.6) {
        cursorFaded = 0.6;
        pulseRing.setAttribute('opacity', 0);
        pulseRing2.setAttribute('opacity', 0.16);
        pulseRing2.setAttribute('r', R_CORE);
        breathDisc.setAttribute('opacity', 0);
        cursorG.setAttribute('opacity', 0.6);
      }
    }

    for (let i = 0; i < haloOn.length; i++) {
      const want = last.active[CELLS[i].layer] ? 0.5 : 0;
      const h = haloOn[i];
      const cur = Number(h.crisp.getAttribute('opacity'));
      if (Math.abs(cur - want) > 0.005) {
        const v = cur + (want - cur) * 0.14;
        h.crisp.setAttribute('opacity', v.toFixed(3));
        h.wide.setAttribute('opacity', (v * 0.26).toFixed(3));
      }
    }
  }

  // Inside the bloomed star: written only when the star has actually turned.
  // The star turns with the theme. It is a transform on its own sheet, so
  // WebKit composites it and nothing inside the bloom is ever written.
  if (!REDUCED && STAR_TURN) {
    // one whole turn a theme, with a slow drift over it so it never reads as
    // a mechanism: two sines, seven and thirteen seconds, a degree and a half
    // and four fifths of one
    const t = now / 1000;
    const drift = REDUCED ? 0
      : 1.5 * Math.sin((TAU * t) / 7 + 0.9) + 0.8 * Math.sin((TAU * t) / 13 + 2.3);
    if (dragFrac == null && last) starFrac = last.progress;
    const turn = starFrac * 360 * STAR_TURN + drift + spinAngle;
    const d = +turn.toFixed(2);
    if (d !== starDeg) {
      starDeg = d;
      starSvg.style.transform = `translateZ(17px) rotate(${d}deg)`;
      // the words are held upright against it, and their clear space is
      // reckoned again every fifteen degrees
      const step = Math.round(d / 15);
      if (step !== wordStep) { wordStep = step; placeWords(d); }
      else turnWords(d, false);
    }
  } else {
    put(gSpin, 'transform', spinAngle ? `rotate(${spinAngle.toFixed(2)} ${C} ${C})` : '');
  }

  requestAnimationFrame(frame);
}

// ==========================================================================
buildRim();
buildLive();
const first = control.readout();
if (first.playing) started = true;
redrawAll(first);
lastChange = first.change.n;
last = first;
control.subscribe(onReadout);
resetCastState();
startCast('short', null);
requestAnimationFrame(frame);

// The listening bench, for ?rate=1 only: nothing is fetched otherwise, and
// nothing of it runs in the frame loop.
if (new URLSearchParams(location.search).has('rate')) {
  import('./rate.js')
    .then((m) => { window.rating = m.installRatings(control); })
    .catch((e) => console.error(e));
}

window.ring = {
  control,
  nudge,
  newMix,
  cast: (kind = 'full') => startCast(kind, () => redrawAll(control.readout())),
  reset: resetAll,
  cross: () => { control.prepareNext(); startCross(); },
  skip: () => control.skip(),
  back: () => control.back(),
  prepareNext: (seed) => control.prepareNext(seed),
  setTransition(p) { transition = clamp(Number(p) || 0, 0, 1); if (last) paintNext(last); },
  freezeCast(p) {
    if (p == null) { castFreeze = null; cast.t0 = -1; resetCastState(); return; }
    if (castFreeze == null) {
      cast.kind = 'full';
      cast.dur = 1550;
      cast.collapse = 0.17;
      cast.swapped = false;
      cast.pending = () => redrawAll(control.readout());
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
};

// What the throw did, for the bench: the power a drag of a given size makes,
// the band it reaches into, the pool it drew and the one it landed on. Reading
// it casts nothing; only `throw` does.
if (window.deepHouse) {
  window.deepHouse.cast = {
    get last() { return lastCast; },
    weights: WEIGHTS,
    power: powerOf,
    band: bandOf,
    // score a pool and pick from it without touching the set
    look(spun = 0, vel = 0, dir = 0) {
      const power = powerOf(spun, vel);
      const band = spun ? bandOf(power) : TAP_BAND;
      const pool = castPool(dir, throwStream(spun, vel, performance.now()));
      return { power, band, pick: pickCast(pool, band, spun ? FLOOR.loud : FLOOR.fresh), pool };
    },
    // and the same throw, cast for real
    throw(spun = 0, vel = 0, dir = 1) {
      const power = powerOf(spun, vel);
      return castNewSeed(spun
        ? { band: bandOf(power), floor: FLOOR.loud, dir, power, spun, vel }
        : { band: TAP_BAND, floor: FLOOR.fresh, dir: 0, power: 0 });
    },
    distanceTo(seed) {
      const preset = (last && last.preset) || 'auto';
      return styleDistance(last && last.track, planTheme(String(seed), 0, { masterSeed: String(seed), preset }));
    },
  };
}
