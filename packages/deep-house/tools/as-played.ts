// **The checks read what the app plays** (PLAN-UNIFY U0, from the deep code review of 10-12). At the fast places the
// producer (`src/producer.ts`) arranges the whole track after the planners: it retires what they laid (the soloist's
// statements, the bed, the bell, the keys' echoes) and writes its own phrases, pads, drum states and bass moves. A
// check that plans the style without it tests a configuration nobody hears. So the planners' checks
// (`check-ambient.ts`, `check-ambient-voices.ts`, `check-keys.ts`) hold each rule twice:
//
//   - **as the app plays it** (the house-v2 style whole): every rule holds, but for the departures the arrangement
//     makes from a planner's rule, each named here by the check with what it is and why; each departure's count is
//     said on the test (`diagnostic`) and summed at the end, so the list a later round fixes is in the output, and a
//     departure of a new kind fails;
//   - **the planner alone** (no place naming a passage or a producer): the planner's own invariants, kept because a
//     place without the producer will play them (the slow side, in the bird-relative rounds).
import assert from 'node:assert/strict';
import test from 'node:test';
import { strategyById } from '../src/strategies/index.ts';
import { withoutTechniques } from '../src/places.ts';

/** The style the app plays (house-v2, every place's techniques on). */
export const APP = strategyById('house-v2').style;
/** The planners alone: the style with no place naming a passage (nor the producer that keeps it). */
export const PLANNERS = withoutTechniques(APP, 'passage');

/** A rule's faults, gathered rather than thrown: `check(ok, says)`. */
export function faults(): { out: string[]; check: (ok: unknown, says: string) => void } {
  const out: string[] = [];
  return { out, check: (ok, says) => { if (!ok) out.push(says); } };
}

/** A departure the app's arrangement makes from a planner's rule: a pattern over the fault's words, and why it is one. */
export interface Departure { id: string; match: RegExp; why: string }

/**
 * Hold the app's faults: every one a named departure (counted into `tally` and said on the test), none of a new kind.
 * Returns the departures' counts for this theme.
 */
export function asPlayed(ctx: { diagnostic: (m: string) => void }, found: string[], known: readonly Departure[], tally: Map<string, { n: number; themes: number; first: string }>): void {
  const unknown = found.filter((f) => !known.some((k) => k.match.test(f)));
  for (const k of known) {
    const xs = found.filter((f) => k.match.test(f));
    if (!xs.length) continue;
    const was = tally.get(k.id) ?? { n: 0, themes: 0, first: xs[0] };
    tally.set(k.id, { n: was.n + xs.length, themes: was.themes + 1, first: was.first });
    ctx.diagnostic(`as the app plays it, ${k.id}: ${xs.length} (${xs[0]})`);
  }
  assert.deepEqual(unknown, [], 'what the app plays breaks a rule in a way no departure names');
}

/** The closing line: each departure's count over the themes, what it is and why (registered last in a check's file). */
export function departuresSaid(name: string, known: readonly Departure[], tally: Map<string, { n: number; themes: number; first: string }>): void {
  test(`${name}: the departures what the app plays makes from the planners' rules, counted`, (ctx) => {
    for (const k of known) {
      const x = tally.get(k.id);
      ctx.diagnostic(x ? `${k.id}: ${x.n} in ${x.themes} of the tests read as the app plays (first: ${x.first}) — ${k.why}` : `${k.id}: none — ${k.why}`);
    }
  });
}
