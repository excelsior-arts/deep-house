// The ledger's own reader: the lines nobody else writes, written whether or not
// the machine view is open (the reconciled review, R54).
//
// The transport writes what it does as it does it — a start, a seam, a cast, a
// spell, an engine — but a section turning over, a lane gated on or off by it,
// a voice drawn onto a lane, a treatment engaging, a note reaching late and the
// clock falling to the interval are things it *has* and does not say. The view
// used to write those down for itself, from its own frame, so they existed only
// while it was open — and the whole point of the ledger is to open the view
// *after* hearing something and find out what it was (`ledger.ts`).
//
// So this reads the readout the ring is already handed, on the page, from the
// moment the page starts: a bar or a theme turning over is the one moment the
// lanes are asked again, which is a few times a second at most, and everything
// else here is two counters and a string. The meters' clip lines stay with the
// taps, which exist only while the view is open, because a clip is something
// only a tap can see.
//
// **The first reading is the baseline and writes nothing** (R114): what is
// already true when the page starts — the section it is in, the lanes already
// treated — is not something the machine just did.

import { clockSource } from '@deep-house/engine/clock';
import { dropInfo } from '@deep-house/engine/deck';
import { lateInfo } from '@deep-house/engine/dsp';
import { lanesOfTheme } from './model.ts';
import { note } from '../ledger.ts';
import { sceneOfDice, textureOfDice } from '../composition.ts';
import type { Control, Readout } from '../control.ts';

/** Start writing; returns the way to stop. */
export function startScribe(control: Control): () => void {
  let track: unknown = null;
  let lastBar = -1;
  let lastSection: string | null = null;
  let gated = new Map<string, boolean>();
  let drawn = new Map<string, string>();
  let treated = new Map<string, string>();
  let lastClock: string | null = null;
  let lastLate = -1;
  let lastDropped = -1;

  function lanes(r: Readout, first: boolean): void {
    let rows;
    try { rows = lanesOfTheme(r); } catch (e) { return; }
    const nowTreated = new Map<string, string>();
    for (const lane of rows) {
      const was = gated.get(lane.id);
      if (!first && was !== undefined && was !== lane.on) {
        note('lane', `${lane.id} was gated ${lane.on ? 'on' : 'off'}`, { by: r.section, bar: r.bar + 1 });
      }
      gated.set(lane.id, lane.on);
      // A lane whose instrument changed — which under house-v2 is a different
      // voice every theme and is exactly the kind of thing an ear notices and
      // cannot name. The composition's texture and scene ride along: they are
      // why a sixteenth lane plays hands on one theme and nothing on the next.
      const playing = lane.playing.join('+');
      const before = drawn.get(lane.id);
      if (!first && before !== undefined && before !== playing && playing) {
        const dice = r.track.dice as Record<string, unknown>;
        const texture = textureOfDice(dice) ? String(dice.texture) : null, scene = sceneOfDice(dice);
        note('voice', `${lane.id} is played by ${playing}`, { was: before || '—', role: lane.role, ...(texture ? { texture } : {}), ...(scene ? { scene } : {}) });
      }
      drawn.set(lane.id, playing);
      if (lane.treatment) nowTreated.set(lane.id, lane.treatment.kind);
    }
    // What the desk has on each lane, and the moment it changes. A treatment is
    // laid out ahead of time by the rota — it is in the plan, not a reaction —
    // so the line is written when the bar the set is on reaches it, which is
    // the instant an ear would hear it.
    if (!first) {
      for (const [id, kind] of nowTreated) {
        if (treated.get(id) === kind) continue;
        const lane = rows.find((l) => l.id === id)!;
        note('treatment', `${kind} engaged on ${id}`, { ...lane.treatment!.settings, voice: lane.playing.join('+') || '—' });
      }
      for (const [id, kind] of treated) if (!nowTreated.has(id)) note('treatment', `${kind} released on ${id}`);
    }
    treated = nowTreated;
  }

  function read(r: Readout): void {
    const first = track === null;
    const turned = r.track !== track;
    if (turned || r.bar !== lastBar) {
      // A section turning over inside one theme; a new theme is the transport's
      // line (`theme`, `seam`) and its first section is not a turn.
      if (!first && !turned && lastSection !== null && r.section !== lastSection) {
        note('section', `the section turned over to ${r.section}`, { bar: r.bar + 1, from: lastSection });
      }
      track = r.track;
      lastBar = r.bar;
      lastSection = r.section;
      lanes(r, first);
    }
    // The two counters the transport keeps are counts since the page opened,
    // so what is worth a line is the step and not the number.
    const late = lateInfo().count, dropped = dropInfo().count;
    if (lastLate >= 0 && late > lastLate) note('late', `${late - lastLate} notes reached late`, { total: late, movedBy: lateInfo().last, cause: lateInfo().cause });
    if (lastDropped >= 0 && dropped > lastDropped) note('late', `${dropped - lastDropped} events were dropped a bar behind the head`, { total: dropped });
    lastLate = late;
    lastDropped = dropped;
    // The clock source; a change of it is a line.
    const clock = clockSource();
    if (lastClock !== null && clock !== lastClock) note('clock', `the clock is now the ${clock}`, { was: lastClock });
    lastClock = clock;
  }

  return control.subscribe(read);
}

export default startScribe;
