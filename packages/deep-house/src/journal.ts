// The session journal: what has played tonight, in the order it played, and
// the two ways a hand walks it.
//
// Eugene, 09-19 17:40 (`notes/archive/2026-09-plans/cited/PLAN-BIRDS-UX.md` §3b):
//
//   *"Since we do not hard-restart the mix when we throw the seed, it is
//   unclear how back and forward work. Resetting the seed should not reset the
//   user's session: back, back, back should restore the seed you were on three
//   tracks ago, and forward, forward re-advance. The seed becomes a time-based
//   parameter. The vision is background music for a very long session, a party
//   from 5 p.m. to midnight: someone throws the seed, then says 'half an hour
//   ago it was such a good track', and rolls back to it."*
//
// **Every theme that plays is an entry** — the seed, the theme of it, the
// engine, the spell, and the bar and clock it started at — so an entry is a
// whole provenance and not a breadcrumb: it is what the love button will read
// from when it exists (`PLAN-RECIPES.md`) and what the machine view's ledger
// can draw as a timeline.
//
// **Nothing is removed.** Back and forward move a pointer; a cast, a strategy
// flip and a theme that simply came next all put an entry *after* the pointer
// and push whatever was ahead of it along. So the two moves are exact inverses
// wherever the pointer stands — walk back three tracks, let the set play on,
// walk forward and you pass through what you heard in the order you heard it —
// and a cast made three tracks back does not delete the evening ahead of it.
//
// **Past either end the set itself answers**, which is what back and forward
// have always done: forward past the last entry is this set's next theme and
// back before the first is its previous one, each of them arriving as a new
// entry at that end. That is the whole of the rule that a page with no journal
// behaves exactly as it did before there was one.
//
// This module is arithmetic and a string in local storage. It plays nothing,
// asks nothing of the transport and knows no audio clock: `control.ts` tells it
// what arrived, and it says where a press should go.

import type { Spell } from './spell.ts';
import type { Development } from './development.ts';

/** The engine and the spell an entry was heard under, as the transport writes them. */
export interface JournalPlace {
  seed: string;
  /** zero-based, as the transport counts themes */
  theme: number;
  strategy: string;
  /** the spell the set was cast under; the house is `null` */
  spell: Partial<Spell> | null;
  /**
   * The recipe row this was heard under, by its permanent id; absent on
   * historical and ordinary entries. A walk plays it back (`control.ts`,
   * `recipeOfEntry`); the two modes below are the set's and are asserted rather
   * than restored, because `load` only reads a journal back on a page whose
   * link carries the same ones.
   */
  recipe?: string;
  accompaniment?: 'base' | 'auto';
  development?: Development;
}

/** One theme that played, with where the set was when it began. */
export interface JournalEntry extends JournalPlace {
  /** the bar of the theme it started on, one-based */
  bar: number;
  /** the audio context's own clock at the swap, where there was one */
  clock: number | null;
  /** the wall clock, so a reload can tell tonight from last week */
  at: number;
}

/**
 * **How long a journal is.** An evening at a party is five o'clock to midnight
 * and a theme is two to four minutes, so a hundred and fifty entries is a whole
 * night of it; two hundred is that with room to spare, and it is about forty
 * kilobytes of storage. Past it the oldest fall off the front — which is the one
 * place "nothing is removed" bends, and it bends at the far end of the evening
 * and never in front of the pointer.
 */
export const CAP = 200;

/** Where it is kept. Beside `deep-house.player`, which is the place, not the walk. */
export const KEY = 'deep-house.journal';

/**
 * **How long a session is.** The journal survives a reload — a phone that
 * locked, a tab that was restored, a browser that came back — but it is the
 * *evening's* walk and not a diary: a journal whose last entry is older than
 * this is last night's, and the page starts a fresh one.
 */
export const SESSION_HOURS = 8;

/** What a press asks for: an entry already in the journal, or the set's own neighbour. */
export type JournalMove =
  | { kind: 'entry'; entry: JournalEntry; index: number }
  | { kind: 'set'; by: 1 | -1 };

// The spell is part of a place (R124): a pull made while the ring was stopped
// and then a play is the same theme under another spell, and was answered
// `already`, so the entry kept the spell it had been heard under before.
const sameSpellOf = (a: Partial<Spell> | null | undefined, b: Partial<Spell> | null | undefined): boolean => {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const k of keys) {
    const x = (a as Record<string, number> | null | undefined)?.[k];
    const y = (b as Record<string, number> | null | undefined)?.[k];
    if (x !== y) return false;
  }
  return true;
};

const samePlace = (a: JournalPlace, b: JournalPlace) =>
  a.seed === b.seed && a.theme === b.theme && a.strategy === b.strategy
  && sameSpellOf(a.spell, b.spell)
  && (a.recipe ?? null) === (b.recipe ?? null)
  && (a.accompaniment ?? 'base') === (b.accompaniment ?? 'base')
  && (a.development ?? 'base') === (b.development ?? 'base');

/** Storage, where there is any and it will have us. A page works without it. */
interface Bin {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function bin(): Bin | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch (e) {
    return null; // storage blocked by the browser's own settings
  }
}

export function createJournal({ store = bin(), now = () => Date.now() }: {
  store?: Bin | null; now?: () => number;
} = {}) {
  let entries: JournalEntry[] = [];
  /** where the hand is in the walk; −1 while nothing has played */
  let at = -1;
  /**
   * What the last press asked for, held until the music answers. A move to an
   * entry says which one, so an arrival that *is* that entry moves the pointer
   * rather than writing a second copy of it; a move past an end says where the
   * new entry goes, so that a back before the first entry lands in front of it
   * and forward after the last lands behind it.
   */
  let pending: { index: number } | { insertAt: number } | null = null;

  // The oldest entry goes, and never the one the pointer is on: at the
  // pointer's own front the oldest is the one after it. It used to pop the
  // *newest* there — a back past the front of a full journal lost the last
  // theme of the evening (R124).
  const trim = () => {
    while (entries.length > CAP) {
      if (at > 0) { entries.shift(); at -= 1; } else entries.splice(1, 1);
    }
  };
  /** Where the next press counts from: the entry the last press is walking to, or the pointer. */
  const walking = (): number => (pending && 'index' in pending ? pending.index : at);

  const save = () => {
    if (!store) return;
    try {
      store.setItem(KEY, JSON.stringify({ v: 1, at, saved: now(), entries }));
    } catch (e) { /* full, or blocked */ }
  };

  return {
    get entries() { return entries; },
    get at() { return at; },
    /** The entry the set is on, or `null` while nothing has played. */
    get here(): JournalEntry | null { return at >= 0 ? entries[at] || null : null; },
    /** Is there anything behind the pointer, and anything ahead of it? */
    get hasBack() { return at > 0; },
    get hasForward() { return at >= 0 && at < entries.length - 1; },

    /**
     * Read tonight's journal back, if there is one and it is tonight's.
     *
     * `here` is where the page is actually starting — a link's seed and theme,
     * or the place that was saved. A journal whose pointer is not on that place
     * is a different walk (somebody else's link, or a seed typed in), so it is
     * left where it is in storage and this session starts its own: opening a
     * link somebody sent must play what the link says and nothing else.
     */
    load(here: JournalPlace | null): boolean {
      if (!store) return false;
      let raw: any = null;
      try { raw = JSON.parse(store.getItem(KEY) || 'null'); } catch (e) { return false; }
      if (!raw || raw.v !== 1 || !Array.isArray(raw.entries) || !raw.entries.length) return false;
      if (!(now() - Number(raw.saved || 0) < SESSION_HOURS * 3600 * 1000)) return false;
      const i = Math.max(0, Math.min(raw.entries.length - 1, Number(raw.at) || 0));
      if (here && !samePlace(raw.entries[i], here)) return false;
      entries = raw.entries;
      at = i;
      pending = null;
      return true;
    },

    /** Forget the walk. A reset to the beginning does this; nothing else does. */
    clear(): void {
      entries = [];
      at = -1;
      pending = null;
      if (store) { try { store.removeItem(KEY); } catch (e) { /* blocked */ } }
    },

    /** Where a press of previous goes. */
    //
    // **From the entry the last press is walking to**, not from the pointer
    // (R60): the pointer moves when the music arrives, so two backs pressed
    // inside one landing both asked for the entry behind it, where the set's
    // own neighbours step five for five presses (ROADMAP:162).
    back(): JournalMove {
      const from = walking();
      if (from > 0) {
        pending = { index: from - 1 };
        return { kind: 'entry', entry: entries[from - 1], index: from - 1 };
      }
      pending = { insertAt: Math.max(0, from) };
      return { kind: 'set', by: -1 };
    },

    /** Where a press of next goes. */
    forward(): JournalMove {
      const from = walking();
      if (from >= 0 && from < entries.length - 1) {
        pending = { index: from + 1 };
        return { kind: 'entry', entry: entries[from + 1], index: from + 1 };
      }
      pending = { insertAt: from + 1 };
      return { kind: 'set', by: 1 };
    },

    /** A press that was refused — the first theme of a set, and nothing behind it. */
    cancel(): void {
      pending = null;
    },

    /**
     * A theme began. Either it is the entry the last press asked for, and the
     * pointer walks to it; or it is new, and it is written in after the
     * pointer — a cast, a strategy flip, or simply the theme that came next.
     *
     * Asked twice for the same place it does nothing at all, so a pause and a
     * play, or a readout taken twice, cannot write the same theme down twice.
     *
     * Hands back what it did, for the ledger to name.
     */
    arrived(place: JournalPlace, { bar = 0, clock = null }: { bar?: number; clock?: number | null } = {}):
      'walked' | 'written' | 'already' {
      const asked = pending;
      pending = null;
      if (asked && 'index' in asked && entries[asked.index] && samePlace(entries[asked.index], place)) {
        at = asked.index;
        save();
        return 'walked';
      }
      const here = at >= 0 ? entries[at] : null;
      if (here && samePlace(here, place)) return 'already';
      const where = asked && 'insertAt' in asked ? Math.max(0, Math.min(entries.length, asked.insertAt)) : at + 1;
      const entry: JournalEntry = { ...place, spell: place.spell ?? null, bar, clock, at: now() };
      entries.splice(where, 0, entry);
      at = where;
      trim();
      save();
      return 'written';
    },
  };
}

export default createJournal;
