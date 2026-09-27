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

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Control } from '../control.ts';
import { sourceLevel } from '@deep-house/engine/source-mix';
import type { SourceMix } from '@deep-house/engine/source-mix';
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
function Key({ x, y = 0, w = HIT_W, h = HIT_H, text, name, on, lit, disabled, act, pressed, title, haspopup, expanded }: {
  x: number; y?: number; w?: number; h?: number; text: string; name: string; on: boolean; lit: string;
  disabled: boolean; act: () => void; pressed?: boolean; title: string; haspopup?: boolean; expanded?: boolean;
}) {
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
      <rect x={x} y={y} width={w} height={h} rx={2} fill={on ? lit : INK.sunken} stroke={on ? lit : INK.edge} strokeWidth={1} />
      <text className={`k${on ? ' on' : ''}`} x={x + w / 2} y={y + h / 2 + 3.3} textAnchor="middle" fill={on ? INK.ground : INK.type}
        fontSize={KEY.font} fontWeight={400} fontFamily="inherit" pointerEvents="none">{text}</text>
    </g>
  );
}

/**
 * A popover anchored to an SVG control: a small disclosure rather than a
 * hover-only tooltip, usable by a finger and by keys. It closes on a press
 * outside it and on Escape, never on a press of its own (the pointer-down of
 * its own controls is stopped), and a scroll moves it with its anchor rather
 * than closing it.
 */
function Popover({ anchor, label, onClose, children }: {
  anchor: RefObject<SVGGElement | null>; label: string; onClose: () => void; children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const [at, setAt] = useState({ left: -9999, top: -9999 });
  const close = useRef(onClose);
  close.current = onClose;
  // **Where it opens** (M8, Eugene: *"some bus box popovers went off the screen
  // or too far"*): its top-left at the control's bottom-left, or its right
  // edge on the control's right edge where the control is near the pane's
  // right; above the control where there is no room below; and always inside
  // the graph's pane and the visual viewport, a spacing step in. The fault was
  // the type step: the popover is zoomed with the type (M6), and a fixed box's
  // own left and top are zoomed with it, so a place measured in the window's
  // pixels landed at 1.25 or 1.5 times as far — it is written here divided by
  // the zoom it is drawn at.
  const place = () => {
    if (!anchor.current || !panel.current) return;
    const a = anchor.current.getBoundingClientRect();
    const b = panel.current.getBoundingClientRect();
    const vv = window.visualViewport;
    let L = vv ? vv.offsetLeft : 0; let T = vv ? vv.offsetTop : 0;
    let R = L + (vv ? vv.width : window.innerWidth); let B = T + (vv ? vv.height : window.innerHeight);
    const pane = anchor.current.closest('.pane.graph');
    if (pane) { const p = pane.getBoundingClientRect(); L = Math.max(L, p.left); T = Math.max(T, p.top); R = Math.min(R, p.right); B = Math.min(B, p.bottom); }
    const M = SPACE.s; const GAP = SPACE.hair;
    let left = a.left + b.width > R - M ? a.right - b.width : a.left;
    left = Math.max(L + M, Math.min(left, R - M - b.width));
    let top = a.bottom + GAP;
    if (top + b.height > B - M && a.top - GAP - b.height >= T + M) top = a.top - GAP - b.height;
    top = Math.max(T + M, Math.min(top, B - M - b.height));
    const z = parseFloat(getComputedStyle(panel.current).zoom) || 1;
    setAt({ left: left / z, top: top / z });
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
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', gone);
      window.removeEventListener('scroll', place, true);
    };
  }, []);
  const host = document.getElementById('machine');
  if (!host) return null;
  return createPortal(
    <div ref={panel} id={id} className="desk-pop" role="dialog" aria-label={label} style={at}
      onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
      // a portal's events still climb the React tree, to the box under the
      // control, whose own hover would take the key's page away (M8)
      onPointerMove={(e) => e.stopPropagation()} onPointerOver={(e) => e.stopPropagation()} onPointerOut={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
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

/** A fader with − and + at its ends, for the fine steps a finger cannot make on a slider. */
function Fader({ name, value, min, max, step, text, onMove, onLet, stepBy, page }: {
  name: string; value: number; min: number; max: number; step: number; text: string;
  onMove: (v: number) => void; onLet: () => void; stepBy: number; page: string;
}) {
  const nudge = (d: number) => { onMove(Math.max(min, Math.min(max, +(value + d).toFixed(3)))); onLet(); };
  return (
    <div className="desk-row" {...keyHelp(page)}>
      <span className="desk-name">{name}</span><output>{text}</output>
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
 * **A source's channel strip**: M, S and its level, right-aligned on the
 * source's one line, and the popover behind the level.
 *
 * @param width the row's width: the strip stands at its right edge
 */
export function SourceControls({ control, voices, label, width, height }: {
  control: Control; voices: string[]; label: string; width: number; height: number;
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
      <Key x={x0} y={y} text="M" name={`Mute ${label}`} on={all('mute')} lit={LIT.mute} disabled={none} pressed={all('mute')}
        act={() => desk.toggle('mute', voices, label)} title={`Mute ${label}: ${say}. A shared instrument follows this everywhere.`} />
      <Key x={x0 + HIT_W + HIT_GAP} y={y} text="S" name={`Solo ${label}`} on={all('solo')} lit={LIT.solo} disabled={none} pressed={all('solo')}
        act={() => desk.toggle('solo', voices, label)} title={`Solo ${label}: ${say}. Solos add up; a mute wins.`} />
      <g ref={level}>
        <Key x={x0 + 2 * (HIT_W + HIT_GAP)} y={y} w={LEVEL_W} text={String(pct)} name={`Strip ${label}`}
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
            <button type="button" {...keyHelp('key:reset')} aria-label={`Reset ${label}`} onClick={() => desk.resetGroup(voices, label)}>reset strip</button>
          </div>
          {exporter ? (
            <div className="desk-tools" aria-label="tools">
              <span className="desk-name">tools</span>
              <button type="button" aria-label={`Export ${label} WAV`} disabled={control.state.render.busy}
                onClick={() => { void exporter!().then((m) => m.exportSource(control, voices, { dry: control.sourceMix.dry.filter((v) => voices.includes(v)) })); }}>
                WAV · 8 bars from here
              </button>
              <div className="desk-status" role="status">{control.state.render.note}</div>
            </div>
          ) : null}
          <p>All parts playing {voices.length > 1 ? 'these instruments' : 'this instrument'} follow this strip.</p>
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
            <button type="button" {...keyHelp('key:reset')} aria-label={`Reset bus ${bus}`} onClick={() => desk.resetGroup(voices, what)}>reset</button>
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
  const lean = state.bands[band] ?? 0;
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
            text={`${lean > 0 ? '+' : ''}${lean.toFixed(1)} dB · ${(room! + lean).toFixed(1)} dB`}
            onMove={(v) => desk.setBand(band, v, false)} onLet={() => desk.said('the master', null, band)} />
          <div className="desk-keys">
            <button type="button" {...keyHelp('key:room')} aria-label={`Room ${label}`} onClick={() => desk.setBand(band, 0)} disabled={!lean}>the room: {room!.toFixed(1)} dB</button>
          </div>
          <p>A lean over the room this seed plays in. It goes back to the room when a cast arrives and when the view closes.</p>
        </Popover>
      ) : null}
    </g>
  );
}

/** Everything the desk has moved, back to clean: next to the strips it resets. */
export function ResetAll({ control, x, y }: { control: Control; x: number; y: number }) {
  const mix = useMix(control);
  const state = useDesk(control);
  const dirty = control.sourceMixOn || Object.keys(state.bands).length > 0;
  void mix;
  return (
    <g style={{ touchAction: 'manipulation' }}>
      <Key x={x} y={y} w={62} h={HIT_H} text="RESET" name="Reset the desk" on={false} lit={INK.bright} disabled={!dirty}
        act={() => deskFor(control).resetAll()} title="Every strip back to unity, nothing muted, soloed or dry, and the master at the room" />
    </g>
  );
}
