// The desk: what a hand may move on the machine view, and the line each move
// writes down.
//
// Eugene (09-25): *"add more interactive controls where possible without heavy
// changes in the engine, to give a more interactive, tunable UX for quick
// experiments on sound and grounded feedback for agents."* Round M1 read what
// the engine hands out today (`notes/rounds/machine-m1.md` has the list) and
// built the cheapest three, none of which needs a line of the engine changed:
//
//   **a source's strip** — mute, solo, sends off (dry) and a level — which is
//   the listening mixer the engine already has (`source-mix.ts`) and the
//   control already carries (`setSourceMix`);
//
//   **a bus's mute, solo and sends off**, which is the same mixer asked for
//   every instrument the lanes put on that bus: a group on a desk;
//
//   **the master's five band gains**, as an offset over the room the set is
//   in, written through the one door the master's handle offers
//   (`master.param('air.gain')`), ramped over 40 ms so a move is not a click.
//
// **None of it is the link, and none of it outlives the view** (the link is a
// promise; a view that only looks must not be a different record). Every move
// writes one ledger line — `desk` — carrying what was moved, to what and over
// what, which is the grounded feedback: a report can hold *"the kick bus was
// muted"* beside the clip it explains.
//
// **The bands go back to the room before the room moves.** A cast walks the
// master to the arriving seed's room over a bar (`retuneMaster` in mix.ts),
// through a ramp line that remembers where it put each band; an offset written
// behind its back would be a step at the next cast. So the desk lets the bands
// go the moment a cast is asked for — before the swap that retunes — and a
// stop and a start, which build a new master, find nothing to let go. Both
// write the line that says so.

import { note } from '../ledger.ts';
import type { Control } from '../control.ts';
import type { SourceMix } from '@deep-house/engine/source-mix';

/** The master's five bands a hand may lean, by the path the master's handle names. */
export const BANDS = ['lowShelf', 'lowMid', 'mid', 'presence', 'air'] as const;
export type Band = typeof BANDS[number];
/** Which master row is which band. */
export const BAND_OF: Record<string, Band> = {
  'm:lowShelf': 'lowShelf', 'm:lowMid': 'lowMid', 'm:mid': 'mid', 'm:presence': 'presence', 'm:air': 'air',
};
/** How far a hand may lean a band, either way, in decibels; and a step of − or +. */
export const BAND_RANGE = 6;
export const BAND_STEP = 0.5;
/** A level's step on the − and + of a strip's popover, in percent. */
export const LEVEL_STEP = 1;
/** How long a band move ramps: long enough not to click, short enough to hear at once. */
const RAMP = 0.04;

const DB_OF: Record<Band, string> = {
  lowShelf: 'lowShelfDb', lowMid: 'lowMidDb', mid: 'midDb', presence: 'presenceDb', air: 'airDb',
};

type Kind = 'mute' | 'solo' | 'dry';
const WORD: Record<Kind, [string, string]> = {
  mute: ['muted', 'unmuted'], solo: ['soloed', 'unsoloed'], dry: ['sent dry', 'given its sends back'],
};

/** What the desk has leant, for the view to draw and a scenario to read. */
export interface DeskState {
  /** band → offset in dB over the room, only where one is leant */
  bands: Partial<Record<Band, number>>;
}

export interface Desk {
  state(): DeskState;
  /** the room's own gain on a band, where a set is playing */
  planned(band: Band): number | null;
  /** the band's gain as the node reads it now */
  reading(band: Band): number | null;
  /**
   * lean a band to an offset over the room; nought takes the lean away. A
   * slider under a finger moves it with `say` false, and writes its one line
   * when it is let go (`said`), so a drag is one line and not forty.
   */
  setBand(band: Band, offset: number, say?: boolean): void;
  /** mute, solo or dry a group of instruments: one source's, or a bus's */
  toggle(kind: Kind, voices: string[], what: string): void;
  /** a level on one instrument, 0–2 */
  setLevel(voice: string, level: number, what: string, say?: boolean): void;
  /** the line a slider let go of writes: where the level or the band now stands */
  said(what: string, voice: string | null, band: Band | null): void;
  /** one source's strip, or a bus's, back to clean */
  resetGroup(voices: string[], what: string): void;
  /** everything back: the mixer to clean and the bands to the room */
  resetAll(): void;
  /** follow the set: let the bands go before a cast, forget a master that went */
  follow(): void;
  /** the view is closing: let everything go */
  release(): void;
}

const desks = new WeakMap<Control, Desk>();

/** The one desk a control has. */
export function deskFor(control: Control): Desk {
  const had = desks.get(control);
  if (had) return had;
  const made = makeDesk(control);
  desks.set(control, made);
  return made;
}

function makeDesk(control: Control): Desk {
  let bands: Partial<Record<Band, number>> = {};
  let master: unknown = null;
  // one value until something changes, so a component may subscribe to it
  let snap: DeskState = { bands: {} };
  const moved = () => { snap = { bands: { ...bands } }; };

  const mix = () => control.state.mix;
  const paramOf = (band: Band) => {
    const m = mix();
    return m ? m.master.param(`${band}.gain`) : null;
  };
  const planned = (band: Band): number | null => {
    const m = mix();
    if (!m) return null;
    const table = m.masterSettings.master as unknown as Record<string, number>;
    const v = table[DB_OF[band]];
    return Number.isFinite(v) ? v : null;
  };
  const write = (band: Band, value: number) => {
    const p = paramOf(band);
    const ctx = control.state.ctx;
    if (!p || !ctx) return;
    const at = ctx.currentTime;
    p.cancelScheduledValues(at);
    p.setValueAtTime(p.value, at);
    p.linearRampToValueAtTime(value, at + RAMP);
  };
  const emit = () => control.emit();

  const mixState = (): SourceMix => control.sourceMix;
  const put = (next: SourceMix) => control.setSourceMix(next);

  const desk: Desk = {
    state: () => snap,
    planned,
    reading: (band) => { const p = paramOf(band); return p ? +p.value.toFixed(2) : null; },
    setBand(band, offset, say = true) {
      const room = planned(band);
      if (room == null) return;
      const lean = +Math.max(-BAND_RANGE, Math.min(BAND_RANGE, offset)).toFixed(2);
      if ((bands[band] ?? 0) === lean) return;
      master = mix() ? mix()!.master : null;
      if (lean === 0) delete bands[band]; else bands[band] = lean;
      moved();
      write(band, room + lean);
      if (say) note('desk', lean === 0 ? `the master's ${band} went back to the room` : `the master's ${band} was leant ${lean > 0 ? '+' : ''}${lean} dB`, {
        band, offset: lean, room: +room.toFixed(2), gain: +(room + lean).toFixed(2),
      });
      emit();
    },
    toggle(kind, voices, what) {
      if (!voices.length) return;
      const cur = mixState();
      const off = voices.every((v) => cur[kind].includes(v));
      const list = off ? cur[kind].filter((v) => !voices.includes(v)) : [...new Set([...cur[kind], ...voices])];
      put({ ...cur, [kind]: list });
      note('desk', `${what} was ${WORD[kind][off ? 1 : 0]}`, {
        voices: voices.join('+'), muted: control.sourceMix.mute.join('+') || '—', soloed: control.sourceMix.solo.join('+') || '—',
      });
    },
    setLevel(voice, level, what, say = true) {
      const cur = mixState();
      const v = +Math.max(0, Math.min(2, level)).toFixed(2);
      if ((cur.gain?.[voice] ?? 1) === v) return;
      put({ ...cur, gain: { ...cur.gain, [voice]: v } });
      if (say) note('desk', `${what}'s ${voice} went to ${Math.round(v * 100)} %`, { voice, level: v, db: v > 0 ? +(20 * Math.log10(v)).toFixed(1) : '−∞' });
    },
    said(what, voice, band) {
      if (voice) {
        const v = control.sourceMix.gain?.[voice] ?? 1;
        note('desk', `${what}'s ${voice} went to ${Math.round(v * 100)} %`, { voice, level: v, db: v > 0 ? +(20 * Math.log10(v)).toFixed(1) : '−∞' });
      }
      if (band) {
        const room = planned(band);
        const lean = bands[band] ?? 0;
        if (room != null) note('desk', lean ? `the master's ${band} was leant ${lean > 0 ? '+' : ''}${lean} dB` : `the master's ${band} went back to the room`,
          { band, offset: lean, room: +room.toFixed(2), gain: +(room + lean).toFixed(2) });
      }
    },
    resetGroup(voices, what) {
      const cur = mixState();
      const gain = { ...cur.gain };
      for (const v of voices) delete gain[v];
      const drop = (xs: string[]) => xs.filter((v) => !voices.includes(v));
      const next = { mute: drop(cur.mute), solo: drop(cur.solo), dry: drop(cur.dry), gain };
      if (JSON.stringify(next) === JSON.stringify({ ...cur, gain: { ...cur.gain } })) return;
      put(next);
      note('desk', `${what} went back to clean`, { voices: voices.join('+') });
    },
    resetAll() {
      const had = control.sourceMixOn || Object.keys(bands).length;
      control.resetSources();
      for (const band of Object.keys(bands) as Band[]) { const room = planned(band); if (room != null) write(band, room); }
      bands = {};
      moved();
      if (had) note('desk', 'the desk went back to clean: every source at unity and the master at the room');
      emit();
    },
    follow() {
      if (!Object.keys(bands).length) return;
      const m = mix();
      if (!m || m.master !== master) {
        // a stop and a start built a new master at the room: nothing to let go
        bands = {};
      moved();
        note('desk', 'the master was built again, at the room: the bands\' leans went with the old one');
        emit();
        return;
      }
      if (control.state.castTo) {
        for (const band of Object.keys(bands) as Band[]) { const room = planned(band); if (room != null) write(band, room); }
        bands = {};
      moved();
        note('desk', 'a cast is arriving: the master\'s bands went back to the room before it retunes them', { to: control.state.castTo });
        emit();
      }
    },
    release() {
      for (const band of Object.keys(bands) as Band[]) { const room = planned(band); if (room != null && mix() && mix()!.master === master) write(band, room); }
      bands = {};
      moved();
    },
  };
  return desk;
}

export default deskFor;
