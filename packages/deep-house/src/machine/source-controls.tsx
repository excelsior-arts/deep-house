// The desk's controls: a channel strip on every source, a group on every bus,
// a lean on every band of the master, and the one reset.
//
// Eugene (09-25): *"the style should follow regular music panels"* — so a
// source's strip is the three things a channel strip has in reach, **M**, **S**
// and its level, and the rest of it (the level's fader with − and + for fine
// steps, sends off, a reset, and the tools) is one press away in a popover, the
// way a desk puts the insert and the aux behind the channel's own select.
//
// **The convention is the hardware desk's** (a Midas, a Yamaha, an SSL): MUTE
// lights red and SOLO lights amber when they are on, and both are dark when
// they are off; the letters are M and S. Every strip draws them the same size,
// in the same place, `HIT_GAP` apart, so one finger cannot press two.
//
// **Why a press sometimes seemed not to work** (round M1's probe, 20 taps a
// control on a phone): the mixer took every one of them, but the button was
// drawn from the view's snapshot, which is taken six times a second on a coarse
// pointer — so a button pressed and read back a tenth of a second later still
// showed the old state in a quarter of the taps, and a hand that pressed again
// undid what it had done. Every control here reads the mixer (and the desk)
// itself, through `useSyncExternalStore` on the control, so it is drawn in the
// frame of the press and not up to 167 ms later.

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Control } from '../control.ts';
import { sourceLevel } from '@deep-house/engine/source-mix';
import type { SourceMix } from '@deep-house/engine/source-mix';
import { deviceOf, sayParam } from '@deep-house/engine/device';
import type { Device, DeviceParam } from '@deep-house/engine/device';
import { STAGE, UNIT_OF_SPEC, stageOf } from '@deep-house/engine/stage';
import type { StageHow } from '@deep-house/engine/stage';
import { BY_ID as EFFECTS_BY_ID } from '@deep-house/engine/effects';
import { resolveParams } from '@deep-house/engine/effects/contract';
import type { LaneRow } from './model.ts';
import { settingsOf } from '@deep-house/engine/settings';
import { INK, KEY, SPACE } from './look.ts';
import { KEY_GAP, KEY_H, KEY_W, LEVEL_W, SOURCE_KEYS_W } from './layout.ts';
import { BAND_RANGE, BAND_STEP, LEVEL_STEP, deskFor } from './desk.ts';
import type { Band } from './desk.ts';
import { keyHelp, quiet, resume } from './help.tsx';

// **The per-instrument export is the private tier's** (Eugene, 09-22: kept for
// his wave analysis, never public). This glob is the one place a shipped file
// reaches `./private/`: behind `__PRIVATE_TOOLS__`, which only a dev or preview
// build sets, and against a folder `.releaseignore` strips, so a release build
// bundles none of it and a public checkout has nothing for it to find. With no
// exporter the WAV tool is simply not drawn in the strip's popover.
// Its shape is written here and not imported, so a public checkout, which has
// no private folder, still type-checks.
interface Exporter {
  exportSource(control: Control, voices: string[], o?: { dry?: string[] }): Promise<unknown>;
}
const PRIVATE: Record<string, () => Promise<Exporter>> =
  typeof __PRIVATE_TOOLS__ !== 'undefined' && __PRIVATE_TOOLS__ ? import.meta.glob<Exporter>('./private/source-export.ts') : {};
const exporter: (() => Promise<Exporter>) | null = Object.values(PRIVATE)[0] ?? null;

/** A strip's buttons: this big, this far apart, and no nearer. */
export const HIT_W = KEY_W;
export const HIT_H = KEY_H;
export const HIT_GAP = KEY_GAP;
/**
 * How far a strip key's press reaches, square: 32, the key and half of the
 * gap round it on every side (8 across, the row's 4 inset and half its 4 gap
 * down), so a finger at a phone's scale has a 32-pixel target.
 */
export const HIT_REACH = KEY_W + KEY_GAP;
/** the level's button, which carries its number */
export { LEVEL_W };
/** How much of a source row the strip takes, from its right edge. */
export const STRIP_CONTROLS_W = SOURCE_KEYS_W;

/** The mixer, read the moment it changes. */
const useMix = (control: Control): SourceMix => useSyncExternalStore(control.subscribe, () => control.sourceMix, () => control.sourceMix);
const useDesk = (control: Control) => {
  const desk = deskFor(control);
  return useSyncExternalStore(control.subscribe, desk.state, desk.state);
};

/** What lights, and in which colour: the desk's own convention. */
const LIT: Record<string, string> = { mute: INK.red, solo: INK.amber, dry: INK.bright };

/** One button of a strip, drawn in SVG: role, keys, and a press that selects nothing. */
function Key({ x, y = 0, w = HIT_W, h = HIT_H, text, name, on, lit, disabled, act, pressed, title, haspopup, expanded, glyph = false, reach = false }: {
  x: number; y?: number; w?: number; h?: number; text: string; name: string; on: boolean; lit: string;
  disabled: boolean; act: () => void; pressed?: boolean; title: string; haspopup?: boolean; expanded?: boolean; glyph?: boolean;
  /** the press reaches `HIT_REACH` square round the key (a strip's keys, whose gaps leave it the room) */
  reach?: boolean;
}) {
  const ink = on ? INK.ground : INK.type;
  return (
    <g role="button" tabIndex={disabled ? -1 : 0} aria-label={name}
      aria-pressed={pressed} aria-disabled={disabled} aria-haspopup={haspopup ? 'dialog' : undefined} aria-expanded={expanded}
      className={`key${on ? ' on' : ''}`}
      onClick={(e) => { e.stopPropagation(); if (!disabled) act(); }}
      // a press is a press: it starts no text selection across the view (round K9)
      onMouseDown={(e) => e.preventDefault()}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!disabled) act(); } }}
      style={{ cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.3 : 1 }}>
      <title>{title}</title>
      {/* **a finger's reach** (the deep review of 10-08): the key is drawn 24 by
          20, and on a phone's square that is its size in pixels; its press
          reaches `HIT_REACH` square, out into half the gap round it, so two
          neighbours' reaches meet and never overlap. Unpainted strokes along
          its edges, which a press finds and a box does not: the key's drawn
          size, its place and its gaps are what they were. Transparent and
          not none: WebKit finds no stroke a style says is none, whatever its
          pointer-events, and its keys reached only as far as they were drawn */}
      {reach && (w < HIT_REACH || h < HIT_REACH) ? (
        <g fill="none" stroke="transparent" pointerEvents="stroke" aria-hidden="true">
          {h < HIT_REACH ? <path d={`M${x} ${y}H${x + w}M${x} ${y + h}H${x + w}`} strokeWidth={HIT_REACH - h} /> : null}
          {w < HIT_REACH ? <path d={`M${x} ${y}V${y + h}M${x + w} ${y}V${y + h}`} strokeWidth={HIT_REACH - w} /> : null}
        </g>
      ) : null}
      <rect x={x} y={y} width={w} height={h} rx={2} fill={on ? lit : INK.sunken} stroke={on ? lit : INK.edge} strokeWidth={1} />
      {glyph ? <DeviceGlyph x={x + GLYPH_IN} y={y + h / 2 - GLYPH / 2} ink={ink} /> : null}
      <text className={`k${on ? ' on' : ''}`} x={glyph ? x + w - GLYPH_IN : x + w / 2} y={y + h / 2 + 3.3} textAnchor={glyph ? 'end' : 'middle'} fill={ink}
        fontSize={KEY.font} fontWeight={400} fontFamily="inherit" pointerEvents="none">{text}</text>
    </g>
  );
}

/**
 * **Where the device is** (DESK-UX1, Eugene 10-05: the strip's key read `100`,
 * which says nothing of what is behind it): a small device at the key's left —
 * three short lines of unequal length, each with a fader's cap on it — in the
 * key's own ink, line work and no fill; the level with its unit at the right.
 */
const GLYPH = 7;
/** the glyph's and the number's inset from the key's edges */
const GLYPH_IN = 4;
function DeviceGlyph({ x, y, ink }: { x: number; y: number; ink: string }) {
  // [length, where the cap sits along it], top to bottom
  const lines: Array<[number, number]> = [[7, 2], [4.5, 3.5], [6, 4.5]];
  return (
    <g className="glyph" pointerEvents="none" aria-hidden="true">
      {lines.map(([len, cap], i) => {
        const ly = y + 0.5 + i * 3;
        return (
          <g key={i}>
            <line x1={x} y1={ly} x2={x + len} y2={ly} stroke={ink} strokeWidth={1} strokeLinecap="round" />
            <circle cx={x + cap} cy={ly} r={1.1} fill={ink} />
          </g>
        );
      })}
    </g>
  );
}

/**
 * A popover anchored to an SVG control: a small disclosure rather than a
 * hover-only tooltip, usable by a finger and by keys. It closes on a press
 * outside it and on Escape, never on a press of its own (the pointer-down of
 * its own controls is stopped), and a scroll of the page moves it with its
 * anchor rather than closing it.
 */
function Popover({ anchor, label, onClose, children }: {
  anchor: RefObject<SVGGElement | null>; label: string; onClose: () => void; children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const [at, setAt] = useState<{ left: number; top: number; maxHeight?: number }>({ left: -9999, top: -9999 });
  const close = useRef(onClose);
  close.current = onClose;
  // where the anchor stood when the box was placed, so a scroll of the page carries the box by as much
  const from = useRef<{ x: number; y: number; left: number; top: number; z: number } | null>(null);
  // **Where it opens** (M8, Eugene: *"some bus box popovers went off the screen
  // or too far"*): its top-left at the control's bottom-left, or its right
  // edge on the control's right edge where the control is near the pane's
  // right; above the control where there is no room below; and always inside
  // the graph's pane and the visual viewport, a spacing step in. The fault was
  // the type step: the popover is zoomed with the type (M6), and a fixed box's
  // own left and top are zoomed with it, so a place measured in the window's
  // pixels landed at 1.25 or 1.5 times as far — it is written here divided by
  // the zoom it is drawn at.
  //
  // **Placed once, never moved by its own growth** (DESK-UX1, Eugene 10-05:
  // the box was placed again whenever it grew, so a line opened near the foot
  // moved the whole box up and the slider was no longer under the pointer).
  // At open the side is chosen — below the control, or above where below has
  // no room for the box as measured — and the box's height is capped at the
  // room it has on that side and at 80 % of the visual viewport; what is past
  // that scrolls inside the box. A line opened later grows the box inside its
  // own frame, and nothing outside it moves.
  const place = () => {
    const el = panel.current;
    if (!anchor.current || !el) return;
    // measured whole, with no cap on it: what the box would be if it had the room
    el.style.maxHeight = 'none';
    const a = anchor.current.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const vv = window.visualViewport;
    const L = vv ? vv.offsetLeft : 0; const T = vv ? vv.offsetTop : 0;
    const R = L + (vv ? vv.width : window.innerWidth); const B = T + (vv ? vv.height : window.innerHeight);
    const M = SPACE.s; const GAP = SPACE.hair;
    const cap = 0.8 * (B - T);
    const want = Math.min(b.height, cap);
    const within = (L: number, T: number, R: number, B: number) => {
      let left = a.left + b.width > R - M ? a.right - b.width : a.left;
      left = Math.max(L + M, Math.min(left, R - M - b.width));
      const below = B - M - (a.bottom + GAP);
      const above = a.top - GAP - (T + M);
      // below where the box as measured fits there; above where it does not and above has more room
      const down = want <= below || below >= above;
      const room = Math.max(0, down ? below : above);
      const h = Math.min(want, room);
      const top = down ? a.bottom + GAP : a.top - GAP - h;
      // the side's room, but never less than the box opened at, and never past the bound's foot
      const maxHeight = Math.max(h, Math.min(cap, room, B - M - top));
      return { left, top: Math.max(T + M, top), maxHeight, fits: want <= room && b.width <= R - L - 2 * M };
    };
    // inside the graph's pane where the pane's visible part can hold the box;
    // where it cannot (a phone's one long page, with the pane half under the
    // edge and a device open — D0), the viewport is the bound, since a box
    // kept inside a pane that is itself off the screen is off the screen
    const pane = anchor.current.closest('.pane.graph');
    const p = pane ? pane.getBoundingClientRect() : null;
    let got = p ? within(Math.max(L, p.left), Math.max(T, p.top), Math.min(R, p.right), Math.min(B, p.bottom)) : within(L, T, R, B);
    // and only where the viewport does better: the box whole, or more of it
    // than the pane's part holds — a box that scrolls either way stays in the
    // pane, and is not set over the ring above it for no more room
    if (p && !got.fits) {
      const wide = within(L, T, R, B);
      if (wide.fits || wide.maxHeight > got.maxHeight + 1) got = wide;
    }
    const z = parseFloat(getComputedStyle(el).zoom) || 1;
    // (the cap is in the window's pixels; the box's own height is laid out under its zoom, so divided by it — as the place is)
    el.style.maxHeight = `${got.maxHeight / z}px`;
    from.current = { x: a.left, y: a.top, left: got.left, top: got.top, z };
    setAt({ left: got.left / z, top: got.top / z, maxHeight: got.maxHeight / z });
  };
  // **a scroll of the page carries the box with its anchor**, by exactly as far
  // as the anchor went; a scroll inside the box (its own table) is not one
  const carry = (e: Event) => {
    const el = panel.current; const f = from.current;
    if (!el || !f || !anchor.current) return;
    if (e.target instanceof Node && el.contains(e.target)) return;
    const a = anchor.current.getBoundingClientRect();
    setAt((s) => ({ ...s, left: (f.left + a.left - f.x) / f.z, top: (f.top + a.top - f.y) / f.z }));
  };
  useLayoutEffect(() => {
    place();
    panel.current?.querySelector<HTMLElement>('input, button')?.focus({ preventScroll: true });
    // the manual waits while a hand works (M4): it closes now, and may open
    // again, after its delay, once this is gone
    quiet();
    return () => { window.setTimeout(resume, 0); };
  }, []);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) close.current();
    };
    const gone = () => close.current();
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', gone);
    window.addEventListener('scroll', carry, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', gone);
      window.removeEventListener('scroll', carry, true);
    };
  }, []);
  const host = document.getElementById('machine');
  if (!host) return null;
  return createPortal(
    <div ref={panel} id={id} className="desk-pop" role="dialog" aria-modal="true" aria-label={label} style={at}
      onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
      // a portal's events still climb the React tree, to the box under the
      // control, whose own hover would take the key's page away (M8)
      onPointerMove={(e) => e.stopPropagation()} onPointerOver={(e) => e.stopPropagation()} onPointerOut={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        // **the focus stays in the box while it is open** (the deep review of
        // 10-08): Tab off its last control comes round to its first, and
        // Shift-Tab off its first to its last; Escape and a press outside close it
        if (e.key === 'Tab' && panel.current) {
          const keys = [...panel.current.querySelectorAll<HTMLElement>('button, input, select, summary, [tabindex]')]
            .filter((k) => k.tabIndex >= 0 && !(k as HTMLButtonElement).disabled && k.getClientRects().length > 0);
          if (!keys.length) return;
          const first = keys[0], last = keys[keys.length - 1];
          const at = document.activeElement;
          if (e.shiftKey ? (at === first || !panel.current.contains(at)) : (at === last || !panel.current.contains(at))) {
            e.preventDefault();
            (e.shiftKey ? last : first).focus({ preventScroll: true });
          }
          return;
        }
        if (e.key !== 'Escape') return;
        e.preventDefault();
        // **the focus goes back to the key that opened it** (M14, both reviews'
        // F2/F5): the anchor is the group round the key, which is not focusable,
        // so the key is found in it — or is it
        const a = anchor.current as unknown as HTMLElement | null;
        const key = a && (a.matches('[tabindex]') ? a : a.querySelector<HTMLElement>('[tabindex]'));
        onClose();
        key?.focus({ preventScroll: true });
      }}>
      <div className="desk-pop-title">{label}</div>
      {children}
    </div>,
    host,
  );
}

/**
 * A fader with − and + at its ends, for the fine steps a finger cannot make on a slider.
 *
 * `bare` (DESK-UX1, Eugene 10-05: the open line was drawn twice, `hpHz · 92.1 Hz`
 * and under it `hpHz 92.1 Hz` again): a fader opened under a device's line has no
 * head of its own, since the line above it is its label and its readout — amber
 * while moved, the value in its cell. The range keeps the whole name for a
 * reader. The strip's level and a band's lean keep their head: there the fader
 * is the line. A bare fader carries no manual page either (`page` unset): a
 * hand working it is not asking what it is, and the page that opened under the
 * drag every time (Eugene 10-05: *"not user friendly"*) is the device head's.
 */
function Fader({ name, value, min, max, step, text, onMove, onLet, stepBy, page, bare = false }: {
  name: string; value: number; min: number; max: number; step: number; text: string;
  onMove: (v: number) => void; onLet: () => void; stepBy: number; page?: string; bare?: boolean;
}) {
  const nudge = (d: number) => { onMove(Math.max(min, Math.min(max, +(value + d).toFixed(3)))); onLet(); };
  return (
    <div className={`desk-row${bare ? ' bare' : ''}`} {...(page ? keyHelp(page) : {})}>
      {bare ? null : <><span className="desk-name">{name}</span><output>{text}</output></>}
      <div className="desk-fader">
        <button type="button" aria-label={`${name} down a step`} onClick={() => nudge(-stepBy)} disabled={value <= min}>−</button>
        <input type="range" min={min} max={max} step={step} value={value} aria-label={name} aria-valuetext={text}
          onChange={(e) => onMove(Number(e.currentTarget.value))}
          onPointerUp={onLet} onKeyUp={onLet} />
        <button type="button" aria-label={`${name} up a step`} onClick={() => nudge(stepBy)} disabled={value >= max}>+</button>
      </div>
    </div>
  );
}

/**
 * **The device** (PLAN-DESK D0, Eugene 10-04: *"once we were raising the mids
 * we discovered we had low-pass filters sitting on the piano; if I had that
 * visible in the machine view … I would have got there faster"*): every
 * parameter the instrument's row carries, as the note renders it this theme —
 * the room's block where the row names one, the row's own numbers otherwise —
 * one line each with its value in its unit, the range its contract admits,
 * and, where a bird moves it, the knob's name and the number the spell set
 * for this theme; where a part writes it, the control's name. Opening it
 * writes no ledger line, because looking is not a desk move.
 *
 * **D1: a numeric line is a setter.** Pressed, it opens the level's fader
 * under that line only — one line open at a time, so the panel stays a table —
 * over the contract field's own range, with the row's value one press away
 * (`reset to 380 Hz`, as a band has `reset to −3.0 dB`). The next note of the instrument
 * renders from the moved number; a moved line is drawn in amber. Words, names,
 * switches, lists and a part the row does not build stay a reading.
 *
 * **Always shown** (DESK-UX1, Eugene 10-05): the strip's popover opens with
 * its fader, its keys and the device under them; the key that showed it, and
 * the session's memory of that key, are gone.
 */

/** A range as the row's title says it (the table has no room for a third column on a phone): the two ends. */
const rangeOf = (p: DeviceParam) => (p.kind === 'num' && p.min != null && p.max != null ? `${p.min}–${p.max}` : '');

/**
 * **How a device line's fader moves** (D1). The contract's range is the
 * fader's whole travel, so no line needs a range declared for it; but a corner
 * admitted from nought to 24 kHz stepped in two-hundredths is 120 Hz a step,
 * and a kick's 46 Hz or its 170 ms tail would be one step from nothing. So a
 * time or a frequency travels its range in ratio — a thousand steps over five
 * decades under its top, about 1.2 % a step — and everything else in equal
 * steps: two hundred over the span, a thousand where the span is under one, a
 * whole number a step for a count.
 */
interface Travel { n: number; to(v: number): number; from(pos: number): number }
export function travelOf(p: DeviceParam): Travel {
  const min = p.min ?? 0; const max = p.max ?? 1;
  const span = max - min;
  const tidy = (v: number) => Math.max(min, Math.min(max, +v.toPrecision(5)));
  if ((p.unit === 'hz' || p.unit === 'seconds' || p.unit === 'ms') && min >= 0 && !p.int && max > 0) {
    const lo = Math.max(min, max / 1e5) || max / 1e5;
    const n = 1000;
    const k = Math.log(max / lo);
    return {
      n,
      to: (v) => (v <= lo ? 0 : Math.min(n, (Math.log(v / lo) / k) * n)),
      from: (pos) => (pos <= 0 && min < lo ? min : tidy(lo * Math.exp((pos / n) * k))),
    };
  }
  if (p.int) {
    const n = span <= 1000 ? Math.max(1, Math.round(span)) : 200;
    return { n, to: (v) => ((v - min) / span) * n, from: (pos) => Math.round(min + (pos / n) * span) };
  }
  const n = span < 1 ? 1000 : 200;
  return { n, to: (v) => ((v - min) / span) * n, from: (pos) => tidy(min + (pos / n) * span) };
}

/**
 * **One numeric line, open** (D1, shared with the stage's in D2): the fader
 * over its line's range, travelling as `travelOf` says, with no head of its
 * own (the line above it is that), and the reset one press away — to the
 * instrument's row, or to the stage's room, the number it goes back to on it —
 * centred under the slider; and, where the move does not reach the sound that
 * is playing, the sentence that says what it waits for, under the fader.
 */
function LineFader({ p, backPage, backLabel, waits, onMove, onLet }: {
  p: DeviceParam; backPage: string; backLabel: string; waits?: string;
  onMove: (v: number | null, say: boolean) => void; onLet: () => void;
}) {
  const value = typeof p.value === 'number' ? p.value : 0;
  const travel = travelOf(p);
  const pos = +travel.to(value).toFixed(3);
  return (
    <>
      <Fader name={p.path} value={pos} min={0} max={travel.n} step={1} stepBy={1} text={sayParam(p)} bare
        onMove={(x) => onMove(travel.from(x), false)} onLet={onLet} />
      <div className="desk-keys desk-under">
        <button type="button" {...keyHelp(backPage)} className="desk-reset" aria-label={backLabel} disabled={p.row === undefined}
          onClick={() => onMove(null, true)}>reset to {sayParam({ ...p, value: p.row ?? p.value })}</button>
      </div>
      {waits ? <p className="desk-waits">{waits[0].toUpperCase() + waits.slice(1)}.</p> : null}
    </>
  );
}

/**
 * A device's head: whose it is and the facts of it, in one dim line under the
 * name; and how the panel is used — the paragraph that stood under the table
 * (DESK-UX1, Eugene 10-05), which a hand reads once. Where the head has a
 * manual page (a row's `key:param`, a stage box's `key:stageparam`) the head is
 * that page's trigger, and the page opens with the paragraph's own sentences
 * at its top — one tooltip, not a title and a page over each other (his word:
 * *"move it into the same tooltip as 'Press a number to move', and show it at
 * another trigger … above the top summary"*), and the fader under a line opens
 * nothing while a hand works it. Without a page (the dispatcher's own table)
 * the paragraph is the head's title.
 */
function DeviceHead({ name, facts, title, page }: { name: string; facts: string[]; title?: string; page?: string }) {
  return (
    <div className="desk-device-head" {...(page ? keyHelp(page) : { title })}>
      <span className="desk-name">{name}</span><span className="desk-device-facts">{facts.join(' · ')}</span>
    </div>
  );
}

/**
 * **An open line's fader, brought where the hand is** (DESK-UX1): the box does
 * not move when it grows, so a line opened at the foot of a long table would
 * open its fader under the box's edge; once it is drawn, the box's own scroll
 * brings the whole of it in.
 */
function SetRow({ children }: { children: ReactNode }) {
  const row = useRef<HTMLTableRowElement>(null);
  useEffect(() => { row.current?.scrollIntoView({ block: 'nearest' }); }, []);
  return <tr ref={row} className="desk-device-set"><td colSpan={2}>{children}</td></tr>;
}

/**
 * **A device's table, over the common shape** (D2): one line a parameter —
 * name, value in its unit, and a mark — a numeric line pressable where the
 * panel can move it, one line open at a time under itself, a moved line amber.
 * An instrument's row (D1), a stage block and an insert's effect are all drawn
 * by it, so the three read alike and none is a second table to keep in step.
 */
function ParamTable({ who, params, settable, open, toggle, mark, title, under, waiting }: {
  who: string; params: DeviceParam[]; settable: (p: DeviceParam) => boolean; open: string | null;
  toggle: (path: string) => void; mark: (p: DeviceParam) => string; title: (p: DeviceParam) => string;
  under: (p: DeviceParam) => ReactNode; waiting?: (p: DeviceParam) => boolean;
}) {
  return (
    <table className="desk-device-table" aria-label={`${who} parameters`}>
      <tbody>
        {params.flatMap((p) => {
          const can = settable(p);
          const isOpen = can && open === p.path;
          const cls = [p.knob ? 'knob' : p.control ? 'control' : '', can ? 'set' : '', p.row !== undefined ? 'moved' : '', isOpen ? 'open' : '', waiting && waiting(p) ? 'waits' : ''].filter(Boolean).join(' ');
          const line = (
            <tr key={p.path} className={cls || undefined}
              {...(can ? {
                role: 'button', tabIndex: 0, 'aria-expanded': isOpen, 'aria-label': `Set ${who} ${p.path}`,
                onClick: (e: { stopPropagation(): void }) => { e.stopPropagation(); toggle(p.path); },
                onMouseDown: (e: { preventDefault(): void }) => e.preventDefault(),
                onKeyDown: (e: { key: string; preventDefault(): void; stopPropagation(): void }) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggle(p.path); }
                },
              } : {})}
              title={title(p)} data-mark={mark(p) || undefined}>
              <th scope="row">{p.path}</th>
              {/* two columns and no third (Eugene, 10-04: *"most controls have empty space on the right,
                  only in Bassline some text there and it seems duplicating label"*): a mark that is
                  not a name — the ring's number after an arrow, "next theme", "default" — rides
                  after the value in the dim ink, and a knob's or a control's name is the title's */}
              <td className="v">{sayParam(p)}{mark(p) ? <span className="m"> · {mark(p)}</span> : null}</td>
            </tr>
          );
          if (!isOpen) return [line];
          return [line, <SetRow key={`${p.path}:set`}>{under(p)}</SetRow>];
        })}
      </tbody>
    </table>
  );
}

const NO_TIMBRES: string[] = [];

/** A number of a row or a block the panel can move: a number, in a range, with a value. */
const settableLine = (p: DeviceParam) => p.kind === 'num' && typeof p.value === 'number' && p.min != null && p.max != null;

/**
 * **An instrument's device on the strip**: its row (D0, D1), and where the
 * voice dispatches by timbre (`pad`, `keys`, round SOUNDS-R3) the dispatcher's
 * own lines — its table and its controls, read — and under them one device per
 * row the timbres this theme plays render through, each named by its timbres
 * and each a row like any other, with its setters: the drone pad's strings
 * with their breath, their corner, their voices.
 */
function DevicePanel({ control, voice, timbres }: { control: Control; voice: string; timbres: string[] }) {
  const r = control.readout();
  const track = r ? r.track : null;
  const state = useDesk(control);
  const device = useMemo(() => deviceOf(track ? settingsOf(track) : null, voice, timbres), [track, voice, timbres.join(' '), state.device]);
  if (!device) {
    return (
      <div className="desk-device" data-voice={voice}>
        <DeviceHead name={voice} facts={['a module voice, not a row']} />
        <p>Its numbers live in its module and no row declares them: nothing to list until it is one.</p>
      </div>
    );
  }
  const spell: Record<string, number> = (track && (track as { knobs?: Record<string, Record<string, number>> }).knobs?.[voice]) || {};
  const own = <RowDevice control={control} device={device} spell={spell} />;
  if (!device.parts.length) return own;
  // **One sound first, the routing folded under it** (Eugene, 10-04, on the
  // drone strip: *"it seems it has two instrument voices inside"* — it has
  // one: a theme plays a dispatcher through one row, and what read as a
  // second instrument was the pad's routing table drawn over the row). So the
  // row the theme plays comes first, as the instrument, and the dispatcher's
  // own table — words, read and not moved — sits folded under a line that
  // names it, for the hand that wants to see the routing.
  return (
    <>
      {device.parts.map((part) => (
        <RowDevice key={part.device.voice} control={control} device={part.device} spell={{}} through={{ voice, timbres: part.timbres }} />
      ))}
      <details className="desk-device-fold">
        <summary title={HOW_USED.dispatch}><span className="desk-name">{voice}</span><span className="desk-device-facts"> · the routing: one name for several sounds</span></summary>
        {own}
      </details>
    </>
  );
}

/**
 * A dispatcher's table as one line a timbre (Eugene, 10-04, on `timbres.stri… stringsPad`,
 * `timbres.stri… off` two lines deep): the timbre's name, the row it plays, and `held` where the
 * sustained role holds the patch; `by`, `none` and `otherwise` as they are.
 */
function timbreLines(params: DeviceParam[]): DeviceParam[] {
  const out: DeviceParam[] = [];
  const rows = new Map<string, { row?: string; sustain?: boolean }>();
  for (const p of params) {
    const m = /^timbres\.([^.]+)\.(row|sustain)$/.exec(p.path);
    if (!m) { out.push(p); continue; }
    const t = rows.get(m[1]) ?? {};
    if (m[2] === 'row') t.row = String(p.value); else t.sustain = p.value === true;
    rows.set(m[1], t);
  }
  for (const [name, t] of rows) out.push({ path: name, value: `${t.row ?? '—'}${t.sustain ? ' · held' : ''}`, unit: '', kind: 'name' });
  return out;
}

/** One row's device: its head, its lines (a number a setter), and the keys under them. */
function RowDevice({ control, device, spell, through }: {
  control: Control; device: Device; spell: Record<string, number>; through?: { voice: string; timbres: string[] };
}) {
  const voice = device.voice;
  const state = useDesk(control);
  const [open, setOpen] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const desk = deskFor(control);
  const dispatcher = device.topology === 'dispatch';
  const facts = through ? [
    `${through.voice} ${through.timbres.join(', ')}`, device.topology, `rev ${device.revision}`,
    device.voicedBy.length ? `voiced by ${device.voicedBy.join(', ')}` : device.block ? `${device.block} block` : 'frozen row', device.cost,
    ...(device.loudnessDb != null ? [`loudness ${device.loudnessDb > 0 ? '+' : ''}${device.loudnessDb} dB`] : []),
  ] : [
    device.topology, `rev ${device.revision}`, device.block ? `${device.block} block` : device.voicedBy.length ? `voiced by ${device.voicedBy.join(', ')}` : dispatcher ? 'by timbre' : 'frozen row', `${device.bus} bus`,
    `level ${device.level}${device.levelDb != null ? ` ${device.levelDb > 0 ? '+' : ''}${device.levelDb.toFixed(1)} dB` : ''}`,
    device.cost, ...(device.loudnessDb != null ? [`loudness ${device.loudnessDb > 0 ? '+' : ''}${device.loudnessDb} dB`] : []),
    ...(device.returns.length ? [`to ${device.returns.join(', ')}`] : []),
  ];
  // a device with no live line at all (a drum, a prepared voice) says so once in its head rather than on every line
  const allNext = device.params.some((p) => p.how === 'next') && !device.params.some((p) => p.how === 'live');
  if (allNext) facts.push('every line from the next note');
  const move = (p: DeviceParam) => (v: number | null, say: boolean) => { const got = desk.setParam(voice, p.path, v, say); setWhy(got.refused ?? null); };
  return (
    <div className="desk-device" data-voice={voice} {...(through ? { 'data-through': through.voice, 'data-timbre': through.timbres.join(' ') } : {})}>
      <DeviceHead name={through ? `${through.timbres.join(' · ')} · ${voice}` : voice} facts={facts} {...(dispatcher ? { title: HOW_USED.dispatch } : { page: 'key:param' })} />
      <ParamTable who={voice} params={dispatcher ? timbreLines(device.params) : device.params} settable={settableLine} open={open}
        toggle={(path) => { setWhy(null); setOpen(open === path ? null : path); }}
        // the number the ring set, after an arrow, where it moved a knob of this line; and, D1b, `next
        // note` where a move is heard from the next note only — a live line, the ordinary case, says
        // nothing. The knob's and a control's names are the title's
        mark={(p) => {
          const set = p.knob && typeof spell[p.knob.name] === 'number' ? spell[p.knob.name] : null;
          return [set != null ? `ring → ${sayParam({ ...p, value: set })}` : '', p.how === 'next' && !allNext ? 'next note' : ''].filter(Boolean).join(' · ');
        }}
        title={(p) => `${p.path}: ${sayParam(p)}${p.row !== undefined ? ` (the row's ${sayParam({ ...p, value: p.row })})` : ''}${rangeOf(p) ? `, in ${rangeOf(p)}` : ''}${p.knob ? `; the ${p.knob.name} knob, ${p.knob.min} to ${p.knob.max}, the ring's ${p.knob.bird}` : ''}${p.control ? `; a note's ${p.control.name}, ${p.control.min} to ${p.control.max}` : ''}${HOW_SAID[p.how ?? ''] ?? ''}${settableLine(p) ? '. Press to move it.' : ''}`}
        under={(p) => (
          <>
            <LineFader p={p} backPage="key:row" backLabel={`Row ${voice} ${p.path}`}
              onMove={move(p)} onLet={() => desk.saidParam(voice, p.path)} />
            {why ? <p role="status">Not moved: {why}.</p> : null}
          </>
        )} />
      {device.knobs.length ? <p>Knobs the voice computes from several of these: {device.knobs.map((k) => k.name).join(', ')}.</p> : null}
      {device.controls.length ? <p>A note may also write: {device.controls.map((c) => c.name).join(', ')}.</p> : null}
      {device.fault ? <p role="status">The moves are not played: {device.fault}.</p> : null}
    </div>
  );
}

/**
 * **How a dispatcher is read, said once** (DESK-UX1, Eugene 10-05): the
 * paragraph that stood under its table is the title of the fold's summary and
 * of its own head. A row's and a stage box's paragraphs open their manual pages
 * (`key:param`, `key:stageparam`), whose first sentences they are.
 */
const HOW_USED = {
  dispatch: 'One name for several sounds: each timbre a note names plays the row in its line. The rows this theme plays stand above it, each with its own numbers.',
} as const;

/** How an instrument's line reaches the sound, in words, for its title (D1b). */
const HOW_SAID: Record<string, string> = {
  live: '; live: a move is heard on the notes sounding now, and on every note after',
  next: '; next note: a move is heard from the next note, and a note sounding keeps its own',
};

/** What a stage line that does not reach the sound now is marked with, short, in the table's third column. */
const WAIT_MARK: Partial<Record<StageHow, string>> = { build: 'next theme', line: 'line writes it', absent: 'not built' };

/**
 * **A stage box's device** (PLAN-DESK D2): every line its block declares
 * (`@deep-house/engine/stage`) — the bass drive's are the effect's own
 * `ParamSpec`s, a bare node's a declared table — with the room's number, the
 * desk's where it moved one, and how a move reaches the sound: a live line
 * says nothing special; a line that waits for the next theme, or that a
 * program's line writes this theme, or whose box is not built, says so in its
 * mark and under its fader. The fields no line moves are listed with why.
 */
function StagePanel({ control, box }: { control: Control; box: string }) {
  const r = control.readout();
  const track = r ? r.track : null;
  const state = useDesk(control);
  const desk = deskFor(control);
  const [open, setOpen] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const playing = !!control.state.mix;
  const record = control.state.mix?.record ?? null;
  const dev = useMemo(() => stageOf(track ? settingsOf(track) : null, box, playing ? (path) => desk.stageHow(path) ?? 'unknown' : null),
    [track, box, state.stage, playing, record]);
  if (!dev) return null;
  // the table shows a line by its own name; its path is the block's, which the head names
  const full = new Map(dev.params.map((p) => [p.name, p.path]));
  // a stage line's own how is the stage's (`StageHow`), kept apart from an instrument line's (`DeviceHow`)
  const lines: Array<DeviceParam & { waits?: string; stage?: StageHow | null }> = dev.params.map(({ how, ...p }) => ({ ...p, path: p.name, stage: how }));
  const moved = dev.params.some((p) => state.stage[p.path] !== undefined);
  const move = (name: string) => (v: number | null, say: boolean) => { const got = desk.setStage(full.get(name)!, v, say); setWhy(got.refused ?? null); };
  const facts = [dev.block, dev.built ? 'built this theme' : 'not built this theme', `${dev.params.length} line${dev.params.length === 1 ? '' : 's'}`,
    ...(dev.fixed.length ? [`${dev.fixed.length} fixed`] : [])];
  return (
    <div className="desk-device" data-stage={box}>
      <DeviceHead name={dev.title} facts={facts} page="key:stageparam" />
      <ParamTable who={dev.title} params={lines} settable={settableLine} open={open}
        toggle={(path) => { setWhy(null); setOpen(open === path ? null : path); }}
        waiting={(p) => !!(p as { waits?: string }).waits}
        mark={(p) => { const how = (p as { stage?: StageHow | null }).stage; return how ? WAIT_MARK[how] ?? '' : ''; }}
        title={(p) => `${full.get(p.path)}: ${sayParam(p)}${p.row !== undefined ? ` (the room's ${sayParam({ ...p, value: p.row })})` : ''}${rangeOf(p) ? `, in ${rangeOf(p)}` : ''}${(p as { waits?: string }).waits ? `; ${(p as { waits?: string }).waits}` : ''}${settableLine(p) ? '. Press to move it.' : '. This room writes none.'}`}
        under={(p) => (
          <>
            <LineFader p={p} backPage="key:stageroom" backLabel={`Room ${dev.title} ${p.path}`}
              waits={(p as { waits?: string }).waits} onMove={move(p.path)} onLet={() => desk.saidStage(full.get(p.path)!)} />
            {why ? <p role="status">Not moved: {why}.</p> : null}
          </>
        )} />
      {/* the box's one reset (DESK-UX1): every line of it back to the room, dark while none is moved */}
      <div className="desk-keys">
        <button type="button" {...keyHelp('key:stageroom')} className="desk-reset" aria-label={`Room ${dev.title}`} disabled={!moved} onClick={() => desk.resetStage(box)}>reset</button>
      </div>
      {dev.fixed.length ? <p>Fixed here: {dev.fixed.map((f) => `${f.path.split('.').pop()} (${f.why})`).join('; ')}.</p> : null}
    </div>
  );
}

/**
 * **A lane insert's chain, read** (D2): the effect the rota put on the lane,
 * its declared `ParamSpec`s with the numbers this segment is built with — the
 * rolls written on the knobs they name, the rest at the effect's own default
 * — or, for a gesture of the stage's own, the six numbers it rolled. A
 * reading: an insert is built per note from the rota's segment, and moving
 * one is a later round's mechanism.
 */
function InsertPanel({ lane, treatment }: { lane: string; treatment: NonNullable<LaneRow['treatment']> }) {
  const fx = treatment.fx ?? null;
  const d = fx ? EFFECTS_BY_ID[fx.id] : null;
  if (!fx || !d) {
    const params: DeviceParam[] = Object.entries(treatment.settings).map(([path, value]) => ({ path, value, unit: '', kind: 'num' }));
    return (
      <div className="desk-device" data-insert={lane}>
        <DeviceHead name={treatment.kind} facts={['a gesture of the stage\'s own', `on ${lane}`]} />
        <ParamTable who={treatment.kind} params={params} settable={() => false} open={null} toggle={() => {}} mark={() => ''}
          title={(p) => `${p.path}: ${sayParam(p)}, as the rota rolled it for this segment`} under={() => null} />
        <p>The numbers the rota rolled for these bars. A reading: the desk does not move an insert yet.</p>
      </div>
    );
  }
  const values = resolveParams(d, fx.params);
  const params: DeviceParam[] = Object.entries(d.params).map(([path, spec]) => ({
    path, value: values[path] ?? spec.default, unit: UNIT_OF_SPEC[spec.unit], kind: 'num', min: spec.min, max: spec.max,
  }));
  return (
    <div className="desk-device" data-insert={lane}>
      <DeviceHead name={d.id} facts={[d.family, `${d.scope} insert`, d.cost, `on ${lane}`, `${treatment.settings.bars ?? '—'} bars`]} />
      <ParamTable who={d.id} params={params} settable={() => false} open={null} toggle={() => {}}
        mark={(p) => (p.path in fx.params ? '' : 'default')}
        title={(p) => `${p.path}: ${sayParam(p)}${rangeOf(p) ? `, in ${rangeOf(p)}` : ''}; ${p.path in fx.params ? 'as the rota rolled it for this segment' : 'the effect\'s own default'}`}
        under={() => null} />
      <p>The effect's declared knobs, as this segment builds it on each note. A reading: an insert is built per note from the rota's segment, so the desk does not move one yet.</p>
    </div>
  );
}

/** The stage boxes that are keys: every one whose block the engine declares. */
export const STAGE_KEYS: ReadonlySet<string> = new Set(Object.keys(STAGE));

/**
 * **A stage box, as a key** (D2): the box is the key, as a master row is a
 * band's, and behind it the box's device. A thin amber line along its foot
 * while any of its lines is moved.
 */
export function StageControl({ control, box, label, width, height }: { control: Control; box: string; label: string; width: number; height: number }) {
  const state = useDesk(control);
  const [open, setOpen] = useState(false);
  const ref = useRef<SVGGElement>(null);
  const decl = STAGE[box];
  if (!decl) return null;
  const moved = decl.lines.some((l) => state.stage[l.path] !== undefined);
  return (
    <g ref={ref} className="desk-stage" style={{ touchAction: 'manipulation' }}>
      <g role="button" tabIndex={0} aria-label={`Stage ${label}`} aria-haspopup="dialog" aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        onMouseDown={(e) => e.preventDefault()}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v); } }}
        style={{ cursor: 'pointer' }}>
        <rect width={width} height={height} fill="transparent" />
      </g>
      {moved ? <rect x={0} y={height - 2} width={width} height={2} fill={INK.amber} pointerEvents="none" /> : null}
      {open ? (
        <Popover anchor={ref} label={`stage · ${label.toLowerCase()}`} onClose={() => setOpen(false)}>
          <StagePanel control={control} box={box} />
        </Popover>
      ) : null}
    </g>
  );
}

/** **A lane insert, as a key** (D2): behind it the effect's declared knobs, read-only. */
export function InsertControl({ lane, treatment, width, height }: { lane: string; treatment: NonNullable<LaneRow['treatment']>; width: number; height: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<SVGGElement>(null);
  const label = treatment.kind.replace(/^fx:/, '');
  return (
    <g ref={ref} style={{ touchAction: 'manipulation' }}>
      <g role="button" tabIndex={0} aria-label={`Insert ${lane}`} aria-haspopup="dialog" aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        onMouseDown={(e) => e.preventDefault()}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v); } }}
        style={{ cursor: 'pointer' }}>
        <rect width={width} height={height} fill="transparent" />
      </g>
      {open ? (
        <Popover anchor={ref} label={`insert · ${label} on ${lane}`} onClose={() => setOpen(false)}>
          <InsertPanel lane={lane} treatment={treatment} />
        </Popover>
      ) : null}
    </g>
  );
}

/**
 * **The strip's one reset** (DESK-UX1, Eugene 10-05: *"'Reset strip' only
 * resets the sound but not the params; we should combine it as one tool to
 * reset everything in the popup"*): one press puts back everything the popover
 * holds — the level, mute, solo and sends of every instrument on the strip, and
 * every moved line of every device under it (the rows a dispatcher plays
 * through among them) — through the desk's own resets, one ledger line a layer
 * as each writes it. Dark (disabled) while nothing on the popover is moved.
 */
function StripReset({ control, voices, timbres, label }: { control: Control; voices: string[]; timbres: Record<string, string[]>; label: string }) {
  const mix = useMix(control);
  const state = useDesk(control);
  const desk = deskFor(control);
  const r = control.readout();
  const track = r ? r.track : null;
  // the rows whose moves this popover shows: each instrument's own, and the rows its timbres play this theme
  const rows = useMemo(() => {
    const out = new Set(voices);
    const settings = track ? settingsOf(track) : null;
    for (const v of voices) for (const part of deviceOf(settings, v, timbres[v] ?? NO_TIMBRES)?.parts ?? []) out.add(part.device.voice);
    return [...out];
  }, [track, voices.join(' '), JSON.stringify(timbres)]);
  const mixed = voices.some((v) => sourceLevel(mix, v) !== 1 || mix.mute.includes(v) || mix.solo.includes(v) || mix.dry.includes(v));
  const devices = rows.filter((v) => state.device[v] && Object.keys(state.device[v]).length);
  return (
    <button type="button" {...keyHelp('key:reset')} className="desk-reset" aria-label={`Reset ${label}`} disabled={!mixed && !devices.length}
      onClick={() => { if (mixed) desk.resetGroup(voices, label); for (const v of devices) desk.resetDevice(v); }}>reset</button>
  );
}

/**
 * **A source's channel strip**: M, S and its level, right-aligned on the
 * source's one line, and the popover behind the level.
 *
 * @param width the row's width: the strip stands at its right edge
 */
export function SourceControls({ control, voices, timbres = {}, label, width, height }: {
  control: Control; voices: string[]; timbres?: Record<string, string[]>; label: string; width: number; height: number;
}) {
  const mix = useMix(control);
  const desk = deskFor(control);
  const [open, setOpen] = useState(false);
  const level = useRef<SVGGElement>(null);
  const none = !voices.length;
  useEffect(() => { if (none) setOpen(false); }, [none]);
  const all = (k: 'mute' | 'solo' | 'dry') => !none && voices.every((v) => mix[k].includes(v));
  // a hair in from the row's right edge, as from its top and bottom (M5)
  const x0 = width - SOURCE_KEYS_W;
  const y = (height - HIT_H) / 2;
  const pct = none ? 100 : Math.round(sourceLevel(mix, voices[0]) * 100);
  const moved = voices.some((v) => sourceLevel(mix, v) !== 1) || all('dry');
  const say = voices.join(', ') || 'no instrument';
  return (
    <g className="desk-strip" style={{ touchAction: 'manipulation' }}>
      <Key reach x={x0} y={y} text="M" name={`Mute ${label}`} on={all('mute')} lit={LIT.mute} disabled={none} pressed={all('mute')}
        act={() => desk.toggle('mute', voices, label)} title={`Mute ${label}: ${say}. A shared instrument follows this everywhere.`} />
      <Key reach x={x0 + HIT_W + HIT_GAP} y={y} text="S" name={`Solo ${label}`} on={all('solo')} lit={LIT.solo} disabled={none} pressed={all('solo')}
        act={() => desk.toggle('solo', voices, label)} title={`Solo ${label}: ${say}. Solos add up; a mute wins.`} />
      <g ref={level}>
        <Key reach x={x0 + 2 * (HIT_W + HIT_GAP)} y={y} w={LEVEL_W} text={`${pct} %`} name={`Strip ${label}`} glyph
          on={false} lit={INK.bright} disabled={none} haspopup expanded={open}
          act={() => setOpen((v) => !v)} title={`${label}: level ${voices.map((v) => `${v} ${Math.round(sourceLevel(mix, v) * 100)} %`).join(', ') || '—'}${all('dry') ? ', sends off' : ''}. Press for the fader, sends and tools.`} />
        {moved ? <rect x={x0 + 2 * (HIT_W + HIT_GAP)} y={y + HIT_H - 2} width={LEVEL_W} height={2} fill={INK.amber} pointerEvents="none" /> : null}
        {/* sends off: a small D in the key's corner, its own mark and never part of the number (M8: it read "100D") */}
        {all('dry') ? (
          <text className="dry-mark" data-dry="" x={x0 + 2 * (HIT_W + HIT_GAP) + LEVEL_W - 2.5} y={y + 6.5} textAnchor="end" fontSize={5.5} fontFamily="inherit" pointerEvents="none">D</text>
        ) : null}
      </g>
      {open ? (
        <Popover anchor={level} label={`${label} · strip`} onClose={() => setOpen(false)}>
          {voices.map((v) => {
            const p = Math.round(sourceLevel(mix, v) * 100);
            return (
              <Fader key={v} name={v} value={p} min={0} max={200} step={1} stepBy={LEVEL_STEP} text={`${p} %`} page="key:level"
                onMove={(n) => desk.setLevel(v, n / 100, label, false)} onLet={() => desk.said(label, v, null)} />
            );
          })}
          <div className="desk-keys">
            <button type="button" {...keyHelp('key:dry')} className={`desk-toggle${all('dry') ? ' on' : ''}`} aria-pressed={all('dry')} aria-label={`Dry ${label}`}
              onClick={() => desk.toggle('dry', voices, label)}>{all('dry') ? 'sends off' : 'sends on'}</button>
            <StripReset control={control} voices={voices} timbres={timbres} label={label} />
          </div>
          {voices.map((v) => <DevicePanel key={v} control={control} voice={v} timbres={timbres[v] ?? NO_TIMBRES} />)}
          {/* the tools on one line (DESK-UX1): the name at the left, the key at the right, and the status under them only while there is one */}
          {exporter ? (
            <div className="desk-tools" aria-label="tools">
              <span className="desk-name">tools</span>
              <button type="button" aria-label={`Export ${label} WAV`} disabled={control.state.render.busy}
                // the tool is a chunk loaded at the press; a page left open across a rebuild asks for a chunk that
                // is gone, and a press that did nothing (Eugene, 10-05) now says so instead
                onClick={() => {
                  exporter!().then((m) => m.exportSource(control, voices, { dry: control.sourceMix.dry.filter((v) => voices.includes(v)) }))
                    .catch(() => { control.state.render = { busy: false, note: 'the export tool could not load: reload the page', ok: false }; control.emit(); });
                }}>
                WAV · 8 bars from here
              </button>
              <div className="desk-status" role="status">{control.state.render.note}</div>
            </div>
          ) : null}
        </Popover>
      ) : null}
    </g>
  );
}

/**
 * **A bus's group**: its name on the strip is a key, and behind it the bus's
 * mute, solo and sends off — the source mixer asked for every instrument the
 * lanes put on that bus this theme.
 */
export function BusControls({ control, bus, voices, width }: { control: Control; bus: string; voices: string[]; width: number }) {
  const mix = useMix(control);
  const desk = deskFor(control);
  const [open, setOpen] = useState(false);
  const head = useRef<SVGGElement>(null);
  const none = !voices.length;
  const all = (k: 'mute' | 'solo' | 'dry') => !none && voices.every((v) => mix[k].includes(v));
  const what = `the ${bus} bus`;
  return (
    <g ref={head} className="desk-strip" style={{ touchAction: 'manipulation' }}>
      <g role="button" tabIndex={none ? -1 : 0} aria-label={`Bus ${bus}`} aria-haspopup="dialog" aria-expanded={open} aria-disabled={none}
        onClick={(e) => { e.stopPropagation(); if (!none) setOpen((v) => !v); }}
        onMouseDown={(e) => e.preventDefault()}
        onKeyDown={(e) => { e.stopPropagation(); if ((e.key === 'Enter' || e.key === ' ') && !none) { e.preventDefault(); setOpen((v) => !v); } }}
        style={{ cursor: none ? 'default' : 'pointer' }}>
        <title>{`${bus}: ${voices.join(', ') || 'nothing on it this theme'}. Press for its mute, solo and sends.`}</title>
        <rect width={width} height={16} fill="transparent" />
      </g>
      {/* what the group has on, as three letters under the name: a value, lit or dark */}
      {(['mute', 'solo', 'dry'] as const).map((k, i) => (
        <text key={k} className={`msd ${k}${all(k) ? ' lit' : ''}`} x={5 + i * 11} y={36} fill={all(k) ? LIT[k] : INK.line} fontSize={7.5} fontWeight={700} fontFamily="inherit" pointerEvents="none">
          {k === 'mute' ? 'M' : k === 'solo' ? 'S' : 'D'}
        </text>
      ))}
      {open ? (
        <Popover anchor={head} label={`${bus} bus · group`} onClose={() => setOpen(false)}>
          <div className="desk-keys">
            {(['mute', 'solo', 'dry'] as const).map((k) => (
              <button key={k} type="button" {...keyHelp(`key:${k}`)} className={`desk-toggle ${k}${all(k) ? ' on' : ''}`} aria-pressed={all(k)}
                aria-label={`${k === 'dry' ? 'Dry' : k === 'mute' ? 'Mute' : 'Solo'} bus ${bus}`}
                onClick={() => desk.toggle(k, voices, what)}>{k === 'dry' ? 'sends off' : k === 'mute' ? 'M' : 'S'}</button>
            ))}
            <button type="button" {...keyHelp('key:reset')} className="desk-reset" aria-label={`Reset bus ${bus}`}
              disabled={!voices.some((v) => sourceLevel(mix, v) !== 1 || mix.mute.includes(v) || mix.solo.includes(v) || mix.dry.includes(v))}
              onClick={() => desk.resetGroup(voices, what)}>reset</button>
          </div>
          <p>{voices.length} on it this theme: {voices.join(', ')}.</p>
        </Popover>
      ) : null}
    </g>
  );
}

/**
 * **A band of the master, leant.** The row of the rack is the key; behind it a
 * fader over ±6 dB of the room's own gain, − and + half a decibel, and the room.
 */
export function BandControl({ control, band, label, width, height }: { control: Control; band: Band; label: string; width: number; height: number }) {
  const state = useDesk(control);
  const desk = deskFor(control);
  const [open, setOpen] = useState(false);
  const row = useRef<SVGGElement>(null);
  // a lean made under a cast waits for it to land, and the fader shows that lean (10-08)
  const waits = state.waits[band];
  const lean = waits ?? state.bands[band] ?? 0;
  const room = desk.planned(band);
  const none = room == null;
  return (
    <g ref={row} style={{ touchAction: 'manipulation' }}>
      <g role="button" tabIndex={none ? -1 : 0} aria-label={`Band ${label}`} aria-haspopup="dialog" aria-expanded={open} aria-disabled={none}
        onClick={(e) => { e.stopPropagation(); if (!none) setOpen((v) => !v); }}
        onMouseDown={(e) => e.preventDefault()}
        onKeyDown={(e) => { e.stopPropagation(); if ((e.key === 'Enter' || e.key === ' ') && !none) { e.preventDefault(); setOpen((v) => !v); } }}
        style={{ cursor: none ? 'default' : 'pointer' }}>
        <rect width={width} height={height} fill="transparent" />
      </g>
      {lean ? <rect x={0} y={height - 2} width={width} height={2} fill={INK.amber} pointerEvents="none" /> : null}
      {open && !none ? (
        <Popover anchor={row} label={`master · ${label.toLowerCase()}`} onClose={() => setOpen(false)}>
          <Fader name={`${label.toLowerCase()} lean`} value={lean} min={-BAND_RANGE} max={BAND_RANGE} step={0.1} stepBy={BAND_STEP} page="key:lean"
            text={waits !== undefined ? `${lean > 0 ? '+' : ''}${lean.toFixed(1)} dB · waits for the cast` : `${lean > 0 ? '+' : ''}${lean.toFixed(1)} dB · ${(room! + lean).toFixed(1)} dB`}
            onMove={(v) => desk.setBand(band, v, false)} onLet={() => desk.said('the master', null, band)} />
          <div className="desk-keys desk-under">
            <button type="button" {...keyHelp('key:room')} className="desk-reset" aria-label={`Room ${label}`} onClick={() => desk.setBand(band, 0)} disabled={!lean}>reset to {room!.toFixed(1)} dB</button>
          </div>
          <p>A lean over the room this seed plays in. It goes back to the room when a cast arrives and when the view closes; one made while a cast is arriving is leant once it lands.</p>
        </Popover>
      ) : null}
    </g>
  );
}

/** Everything the desk has moved, back to clean: next to the strips it resets. */
export function ResetAll({ control, x, y }: { control: Control; x: number; y: number }) {
  const mix = useMix(control);
  const state = useDesk(control);
  const dirty = control.sourceMixOn || Object.keys(state.bands).length > 0 || Object.keys(state.device).length > 0 || Object.keys(state.stage).length > 0;
  void mix;
  return (
    <g style={{ touchAction: 'manipulation' }}>
      <Key x={x} y={y} w={62} h={HIT_H} text="RESET" name="Reset the desk" on={false} lit={INK.bright} disabled={!dirty}
        act={() => deskFor(control).resetAll()} title="Every strip back to unity, nothing muted, soloed or dry, every device at its row, every stage block and the master at the room" />
    </g>
  );
}
