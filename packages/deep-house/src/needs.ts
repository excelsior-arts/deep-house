// **What a grammar or a technique needs of a theme, and one reader of it** (PLAN-UNIFY §0b; engine-data, 10-28). Each
// grammar is admitted by its own needs and never by another's admission. Three readers had been written by hand, and
// `kit` meant two things (the drums' place has a kit row; the drums on and four-on-the-floor), so the words are four:
//
//   kit         the drums' place has a kit row: the drums whose phrases the row's conversation, passage and arrangement
//               were written against (`DrumsEntry.kit`)
//   no-kit      no drums play (the spell derives none, so every percussion gate is held off): the silence a row was
//               written over, the sea's (the ambient-waves review, 10-18)
//   drums       the drums derived on
//   four-floor  the derived kit is the four-on-the-floor one (the ensembles', the hook's)
//
// A word the reader does not know is never met. Pure; no DOM.

export type GrammarNeed = 'kit' | 'no-kit' | 'drums' | 'four-floor';
export const GRAMMAR_NEEDS: readonly GrammarNeed[] = Object.freeze(['kit', 'no-kit', 'drums', 'four-floor']);

/** What a theme offers: the derived state's drums and kit (none where the style derives none), and whether the drums' place has a kit row. */
export interface NeedsContext { derived: { drumsOn: boolean; kit: string } | null; kitRow: boolean }

/** Are every one of the needs met. None: met. */
export function needsMet(needs: readonly GrammarNeed[] | undefined, c: NeedsContext): boolean {
  return (needs ?? []).every((n) => n === 'kit' ? c.kitRow : n === 'no-kit' ? !!c.derived && !c.derived.drumsOn
    : n === 'drums' ? !!c.derived && c.derived.drumsOn : n === 'four-floor' ? !!c.derived && c.derived.kit === 'fourFloor' : false);
}
