// **The one call that plans a theme**, in a module a worker can load.
//
// It was `planTheme` in `src/mix.ts`, which is the session's facade and
// imports the whole machine — the master, the decks, the scheduler — none of
// which a plan needs. The planning perf round (10-12) moved planning off the
// page's thread (`src/plan-worker.ts`, `src/plan-off-thread.ts`), and the
// worker has to make the very call the page makes, so the call lives here and
// `mix.ts` hands it on under the name every caller has always imported.
//
// Nothing here reads the page: the two modes are resolved off the options
// (and off `location.search` only where a caller left them out, which the
// worker's own requests never do), and the style is the strategy's own
// unless a caller states one.

import { planTheme as planThemeOf } from './set-plan.ts';
import type { MixOptions, SetTrack } from './set-plan.ts';
import { accompanimentFor } from './recipe-request.ts';
import { developmentFor } from './development.ts';
import { strategyById } from './strategies/index.ts';

/**
 * The whole plan of theme n, in this build's style unless told another. A
 * caller may name the music two ways and they compose: `style` is the music
 * itself, and `strategy` is the id of the thing that plays it. A caller that
 * names neither gets the default strategy's style, which is the record.
 */
export const planTheme = (masterSeed: string | number, n: number, opts: Partial<MixOptions> = {}): SetTrack =>
  planThemeOf(masterSeed, n, { ...opts, accompaniment: accompanimentFor(opts), development: developmentFor(opts), style: opts.style || strategyById(opts.strategy).style });
