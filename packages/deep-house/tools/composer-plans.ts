// **The composer checks' plans, made once** (the review of 10-08, A4): the
// check-composer shards ask the same theme of the same style many times over
// (the house's golden themes, the benchmark at its spell, a seed under v2), and
// a plan is pure — the same request is the same plan — so each is planned once
// per shard and handed back deep-frozen (its program is compiled once already: `programOf`'s own cache), so no test can write into what the
// next one reads. A style, a recipe or a library is keyed by its identity (a
// test's hand-built style is its own key); everything else by its value.
import { planTheme as planThemeOf } from '../src/mix.ts';

const ids = new WeakMap<object, number>();
let next = 0;
const idOf = (o: object): number => { let id = ids.get(o); if (id === undefined) { id = ++next; ids.set(o, id); } return id; };
const BY_IDENTITY = new Set(['style', 'recipe', 'library', 'visit']);
const keyOf = (seed: unknown, n: unknown, opts: Record<string, unknown> | undefined): string =>
  JSON.stringify([String(seed), n, opts && Object.keys(opts).sort().map((k) => {
    const v = opts[k];
    return [k, BY_IDENTITY.has(k) && v && typeof v === 'object' ? `#${idOf(v)}` : v];
  })]);

/** Freeze a value and everything it holds, once. */
export function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v) && !ArrayBuffer.isView(v)) {
    Object.freeze(v);
    for (const x of Object.values(v as object)) deepFreeze(x);
  }
  return v;
}

const PLANS = new Map<string, ReturnType<typeof planThemeOf>>();
/** `planTheme`, planned once per request and deep-frozen. */
export const planTheme: typeof planThemeOf = ((seed: Parameters<typeof planThemeOf>[0], n: Parameters<typeof planThemeOf>[1], opts?: Parameters<typeof planThemeOf>[2]) => {
  const key = keyOf(seed, n, opts as Record<string, unknown> | undefined);
  let plan = PLANS.get(key);
  if (!plan) { plan = deepFreeze(planThemeOf(seed, n, opts)); PLANS.set(key, plan); }
  return plan;
}) as typeof planThemeOf;

