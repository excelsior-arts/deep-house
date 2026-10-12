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
import { BIRDS, HOUSE, SPELL_SAME, asSpell, spellQuery } from '../spell.ts';
import type { Spell } from '../spell.ts';
import type { Control } from '../control.ts';
import type { MachineStore } from './store.ts';
import PRESETS from './genres.json' with { type: 'json' };
import ROW_PLACES from '../row-places.json' with { type: 'json' };

/**
 * **The table** (M7, Eugene: *"we select top-level genres on the first screen,
 * then the selected item becomes the centre and we have eight sub-genres —
 * DnB → Liquid, Jungle, Techstep, Neurofunk…; the matrices of dependencies and
 * control values should be stored in JSON, as we will polish and iterate on
 * it"*). `genres.json` is the table: families, each with its measured spell,
 * and up to eight sub-genres, each either `tuned` with a measured spell of its
 * own or not yet, when it plays its family's and says so.
 */
export interface GenreSub {
  label: string;
  /** the controls away from the house, where the sub is tuned */
  spell?: Partial<Spell>;
  tuned: boolean;
  about: string;
  /** (M18) the recipe library's rows that belong to it, by their own ids */
  recipes?: string[];
}
export interface GenreFamily {
  label: string;
  spell: Partial<Spell>;
  /** false: the ring's controls cannot reach this genre and the spell is the nearest the search found */
  reachable: boolean;
  /** (M10) its own spell is one to play: measured and reached; false, its key on its own tier is disabled */
  tuned: boolean;
  about: string;
  /** (M18) the recipe library's rows that belong to the family as a whole */
  recipes?: string[];
  subs: GenreSub[];
}
/** A key as the grid draws it: its word, its spell, its tooltip, and where it leads. */
export interface GenrePreset {
  label: string;
  spell: Partial<Spell>;
  reachable: boolean;
  /**
   * (M10) whether the key plays: its spell is tuned, or (M23) the recipe rows it
   * claims have a region, so its spell is their audit key's and a theme in
   * three under it draws them; a key that plays neither is disabled
   */
  tuned: boolean;
  /** (M23) the region key its rows are admitted around, where it plays by its rows */
  byRows?: string;
  about: string;
  /** the family it belongs to (M17): with the label, a style's name */
  of?: string;
}
/**
 * A tile of the grid (GA8), as `genres.json` names it: its word, the family it
 * stands for, and — where two tiles share one family — the family's styles it
 * gathers.
 */
export interface GenreTile {
  label: string;
  family: string;
  styles?: string[];
  about?: string;
}

const TABLE = PRESETS as unknown as {
  home: string;
  grid: { centre: { family: string; style: string }; around: GenreTile[] };
  families: GenreFamily[];
};
export const FAMILIES: readonly GenreFamily[] = TABLE.families;
/** The family the house belongs to. */
export const HOME = TABLE.home;

/**
 * **The place a key's rows play at** (M23; since GA5 the composer knows rows
 * and birds only, `src/row-places.json`, keyed by the rows' own ids): a key's
 * spell is the birds most of its rows sit at, the first named on a tie; the
 * house's own place (no bird named) is not a key's. The genre side of the map
 * stays here, in the machine view.
 */
const PLACES = ROW_PLACES as unknown as { rows: Record<string, { birds: Partial<Spell> }> };
const placeOf = (id: string): string | null => {
  const p = PLACES.rows[id];
  return p && Object.keys(p.birds).length ? JSON.stringify(p.birds) : null;
};
export function regionOf(rows: readonly string[] | undefined): string | null {
  const count = new Map<string, number>();
  for (const id of rows || []) { const k = placeOf(id); if (k) count.set(k, (count.get(k) || 0) + 1); }
  let best: string | null = null;
  for (const [k, n] of count) if (!best || n > count.get(best)!) best = k;
  return best;
}
const byRows = (region: string | null) => (region ? { byRows: region, spell: JSON.parse(region) as Partial<Spell> } : null);

/**
 * A sub as a key: its own spell where tuned, its rows' region where it has one (M23), its family's where not.
 * **A tuned sub is reached** (the deep review of 10-08): its spell is a place the
 * ring's controls stand at, so its tooltip never says otherwise; it read its
 * family's `reachable`, and the Drum & Bass tile, which plays Liquid's measured
 * spell, said it was not reached by the ring's controls.
 */
export const subPreset = (f: GenreFamily, s: GenreSub): GenrePreset => {
  const mine = !!(s.tuned && s.spell);
  const own = mine ? null : byRows(regionOf(s.recipes));
  return { label: s.label, spell: mine ? s.spell! : f.spell, reachable: mine || f.reachable, about: s.about, of: f.label, ...own, tuned: s.tuned || !!own };
};
export const familyPreset = (f: GenreFamily): GenrePreset => {
  // a family's rows are its own and its sub-genres': it plays the region most of them share
  const own = f.tuned ? null : byRows(regionOf([...(f.recipes || []), ...f.subs.flatMap((x) => x.recipes || [])]));
  return { label: f.label, spell: f.spell, reachable: f.reachable, about: f.about, of: f.label, ...own, tuned: f.tuned || !!own };
};

/**
 * **A tile's preset** (GA8, the brief: *"the family's existing centre preset;
 * where a family had no single preset, take its first tuned sub-style's"*): a
 * tile of a whole family plays the family's own key as its tier drew it — its
 * tuned spell, or the place its rows share (M23) — and, where it has neither,
 * the family's first tuned style; a tile of some of a family's styles plays the
 * first of them that is tuned, or the place their rows share. Neither: the tile
 * is untuned, and disabled. `null` where the table names no such family.
 */
export function tilePreset(t: GenreTile): GenrePreset | null {
  const f = FAMILIES.find((x) => x.label === t.family);
  if (!f) return null;
  let base: GenrePreset;
  if (!t.styles) {
    base = familyPreset(f);
    const first = base.tuned ? undefined : f.subs.find((s) => s.tuned && s.spell);
    if (first) base = subPreset(f, first);
  } else {
    const subs = t.styles.map((w) => f.subs.find((s) => s.label === w)).filter((s): s is GenreSub => !!s);
    const first = subs.find((s) => s.tuned && s.spell);
    const own = first ? null : byRows(regionOf(subs.flatMap((s) => s.recipes || [])));
    base = first ? subPreset(f, first) : { label: t.label, spell: f.spell, reachable: f.reachable, about: subs[0]?.about ?? f.about, ...own, tuned: !!own };
  }
  return { ...base, label: t.label, about: t.about ?? base.about, of: f.label };
}

/**
 * **Whether a key presses** (M10, Eugene: *"the tiles we do not support
 * completely need to be disabled and not clickable"*): only where its spell is
 * tuned — as the table says, never the code. Under house-v1 only the centre.
 */
export function presses(p: GenrePreset, v1: boolean, centre: boolean): boolean {
  if (v1) return centre;
  return p.tuned;
}

/**
 * **Deep House, the centre, always** (M8, Eugene: *"Deep House in the centre as
 * the default style ... this exception is only for Deep House, due to the
 * nature of the project"*): the grid's `centre`, the house's own style, the one
 * tuned to the house itself. Pressed, it plays the house.
 */
const homeFamily = FAMILIES.find((f) => f.label === TABLE.grid.centre.family) ?? FAMILIES.find((f) => f.label === HOME) ?? FAMILIES[0];
export const DEEP_HOUSE: GenrePreset = subPreset(homeFamily,
  homeFamily.subs.find((s) => s.label === TABLE.grid.centre.style)
  ?? homeFamily.subs.find((s) => s.tuned && s.spell && !Object.keys(s.spell).length) ?? homeFamily.subs[0]);

/** The eight tiles round the centre, in reading order; a cell the table names nothing for is `null`. */
export const TILES: ReadonlyArray<GenrePreset | null> = (() => {
  const around: Array<GenrePreset | null> = TABLE.grid.around.slice(0, 8).map(tilePreset);
  while (around.length < 8) around.push(null);
  return around;
})();

/**
 * **The nine cells, fixed** (GA8, Eugene: *"tiles change position. Fix all
 * tiles in place, add a green dot to the selected one. Simple UX."*): in
 * reading order, Deep House always the fifth and the eight always in their
 * cells; nothing moves when a style is chosen.
 */
export const CELLS: ReadonlyArray<GenrePreset | null> = [...TILES.slice(0, 4), DEEP_HOUSE, ...TILES.slice(4, 8)];

/** A key's whole spell, the house under what it names. */
export const presetSpell = (p: GenrePreset): Spell => asSpell({ ...HOUSE, ...p.spell });

/** How far apart two spells read: the largest single bird's difference. */
export function spellGap(a: Partial<Spell> | null | undefined, b: Partial<Spell> | null | undefined): number {
  let gap = 0;
  for (const bird of BIRDS) gap = Math.max(gap, Math.abs((a?.[bird] ?? HOUSE[bird]) - (b?.[bird] ?? HOUSE[bird])));
  return gap;
}

/** Lit within this of its preset: the one tolerance for the same spell (M14, `SPELL_SAME`). */
export const NEAR = SPELL_SAME;

/** Whether a key is lit: its spell is tuned and is the one playing. */
export function isLit(p: GenrePreset, playing: Partial<Spell> | null | undefined): boolean {
  // (M11) an untuned spell says nothing about what plays: a tile with none
  // measured would read as the house
  return p.tuned && spellGap(playing, presetSpell(p)) <= NEAR;
}

/**
 * **The selected style** (M17's rule; since GA8 a dot, never a place): Deep
 * House at the house, or the tile whose spell is playing. Every style a key can
 * play and that is tuned — Deep House and the tuned tiles — named by its family
 * and its word.
 */
export const styleKey = (p: GenrePreset): string => `${p.of ?? ''}/${p.label}`;
export const TUNED_STYLES: readonly GenrePreset[] = [
  DEEP_HOUSE,
  ...TILES.filter((p): p is GenrePreset => !!p && p.tuned && styleKey(p) !== styleKey(DEEP_HOUSE)),
];
/**
 * Which style is selected, and carries the dot: the tuned style the playing spell is
 * (within `SPELL_SAME`) — the one last chosen if it is among them — and, where
 * the spell is no tuned style (a bird moved), the one last chosen, unlit; a
 * viewer who never chose one has Deep House, the default, unlit. Never a blank:
 * one key always carries the dot.
 */
export function selectedOf(playing: Partial<Spell> | null | undefined, chosen: string | null): GenrePreset {
  const same = TUNED_STYLES.filter((p) => spellGap(playing, presetSpell(p)) <= NEAR);
  const kept = chosen ? TUNED_STYLES.find((p) => styleKey(p) === chosen) : undefined;
  if (kept && same.includes(kept)) return kept;
  if (same.length) return same[0];
  return kept ?? DEEP_HOUSE;
}
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
