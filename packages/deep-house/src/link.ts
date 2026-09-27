// The link: every query parameter the page reads, in one table.
//
// Eugene, 09-22: *"once the players start operating and the query params
// reflect current state, we 100 % put the version of the engine — because users
// will distribute bookmarks and links on the internet or save them in memories.
// I want to make sure the same sound will be restored in future once we release
// version 3."* So a link is a promise, and this module is where it is kept:
//
//   - **one table** (`LINK_ROWS`): every parameter by name, with its class, what
//     a link without it plays, and when the page writes it. Nothing in `src/`
//     or `tools/` reads the address but through here (`tools/check-link.ts`
//     greps for it), so a parameter cannot be read without a row;
//   - **one reader** (`linkRead`): the address in, a typed link, the address
//     the page will play and what was refused out — the refusals the page
//     review of 09-22 asked for (a bad link is a ring with a line on it, never
//     a black page), each in its own words;
//   - **one writer** (`linkWrite`): a place in, the address out. It always
//     names the seed, the engine (`v`) and the theme, and every other sound
//     parameter that is not what that engine's version reads its absence as —
//     so a link a hand has written plays the same record whatever the page's
//     own default becomes. It never writes the bar (below).
//
// **A bare link is the page's choice; a written link is the player's.** A link
// with no `v` plays the page's default (`pageDefault()`, `DEFAULT_VER` in the
// table: house-v2 in every build, v3 some day). A link with `v=2` plays
// house-v2 for as long as this build or any later one can play it, because
// every later engine is a new version token and house-v2's plans and programs
// freeze at release the way house-v1's have.
//
// **The bar is read and never written** (Eugene, 09-22): *"while the player is
// working it must NOT put the current time position — the bar — in the URL.
// Users will bookmark or copy the link after they heard the track, so it could
// well be near the end; whoever gets the link would then hear the machine keep
// going and mix into the next track instead of the track the sender wanted to
// share."* A dev link may still carry one and the page opens there; the first
// write after a hand has started the set takes it off, so a copy is always the
// track from its beginning.
//
// The table itself is `src/link-table.ts`, which imports nothing, because the
// composer's own readers (`spell.ts`, `strategies/index.ts`, `development.ts`,
// `recipe-request.ts`, `set-plan.ts`) ask it and this module imports them.

import { parseSpell, spellQuery, HOUSE, BIRDS, BIRD_CODE } from './spell.ts';
import { note } from './ledger.ts';
import type { Spell } from './spell.ts';
import { recipeById } from './recipes.ts';
import { planTheme, recipesFor } from './mix.ts';
import type { Accompaniment } from './recipe-request.ts';
import type { Development } from './development.ts';
import { LINK_ROWS, ROW, SOUND, BYPASS_NAMES, VERSIONS, DEFAULT_VER, versionOf, verOf, pageDefault, linkQuery, linkRaw, linkValue } from './link-table.ts';
import type { LinkClass, LinkRow, Version } from './link-table.ts';

export { LINK_ROWS, VERSIONS, DEFAULT_VER, versionOf, verOf, pageDefault, linkRaw, linkValue };
export type { LinkClass, LinkRow, Version };

/** A link, read. */
export interface Link {
  /** `null`: the link names none, and the page opens where it would */
  seed: string | null;
  /** zero-based */
  theme: number;
  /** the strategy id the link plays: the one it names, or the page's default */
  strategy: string;
  /** whether the link named its engine (a bare link did not) */
  named: boolean;
  /** the spell as written, `null` where none is */
  spell: Spell | null;
  /** `'auto'`, a row id, or `null` for none */
  recipe: string | null;
  accompaniment: Accompaniment;
  development: Development;
  /** zero-based, or `null`; input only */
  bar: number | null;
  /** seconds into the theme, or `null` (K32): read once at the open, written only by `linkWithTime` */
  t: number | null;
  lock: boolean;
  view: string | null;
  out: 'direct' | 'element' | 'silent' | null;
  latency: AudioContextLatencyCategory | number | null;
  /** the bypass rows as given */
  bypass: Record<string, string>;
  /** every parameter with no row, kept as given and in order: the page plays without them */
  unknown: Array<[string, string]>;
}

/** One part of a link the page would not play, and what it said about it. */
export interface LinkProblem {
  /** the parameter that was taken off the address */
  param: string;
  /** the ring's one line: what was wrong, and what plays instead */
  short: string;
  /** the whole sentence, for the console, the ledger and a screen reader */
  long: string;
}

export interface LinkOptions {
  /** the engine a bare link plays; the page passes `pageDefault()` */
  pageDefault?: string;
  /** the engines a link can name; a check adds one that does not exist yet */
  versions?: readonly Version[];
  /**
   * Plan the whole request once, so a recipe the composer refuses is refused
   * here, out loud (default true). Off for the cheap reads of an address the
   * page has already repaired, and for a check planning an engine this build
   * does not have.
   */
  trial?: boolean;
}

const echo = (v: string) => JSON.stringify(v.length > 40 ? `${v.slice(0, 40)}…` : v);
const LATENCIES = ['interactive', 'balanced', 'playback'];

/**
 * **The reader.** The search string in; the link it asks for, the search
 * string the page will play (the given one, less what was refused) and what
 * was refused out.
 *
 * **A bad link is a ring with a line on it, never a black page** (Eugene,
 * 09-22). A parameter the page cannot play is taken off with a sentence saying
 * so: a seed nobody could type, a theme or a bar that is not a count, an
 * engine nothing answers to, a spell that does not parse, an accompaniment or
 * a development that is not one of the modes, a recipe the library does not
 * hold — and then (with `trial`) the whole request is planned once, so a recipe
 * the composer refuses (a hand part without its accompaniment, a complete
 * arrangement asked to develop) is refused here rather than as an exception
 * nobody catches. What is taken off falls back to what a bare link plays.
 *
 * Nothing on a link names a file or a path: a recipe is a name in the library
 * compiled into the page and nothing is fetched for it.
 *
 * Pure, so a check can sweep it.
 */
export function linkRead(search: string, opts: LinkOptions = {}): { link: Link; search: string; problems: LinkProblem[] } {
  const versions = opts.versions ?? VERSIONS;
  const fallback = opts.pageDefault ?? pageDefault();
  const q = linkQuery(search);
  const problems: LinkProblem[] = [];
  const refuse = (param: string, short: string, long: string) => {
    q.delete(param);
    problems.push({ param, short, long });
  };
  const seed = q.get('seed');
  if (seed !== null && !/^[!-~]{1,64}$/.test(seed.trim()))
    refuse('seed', 'bad seed · the house', `seed ${echo(seed)} is not a seed anybody could type; the page opens where it would with none`);
  for (const [param, word] of [['theme', 'theme one'], ['bar', 'bar one']]) {
    const v = q.get(param);
    if (v !== null && !(/^\d{1,4}$/.test(v) && Number(v) >= 1))
      refuse(param, `bad ${param} · ${word}`, `${param} ${echo(v)} is not a count from one; the page opens on ${word}`);
  }
  // The line says what plays, which is the page's default and not the record
  // (the reconciled review of 09-24, R125): it said "the record" while v2
  // played, and a listener reading it thought they were on v1.
  const ver = q.get('v');
  if (ver !== null && ver.trim() && !versionOf(ver, versions))
    refuse('v', `no such engine · v${verOf(fallback, versions)}`, `v ${echo(ver)} names no engine in this build; the page plays v${verOf(fallback, versions)}`);
  const spell = q.get('spell');
  if (spell !== null && spell.trim() && !parseSpell(spell))
    refuse('spell', 'bad spell · the house', `spell ${echo(spell)} does not read as name:value pairs; the page plays the house`);
  const accompaniment = q.get('accompaniment');
  if (accompaniment !== null && !['base', 'auto'].includes(accompaniment))
    refuse('accompaniment', 'bad accompaniment · the house', `accompaniment ${echo(accompaniment)} is not base or auto; the page plays base`);
  const development = q.get('development');
  if (development !== null && !['base', 'phrased', 'shaped', 'percussion'].includes(development))
    refuse('development', 'bad development · the house', `development ${echo(development)} is not a mode this page has; the page plays base`);
  // An empty recipe is none, as the link below reads it; it was refused as
  // "no recipe called \"\"" and then read as none anyway (R125).
  const recipe = q.get('recipe');
  if (recipe !== null && !['auto', 'none', ''].includes(recipe.trim())) {
    let row = null;
    try { row = /^[a-z0-9][a-z0-9/_-]{0,80}$/i.test(recipe.trim()) ? recipeById(recipe.trim()) : null; } catch (e) { row = null; }
    if (!row) refuse('recipe', 'no such recipe · the house', `no recipe in this build is called ${echo(recipe)}; the page plays the house`);
  }
  // The whole request, planned once: what the composer refuses is refused
  // here, until what is left plays. **One row is taken off where one is
  // enough**, the modes before the recipe: the recipe is what the link named,
  // and a mode round it is what made the pair illegal — `recipe=house/sub-room
  // &development=shaped` lost its recipe and kept the mode at fault (R66 of the
  // review of 09-24). Where no one row alone plays, the recipe goes first and
  // then the modes round it, as it always did.
  if (opts.trial !== false) {
    const refusal = (query: URLSearchParams): string | null => {
      try {
        const at = `?${query.toString()}`;
        const seedNow = (query.get('seed') || '1').trim();
        const theme = Math.max(0, Number(query.get('theme') || 1) - 1);
        const engine = versionOf(query.get('v'), versions)?.strategy ?? fallback;
        const cast = recipesFor({ masterSeed: seedNow, strategy: engine, search: at });
        planTheme(seedNow, theme, { strategy: engine, search: at, spell: cast.spell, recipe: cast.track });
        return null;
      } catch (e) {
        // **A thrown TypeError is ours, not a refusal** (K33, the held-errors
        // audit): a link the planner cannot read is refused with its reason,
        // and a bug under it — a TypeError, a ReferenceError — is a fault the
        // ledger names and the reports carry, and the link is not refused for it.
        if (e instanceof TypeError || e instanceof ReferenceError) {
          note('fault', 'the planner threw under a link', { error: String((e as Error).message).slice(0, 120) });
          return null;
        }
        return (e as Error).message || String(e);
      }
    };
    const refuseFor = (param: string, why: string) => {
      const alone = /layer playback is not implemented/.test(why);
      refuse(param, alone ? 'hand part alone · the house' : `${param} refused · the house`,
        alone ? `recipe ${echo(q.get('recipe') || '')} is a part and plays only over its accompaniment (add accompaniment=auto); the page plays the house`
          : `${param} ${echo(q.get(param) || '')} was refused: ${why}; the page plays without it`);
    };
    const why = refusal(q);
    if (why !== null) {
      const one = ['development', 'accompaniment', 'recipe'].find((param) => {
        if (!q.has(param)) return false;
        const without = new URLSearchParams(q);
        without.delete(param);
        return refusal(without) === null;
      });
      if (one) refuseFor(one, why);
      else {
        let now: string | null = why;
        for (const param of ['recipe', 'development', 'accompaniment']) {
          if (!q.has(param)) continue;
          refuseFor(param, now);
          if ((now = refusal(q)) === null) break;
        }
      }
    }
  }
  const named = versionOf(q.get('v'), versions);
  const version = named ?? versionOf(fallback, versions);
  const absent = version?.absent ?? { recipe: null, accompaniment: 'base' as Accompaniment, development: 'base' as Development };
  const count = (v: string | null) => (v !== null && /^\d{1,4}$/.test(v) && Number(v) >= 1 ? Number(v) - 1 : null);
  const out = q.get('out');
  const latency = q.get('latency');
  const recipeNow = q.get('recipe');
  const link: Link = {
    seed: q.get('seed')?.trim() || null,
    theme: count(q.get('theme')) ?? 0,
    strategy: named ? named.strategy : fallback,
    named: !!named,
    spell: parseSpell(q.get('spell')),
    recipe: recipeNow === null ? absent.recipe : ['', 'none'].includes(recipeNow.trim()) ? null : recipeNow.trim(),
    accompaniment: (q.get('accompaniment') as Accompaniment | null) ?? absent.accompaniment,
    development: (q.get('development') as Development | null) ?? absent.development,
    bar: count(q.get('bar')),
    t: (() => { const v = q.get('t'); return v !== null && /^\d{1,6}$/.test(v.trim()) ? Number(v.trim()) : null; })(),
    lock: q.get('lock') === 'engine',
    view: q.get('view'),
    out: out === 'direct' || out === 'element' || out === 'silent' ? out : null,
    latency: !latency ? null : LATENCIES.includes(latency) ? latency as AudioContextLatencyCategory
      : Number.isFinite(Number(latency)) && Number(latency) > 0 ? Number(latency) : null,
    bypass: Object.fromEntries(BYPASS_NAMES.filter((n) => q.has(n)).map((n) => [n, q.get(n)!])),
    unknown: [...q.entries()].filter(([k]) => !ROW[k]),
  };
  return { link, search: problems.length ? plain(q) : search.replace(/^\?/, ''), problems };
}

/**
 * **Whether two links play the same place**: the seed, the theme, the engine,
 * the spell (absent is the house), the recipe and the two modes, each read as
 * the page reads it, so a row written out and the same row left to its absence
 * are one place. Never the bar and never a view row. It is what a stored second
 * is resumed against (R26 of the review of 09-24): a link resumed at the
 * stored second whenever its seed and theme matched, under any engine, spell,
 * recipe or mode.
 */
export function linkSameSound(a: string, b: string, opts: LinkOptions = {}): boolean {
  const x = linkHere(a, opts), y = linkHere(b, opts);
  const birds = (s: Spell | null) => BIRDS.map((k) => (s ?? HOUSE)[k]).join(',');
  return x.seed === y.seed && x.theme === y.theme && x.strategy === y.strategy && birds(x.spell) === birds(y.spell)
    && x.recipe === y.recipe && x.accompaniment === y.accompaniment && x.development === y.development;
}

/**
 * **Whether a search string is a bare link**: no sound row on it at all (view
 * rows, bypass rows, a bar and unknown parameters may stand there). A bare
 * address is the page's to fill — from the link this browser stored, when
 * there is one (`control.ts`), else the page's defaults.
 */
export const linkBare = (search?: string | null): boolean => {
  const q = linkQuery(search);
  return SOUND.every((name) => !q.has(name));
};

/**
 * **A stored link over a bare address**: the stored link's sound rows, then
 * whatever the address carries (view rows, bypass rows, unknown parameters) in
 * its own order — the order `linkWrite` writes. Only the stored link's sound
 * rows are taken, and — since K21 — its machine view where the address names
 * none, so a store can never put a bar or anything else on the address. The
 * result is read like any link, refusals and all.
 */
export function linkOver(stored: string, search?: string | null): string {
  const from = linkQuery(stored), q = new URLSearchParams();
  for (const name of SOUND) { const v = from.get(name); if (v !== null) q.set(name, v); }
  const here = linkQuery(search);
  for (const [k, v] of here) q.append(k, v);
  if (from.get('view') === 'machine' && !here.has('view')) q.append('view', 'machine');
  return plain(q);
}

/**
 * **The machine view's row** (round K21, Eugene: *"the machine view should be
 * encoded in the URL so on a page refresh it is not gone"*): `view=machine` set
 * while the view is open and taken off when it closes, every other row kept
 * where it stands. Not a sound row: nothing a link plays depends on it.
 */
export function linkView(search: string | null | undefined, open: boolean): string {
  const q = linkQuery(search);
  if (open) q.set('view', 'machine');
  else q.delete('view');
  return plain(q);
}

/** The address as it stands, read through the table, with nothing planned: the page's own cheap read. */
export const linkHere = (search?: string | null, opts: LinkOptions = {}): Link =>
  linkRead(search ?? (typeof location !== 'undefined' ? location.search : ''), { ...opts, trial: false }).link;

/**
 * **The address bar as a person reads it.** A spell is
 * `?spell=em:1.00,ti:0.30` and not `?spell=em%3A1.00%2Cti%3A0.30`.
 * A colon and a comma are both legal where they stand — RFC 3986 puts `:` and
 * the sub-delimiter `,` in `pchar`, and a query is made of `pchar` — but
 * `URLSearchParams.toString()` escapes every sub-delimiter it knows about. Ours
 * are the separators, so they are unescaped again — and so is the slash of a
 * recipe's id (`house/hand-rolling`), which a query allows as it stands — and
 * nothing else is: the string still parses back through `URLSearchParams`
 * unchanged.
 */
const plain = (q: URLSearchParams): string => q.toString().replace(/%3A/g, ':').replace(/%2C/g, ',').replace(/%2F/g, '/');

/** A place, as the writer is handed one. */
export interface LinkState {
  seed: string;
  /** zero-based */
  theme: number;
  strategy: string;
  /**
   * The spell to write, or `null` to write none: the caller decides, because
   * only it knows whether the spell is a hand's or a roll a recipe would redo.
   * A spell at the house is written as all eight values (a recipe's home).
   */
  spell?: Partial<Spell> | null;
  recipe?: string | null;
  accompaniment?: Accompaniment;
  development?: Development;
}

/**
 * **The writer.** A place in, the search string out (no `?`).
 *
 * Always the seed and the engine as its version token; the theme past the
 * first (K34: a link without one plays the first); the spell as
 * the caller hands it; the recipe and the two modes wherever they are not what
 * that engine reads their absence as (`explicit` writes them regardless,
 * `recipe=none` included). Never the bar. Everything else on `base` — the view
 * rows, the bypass rows and any parameter with no row — is kept as it stands,
 * after the sound, in its own order.
 */
export function linkWrite(state: LinkState, base = '', opts: { explicit?: boolean; versions?: readonly Version[] } = {}): string {
  const versions = opts.versions ?? VERSIONS;
  const absent = versions.find((v) => v.strategy === state.strategy)?.absent;
  const q = new URLSearchParams();
  q.set('seed', String(state.seed));
  q.set('v', verOf(state.strategy, versions));
  // (K34, Eugene: "skip theme=1 … assume it's the default value if not set"): the
  // first theme is what a link without one plays, so it is left out, as a bird
  // at its house is
  const theme = Math.max(0, Math.floor(state.theme));
  if (theme > 0) q.set('theme', String(theme + 1));
  if (state.spell) q.set('spell', spellQuery(state.spell) ?? BIRDS.map((b) => `${BIRD_CODE[b]}:${HOUSE[b]}`).join(','));
  const recipe = state.recipe ?? null;
  if (opts.explicit || !absent || absent.recipe !== recipe) q.set('recipe', recipe ?? 'none');
  for (const [name, value] of [['accompaniment', state.accompaniment ?? 'base'], ['development', state.development ?? 'base']] as const)
    if (opts.explicit || !absent || absent[name] !== value) q.set(name, value);
  for (const [k, v] of linkQuery(base)) if (!SOUND.includes(k) && k !== 'bar' && k !== 't') q.append(k, v);
  return plain(q);
}

/**
 * **A dev deep link to a place in a track**: a written link with the bar on
 * it. For the tools that hand Eugene a moment to listen to (`tools/review`);
 * the page never calls it, and the check holds `src/` to that.
 */
export function linkAt(state: LinkState, bar: number, base = ''): string {
  const q = linkQuery(linkWrite(state, base));
  q.set('bar', String(Math.max(0, Math.floor(bar)) + 1));
  return plain(q);
}

/**
 * **The link with the time** (round K32, Eugene: *"another Copy Link with
 * time"*): the canonical link a state writes, and `t`, whole seconds into the
 * theme. The page opened on it starts the theme at the bar line at or before
 * that second and drops `t` from its address; the canonical link, a digest row
 * and the address the page keeps never carry it (`linkWrite` drops it from a
 * base, as it drops the bar). The machine view's key calls this with the
 * transport's second.
 */
export function linkWithTime(state: LinkState, seconds: number, base = ''): string {
  const q = linkQuery(linkWrite(state, base));
  q.set('t', String(Math.max(0, Math.floor(Number(seconds) || 0))));
  return plain(q);
}

/** The address without one of its rows (the time link's `t` once read): every other row where it stands. */
export function linkWithout(search: string | null | undefined, name: 't'): string {
  const q = linkQuery(search);
  q.delete(name);
  return plain(q);
}

export default LINK_ROWS;
