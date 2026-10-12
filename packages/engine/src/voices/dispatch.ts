// One event name for several sounds: the role voices that dispatch by timbre.
//
// Round SOUNDS-R3. Two of the record's voices were never one instrument: `pad`
// is the sustained role in four families — the strings ensemble and its swell,
// and two keyboard patches held rather than struck — and `keys` is the
// rhythmic role in five keyboard patches. A part writes the role's name on the
// event and the family on the note (`p.timbre`, `p.preset`), and the arrangement,
// the lane meters and the solo-stem renders never have to know which instrument
// is holding the chord this time. Until this round each was a module that
// branched on the name (`pad.ts`, and the patch table inside `keys.ts`).
//
// Now the event name is a row of this topology (`sounds/ensemble/pad.json`,
// `sounds/keyboard/keys.json`) whose parameters are the table **timbre → the
// row it renders through**, and every sound behind it is a row of its own
// (`stringsPad`, `stringsSwell`, `keysRhodes` …), rendered by its own topology
// (`strings.ts`, `keys.ts`) with its own device. The event names do not move:
// they are hashed into every lock and every link.
//
//   by         the note's field that names the timbre: `timbre`, `preset`
//   none       the timbre a note that names none plays
//   otherwise  the timbre a note naming one the table has not plays (the
//              keyboard's old fallback to the rhodes)
//   timbres    each timbre's row, and whether it is `sustain`ed: a keyboard
//              patch the sustained role holds rather than strikes, handed the
//              note with `sustain` set, its `preset` the timbre's name, and its
//              knobs re-expressed against the row's own (a knob is a number
//              against the declaring voice's default, so what crosses is the
//              factor, which is what the sound is made of; a note with no
//              knobs crosses exactly as it is)
//
// The dispatcher's own descriptor is what the composer has always read of the
// role — its knobs, its controls, its timbre facts, the families it
// `dispatches` — and the controls it declares it applies at its door, before it
// hands the note on: `motion` scales the note's own drift, chorus and tremolo
// (1 is the room's), which is the room rescaled for that note and handed to
// whichever row renders it.

import { rescaleKnobs, withControls } from './descriptor.ts';
import type { Controls, NoteParams, VoiceRenderer } from './descriptor.ts';
import type { Settings } from '../settings.ts';
import { admittedOf } from './sound.ts';
import type { SoundRow, Topology } from './sound.ts';
import type { PatchOf } from './schema.ts';
import { bool, contract, map, name, names, table, word } from './schema.ts';

/** What a dispatching row carries (`schema.ts`). */
const PARAMETERS = contract({
  by: word('timbre', 'preset'),
  none: name(),
  otherwise: name(),
  timbres: map(table({ row: name(), sustain: bool() }), 1, 16),
}, (f) => [...names(f, 'none', 'timbres'), ...names(f, 'otherwise', 'timbres')]);

/** A dispatching row's table. */
type DispatchPatch = PatchOf<typeof PARAMETERS.fields>;

/**
 * **Scale an individual note's intrinsic motion without changing the room**:
 * the sustained role's `motion` control, a factor on the ensemble's detune,
 * chorus and vibrato, the pad's drift and the held keys' tremolo, rotary and
 * pan. The room itself where the note does not ask (or asks for one).
 */
export function padNoteSettings(settings: Settings, p: NoteParams, controls: Controls): Settings {
  const motion = withControls(p, controls).motion;
  if (motion === undefined || motion === 1) return settings;
  return { ...settings,
    strings: { ...settings.strings, detuneCents: settings.strings.detuneCents * motion,
      ensembleWet: settings.strings.ensembleWet * motion, vibratoCents: settings.strings.vibratoCents * motion },
    space: { ...settings.space, padDriftCents: settings.space.padDriftCents * motion },
    keys: { ...settings.keys, tremoloDepth: settings.keys.tremoloDepth * motion,
      rotaryDepth: settings.keys.rotaryDepth * motion, tremoloPan: settings.keys.tremoloPan * motion },
  };
}

/** The timbre a note of this dispatcher plays, as the table resolves it: the name it wrote, or the table's own. */
export function timbreOf(row: SoundRow, p: NoteParams | null | undefined): string {
  const P = row.parameters as DispatchPatch;
  const t = (p ? p[P.by] : undefined) || P.none;
  return Object.prototype.hasOwnProperty.call(P.timbres, t) ? t : P.otherwise;
}

/** The row a note of this dispatcher renders through, by its id. */
export const targetOf = (row: SoundRow, p: NoteParams | null | undefined): string =>
  (row.parameters as DispatchPatch).timbres[timbreOf(row, p)].row;

/**
 * The dispatching topology: a row of it is an event name that stands for
 * several rows, and renders a note through the one its timbre names.
 */
export const DISPATCH: Topology = {
  id: 'dispatch',
  cost: 'dear',
  parameters: PARAMETERS,
  render: (row): VoiceRenderer => {
    const P = row.parameters as DispatchPatch;
    const controls = row.descriptor.controls;
    const knobs = row.descriptor.knobs ?? {};
    const moves = !!controls && Object.prototype.hasOwnProperty.call(controls, 'motion');
    return (ctx, out, time, p = {}, settings) => {
      if (controls) p = withControls(p, controls);
      if (moves) settings = padNoteSettings(settings, p, controls!);
      // the name as the note wrote it (a falsy one is the table's own), and
      // the row it resolves to: a name the table has not plays `otherwise`
      const named = p[P.by];
      const timbre = named || P.none;
      const entry = Object.prototype.hasOwnProperty.call(P.timbres, timbre) ? P.timbres[timbre] : P.timbres[P.otherwise];
      const target = admittedOf(entry.row);
      if (!target) throw new Error(`${row.id}: the row ${entry.row} its ${timbre} renders through is not admitted`);
      if (!entry.sustain) return target.render(ctx, out, time, p, settings);
      return target.render(ctx, out, time, { ...rescaleKnobs(p, knobs, target.knobs ?? {}), preset: timbre, sustain: true }, settings);
    };
  },
  // Every row the table names is admitted, and is not itself a dispatcher; the
  // dispatcher's own timbre facts are the facts of the rows that make them; the
  // families it `dispatches` are timbres of its table; and a row it reaches
  // without holding it declares its knobs — the factor a note's knob is, is
  // read against the row's own defaults, which are the dispatcher's.
  check: (row: SoundRow) => {
    const P = row.parameters as DispatchPatch;
    const bad: string[] = [];
    const say = (s: string) => bad.push(`${row.id}: ${s}`);
    for (const [t, e] of Object.entries(P.timbres)) {
      const target = admittedOf(e.row);
      if (!target || !target.row) { say(`its ${t} renders through ${e.row}, which is not an admitted row`); continue; }
      if (target.row.topology === 'dispatch') say(`its ${t} renders through ${e.row}, another dispatcher`);
      if (!e.sustain && JSON.stringify(target.knobs ?? {}) !== JSON.stringify(row.descriptor.knobs ?? {}))
        say(`its ${t} renders through ${e.row} as it is, and that row's knobs are not its own`);
    }
    for (const [t, facts] of Object.entries(row.descriptor.timbres)) {
      const e = P.timbres[t];
      const target = e ? admittedOf(e.row) : undefined;
      if (!target) { say(`it declares the timbre ${t} and no row of its table makes it`); continue; }
      if (JSON.stringify(target.timbres[t]) !== JSON.stringify(facts)) say(`its ${t} says ${JSON.stringify(facts)} and ${e.row} says ${JSON.stringify(target.timbres[t])}`);
    }
    for (const t of row.descriptor.dispatches) if (!Object.prototype.hasOwnProperty.call(P.timbres, t)) say(`it dispatches ${t}, which its table has not`);
    return bad;
  },
};
