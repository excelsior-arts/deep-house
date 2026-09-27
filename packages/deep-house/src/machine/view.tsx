// The machine view, drawn.
//
// Every component here reads one immutable snapshot out of the store and
// renders it. Commands go through Control (engine selection and instrument
// monitoring); no component writes to audio nodes or reaches into the DOM to
// find out something the snapshot already says — the
// three `useState`s in the file are the width of the window, the size of the
// graph's own pane and which ledger line was last copied, which are facts about
// the *screen* and the *hand* and about nothing in the audio graph.
//
// The pane's size is one of them because **the canvas is computed from the room
// it has** (Eugene, 09-19: *"space out the graph and fill the black canvas to
// all the space between the left and right column"*). It is measured off the
// element's border box rather than its content box, so a scrollbar appearing
// cannot take fifteen pixels away, make the drawing narrower, take the
// scrollbar away again and start over; and it is read through a `ResizeObserver`
// behind a timer, because a drag of a window edge fires one of those per
// frame.
//
// The rack and the page-scroll mode are the same boxes and the same readings in
// two layouts, and there is no third: one break, at `RACK_MIN_WIDTH`, and below
// it the diagram becomes a single column in reading order with the page itself
// scrolling, so on a small iPhone window every reading is still there and
// nothing is behind a tab or a tooltip.

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { LEGEND_H, PAD, RACK_MIN_WIDTH, SOURCE_H, bellsAt, layoutCanvas, mainPath, rackOf, shapeOf } from './layout.ts';
import type { Fit, Layout, Place } from './layout.ts';
import { INK, LAMP, METER_FLOOR, REST, REST_BOX, SCALE, SPACE, TOOL_KEY_H, density, meterAt } from './look.ts';
import type { Lamp } from './look.ts';
import { KEEP_SECONDS, note, sentence } from '../ledger.ts';
import { linkView } from '../link.ts';
import type { Entry } from '../ledger.ts';
import { STAGE_ABOUT } from '@deep-house/engine/describe';
import { STRATEGIES, STRATEGY_IDS } from '../strategies/index.ts';
import { BIRDS, HOUSE, SPELL_SAME, asSpell, derive } from '../spell.ts';
import type { Control } from '../control.ts';
import type { MachineStore } from './store.ts';
import { GROUPS } from './model.ts';
import { BandControl, BusControls, ResetAll, STRIP_CONTROLS_W, SourceControls } from './source-controls.tsx';
import { BAND_OF } from './desk.ts';
import { Help, manualKey, said, showingOf, useHelp } from './help.tsx';
import { GenreKeys } from './genres.tsx';
import type { Showing } from './help.tsx';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { MachineEdge, MachineNode, MachineSnapshot } from './model.ts';
import type { MeterFrame } from '@deep-house/engine/taps';

/** The box the ring is centred in; the sigil's own CSS does the rest. */
const RING_BOX: CSSProperties = { position: 'absolute', inset: 0 };

const dbText = (db: number | null | undefined): string =>
  db == null ? '—' : db <= METER_FLOOR ? '−∞' : `${db > 0 ? '+' : ''}${db.toFixed(1)}`;

/**
 * What the LED on a box says.
 *
 * Every one of them is a reading and not a mood: a bus is red when its own peak
 * reached the ceiling, the limiter is red when it is pulling more than three
 * decibels down, a lane is off when the section has gated it, the output is red
 * when the clock has fallen to the interval and amber on the silent route the
 * suites use, and the deck is red when a note was late.
 */
function lampFor(node: MachineNode, snap: MachineSnapshot): Lamp {
  // **A box that has not been built has no lamp.** A pause takes the whole
  // audio graph down and leaves every box of it `idle`; the boxes stay where
  // they are, their lamps go out, their meters fall to the floor, and a play
  // lights them again without a thing moving.
  if (node.state === 'idle') return 'off';
  const meters = snap.meters;
  if (node.meter && meters) {
    // a bus over 0 dBFS is hot, not clipped: buses are float, and the limiter
    // is the one ceiling; only the output's own meter turns red (M15)
    if (meters.clipped.includes(node.meter)) return node.meter === 'out' ? 'red' : 'amber';
    if (meters.hot.includes(node.meter)) return 'amber';
    const read = node.meter === 'out' ? meters.out : meters.buses[node.meter];
    if (!read) return 'off';
    return read.peak > METER_FLOOR ? 'green' : 'off';
  }
  if (node.id === 'm:limiter') {
    if (node.state === 'bypassed') return 'amber';
    if (!meters || !meters.reduction.posting) return 'off';
    return meters.reduction.worst > 3 ? 'red' : meters.reduction.worst > 1 ? 'amber' : 'green';
  }
  if (node.id === 'sink') {
    if (snap.output.clock === 'interval') return 'red';
    if (snap.output.route === 'silent' || snap.output.clock === 'blob-worker') return 'amber';
    return snap.output.state === 'running' ? 'green' : 'off';
  }
  if (node.kind === 'deck') return snap.counters.late.count ? 'red' : 'green';
  if (node.kind === 'lane') {
    if (node.state === 'gated') return 'off';
    // By name and not by position: a reading added to a lane box tomorrow must
    // not decide what its lamp says.
    const events = node.readings.find((r) => r.name === 'events');
    return events && Number(events.value) > 0 ? 'green' : 'amber';
  }
  if (node.state === 'bypassed') return 'amber';
  if (node.state === 'gated') return 'off';
  // A compressor says what it is doing: how far it is pulling, right now.
  const gr = node.readings.find((r) => r.name === 'gr');
  if (gr && typeof gr.value === 'number') return -gr.value > 3 ? 'amber' : 'green';
  return 'green';
}

/** A box the music is not passing through: gated by a section, or not built. */
const resting = (node: MachineNode): boolean => node.state === 'gated' || node.state === 'idle';

const readingText = (node: MachineNode): string =>
  node.readings
    .filter((r) => r.value !== null && r.value !== '')
    .map((r) => `${r.name} ${r.value}${r.unit ? ` ${r.unit}` : ''}`)
    .join('  ');

// --- the shapes -------------------------------------------------------------
//
// Six, and each one is what the thing *is* rather than a rectangle with a
// different label (Eugene, 09-19: *"hierarchy is not reading at all"*): a
// source is one line with its channel strip, a lane insert and a send are
// small chips, a bus is a mixer strip with its meter down it, a stage is a box,
// and a stage of the master is a row of one rack unit.

/**
 * Text cut to the room it has, with an ellipsis.
 *
 * The face is monospaced, so a character is a known fraction of its size and
 * the cut is arithmetic rather than a measurement — which is what lets a box be
 * laid out without ever asking the browser how wide a string came out.
 *
 * @param px the room the line has, in canvas units
 */
const CHAR = 0.6;
export function cut(text: string, px: number, size: number, spacing = 0): string {
  const fits = Math.max(1, Math.floor(px / (size * CHAR + spacing)));
  return text.length > fits ? `${text.slice(0, Math.max(1, fits - 1))}…` : text;
}

/** The same text over at most two lines, broken on a space. */
export function wrap(text: string, px: number, size: number, lines = 2): string[] {
  const fits = Math.max(1, Math.floor(px / (size * CHAR)));
  const out: string[] = [];
  let left = text;
  while (left && out.length < lines) {
    if (left.length <= fits) { out.push(left); break; }
    if (out.length === lines - 1) { out.push(cut(left, px, size)); break; }
    let at = left.lastIndexOf(' ', fits);
    if (at <= 0) at = fits;
    out.push(left.slice(0, at));
    left = left.slice(at + 1);
  }
  return out;
}

/** What asks the manual for the words for a box, given where the pointer is on it. */
type Ask = (e: ReactPointerEvent<SVGGElement>, el: SVGGElement) => Showing | null;
const NO_ASK: Ask = () => null;
/** A box's title, lit when a selected wire ends on it. */
const titleInk = (lit: boolean, dim: boolean) => (lit ? INK.amber : dim ? INK.dim : INK.bright);

/** One line of small dim type, cut to its room. */
function Note({ text, x, y, w, size = 8.5, role = 'n' }: { text: string; x: number; y: number; w: number; size?: number; role?: 'n' | 'v' }) {
  if (!text) return null;
  return (
    <text className={role} x={x} y={y} fill={INK.dim} fontSize={size} fontFamily="inherit">{cut(text, w, size)}</text>
  );
}

/**
 * A source: **one line** (Eugene, 09-25: *"all instruments in one column,
 * compact, one line per instrument"*) — the lamp, the lane's name, the
 * instrument playing it, and the channel strip at the right-hand end. What the
 * box used to print under it — the events, the candidates, the knobs the spell
 * moved, the role — is its tooltip, and every word of it is still the node's.
 */
function SourceRowShape({ node, place, snap, control, lit = false, ask = NO_ASK }: { node: MachineNode; place: Place; snap: MachineSnapshot; control?: Control; lit?: boolean; ask?: Ask }) {
  const hp = useHelp(ask);
  const dim = resting(node);
  const lamp = lampFor(node, snap);
  const { w, h } = place;
  const source = snap.lanes.find((l) => `lane:${l.id}` === node.id);
  const strip = !!(source && control);
  const room = w - 16 - (strip ? STRIP_CONTROLS_W : 6);
  // one line where the name and the instrument fit beside the keys, and two
  // where they do not: the name and the keys on the first, the instrument under
  // them (M4); the layout said which when it gave the row its height
  const two = h > SOURCE_H;
  const line = SOURCE_H / 2;
  const label = cut(node.label, two ? room : Math.min(room * 0.55, 104), 8.5, 0.6);
  const labelW = label.length * (8.5 * CHAR + 0.6);
  return (
    <g transform={`translate(${place.x} ${place.y})`} data-box={node.id} data-state={node.state} data-lit={lit ? '' : undefined} data-lines={two ? 2 : 1} {...hp}>
      <g opacity={dim ? REST_BOX : 1}>
        <rect width={w} height={h} fill={INK.panel} stroke={dim ? INK.line : INK.edge} strokeWidth={1} />
        <circle className="lamp" cx={8} cy={line} r={3} fill={LAMP[lamp]} />
        <text className={`l${lit ? " lit" : ""}`} x={16} y={line + 3.2} fill={titleInk(lit, dim)} fontSize={8.5} letterSpacing={0.6} fontFamily="inherit">{label}</text>
        {two ? (
          <text className="v" x={16} y={h - 9} fill={INK.dim} fontSize={7.5} fontFamily="inherit">{cut(node.made, w - 22, 7.5)}</text>
        ) : (
          <text className="v" x={16 + labelW + 7} y={line + 3} fill={INK.dim} fontSize={7.5} fontFamily="inherit">
            {cut(node.made, room - labelW - 7, 7.5)}
          </text>
        )}
      </g>
      {/* the strip is drawn at full strength on a resting source: a control a
          hand can press is never dimmed into looking like it cannot be */}
      {strip ? <SourceControls control={control!} voices={source!.playing} label={source!.id} width={w} height={SOURCE_H} /> : null}
    </g>
  );
}

/**
 * A box: a title row with the lamp and what the machine made there, then its
 * readings and the descriptor's sentence, each line with the width to itself.
 */
function BoxShape({ node, place, snap, lit = false, ask = NO_ASK }: { node: MachineNode; place: Place; snap: MachineSnapshot; lit?: boolean; ask?: Ask }) {
  const hp = useHelp(ask);
  const dim = resting(node);
  const lamp = lampFor(node, snap);
  const { w, h } = place;
  const made = cut(node.made, w - 72, 7);
  const labelWidth = w - 26 - made.length * 7 * CHAR;
  const values = rowValue(valueText(node), w - 12, 8);
  return (
    <g transform={`translate(${place.x} ${place.y})`} data-box={node.id} data-state={node.state} opacity={dim ? REST_BOX : 1}
      data-lit={lit ? '' : undefined} {...hp}>
      <rect width={w} height={h} fill={INK.panel} stroke={dim ? INK.line : INK.edge} strokeWidth={1} />
      <rect width={w} height={15} fill={INK.sunken} />
      <line x1={0} y1={15} x2={w} y2={15} stroke={dim ? INK.line : INK.edge} strokeWidth={1} />
      <circle className="lamp" cx={7} cy={7.5} r={3} fill={LAMP[lamp]} />
      <text className={`l${lit ? " lit" : ""}`} x={15} y={11} fill={titleInk(lit, dim)} fontSize={8.5} letterSpacing={0.9} fontFamily="inherit">
        {cut(node.label, labelWidth, 8.5, 0.9)}
      </text>
      <text className="n" x={w - 5} y={11} textAnchor="end" fill={INK.dim} fontSize={7} fontFamily="inherit">{made}</text>
      {/* the value over two lines where one will not hold it, and then the
          note is the manual's to say (M6: a value is not cut while there is room) */}
      {values.map((t, i) => (
        <text key={i} className="v" data-value="" x={6} y={values.length === 1 ? 28 : 27 + i * 9.5} fill={dim ? INK.dim : INK.type} fontSize={8} fontFamily="inherit">{t}</text>
      ))}
      {values.length === 1 ? <Note text={node.note || ''} x={6} y={40} w={w - 12} size={7.5} /> : null}
    </g>
  );
}

/** A lane insert or a send: a chip, a title and two short lines. */
function ChipShape({ node, place, snap, accent, lit = false, ask = NO_ASK }: { node: MachineNode; place: Place; snap: MachineSnapshot; accent: boolean; lit?: boolean; ask?: Ask }) {
  const hp = useHelp(ask);
  const { w, h } = place;
  const dim = node.state !== 'live';
  const settings = accent ? node.readings.map((r) => `${r.name} ${r.value}`).join('  ') : readingText(node);
  return (
    <g transform={`translate(${place.x} ${place.y})`} data-box={node.id} data-state={node.state} opacity={dim ? REST : 1}
      data-lit={lit ? '' : undefined} {...hp}>
      <rect width={w} height={h} fill={INK.sunken} stroke={INK.edge} strokeWidth={1} />
      {/* an insert's amber edge says it is on the lane's own wire, which a return is not */}
      {accent ? <rect width={3} height={h} fill={INK.amber} opacity={dim ? 0.3 : 0.85} /> : null}
      <circle className="lamp" cx={w - 9} cy={9} r={3} fill={LAMP[lampFor(node, snap)]} />
      <text className={`l${lit ? " lit" : ""}`} x={accent ? 9 : 7} y={12.5} fill={titleInk(lit, false)} fontSize={8.5} letterSpacing={0.9} fontFamily="inherit">
        {cut(node.label, w - 26, 8.5, 0.9)}
      </text>
      <Note text={settings} x={accent ? 9 : 7} y={25} w={w - 14} size={7.5} role="v" />
      <Note text={node.note || ''} x={accent ? 9 : 7} y={35} w={w - 14} size={7} />
    </g>
  );
}

/** The meter's segments: one a little under three decibels, so the scale reads by counting. */
const SEGMENT = 4;

/**
 * A bus: a mixer strip, with a meter of LEDs up it (Eugene, 09-25: *"normal
 * green indicators with a little halo, an LED look at night"* — a meter is a
 * value, so its halo is allowed; nothing else in the view glows). A segment is
 * green, amber from −1 dBFS where the scene gate calls a peak hot, and red
 * when the bus reached full scale; the peak hold is one segment lit on its own.
 */
function StripShape({ node, place, snap, control, lit = false, ask = NO_ASK }: { node: MachineNode; place: Place; snap: MachineSnapshot; control?: Control; lit?: boolean; ask?: Ask }) {
  const hp = useHelp(ask);
  const { w, h } = place;
  const meters: MeterFrame | null = snap.meters;
  const read = node.meter && meters ? (node.meter === 'out' ? meters.out : meters.buses[node.meter]) : null;
  // only the output clips; a bus's strip over 0 dBFS reads hot (M15)
  const clipped = !!(node.meter === 'out' && meters && meters.clipped.includes(node.meter));
  const bus = node.id.replace(/^bus:/, '');
  const name = node.label.replace(/^BUS /, '');
  const channels = node.readings.find((r) => r.name === 'ch');
  const top = 44;
  const foot = h - 16;
  const span = foot - top;
  const n = Math.max(8, Math.floor(span / SEGMENT));
  const seg = span / n;
  const dbOf = (i: number) => METER_FLOOR + ((i + 1) / n) * (0 - METER_FLOOR);
  const at = (db: number) => foot - meterAt(db) * span;
  const barX = w - 16;
  const rms = read ? read.rms : METER_FLOOR - 1;
  const hold = read && read.hold > METER_FLOOR ? read.hold : null;
  const holdSeg = hold == null ? -1 : Math.min(n - 1, Math.max(0, Math.ceil(meterAt(hold) * n) - 1));
  const colour = (i: number) => (dbOf(i) > HOT_LED ? (clipped ? INK.red : INK.amber) : INK.green);
  const glow: ReactNode[] = [];
  const dark: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const on = meterAt(rms) * n > i + 0.5 || i === holdSeg;
    const y = foot - (i + 1) * seg + 0.6;
    (on ? glow : dark).push(
      <rect key={i} x={barX + 1} y={y} width={9} height={Math.max(1, seg - 1.2)} fill={on ? colour(i) : INK.ledOff} />,
    );
  }
  return (
    <g transform={`translate(${place.x} ${place.y})`} data-box={node.id} data-state={node.state} data-lit={lit ? '' : undefined} {...hp}>
      <g opacity={resting(node) ? REST : 1}>
        <rect width={w} height={h} fill={INK.panel} stroke={INK.edge} strokeWidth={1} />
        <rect width={w} height={16} fill={INK.sunken} />
        <line x1={0} y1={16} x2={w} y2={16} stroke={INK.edge} strokeWidth={1} />
        <circle className="lamp" cx={w - 7} cy={8} r={2.8} fill={LAMP[lampFor(node, snap)]} />
        <text className={`l${lit ? " lit" : ""}`} x={4} y={11.5} fill={titleInk(lit, false)} fontSize={7} letterSpacing={0.2} fontFamily="inherit">{cut(name, w - 13, 7, 0.2)}</text>
        <text className="v" x={5} y={26} fill={INK.dim} fontSize={7} fontFamily="inherit">{channels ? `${channels.value} ch` : 'st'}</text>
        <text className="v" x={w - 4} y={26} textAnchor="end" fill={hold != null ? INK.bright : INK.dim} fontSize={7} fontFamily="inherit">{dbText(hold)}</text>
        {SCALE.map((db) => (
          <line key={db} x1={barX - 5} y1={at(db)} x2={barX - 1} y2={at(db)} stroke={INK.line} strokeWidth={1} />
        ))}
        <text className="n" x={barX - 6} y={top + 4} textAnchor="end" fill={INK.dim} fontSize={6} fontFamily="inherit">0</text>
        <text className="n" x={barX - 6} y={foot} textAnchor="end" fill={INK.dim} fontSize={6} fontFamily="inherit">{METER_FLOOR}</text>
        <rect x={barX} y={top - 1} width={11} height={span + 2} fill={INK.ground} stroke={INK.line} strokeWidth={1} />
        <g className="led-off">{dark}</g>
        <g className="led" filter="url(#machineHalo)">{glow}</g>
        <text className="n" x={5} y={h - 5} fill={INK.dim} fontSize={6.5} fontFamily="inherit">dBFS</text>
      </g>
      {control ? <BusControls control={control} bus={bus} voices={snap.busVoices[bus] || []} width={w} /> : null}
    </g>
  );
}

/** Where a LED segment turns amber: the scene gate's hot, −1 dBFS. */
const HOT_LED = -1;

/** One stage of the master, as a row of the one rack unit; a band is a key. */
/**
 * **A value, said short** (M6, Eugene: *"too much compression, but there is
 * space in the box middle"*): a reading as a desk prints it — 18 Hz, +1.5 dB,
 * Q 0.71, 4:1, 433 ms — joined by a middle dot, so a row's value fits where
 * the old one was cut.
 */
function valueText(node: MachineNode): string {
  const parts: string[] = [];
  for (const r of node.readings) {
    if (r.value === null || r.value === '' || r.name === 'of') continue;
    const v = typeof r.value === 'number' ? (Math.abs(r.value) >= 100 ? Math.round(r.value) : +r.value.toFixed(2)) : r.value;
    if (r.name === 'freq') parts.push(`${v} Hz`);
    else if (r.name === 'gain' || r.name === 'return') parts.push(`${typeof v === 'number' && v > 0 ? '+' : ''}${v} dB`);
    else if (r.name === 'Q') parts.push(`Q ${v}`);
    else if (r.name === 'ratio') parts.push(`${v}:1`);
    else if (r.name === 'thr') parts.push(`thr ${v} dB`);
    else if (r.name === 'gr') parts.push(`gr ${v} dB`);
    else if (r.name === 'time') parts.push(`${v} ms`);
    else if (r.name === 'ceiling') parts.push(`ceiling ${v} dB`);
    else if (r.name === 'curve') parts.push(`${v}-pt curve`);
    else if (r.name === 'os') parts.push(`os ${v}`);
    else if (r.name === 'lean') parts.push(`lean ${typeof v === 'number' && v > 0 ? '+' : ''}${v}`);
    else if (r.name === 'rate') parts.push(`${typeof v === 'number' ? +(v / 1000).toFixed(1) : v} kHz`);
    else if (r.name === 'buffer') parts.push(`buffer ${v} ms`);
    else if (r.name === 'out') parts.push(`out ${v} ms`);
    else parts.push(`${r.name} ${v}${r.unit === 'hz' ? ' Hz' : r.unit === 'db' ? ' dB' : r.unit === 'ms' ? ' ms' : ''}`);
  }
  return parts.join(' · ');
}

/**
 * The value on a row, right-aligned in the room the label leaves: one line
 * where it fits, two where it does not (broken at a middle dot), and cut only
 * where even two will not hold it (M6).
 */
function rowValue(text: string, room: number, size: number): string[] {
  const fits = (t: string) => t.length * size * CHAR <= room;
  if (fits(text)) return [text];
  const parts = text.split(' · ');
  for (let k = parts.length - 1; k > 0; k--) {
    const a = parts.slice(0, k).join(' · '); const b = parts.slice(k).join(' · ');
    if (fits(a) && fits(b)) return [a, b];
  }
  return [cut(text, room, size)];
}

/** One stage of the master, as a row of the one rack unit; a band is a key. */
function RowShape({ node, place, snap, control, lit = false, ask = NO_ASK }: { node: MachineNode; place: Place; snap: MachineSnapshot; control?: Control; lit?: boolean; ask?: Ask }) {
  const hp = useHelp(ask);
  const { w, h } = place;
  const lamp = lampFor(node, snap);
  const meters = snap.meters;
  const gr = node.id === 'm:limiter' && meters && meters.reduction.posting ? meters.reduction.worst : null;
  const read = node.meter && meters ? meters.out : null;
  const band = BAND_OF[node.id];
  const lean = node.readings.find((r) => r.name === 'lean');
  const label = cut(node.label, 78, 8.5, 0.8);
  const labelEnd = 20 + label.length * (8.5 * CHAR + 0.8);
  const gap = SPACE.s;
  const size = 7.5;
  // the value's room: from the label's end, a gap, to the row's right edge less its inset
  const room = w - 6 - labelEnd - gap;
  const value = read ? `${dbText(read.hold)} dBFS` : valueText(node) || node.made;
  const lines = gr != null ? [] : rowValue(value, room, size);
  // the limiter: its reduction as a number at the right, and its bar in a slot
  // of its own to the number's left, a gap apart (M6: the bar lay under it)
  const grText = gr != null ? `−${gr.toFixed(1)} dB` : '';
  const grW = grText.length * 8 * CHAR;
  const barW = 36;
  const barX = w - 6 - grW - gap - barW;
  return (
    <g transform={`translate(${place.x} ${place.y})`} data-box={node.id} data-state={node.state} data-lit={lit ? '' : undefined} {...hp}>
      <g opacity={resting(node) ? REST : 1}>
        <rect width={w} height={h} fill={INK.panel} />
        <line x1={0} y1={h} x2={w} y2={h} stroke={INK.line} strokeWidth={1} />
        <circle className="lamp" cx={10} cy={h / 2} r={3} fill={LAMP[lamp]} />
        <text className={`l${lit ? ' lit' : ''}`} x={20} y={h / 2 + 3.5} fill={titleInk(lit, false)} fontSize={8.5} letterSpacing={0.8} fontFamily="inherit">
          {label}
        </text>
        {gr != null ? (
          <g data-gr="">
            <rect data-gr-bar="" x={barX} y={h / 2 - 4} width={barW} height={8} fill={INK.sunken} stroke={INK.line} strokeWidth={1} />
            <rect x={barX + 1} y={h / 2 - 3} width={Math.max(0, Math.min(barW - 2, (gr / 6) * (barW - 2)))} height={6}
              fill={gr > 3 ? INK.red : INK.amber} opacity={0.8} />
            <text data-gr-text="" className="v" x={w - 6} y={h / 2 + 3.5} textAnchor="end" fill={INK.type} fontSize={8} fontFamily="inherit">
              {grText}
            </text>
          </g>
        ) : lines.map((t, i) => (
          <text key={i} data-value="" className={`v${lean ? ' warn' : ''}`} x={w - 6}
            y={lines.length === 1 ? h / 2 + 3 : h / 2 - 1.5 + i * (size + 1.5)} textAnchor="end"
            fill={lean ? INK.amber : INK.dim} fontSize={size} fontFamily="inherit">{t}</text>
        ))}
      </g>
      {band && control ? <BandControl control={control} band={band} label={node.label} width={w} height={h} /> : null}
    </g>
  );
}

/**
 * **The master's response**, at the foot of its column (M2): the sum of what
 * its five bands do as they stand now, 20 Hz to 20 kHz, drawn from the readings
 * the description already carries. The curve is scaled to the box's own height
 * with a margin — the sum of two bells can stand higher than either, which is
 * how it once ran out of the top of its box — and clipped to the box besides.
 */
const BELLS_MARGIN = 5;
// **A box re-renders when what it draws changed, and not on every publish**
// (M14, both reviews' F8/F9): the whole graph — some fifty boxes and their
// handlers — was rendered afresh twelve times a second, stopped or playing.
// What a box draws is its node and the few readings of the snapshot it reads:
// its lamp, its lane, its bus's meter and voices, the limiter's pull. Those,
// and the place, the lit state and its handlers, are the whole comparison.
type ShapeProps = { node: MachineNode; place: Place; snap: MachineSnapshot; control?: Control; lit?: boolean; ask?: Ask; accent?: boolean };
function drawnOf(p: ShapeProps, what: 'source' | 'box' | 'strip' | 'row'): string {
  const { node, snap } = p;
  let extra = lampFor(node, snap) as string;
  if (what === 'source') extra += JSON.stringify(snap.lanes.find((l) => `lane:${l.id}` === node.id) ?? null);
  if (what === 'strip') {
    const m = snap.meters;
    const read = node.meter && m ? (node.meter === 'out' ? m.out : m.buses[node.meter]) : null;
    const bus = node.id.replace(/^bus:/, '');
    extra += JSON.stringify(read) + (m && node.meter ? `${m.clipped.includes(node.meter)}${m.hot.includes(node.meter)}` : '') + JSON.stringify(snap.busVoices[bus] ?? null);
  }
  if (what === 'row') {
    const m = snap.meters;
    extra += m ? JSON.stringify([m.reduction, node.meter ? m.out : null]) : '';
  }
  return JSON.stringify(node) + extra;
}
const sameShape = (what: 'source' | 'box' | 'strip' | 'row') => (a: ShapeProps, b: ShapeProps): boolean =>
  a.place === b.place && a.lit === b.lit && a.control === b.control && a.ask === b.ask && a.accent === b.accent && drawnOf(a, what) === drawnOf(b, what);
const SourceRow = memo(SourceRowShape, sameShape('source'));
const Box = memo(BoxShape, sameShape('box'));
const Chip = memo(ChipShape as (p: ShapeProps & { accent: boolean }) => ReturnType<typeof ChipShape>, sameShape('box'));
const Strip = memo(StripShape, sameShape('strip'));
const Row = memo(RowShape, sameShape('row'));

function Bells({ rows, x, y, w, h, ask = NO_ASK }: { rows: MachineNode[]; x: number; y: number; w: number; h: number; ask?: Ask }) {
  const hp = useHelp(ask);
  if (!rows.length) return null;
  const bells = rows.map((n) => ({
    label: n.label,
    hz: Number(n.readings.find((r) => r.name === 'freq')?.value ?? 0),
    db: Number(n.readings.find((r) => r.name === 'gain')?.value ?? 0),
    q: Number(n.readings.find((r) => r.name === 'Q')?.value ?? 1),
    type: n.made.replace('biquad ', ''),
  })).filter((b) => b.hz > 0);
  const LO = Math.log10(20);
  const HI = Math.log10(20000);
  const at = (hz: number) => ((Math.log10(Math.max(20, hz)) - LO) / (HI - LO)) * w;
  // the sum, sampled: a bell a gaussian in log frequency, a shelf a step
  const sum: Array<[number, number]> = [];
  for (let i = 0; i <= 80; i++) {
    const hz = Math.pow(10, LO + ((HI - LO) * i) / 80);
    let db = 0;
    for (const b of bells) {
      const d = (Math.log10(hz) - Math.log10(b.hz)) * Math.max(0.6, b.q);
      db += b.type.includes('shelf')
        ? b.db * (b.type.includes('low') ? 1 / (1 + Math.pow(hz / b.hz, 2)) : 1 / (1 + Math.pow(b.hz / hz, 2)))
        : b.db * Math.exp(-d * d * 2.2);
    }
    sum.push([at(hz), db]);
  }
  // scaled so the highest point of the sum, either way, sits a margin inside the box
  const span = Math.max(3, ...sum.map(([, db]) => Math.abs(db)));
  const dbY = (db: number) => h / 2 - (db / span) * (h / 2 - BELLS_MARGIN);
  const d = sum.map(([px, db], i) => `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${dbY(db).toFixed(1)}`).join(' ');
  return (
    <g transform={`translate(${x} ${y})`} data-bells="" {...hp}>
      <defs><clipPath id="machineBellsClip"><rect width={w} height={h} /></clipPath></defs>
      <text className="l" x={0} y={-4} fill={INK.type} fontSize={7.5} letterSpacing={1.2} fontFamily="inherit">MASTER RESPONSE · ±{span.toFixed(1)} dB</text>
      <rect width={w} height={h} fill={INK.sunken} stroke={INK.line} strokeWidth={1} />
      <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke={INK.line} strokeWidth={1} />
      {bells.map((b) => (
        <line key={b.label} x1={at(b.hz)} y1={0} x2={at(b.hz)} y2={h} stroke={INK.line} strokeWidth={1} />
      ))}
      <path d={d} clipPath="url(#machineBellsClip)" fill="none" stroke={INK.bright} strokeWidth={1.3} opacity={0.85} />
      <text className="n" x={4} y={h - 3} fill={INK.dim} fontSize={6.5} fontFamily="inherit">20 Hz</text>
      <text className="n" x={w - 4} y={h - 3} textAnchor="end" fill={INK.dim} fontSize={6.5} fontFamily="inherit">20 k</text>
    </g>
  );
}

// --- the canvas -------------------------------------------------------------

/**
 * What each kind of wire means, and how it is drawn: **shades of grey**
 * (Eugene, 09-25: *"no acid blue lines"*), told apart by weight and by dash,
 * and an arrowhead where the signal goes (M2: a send too, now that each has its
 * own lane — from the bus into the line it may feed).
 *
 * **At rest they sit back** (M2, Eugene: *"too bright against the rest of the
 * UI"*): every wire at `WIRE_REST` of its ink, the grey of the panel's own line
 * work, and a wire a hand has selected at full strength with the others at
 * `WIRE_AWAY`.
 */
const WIRE_REST = 0.55;
const WIRE_AWAY = 0.15;
const WIRE: Record<string, { stroke: string; dash?: string; width: number; opacity: number; what: string; arrow: boolean }> = {
  signal: { stroke: INK.wire, width: 1.1, opacity: WIRE_REST, what: 'signal', arrow: true },
  main: { stroke: INK.wireMain, width: 2, opacity: WIRE_REST, what: 'the main path', arrow: true },
  send: { stroke: INK.wireFaint, width: 0.9, opacity: WIRE_REST, what: 'may send', arrow: true },
  return: { stroke: INK.wire, dash: '5 3', width: 1.1, opacity: WIRE_REST, what: 'a return', arrow: true },
  sidechain: { stroke: INK.wire, dash: '1.5 2.5', width: 1.3, opacity: WIRE_REST, what: 'the sidechain key', arrow: true },
};
const kindOf = (e: MachineEdge, main: Set<string>) => (e.kind === 'signal' && main.has(`${e.from}>${e.to}`) ? 'main' : e.kind);

/** The legend: what a wire means and what a lamp means, under the canvas. */
function Legend({ y, w }: { y: number; w: number }) {
  const wires: Array<[string, string]> = [
    ['main', WIRE.main.what], ['signal', WIRE.signal.what],
    ['return', WIRE.return.what], ['sidechain', WIRE.sidechain.what], ['send', WIRE.send.what],
  ];
  const lamps: Array<[Lamp, string]> = [
    ['green', 'sounding'], ['amber', 'hot, or passed through'], ['red', 'clipping, or late'], ['off', 'gated off'],
  ];
  let x = PAD;
  const marks: ReactNode[] = [];
  for (const [kind, what] of wires) {
    const look = WIRE[kind];
    marks.push(
      <g key={kind}>
        <line x1={x} y1={y + 12} x2={x + 22} y2={y + 12} stroke={look.stroke} strokeWidth={look.width}
          strokeDasharray={look.dash} opacity={look.opacity} />
        <text className="n" x={x + 27} y={y + 15} fill={INK.dim} fontSize={8} fontFamily="inherit">{what}</text>
      </g>,
    );
    x += 34 + what.length * 5.2;
  }
  for (const [lamp, what] of lamps) {
    marks.push(
      <g key={lamp}>
        <circle cx={x + 4} cy={y + 12} r={3.2} fill={LAMP[lamp]} />
        <text className="n" x={x + 12} y={y + 15} fill={INK.dim} fontSize={8} fontFamily="inherit">{what}</text>
      </g>,
    );
    x += 18 + what.length * 5.2;
  }
  return (
    <g>
      <line x1={PAD} y1={y} x2={w - PAD} y2={y} stroke={INK.line} strokeWidth={1} />
      {marks}
    </g>
  );
}

/** A branch: two points, one straight run. */
const straight = (pts: Array<{ x: number; y: number }>) => pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

/** What the layout is a function of: the nodes where they go, the wires, and the room. */
function shapeKey(snap: MachineSnapshot, fit?: Fit): string {
  let k = `${fit ? `${fit.width}x${fit.height}@${fit.space ?? 1}/${fit.type ?? 0}` : '-'}#`;
  for (const n of snap.part.nodes) k += `${n.id}:${n.stage}:${n.group ?? ''}:${n.exit ?? ''}|`;
  k += '#';
  for (const e of snap.part.edges) k += `${e.from}>${e.to}:${e.kind}|`;
  return k;
}

/**
 * The canvas: the machine in the named stages of its own signal. It is one
 * SVG, which is also what the headless export writes.
 */
export function Diagram({ snap, fit, id = 'machineDiagram', control }: { snap: MachineSnapshot; fit?: Fit; id?: string; control?: Control }) {
  // **Laid out when the machine's shape changes, and not on every frame** (R115).
  const shape = shapeKey(snap, fit);
  const { layout, main, rack } = useMemo(() => {
    const layout: Layout = layoutCanvas(snap.part, GROUPS, fit);
    return { layout, main: mainPath(snap.part), rack: rackOf(layout) };
  }, [shape]);
  const byId = new Map(snap.part.nodes.map((n): [string, MachineNode] => [n.id, n]));
  const now = (p: Place): MachineNode => byId.get(p.node.id) ?? p.node;
  const bells = layout.order.map(now).filter((n) => n.stage === 'master' && /shelf|peaking/.test(n.made));
  const bellsBox = bells.length ? bellsAt(layout) : null;
  const sources = layout.columns.find((c) => c.stage === 'sources');

  // **The manual, asked at the moment a pointer arrives** (M2), off the
  // snapshot as it is then and not as it was when the box was drawn.
  const held = useRef(snap);
  held.current = snap;
  //
  // **Only a title asks** (M4, Eugene: *"hovering the box's title area is an
  // intent to see more info — not the mouse moving anywhere in the box"*): a
  // box's title row, a source's name and instrument (not its keys), a strip's
  // name, and its M S D row for the meter's legend (not the LED column), a rack
  // row's name, the response's title. Anywhere else on a box is quiet.
  // the response's rows as they read now, for its page
  const bellsNow = useRef(bells);
  bellsNow.current = bells;
  const askFor = (id: string, place: Place | null): Ask => (e, el) => {
    const s = held.current;
    const bells = bellsNow.current;
    const n = s.part.nodes.find((x) => x.id === id) ?? null;
    const r = el.getBoundingClientRect();
    const rect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    if (id === 'bells') {
      // the title stands over the box, and is the top of what the group draws
      if (e.clientY - r.top > 13 * (r.width / (bellsBox ? bellsBox.w : r.width))) return null;
      return showingOf('bells', null, s, rect, bells.map((b) => `${b.label.toLowerCase()}: ${said(b)}`).join('. '));
    }
    if (!n || !place) return null;
    const k = place.w / r.width;
    const ux = (e.clientX - r.left) * k;
    const uy = (e.clientY - r.top) * k;
    if (n.stage === 'sources') { if (ux > place.w - STRIP_CONTROLS_W) return null; }
    else if (n.stage === 'buses') {
      if (uy > 40) return null;
      if (uy > 17) return showingOf('meter', n, s, rect);
    } else if (n.stage === 'master') { if (ux > 110) return null; }
    else if (uy > 16) return null;
    const lane = s.lanes.find((l) => `lane:${l.id}` === n.id);
    return showingOf(manualKey(n, lane ? lane.family : null), n, s, rect, said(n));
  };

  // **One ask per box for the layout's life** (M14): a new closure every
  // publish made every box a new prop and re-rendered the whole graph
  const asks = useMemo(() => new Map<string, Ask>(), [layout]);
  const askOf = (id: string, place: Place | null): Ask => {
    let a = asks.get(id);
    if (!a) { a = askFor(id, place); asks.set(id, a); }
    return a;
  };

  // **A wire a hand has picked** (M2): lit end to end, its two ports and the
  // titles of the two boxes it joins lit with it, every other wire set back.
  // One at a time; a press on it again, or anywhere else, lets it go.
  const [picked, setPicked] = useState<string | null>(null);
  const keyOf = (e: MachineEdge, i: number) => `${e.from}>${e.to}:${e.kind}:${i}`;
  // a press anywhere that is not a wire lets the picked one go — on the canvas,
  // on a box, on the readings or the ledger
  useEffect(() => {
    if (!picked) return;
    const away = (e: PointerEvent) => { const t = e.target as Element | null; if (!t || !t.closest || !t.closest('[data-hit]')) setPicked(null); };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [picked]);
  const pickedWire = picked ? layout.wires.find((w, i) => keyOf(w.edge, i) === picked) ?? null : null;
  const lit = new Set(pickedWire ? [pickedWire.edge.from, pickedWire.edge.to] : []);
  // a pick is looking and not a change to the music, so the ledger does not
  // hear of it (M6: *"it's just noise"*)
  const pick = (k: string, _e: MachineEdge) => { setPicked((was) => (was === k ? null : k)); };
  return (
    <svg
      onClick={() => setPicked(null)}
      id={id}
      width={layout.width * layout.scale}
      height={layout.height * layout.scale}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ background: INK.ground, fontFamily: 'ui-monospace, Menlo, Consolas, monospace', display: 'block' }}
      role={control ? 'group' : 'img'}
      aria-label="the machine that is playing, stage by stage"
    >
      <defs>
        {Object.entries(WIRE).filter(([, look]) => look.arrow).map(([kind, look]) => (
          <marker key={kind} id={`machineArrow-${kind}`} viewBox="0 0 8 8" refX={7} refY={4} markerWidth={5} markerHeight={5} orient="auto">
            <path d="M 0 1 L 7 4 L 0 7 z" fill={look.stroke} />
          </marker>
        ))}
        <marker id="machineArrow-picked" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={5} markerHeight={5} orient="auto">
          <path d="M 0 1 L 7 4 L 0 7 z" fill={INK.bright} />
        </marker>
        {/* the one glow in the view: a lit LED's halo */}
        <filter id="machineHalo" x="-60%" y="-20%" width="220%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.4" result="halo" />
          <feMerge><feMergeNode in="halo" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect width={layout.width} height={layout.height} fill={INK.ground} />

      {/* the columns: a caps title and the one sentence that says what the stage does */}
      <g>
        {layout.columns.map((c) => {
          const about = STAGE_ABOUT[c.stage];
          const room = c.stage === 'sources' && control ? c.w - 72 : c.room;
          return (
            <g key={c.stage}>
              <text className="l" x={c.x} y={PAD + 9} fill={INK.type} fontSize={9.5} letterSpacing={2} fontFamily="inherit">
                {about.title.toUpperCase()}
              </text>
              {wrap(about.what, Math.min(room, layout.width - c.x - PAD), 7.5).map((line, n) => (
                <text className="n" key={line} x={c.x} y={PAD + 20 + n * 9} fill={INK.dim} fontSize={7.5} fontFamily="inherit">{line}</text>
              ))}
              <line x1={c.x} y1={PAD + 34} x2={c.x + c.w} y2={PAD + 34} stroke={INK.line} strokeWidth={1} />
            </g>
          );
        })}
        {/* the one reset, beside the strips it resets (Eugene, 09-25: *"closer to
            the source where we change solo or mute"*) */}
        {sources && control ? <ResetAll control={control} x={sources.x + sources.w - 62} y={PAD - 3} /> : null}
      </g>

      {/* the framed groups of the sources, and the bus column's areas */}
      <g>
        {layout.frames.map((f) => (
          <g key={f.id} data-frame={f.id}>
            <rect x={f.x} y={f.y} width={f.w} height={f.h} fill="none" stroke={INK.line} strokeWidth={1} />
            <text className="l" x={f.x + 7} y={f.y + 11} fill={INK.type} fontSize={8} letterSpacing={1.6} fontFamily="inherit">
              {f.label.toUpperCase()}
            </text>
          </g>
        ))}
        {layout.areas.map((a) => (a.id === 'effects' ? (
          <rect key={a.id} data-area={a.id} x={a.x - 0.5} y={a.y} width={a.w + 1} height={a.h} fill="none" stroke={INK.line} strokeWidth={1} />
        ) : (
          <text className="l" key={a.id} data-area={a.id} x={a.x + 4} y={a.y + 11} fill={INK.type} fontSize={7.5} letterSpacing={1.2} fontFamily="inherit">
            {a.label.toUpperCase()}
          </text>
        )))}
        {rack ? (
          <rect x={rack.x - 1} y={rack.y - 1} width={rack.w + 2} height={rack.h + 2}
            fill="none" stroke={INK.edge} strokeWidth={1.4} />
        ) : null}
      </g>

      {/* the wires: each in a lane of its own, square corners rounded a hair;
          an invisible wider stroke under each is where a hand picks it up. A
          wire riding a trunk (M3) draws only its two branches, each off and
          into a port of its own, and the trunk is drawn once, under them; a
          hand picks a wire up by its branch, and the trunk picks up nothing,
          since it belongs to every wire riding it and to none. */}
      <g>
        {layout.trunks.map((t) => {
          const kind = t.kind === 'signal' ? 'signal' : t.kind;
          const look = WIRE[kind] || WIRE.signal;
          const d = t.d;
          return (
            <path key={t.id} d={d} data-trunk={t.id} data-count={t.count} data-kind={kind} fill="none" stroke={look.stroke}
              strokeWidth={look.width + 0.3} strokeDasharray={look.dash} opacity={picked ? WIRE_AWAY : look.opacity} pointerEvents="none" />
          );
        })}
        {/* a joined arrival (M8): its stem into the box, drawn once, with the one arrowhead */}
        {layout.joins.map((j) => {
          const look = WIRE[j.look] || WIRE.signal;
          return (
            <path key={j.id} d={j.d} data-join={j.id} data-count={j.count} data-kind={j.look} fill="none" stroke={look.stroke}
              strokeWidth={look.width} strokeDasharray={look.dash} opacity={picked ? WIRE_AWAY : look.opacity}
              markerEnd={look.arrow ? `url(#machineArrow-${j.look})` : undefined} pointerEvents="none" />
          );
        })}
        {layout.wires.map((wire, i) => {
          const e = wire.edge;
          if (wire.implied) return null;
          const k = keyOf(e, i);
          if (k === picked) return null;
          const kind = kindOf(e, main);
          const look = WIRE[kind] || WIRE.signal;
          const op = picked ? WIRE_AWAY : look.opacity;
          const hit = (d: string, n = 0) => (
            <path key={`hit${n}`} d={d} data-hit={`${e.from}>${e.to}`} fill="none" stroke="transparent" strokeWidth={9}
              pointerEvents="stroke" style={{ cursor: 'pointer', touchAction: 'manipulation' }}
              onClick={(ev) => { ev.stopPropagation(); pick(k, e); }} />
          );
          if (wire.join) {
            return (
              <g key={k} data-joins={wire.join}>
                <path d={wire.ownD} data-wire={`${e.from}>${e.to}`} data-kind={kind} fill="none" stroke={look.stroke}
                  strokeWidth={look.width} strokeDasharray={look.dash} opacity={op} pointerEvents="none" />
                {hit(wire.ownD!)}
              </g>
            );
          }
          if (wire.branches) {
            const [out, into] = wire.branchD!;
            return (
              <g key={k} data-rides={wire.trunk}>
                <path d={out} data-branch={`${e.from}>${e.to}`} data-kind={kind} fill="none" stroke={look.stroke}
                  strokeWidth={look.width} strokeDasharray={look.dash} opacity={op} pointerEvents="none" />
                <path d={into} data-branch={`${e.from}>${e.to}`} data-kind={kind} fill="none" stroke={look.stroke}
                  strokeWidth={look.width} strokeDasharray={look.dash} opacity={op}
                  markerEnd={look.arrow ? `url(#machineArrow-${kind})` : undefined} pointerEvents="none" />
                {hit(out, 0)}{hit(into, 1)}
              </g>
            );
          }
          return (
            <g key={k}>
              <path d={wire.d} data-wire={`${e.from}>${e.to}`} data-kind={kind} fill="none" stroke={look.stroke}
                strokeWidth={look.width} strokeDasharray={look.dash} opacity={op}
                markerEnd={look.arrow ? `url(#machineArrow-${kind})` : undefined} pointerEvents="none" />
              {hit(wire.d)}
            </g>
          );
        })}
        {pickedWire ? (() => {
          const e = pickedWire.edge;
          const kind = kindOf(e, main);
          const look = WIRE[kind] || WIRE.signal;
          const hits = pickedWire.branchD ? [...pickedWire.branchD] : [pickedWire.ownD ?? pickedWire.d];
          return (
            <g key="picked" data-picked={`${e.from}>${e.to}`}>
              <path d={pickedWire.d} data-wire={`${e.from}>${e.to}`} data-kind={kind} data-selected="" fill="none" stroke={INK.bright}
                strokeWidth={look.width + 0.8} strokeDasharray={look.dash} opacity={1}
                markerEnd={`url(#machineArrow-picked)`} pointerEvents="none" />
              <circle cx={pickedWire.from.x} cy={pickedWire.from.y} r={2.8} fill={INK.amber} data-port="from" pointerEvents="none" />
              {hits.map((d, n) => (
                <path key={n} d={d} data-hit={`${e.from}>${e.to}`} fill="none" stroke="transparent" strokeWidth={9}
                  pointerEvents="stroke" style={{ cursor: 'pointer', touchAction: 'manipulation' }}
                  onClick={(ev) => { ev.stopPropagation(); pick(picked!, e); }} />
              ))}
            </g>
          );
        })() : null}
      </g>

      {/* the boxes */}
      <g>
        {layout.order.map((p) => {
          const node = now(p);
          const shape = shapeOf(node);
          const on = lit.has(node.id);
          const ask = askOf(node.id, p);
          if (shape === 'source') return <SourceRow key={node.id} node={node} place={p} snap={snap} control={control} lit={on} ask={ask} />;
          if (shape === 'strip') return <Strip key={node.id} node={node} place={p} snap={snap} control={control} lit={on} ask={ask} />;
          if (shape === 'chip') return <Chip key={node.id} node={node} place={p} snap={snap} accent lit={on} ask={ask} />;
          if (shape === 'send') return <Chip key={node.id} node={node} place={p} snap={snap} accent={false} lit={on} ask={ask} />;
          if (shape === 'row') return <Row key={node.id} node={node} place={p} snap={snap} control={control} lit={on} ask={ask} />;
          return <Box key={node.id} node={node} place={p} snap={snap} lit={on} ask={ask} />;
        })}
        {bellsBox ? <Bells rows={bells} {...bellsBox} ask={askOf('bells', null)} /> : null}
      </g>

      <Legend y={layout.height - LEGEND_H} w={layout.width} />
    </svg>
  );
}

// --- the readout ------------------------------------------------------------

function Fact({ k, v, tone, wide, span, wrap }: { k: string; v: ReactNode; tone?: 'warn' | 'bad'; wide?: boolean; span?: number; wrap?: boolean }) {
  return (
    <div className={`fact${wide ? ' wide' : ''}${wrap ? ' wrap' : ''}`} data-fact={k} style={span && span > 1 ? { gridColumn: `span ${span}` } : undefined}>
      <span className="k">{k}</span>
      <span className={`v${tone ? ` ${tone}` : ''}`}>{v}</span>
    </div>
  );
}

/** Three tiles to a row, in the side column and on a phone. */
const PER_ROW = 3;
/** A stage longer than this many characters takes a row; shorter, it wraps inside its tile. */
const STAGE_TILE = 30;

/**
 * The readings, as tiles under the ring (Eugene, 09-25: *"tile the reads two or
 * three to a row, to compress the vertical footprint"*). A tile is a name over
 * its value, three to a row; a reading that is a sentence takes a row of its
 * own, in the order the numbers, then the stage (where it is a sentence and not
 * the one word *flat*), then what the spell reads as, and **the spell last, end
 * to end**, as the longest (M3). The engine is not a tile: the engine keys over
 * the readings already say which is playing (M3, Eugene: *"we can drop
 * STRATEGY — it matches the engine selector above"*). Where the numbers do not
 * fill their last row, its last tile takes the rest of it, so no row is ragged.
 */
function Facts({ snap }: { snap: MachineSnapshot }) {
  const gr = snap.meters && snap.meters.reduction.posting ? snap.meters.reduction.worst : null;
  const peak = snap.meters ? snap.meters.out.hold : null;
  const clipping = !!(snap.meters && snap.meters.clipped.length);
  const stage = snap.stage.front || snap.stage.lead
    ? `${snap.stage.front || '—'}${snap.stage.lead ? ` · ${snap.stage.lead}${snap.stage.leadHz ? ` ${snap.stage.leadHz} Hz` : ''}` : ''}`
    : 'flat';
  const sentence = stage.length > STAGE_TILE;
  const tiles: Array<{ k: string; v: ReactNode; tone?: 'warn' | 'bad' }> = [
    { k: 'seed', v: snap.castTo ? `${snap.seed} → ${snap.castTo}` : snap.seed, tone: snap.castTo ? 'warn' : undefined },
    { k: 'room', v: snap.room },
    { k: 'theme', v: snap.theme },
    { k: 'bar', v: `${snap.bar}/${snap.bars}` },
    { k: 'section', v: snap.section || '—' },
    { k: 'chord', v: snap.chord || '—' },
    // the tempo family the spell derives beside the tempo (M8: the internals,
    // *"a debugging tool first"*); house-v1 reads no spell, so it has none
    { k: 'bpm', v: snap.strategy === 'house-v1' ? snap.bpm.toFixed(1) : `${snap.bpm.toFixed(1)} · ${derive(asSpell({ ...HOUSE, ...(snap.spell || {}) })).tempoFamily}` },
    { k: 'key', v: snap.key },
    { k: 'peak out', v: dbText(peak), tone: clipping ? 'bad' : undefined },
    { k: 'gain red.', v: gr == null ? '—' : `${gr.toFixed(1)} dB`, tone: gr != null && gr > 3 ? 'warn' : undefined },
    { k: 'seam', v: snap.transition ? snap.transition.toFixed(2) : '—', tone: snap.transition ? 'warn' : undefined },
    { k: 'late', v: snap.counters.late.count, tone: snap.counters.late.count ? 'bad' : undefined },
    { k: 'dropped', v: snap.counters.dropped.count, tone: snap.counters.dropped.count ? 'bad' : undefined },
    { k: 'fallbacks', v: snap.counters.piano.live ?? 0, tone: snap.counters.piano.live ? 'warn' : undefined },
    { k: 'clock', v: snap.output.clock || '—', tone: snap.output.clock === 'interval' ? 'bad' : undefined },
    { k: 'latency', v: `${snap.output.baseMs ?? '—'}/${snap.output.outputMs ?? '—'} ms` },
    { k: 'out', v: snap.output.route, tone: snap.output.route === 'silent' ? 'warn' : undefined },
    // the stage is a tile, beside OUT, and wraps to a second line inside it
    // before it takes a row of its own (M6: *"OUT and STAGE could be on the
    // same line"*); only a stage longer than two lines of a tile does
    ...(stage.length > STAGE_TILE ? [] : [{ k: 'stage', v: stage }]),
  ];
  const rest = tiles.length % PER_ROW;
  return (
    <div className="list">
      {tiles.map((t, i) => (
        <Fact key={t.k} k={t.k} v={t.v} tone={t.tone} wrap={t.k === 'stage' || t.k === 'bpm'} span={rest && i === tiles.length - 1 ? PER_ROW - rest + 1 : 1} />
      ))}
      {sentence ? <Fact wide k="stage" v={stage} /> : null}
      {/* What those dice are expected to measure as, where the strategy has a
          map to say (`src/calibration.ts`). */}
      {snap.reads ? (
        <Fact wide k="reads" v={Object.entries(snap.reads).map(([k, v]) => `${k.slice(0, 2)} ${(+v).toFixed(2)}`).join(' ')} />
      ) : null}
      {/* **The spell, a cell a control** (M6, Eugene: *"a two-row layout where
          the label on top is the name and the always-visible number below"*):
          each control's short name over its **raw value**, 0.00 to 1.00 — what
          the address carries and the composer reads (M8, Eugene: *"the machine
          view should operate more on internals than user-facing values, due to
          its nature: a debugging tool first"*; the percent it showed was a ratio
          to the house, 239 %, and not even the ring's scale). A control off the
          house a step brighter; the swatch after the name the one place the
          spell's colour is in the view; eight to a row at every width, on the
          tile's own padding and its name's left edge. */}
      <div className="fact wide spell" data-fact="spell">
        <div className="spell-head"><span className="k">spell</span><span className="swatch" style={{ background: snap.spellHex }} /></div>
        <div className="spell-grid">
          {BIRDS.map((b) => {
            const v = snap.spell && typeof snap.spell[b] === 'number' ? snap.spell[b] : HOUSE[b];
            const home = Math.abs(v - HOUSE[b]) <= SPELL_SAME;
            return (
              <div key={b} className={`cell${home ? '' : ' off'}`} data-bird={b} title={`${b} ${v.toFixed(3)}; the house is ${HOUSE[b].toFixed(3)}`}>
                <span className="k">{b.slice(0, 2)}</span>
                <span className="v">{v.toFixed(2)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --- the one control -------------------------------------------------------

/**
 * **The switch between engines, and the only thing on this view a hand may
 * touch** (`notes/archive/2026-09-v2-day-chain/plans/PLAN-MACHINE-VIEW.md` §5b). Everything else is a dashboard.
 *
 * **It sits at the foot of the left column** (M8, Eugene: *"it's not our main
 * function"*; from 09-19 to M7 it was directly under the ring), in the left
 * column and in the phone's stack alike, as a thin horizontal toggle under a
 * header of its own: the strategies side by side as segments, one row high,
 * the one that is playing lit.
 *
 * It is **not a box of the graph**, and that is the distinction the whole view
 * is built on: the graph is a description of the signal and every box in it is
 * a node that exists. A control is not a node, so it is not drawn as one.
 *
 * Choosing a row is a **seam** and never a stop: the transport re-plans the
 * next theme of the same seed under that engine and hands over from the next
 * phrase line. So the row that is *marked* is the one that is playing, and the
 * one that is arriving is marked as arriving until the low end changes hands.
 */
function Engine({ snap, control }: { snap: MachineSnapshot; control: Control }) {
  return (
    <div className="engine" role="group" aria-label="the engine this set is played under">
      {STRATEGY_IDS.map((id) => {
        const playing = snap.strategy === id;
        const arriving = snap.strategyTo === id;
        return (
          <button
            type="button"
            key={id}
            disabled={control.engineLocked && id !== control.state.strategy}
            className={`row${playing ? ' on' : ''}${arriving ? ' arriving' : ''}`}
            aria-pressed={playing}
            // The label a hand cannot see on a segment one row high: which
            // engine it is, and whether it is playing, arriving, or waiting.
            title={`${id} — ${STRATEGIES[id].label}`}
            aria-label={`${id}: ${arriving ? 'arriving' : playing ? 'playing' : 'switch to it'}`}
            onClick={() => control.setStrategy(id)}
          >
            <svg width={9} height={9} aria-hidden="true">
              <circle cx={4.5} cy={4.5} r={3.5} fill={playing ? INK.green : arriving ? INK.amber : INK.line} />
            </svg>
            <span className="id">{id}</span>
          </button>
        );
      })}
    </div>
  );
}

// --- the ledger -------------------------------------------------------------

/**
 * One line, drawn once: a line is a value that never changes once written, so
 * a publish redraws only the lines that arrived and the one marked copied
 * (R115: up to 240 of them were rebuilt twelve times a second).
 */
const LedgerLine = memo(function LedgerLine({ e, copied, copy }: { e: Entry; copied: boolean; copy: (e: Entry) => void }) {
  return (
    <button
      type="button"
      className={`line ${e.kind}${copied ? ' copied' : ''}`}
      onClick={() => copy(e)}
      title="copy this line"
    >
      <span className="bar">{e.theme ? `${e.theme}·${String(e.bar).padStart(3, '0')}` : '—'}</span>
      <span className="what">{e.what}</span>
      {Object.keys(e.fields).length ? (
        <span className="fields">
          {' '}
          {Object.entries(e.fields)
            .filter(([, v]) => v !== null && v !== '')
            .map(([k, v]) => `${k} ${typeof v === 'number' ? +v.toFixed(3) : v}`)
            .join(', ')}
        </span>
      ) : null}
    </button>
  );
});

function Ledger({ snap, hide }: { snap: MachineSnapshot; hide: () => void }) {
  const [copied, setCopied] = useState<number>(0);
  const lines = snap.ledger.slice().reverse();
  // Marked copied when the clipboard says it took the line, and not before: a
  // page that is not focused, or a browser that will not, leaves it unmarked
  // rather than claiming a copy that never happened (R119).
  const copy = useCallback((e: Entry) => {
    const text = sentence(e);
    try {
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => setCopied(e.n), () => {});
    } catch (err) { /* a browser that will not, from a page that is not focused */ }
  }, []);
  return (
    <>
      {/* HIDE is the log mark again, pressed, where the key that opened the
          ledger stood: show and hide are one spot (M20) */}
      <h2 className="with-key">ledger · last {KEEP_SECONDS} s
        <button type="button" className="pane-key log-key" data-tool="ledger" aria-label="Hide the ledger" aria-pressed title="Hide the ledger; the graph takes its width" onClick={hide}><LogMark /></button>
      </h2>
      <div className="lines">
        {lines.length === 0 ? <p className="empty">nothing yet. Start the set.</p> : null}
        {lines.map((e) => <LedgerLine key={e.n} e={e} copied={copied === e.n} copy={copy} />)}
      </div>
    </>
  );
}

// --- the whole view ---------------------------------------------------------

/** How wide the window is, watched the one way a layout may be driven. */
// **At most once a frame** (M14, both reviews' F4/F10: a window-edge drag
// delivered a width a pixel, each a new density and a new layout of the whole
// graph — 40 one-pixel steps were 1.1 s of script and 34,572 mutations at 1440).
function useWidth(): number {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1200 : window.innerWidth));
  useEffect(() => {
    let raf = 0;
    const on = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; setW(window.innerWidth); }); };
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return w;
}

/** How much room the graph's own pane has, measured and then watched. */
function usePane(): [(el: HTMLDivElement | null) => void, { width: number; height: number }] {
  const [fit, setFit] = useState({ width: 0, height: 0 });
  const held = useRef<HTMLDivElement | null>(null);
  const measure = useCallback(() => {
    const el = held.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const width = Math.round(box.width);
    const height = Math.round(box.height);
    setFit((was) => (was.width === width && was.height === height ? was : { width, height }));
  }, []);
  // Synchronously on the first commit, so whatever asked for the view — a key,
  // a query string, a headless export — can read the diagram in the same turn
  // and read it at the size it will be drawn at.
  const ref = useCallback((el: HTMLDivElement | null) => { held.current = el; measure(); }, [measure]);
  useLayoutEffect(measure, [measure]);
  useEffect(() => {
    let timer = 0;
    const on = () => {
      if (timer) return;
      timer = window.setTimeout(() => { timer = 0; measure(); }, 120);
    };
    const watch = new ResizeObserver(on);
    if (held.current) watch.observe(held.current);
    window.addEventListener('resize', on);
    return () => {
      watch.disconnect();
      window.removeEventListener('resize', on);
      if (timer) window.clearTimeout(timer);
    };
  }, [measure]);
  return [ref, fit];
}

/**
 * **A still press on the dark round the ring closes the view** (M8, Eugene:
 * *"clicking on the dark space at the edge of the ring"*): inside the ring's
 * box and outside its circle, a press that lets go where it came down, soon —
 * never a drag, which may be a spin, and never a hold.
 */
const STILL_PX = 5;
const STILL_MS = 600;
function darkPress(exit: () => void) {
  return (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // a key in the box (BACK) is pressed as a key, not as the dark round the ring
    if ((e.target as Element).closest && (e.target as Element).closest('button')) return;
    const tilt = document.getElementById('tilt');
    if (!tilt) return;
    const r = tilt.getBoundingClientRect();
    const rr = Math.min(r.width, r.height) / 2;
    if (Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) <= rr) return;
    // no mouse press after a finger's, which would move the focus off the ring
    // the close gives it back to
    e.preventDefault();
    const x0 = e.clientX; const y0 = e.clientY; const t0 = performance.now(); const id = e.pointerId;
    let moved = false;
    const move = (m: PointerEvent) => { if (m.pointerId === id && Math.hypot(m.clientX - x0, m.clientY - y0) > STILL_PX) moved = true; };
    const up = (u: PointerEvent) => {
      if (u.pointerId !== id) return;
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      if (u.type === 'pointerup' && !moved && Math.hypot(u.clientX - x0, u.clientY - y0) <= STILL_PX && performance.now() - t0 < STILL_MS) {
        // the click this press ends in lands on the ring's page once the view
        // is gone, and presses nothing there
        const eat = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
        document.addEventListener('click', eat, { capture: true, once: true });
        setTimeout(() => document.removeEventListener('click', eat, { capture: true }), 500);
        exit();
      }
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  };
}

/**
 * **The ring's toolbar** (M13, Eugene: *"introduce another toolbar right under
 * the ring; move the Back button into it and call it Close; move Show Ledger to
 * the left of it and turn it into Hide Ledger when open; add another button to
 * the left, Copy Link … when I open the app from the iOS home screen I have no
 * Share button"*): three desk keys, right-aligned, one row of a fixed height.
 */
function RingTools({ exit, control, seconds }: { exit?: () => void; control: Control; seconds: number }) {
  const [copied, setCopied] = useState<'link' | 'at' | null>(null);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const done = (which: 'link' | 'at') => {
    setCopied(which);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), COPIED_MS);
  };
  const copy = () => {
    void copyText(ringLink()).then((ok) => {
      if (!ok) return;
      note('transport', 'link copied', { link: ringLink() });
      done('link');
    });
  };
  // **COPY AT m:ss** (M16, Eugene: *"another button Copy Link with time"*): the
  // ring's link with `t`, the transport's own second at the press (K32's
  // `withTime`); the address keeps no `t`
  const copyAt = () => {
    const link = control.link.withTime();
    const t = Number(new URL(link).searchParams.get('t') ?? Math.floor(seconds));
    void copyText(link).then((ok) => {
      if (!ok) return;
      note('transport', `link copied at ${clock(t)}`, { link, t });
      done('at');
    });
  };
  return (
    // a plain group of three ordinary tab stops (M14, the review of 09-26): a toolbar
    // promises arrow keys, and the page's one key is Space
    <div className="ring-tools" role="group" aria-label="the view's tools">
      <button type="button" className="pane-key" data-tool="copy-at" aria-label={`Copy the link at ${clock(Math.floor(seconds))}`}
        title="Copy the link to what is playing, starting where it is now — the ring's link with the time" onClick={copyAt}>
        {copied === 'at' ? 'copied' : `copy at ${clock(Math.floor(seconds))}`}
      </button>
      <button type="button" className="pane-key" data-tool="copy" aria-label="Copy the link" title="Copy the link to what is playing — the ring's own link, without the view" onClick={copy}>
        {copied === 'link' ? 'copied' : 'copy link'}
      </button>
      {exit ? (
        <button type="button" className="pane-key" data-tool="close" data-exit="view" aria-label="Back to the ring" title="Back to the ring — closes the machine view" onClick={exit}>close</button>
      ) : null}
    </div>
  );
}
/** How long COPY LINK reads COPIED. */
const COPIED_MS = 1000;

/**
 * **The link to copy is the ring's, not the panel's** (M13): the address as it
 * stands — `v=2` and every sound row the control wrote — with `view=machine`
 * taken off, since the link is the track and the view is how it is looked at.
 */
export function ringLink(): string {
  const search = linkView(location.search, false);
  return `${location.origin}${location.pathname}${search ? `?${search}` : ''}${location.hash}`;
}

/**
 * Into the clipboard: the async clipboard where the page has it and it answers,
 * and else a selected hidden field and `execCommand('copy')` — which is what an
 * iOS home-screen web app, and a page inside another's frame, still honour
 * inside the press.
 */
/** A time into the theme as a clock says it: 4:12. */
export const clock = (s: number): string => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

async function copyText(text: string): Promise<boolean> {
  const fallback = () => {
    // the key keeps the focus (M14, both reviews: the field took it and left it on the page)
    const had = document.activeElement as HTMLElement | null;
    const f = document.createElement('textarea');
    f.value = text;
    f.setAttribute('readonly', '');
    f.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px';
    document.body.appendChild(f);
    f.focus({ preventScroll: true });
    f.select();
    f.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    f.remove();
    try { if (had && had.isConnected) had.focus({ preventScroll: true }); } catch (e) { /* nothing to focus */ }
    return ok;
  };
  // the fallback first where the async clipboard is known not to be there, so
  // it runs inside the press itself
  if (!navigator.clipboard || !window.isSecureContext) return fallback();
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { return fallback(); }
}

/** The log mark (M20): four short lines, the ledger's key's whole face. */
function LogMark() {
  return (
    <svg width={12} height={10} viewBox="0 0 12 10" aria-hidden="true">
      {[1, 3.67, 6.33, 9].map((y) => <line key={y} x1={1} y1={y} x2={11} y2={y} stroke="currentColor" strokeWidth={1} strokeLinecap="round" />)}
    </svg>
  );
}

/** Where this browser keeps whether the ledger is put away. */
const LEDGER_KEY = 'deep-house.machine.ledger';

export function Machine({ store, control, ringHost, exit }: {
  store: MachineStore; control: Control; ringHost: (el: HTMLDivElement | null) => void; exit?: () => void;
}) {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const width = useWidth();
  const rack = width >= RACK_MIN_WIDTH;
  const [paneRef, pane] = usePane();
  // **The ledger may be put away** (M6), and the graph takes its width; the
  // choice is this viewer's, kept in this browser (and forgotten where the
  // browser keeps nothing)
  // **hidden for a viewer who has not chosen** (M10, Eugene: *"for all new users
  // the ledger is hidden by default"*); a viewer who chose keeps the choice
  const [ledgerOn, setLedgerOn] = useState(() => { try { return localStorage.getItem(LEDGER_KEY) === 'shown'; } catch (e) { return false; } });
  const showLedger = (on: boolean) => {
    setLedgerOn(on);
    try { localStorage.setItem(LEDGER_KEY, on ? 'shown' : 'hidden'); } catch (e) { /* nothing kept */ }
  };
  // Above the break the canvas owns the pane in both directions; below it the
  // pane's own height *is* the drawing's, so asking for it back would be a
  // measurement of itself.
  // the density the window's width asks for (M6): spacing and type by width
  const { space, type } = density(width);
  // put away, the log mark floats at the canvas's top-right (M20): the drawing
  // keeps that corner clear by ending a key's width short, and reserves no panel
  const clear = rack && !ledgerOn ? (TOOL_KEY_H + SPACE.s * 2) * type : 0;
  const fit: Fit = { width: Math.max(0, pane.width - clear), height: rack ? pane.height : 0, space, type };
  // the panes, the popovers and the manual step their type with the drawing
  useLayoutEffect(() => { document.getElementById('machine')?.style.setProperty('--t', String(type)); }, [type]);
  // Three columns (Eugene's sketch, 09-19): down the left the ring, the genre
  // keys, every reading as tiles, and the engine toggle last (M8); the graph
  // edge to edge in the middle with nothing drawn over it; the ledger down the
  // right, newest first.
  //
  // Below the break the same three stack into one long page in that order —
  // the ring, the genres, the readings, the engine, then the graph, then the
  // ledger at the end — which is the order they are in the document, so nothing is reordered
  // by CSS and a screen reader, a tab and a check all read what the page
  // says.
  return (
    <div className={`view ${rack ? 'rack' : 'scrolling'}${ledgerOn ? '' : ' no-ledger'}`} id="machineInner">
      <div className="sheet">
        <div className="pane side">
          {/* the ring and its toolbar are one block: on a phone the block is
              what is pinned, so the keys stay with the ring (M13) */}
          <div className="ring-block">
            <div className="ringbox" onPointerDown={exit ? darkPress(exit) : undefined}>
              {/* The ring itself is moved in here, live, by `index.tsx`: the same
                  SVG scaled and nothing redrawn. */}
              <div ref={ringHost} style={RING_BOX} />
            </div>
            <RingTools exit={exit} control={control} seconds={snap.seconds} />
          </div>
          <GenreKeys store={store} control={control} />
          <div className="facts">
            <h2>readings</h2>
            <Facts snap={snap} />
          </div>
          {/* the engine last (M8, Eugene: *"put the v1 / v2 selector line at the
              end of the left panel's stack — it's not our main function; the
              genre selection is likely the top function"*), under a header of
              its own so it does not read as a reading */}
          {/* the private tier's CAPTURE block fills this (its record tools); a release build leaves it empty */}
          <div data-slot="capture" />
          <section className="engine-block" aria-label="engine">
            <h2>engine</h2>
            <Engine snap={snap} control={control} />
          </section>
        </div>
        {/* **One drawing, two layouts** (Eugene, 09-19). The graph is the same
            layered picture at every width: above the break it fills the middle
            column, and below it it is the one element on the page that scrolls
            sideways, because a layered graph is wider than a phone and the page
            itself must never scroll across. There is no second rendering of the
            machine to keep in step. */}
        <div className="pane graph" ref={paneRef}>
          <Diagram snap={snap} fit={fit} control={control} />
        </div>
        {/* **One key, where the ledger is** (M19): shown, HIDE in its own
            header; put away (M20), the log mark floating over the canvas —
            top-right beside the graph, at the page's foot on a phone — and no
            panel reserved for it */}
        {ledgerOn ? (
          <div className="pane ledger">
            <Ledger snap={snap} hide={() => showLedger(false)} />
          </div>
        ) : (
          <button type="button" className="pane-key ledger-show" data-tool="ledger" aria-label="Show the ledger" aria-pressed={false} title="Show the ledger" onClick={() => showLedger(true)}>
            <LogMark />
          </button>
        )}
        <Help />
      </div>
    </div>
  );
}

export default Machine;
