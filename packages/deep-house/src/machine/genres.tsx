// The genre keys: nine presets under the ring, for the engineer (PLAN-GENRES).
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

/**
 * **Two tiers** (M7, Eugene: *"we select top-level genres on the first screen,
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
  /** (M10) whether its spell is tuned: a key that plays an untuned spell is disabled */
  tuned: boolean;
  about: string;
  /** the family it belongs to — its own name for a family's key (M17): with the label, a style's name */
  of?: string;
  /** a family, pressed on the first tier, opens its subs */
  family?: GenreFamily;
}

const TABLE = PRESETS as unknown as { home: string; families: GenreFamily[] };
export const FAMILIES: readonly GenreFamily[] = TABLE.families;
/** The family the house belongs to. */
export const HOME = TABLE.home;

/** A sub as a key: its own spell where tuned, its family's where not. */
export const subPreset = (f: GenreFamily, s: GenreSub): GenrePreset => ({
  label: s.label, spell: s.tuned && s.spell ? s.spell : f.spell, reachable: f.reachable, tuned: s.tuned, about: s.about, of: f.label,
});
export const familyPreset = (f: GenreFamily): GenrePreset => ({ label: f.label, spell: f.spell, reachable: f.reachable, tuned: f.tuned, about: f.about, family: f, of: f.label });

/**
 * **Whether a key presses** (M10, Eugene: *"the tiles we do not support
 * completely need to be disabled and not clickable"*): a family on the first
 * tier always does, since it opens its tier; every other key only where its
 * spell is tuned — as the table says, never the code. Under house-v1 only the
 * centre.
 */
export function presses(p: GenrePreset, openTier: boolean, v1: boolean, centre: boolean): boolean {
  if (v1) return centre;
  if (!openTier && p.family) return true;
  return p.tuned;
}

/**
 * **Deep House, the first tier's centre, always** (M8, Eugene: *"with House we
 * make an exception on the root view: Deep House in the centre as the default
 * style, and House as one of the eight tiles; when we go into the House tile
 * it becomes the centre and Deep House is one of its options. This exception
 * is only for Deep House, due to the nature of the project."*): the house's
 * own sub-genre, the one tuned to the house itself. Pressed, it plays the
 * house; it never opens a family.
 */
const homeFamily = FAMILIES.find((f) => f.label === HOME) ?? FAMILIES[0];
export const DEEP_HOUSE: GenrePreset = subPreset(homeFamily,
  homeFamily.subs.find((s) => s.tuned && s.spell && !Object.keys(s.spell).length) ?? homeFamily.subs[0]);

/**
 * The nine cells of a tier, in reading order, the centre fifth; a cell nothing
 * fills is `null`. The first tier is the eight families round Deep House, the
 * same nine whatever was visited; the second, a family's subs round the family.
 */
export function tierOf(current: string, open: boolean, centre: GenrePreset = DEEP_HOUSE): Array<GenrePreset | null> {
  if (!open) {
    const around: Array<GenrePreset | null> = FAMILIES.slice(0, 8).map(familyPreset);
    while (around.length < 8) around.push(null);
    return [...around.slice(0, 4), centre, ...around.slice(4, 8)];
  }
  const f = FAMILIES.find((x) => x.label === current) ?? homeFamily;
  const around: Array<GenrePreset | null> = f.subs.map((s) => subPreset(f, s));
  while (around.length < 8) around.push(null);
  // on its own tier the family is a key like its subs: lit by its own spell alone
  return [...around.slice(0, 4), { ...familyPreset(f), family: undefined }, ...around.slice(4, 8)];
}

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

/**
 * Whether a key is lit: its spell is the one playing. A family on the first
 * tier is lit as well when one of its tuned subs is — the family holds what is
 * playing, which is how the house's family is lit at the house.
 */
export function isLit(p: GenrePreset, playing: Partial<Spell> | null | undefined): boolean {
  // (M11) an untuned spell says nothing about what plays: a family with none
  // measured (Trance) would read as the house
  if (p.tuned && spellGap(playing, presetSpell(p)) <= NEAR) return true;
  return !!p.family && p.family.subs.some((s) => s.tuned && s.spell && spellGap(playing, presetSpell({ ...p, spell: s.spell })) <= NEAR);
}

/**
 * **The root's centre is the style that plays** (M17, Eugene's genre lift: a
 * sub-genre chosen inside a family takes the root's centre, so the root reads
 * eight families round what is playing; Deep House is the centre only by
 * default). Every style a key can play and that is tuned — a family's own
 * spell and its tuned sub-genres, Deep House among them — named by its family
 * and its word.
 */
export const styleKey = (p: GenrePreset): string => `${p.of ?? ''}/${p.label}`;
export const TUNED_STYLES: readonly GenrePreset[] = [
  DEEP_HOUSE,
  ...FAMILIES.flatMap((f) => [
    ...(f.tuned ? [{ ...familyPreset(f), family: undefined }] : []),
    ...f.subs.filter((x) => x.tuned).map((x) => subPreset(f, x)),
  ]).filter((p) => styleKey(p) !== styleKey(DEEP_HOUSE)),
];
/**
 * Which style stands in the centre: the tuned style the playing spell is
 * (within `SPELL_SAME`) — the one last chosen if it is among them — and, where
 * the spell is no tuned style (a bird moved), the one last chosen, unlit; a
 * viewer who never chose one has Deep House, the default, unlit. Never a blank:
 * a centre is a key, and a key plays something.
 */
export function centreOf(playing: Partial<Spell> | null | undefined, chosen: string | null): GenrePreset {
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

/** The grid itself, mounted under the ring by `view.tsx`. */
/**
 * **What the grid is today** (M8, Eugene: *"clearly put a label in the centre,
 * like WORK IN PROGRESS, to outline that this is wishful thinking here"*): the
 * sub-genres tuned with spells of their own, counted off the table so the
 * sentence stays true as the table is tuned.
 */
const TUNED = FAMILIES.flatMap((f) => f.subs.filter((s) => s.tuned).map((s) => s.label));
export const WIP_ABOUT = `Work in progress: ${TUNED.length} sub-genre${TUNED.length === 1 ? ' is' : 's are'} tuned (${TUNED.join(', ')}); every other sub-genre plays its family's spell until it is tuned.`;

export function GenreKeys({ store, control }: { store: MachineStore; control: Control }) {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const playing = snap.spell;
  // which family is in the centre, and whether its subs are open around it
  const [current, setCurrent] = useState(HOME);  // the family open, when one is
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(readChosen);
  // **house-v1 reads no spell** (M6, Eugene: *"just keeping the central Deep
  // House is fine"*): under it the grid is the first tier's centre alone, the
  // house, lit; the other eight dim and do nothing, and nothing opens
  const v1 = snap.strategy === 'house-v1';
  const centre = v1 ? DEEP_HOUSE : centreOf(playing, chosen);
  const cells = tierOf(current, open && !v1, centre);
  const press = (p: GenrePreset, i: number) => {
    if (v1) { if (i === 4) applyGenre(control, p); return; }
    // on the first tier a family opens; its centre and its subs play
    if (!open && p.family) { setCurrent(p.family.label); setOpen(true); return; }
    applyGenre(control, p);
    // the style played is the one the root's centre now stands for (M17)
    if (p.tuned) { const k = styleKey(p); keepChosen(k); setChosen(k); }
  };
  // the tier's name as its tiles say it, in proper case (M17)
  const caption = v1 ? 'house-v1 is the house: the other eight steer house-v2 only' : open ? current : 'Families';
  return (
    <section className="genre-block" aria-label="genre presets">
      {/* its own header, like the other blocks (M6); the tier it is on, and the way back (M7) */}
      <h2 className="genre-head">
        <span className="title">genres<span className="caption" data-tier={open ? 'sub' : 'family'}>{caption}</span></span>
        <span className="wip" data-wip="" title={WIP_ABOUT}>work in progress</span>
        <span className="keys">
          {open && !v1 ? (
            <button type="button" className="pane-key" aria-label="Back to the genre families" title="Back to the families" onClick={() => setOpen(false)}>back</button>
          ) : null}
        </span>
      </h2>
      <div className="genres" role="group" aria-label={open ? `${current}: its sub-genres, a spell each` : 'genre families'} style={GRID}>
        {cells.map((p, i) => {
          if (!p) return <div key={`empty${i}`} className="genre empty" style={{ ...KEY, cursor: 'default' }} aria-hidden="true" />;
          const centre = i === 4;
          const off = !presses(p, open && !v1, v1, centre);
          // **the lamp is the centre's alone** (M17): the one style that plays
          // a disabled key has no lamp: it can say nothing about what plays
          const lit = off ? false : v1 ? centre : isLit(p, playing);
          return (
            <button
              type="button"
              key={`${open ? 'sub' : 'fam'}:${i}:${p.label}`}
              className={`genre${lit ? ' on' : ''}${centre ? ' home' : ''}${p.reachable ? '' : ' far'}`}
              data-genre={p.label}
              data-opens={!open && p.family && !v1 ? '' : undefined}
              aria-pressed={lit}
              // under v1 the outer keys are shut (M6); an untuned key stays a
              // key its tooltip can be read on, and presses nothing (M10)
              disabled={v1 && !centre}
              aria-disabled={off}
              data-untuned={!v1 && off ? '' : undefined}
              title={!open && p.family && !v1 ? `${p.about} Press to see its sub-genres.`
                : !v1 && off ? `${p.about.replace(/ — plays the family's spell\.?$/, '.')} Disabled until it is tuned.`
                : p.reachable ? p.about : `${p.about}${/ring's controls/.test(p.about) ? '' : ' Not reached by the ring\'s controls: this is the nearest spell to it.'}`}
              onClick={() => { if (!off) press(p, i); }}
              style={{
                ...KEY,
                ...(centre ? null : { padding: `7px ${LAMP_INSET}px 8px` }),
                // (M18) a long name a step smaller and a hair less inset, so the
                // merged families' names stand whole on a third of the column
                ...(p.label.length > LONG_NAME ? { fontSize: 8.5, letterSpacing: 0, paddingLeft: centre ? LAMP_INSET + LAMP_SIZE + SPACE.hair : SPACE.hair, paddingRight: SPACE.hair } : null),
                ...(lit ? { background: INK.panel, color: INK.bright } : null),
                ...(off ? { opacity: 0.35, cursor: 'default' } : null),
              }}
            >
              {centre ? (
                <svg width={LAMP_SIZE} height={LAMP_SIZE} aria-hidden="true" style={LAMP_AT} data-lamp="">
                  <circle cx={LAMP_SIZE / 2} cy={LAMP_SIZE / 2} r={2.5} fill={lit ? INK.green : INK.line} />
                </svg>
              ) : null}
              <span>{p.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default GenreKeys;
