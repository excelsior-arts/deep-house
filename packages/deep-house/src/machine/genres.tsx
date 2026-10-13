// The genre keys: nine presets under the ring, for the engineer (PLAN-GENRES).
//
// **One level** (GA8, Eugene, 10-01: *"focus only on a few genres for now, the
// most abstract; remove sub-views and have only 9 top-level tiles. We keep our
// recipes in place — it should still be possible to get to a genre by pulling
// birds"*): Deep House in the centre and eight tiles round it, named and ordered
// by `grid` in `genres.json`; no tier opens. The families and their sub-styles
// stay in the table as what is measured and claimed, and are not drawn.
//
// Eugene, 09-25: *"add another grid of nine buttons in the machine view, right
// under the ring, with genres. The middle is reserved for our default bird
// combo, Deep House; the other eight are target styles."* A key is **a spell and
// nothing else**: pressing it asks the control for that spell exactly as a hand
// on the ring would (`control.setSpell`), so the link carries the spell as it
// always does, the move lands at the next phrase line over the usual blend, and
// no genre word ever reaches the address bar or the composer. The word is the
// key's label, and it lives here, in the engineer's view, where genre words are
// allowed (the ring's copy names none: bird-labels.json).
//
// The spells are the search's best (`notes/analysis/genres-2026-09-25.md`), in
// `genres.json` beside this file with how near each one measured and what it
// could not reach. A key whose genre the birds cannot reach is drawn all the
// same, applies the nearest spell it found, and says so in its tooltip.
//
// A key is lit while the spell playing is within `NEAR` of its preset — the
// largest single bird's difference, the way a hand reads a bird's position —
// so a key a hand has moved away from goes dark, and the house key is lit at
// the house.

import { useState, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import { INK, SPACE } from './look.ts';
import { note } from '../ledger.ts';
import { spellQuery } from '../spell.ts';
import type { Control } from '../control.ts';
import type { MachineStore } from './store.ts';
import { TILES, CELLS, DEEP_HOUSE, presetSpell, isLit, presses, selectedOf, styleKey, type GenrePreset } from './genre-table.ts';
export * from './genre-table.ts';

/** Where this browser keeps the style last chosen (M17): the viewer's, never the link's. */
const CHOSEN_KEY = 'deep-house.machine.genre';
const readChosen = (): string | null => { try { return localStorage.getItem(CHOSEN_KEY); } catch (e) { return null; } };
const keepChosen = (k: string): void => { try { localStorage.setItem(CHOSEN_KEY, k); } catch (e) { /* nothing kept */ } };

/** Press a key: the control's own spell ask, and one line in the ledger. */
export function applyGenre(control: Control, p: GenrePreset): void {
  const spell = presetSpell(p);
  const query = spellQuery(spell);
  note('spell', `genre preset: ${p.label} → spell ${query ?? 'the house'}`, { genre: p.label, spell: query ?? 'house', reachable: p.reachable });
  // The house is asked for as nothing at all, which is what a bare link and a
  // release of every bird ask for.
  control.setSpell(query ? spell : null);
}

const GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 1,
  background: INK.line,
  borderBottom: `1px solid ${INK.line}`,
  flex: '0 0 auto',
};
/**
 * A key (M6, Eugene: *"the green dot should be on the left, at the same
 * distance from the button's edge on every key; the text centred is fine"*):
 * the lamp at one inset from the left edge on all nine, the word centred in the
 * width the lamp leaves, and no italics — a genre the ring's controls cannot
 * reach says so in its tooltip, and its lamp simply stays dark until its spell
 * is the one playing.
 */
const LAMP_INSET = SPACE.s;
const LAMP_SIZE = 7;
const KEY: CSSProperties = {
  position: 'relative',
  display: 'block',
  minWidth: 0,
  border: 0,
  background: INK.sunken,
  color: INK.dim,
  font: 'inherit',
  textAlign: 'center',
  padding: `7px ${LAMP_INSET}px 8px ${LAMP_INSET + LAMP_SIZE + SPACE.hair}px`,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  letterSpacing: '0.02em',
  // a genre's name whole on a third of the side column: "Drum and Bass" was cut (M7)
  fontSize: 10,
};
/** Past this many letters a key's name is set a step smaller (M18). */
const LONG_NAME = 15;
const LAMP_AT: CSSProperties = { position: 'absolute', left: LAMP_INSET, top: '50%', marginTop: -LAMP_SIZE / 2 };

/**
 * **What the grid is today** (M8, Eugene: *"clearly put a label in the centre,
 * like WORK IN PROGRESS, to outline that this is wishful thinking here"*): which
 * of the eight play on a measured spell, which by their recipes, and which wait,
 * counted off the table so the sentence stays true as it is tuned.
 */
const drawn = TILES.filter((p): p is GenrePreset => !!p);
const MEASURED = drawn.filter((p) => p.tuned && !p.byRows).map((p) => p.label);
const BY_ROWS = drawn.filter((p) => p.tuned && p.byRows).map((p) => p.label);
const WAITING = drawn.filter((p) => !p.tuned).map((p) => p.label);
export const WIP_ABOUT = `Work in progress: ${MEASURED.length + BY_ROWS.length} of the ${drawn.length} genres play`
  + `${MEASURED.length ? ` — ${MEASURED.join(', ')} on a measured spell` : ''}`
  + `${BY_ROWS.length ? `${MEASURED.length ? ',' : ' —'} ${BY_ROWS.join(', ')} by their recipes` : ''}`
  + `${WAITING.length ? `; ${WAITING.join(', ')} ${WAITING.length === 1 ? 'is' : 'are'} disabled until tuned` : ''}.`;

/** The grid itself, mounted under the ring by `view.tsx`. */

export function GenreKeys({ store, control }: { store: MachineStore; control: Control }) {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const playing = snap.spell;
  const [chosen, setChosen] = useState<string | null>(readChosen);
  // **house-v1 reads no spell** (M6, Eugene: *"just keeping the central Deep
  // House is fine"*): under it the grid is the centre alone, the house, lit;
  // the other eight dim and do nothing
  const v1 = snap.strategy === 'house-v1';
  const selected = v1 ? DEEP_HOUSE : selectedOf(playing, chosen);
  // the spell a hand-over is on its way to, where it is not yet playing
  const asked = v1 ? null : snap.asked;
  const press = (p: GenrePreset, i: number) => {
    if (v1) { if (i === 4) applyGenre(control, p); return; }
    applyGenre(control, p);
    // the style played is the one that now carries the dot (M17)
    if (p.tuned) { const k = styleKey(p); keepChosen(k); setChosen(k); }
  };
  return (
    <section className="genre-block" aria-label="genre presets">
      {/* its own header, like the other blocks (M6); one level, so no tier and no way back (GA8) */}
      <h2 className="genre-head">
        <span className="title">genres{v1 ? <span className="caption">house-v1 is the house: the other eight steer house-v2 only</span> : null}</span>
        <span className="wip" data-wip="" title={WIP_ABOUT}>work in progress</span>
      </h2>
      <div className="genres" role="group" aria-label="genre presets, a spell each" style={GRID}>
        {CELLS.map((p, i) => {
          if (!p) return <div key={`empty${i}`} className="genre empty" style={{ ...KEY, cursor: 'default' }} aria-hidden="true" />;
          const centre = i === 4;
          const off = !presses(p, v1, centre);
          // **the dot is the selected key's alone** (GA8): green while its
          // spell plays, dark once a bird has moved off it; a disabled key
          // never carries it: it can say nothing about what plays
          const dot = !off && styleKey(p) === styleKey(selected);
          const lit = dot && (v1 || isLit(p, playing));
          // **arriving** (the deep review of 10-08): the key whose spell a
          // hand-over is bringing, amber until it plays, as an engine arriving is
          const arriving = !off && !lit && !!asked && isLit(p, asked);
          return (
            <button
              type="button"
              key={`${i}:${p.label}`}
              className={`genre${lit ? ' on' : ''}${arriving ? ' arriving' : ''}${centre ? ' home' : ''}${p.reachable ? '' : ' far'}`}
              data-genre={p.label}
              aria-pressed={lit}
              // under v1 the outer keys are shut (M6); an untuned key stays a
              // key its tooltip can be read on, and presses nothing (M10)
              disabled={v1 && !centre}
              aria-disabled={off}
              data-untuned={!v1 && off ? '' : undefined}
              title={!v1 && !off && p.byRows ? `${p.label}: plays its recipes on a turn.`
                : !v1 && off ? `${p.about.replace(/ — plays the family's spell\.?$/, '.')} Disabled until it is tuned.`
                : p.reachable ? p.about : `${p.about}${/ring's controls/.test(p.about) ? '' : ' Not reached by the ring\'s controls: this is the nearest spell to it.'}`}
              onClick={() => { if (!off) press(p, i); }}
              style={{
                ...KEY,
                // (M18) a long name a step smaller and a hair less inset, so the
                // longest names stand whole on a third of the column
                ...(p.label.length > LONG_NAME ? { fontSize: 8.5, letterSpacing: 0, paddingLeft: LAMP_INSET + LAMP_SIZE + SPACE.hair, paddingRight: SPACE.hair } : null),
                ...(lit ? { background: INK.panel, color: INK.bright } : null),
                // arriving: the engine row's amber, until it plays (10-08)
                ...(arriving ? { color: INK.amber } : null),
                ...(off ? { opacity: 0.35, cursor: 'default' } : null),
              }}
            >
              {dot || arriving ? (
                <svg width={LAMP_SIZE} height={LAMP_SIZE} aria-hidden="true" style={LAMP_AT} data-lamp={dot ? '' : undefined} data-arriving={arriving ? '' : undefined}>
                  <circle cx={LAMP_SIZE / 2} cy={LAMP_SIZE / 2} r={2.5} fill={lit ? INK.green : arriving ? INK.amber : INK.line} />
                </svg>
              ) : null}
              <span>{p.label}</span>
              {arriving ? <span className="vh">, arriving at the next phrase line</span> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default GenreKeys;
