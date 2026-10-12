// The shared ground of the check-composer shards (the review of 10-08, A4: the
// one file of 55 tests ran serially in about two minutes; it is four files
// `node --test` runs side by side, each planning a theme once, `composer-plans.ts`).
// The shards are `check-composer-phrases.ts`, `-swells.ts`, `-sections.ts` and
// `-places.ts`, in the order the tests stood; what they share is here.
//
// The composer's holes within the locks: round (e) of the reconciled review of
// 09-24 (`notes/reviews/RECONCILED-2026-09-24.md` §4 (e)). Each test is the
// finding's reproduction swept over seeds, red on the code the review read and
// green after its fix. house-v1 never moves: a fix that reaches a plan is
// house-v2's alone, by what its style carries (the motif, the composition
// policy, the organ rule) or by a switch (`sectionEdges`, and round (g)'s
// `sectionPhrases` and `leadIns`), and the golden and program digests hold v1
// byte for byte.
import { planTheme } from './composer-plans.ts';
import Rng from '../src/rng.ts';
import { programOf, seamPlan, blendAsked } from '../src/performance.ts';
import { interpretWants } from '../src/interpret.ts';
import { laneLevelDb, ROOM_OFF_DB } from '../src/lane-level.ts';
import { silentRuns } from '../src/silence.ts';
import { readFileSync } from 'node:fs';
import { makeArrangement, pushCurve, sectionGrid, layersAtBar, cutMainsFirst, mainsApart, type Arrangement, type Section } from '../src/arrangement.ts';
import { organTheme } from '../src/set-plan.ts';
import { generate } from '../src/generator.ts';
import { style, settings } from '../src/styles/deep-house-v2.ts';
import { style as v1 } from '../src/styles/deep-house.ts';
import { HOUSE, biasFor } from '../src/spell.ts';
import { swellsOf, spellVerdict } from '../src/swell.ts';
import { sweepsOf } from '../src/sweep.ts';
import { soloPlace, soloEvents, soloCeiling, soloMinBars, SOLO_MIN_MINUTES, SOLO_POP_DB, SOLO_SECTION_BARS } from '../src/solo.ts';

export const v2 = { strategy: 'house-v2', spell: HOUSE } as const;
// The lead-ins' own rules are asked with round S14's glue gates off: since S14
// the house's dark casts keep no noise glue, and the lead-in is what is placed
// before the gates take it.
// The house's own tables everywhere (GA6's place tables off): the composer's
// rules about its own form, harmony and bass are asked of its own form,
// harmony and bass, whatever the birds; the place tables are checked on their own.
export const houseTables = { ...style, switches: { ...(style.switches as Record<string, boolean>), placeTables: false } } as typeof style;
export const leadInStyle = { ...style, switches: { ...(style.switches as Record<string, boolean>), glueGates: false, placeTables: false } } as typeof style;
export type Plan = ReturnType<typeof planTheme>;
export const pcIn = (t: Plan, midi: number) => t.key.scale.includes(((midi - t.key.root) % 12 + 12) % 12);

// **The lead-ins as the plan writes them** (R34), read off the glue lanes'
// events by their shape, since house-v2's glue lanes draw kitchen voices and a
// name says nothing: a rise ends on the line it leads into (0.35, 0.5 or 0.65),
// a long swell arrives on it with the length of a rise, the swell that comes
// with an impact arrives on it in 1.8 s, the impact is on it (0.65, no length),
// and the fall is the bar before it (0.45, one bar).
export const RHYTHM_GATES = ['kick', 'hatClosed', 'hatOpen', 'sixteenths', 'clap', 'bass'];
export function leadInsOf(t: Plan) {
  const bs = t.barSeconds, glue = t.events.filter(e => (e.role === 'texture' || e.layer === 'fx') && e.p.gain !== undefined);
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const played = new Set(t.timeline.flatMap(r => r.layers.filter(l => RHYTHM_GATES.includes(l))));
  const secs = t.arrangement.sections;
  const risers = glue.filter(e => e.p.dur && e.p.dur >= bs - 1e-9 && [0.35, 0.5, 0.65].includes(e.p.gain!) && secs.some(x => x.startBar > 0 && near(e.t + e.p.dur!, x.startBar * bs)));
  const returns = secs.flatMap((s, i) => {
    const next = secs[i + 1];
    if (!next || !['drop', 'main'].includes(next.kind) || s.phrases.at(-1)!.layers.kick) return [];
    const line = next.startBar;
    if (t.timeline[line - 1].layers.includes('kick') || !t.timeline[line].layers.includes('kick')) return [];
    const at = line * bs, before = t.timeline[line - 1].layers, after = t.timeline[line].layers.filter(l => RHYTHM_GATES.includes(l));
    const gained = after.filter(l => !before.includes(l)).length, missing = [...played].filter(l => !after.includes(l)).length;
    const rise = risers.find(e => near(e.t + e.p.dur!, at));
    const long = glue.find(e => near(e.t, at) && e.p.dur && e.p.dur > 2);
    const swell = glue.find(e => near(e.t, at) && e.p.dur && e.p.dur <= 2);
    const impact = glue.find(e => near(e.t, at) && !e.p.dur && e.p.gain === 0.65);
    const fall = glue.find(e => near(e.t, at - bs) && e.p.gain === 0.45 && near(e.p.dur!, bs));
    const kind = rise ? 'riser' : long ? 'swell-long' : swell && impact ? 'swell+impact' : impact ? 'impact' : fall ? 'fall' : 'none';
    return [{ line, s, next, kind, rise: rise ?? long, contrast: gained / Math.max(1, gained + missing), gained }];
  });
  return { risers, returns };
}

export {
  planTheme,
  Rng,
  programOf,
  seamPlan,
  blendAsked,
  interpretWants,
  laneLevelDb,
  ROOM_OFF_DB,
  silentRuns,
  readFileSync,
  makeArrangement,
  pushCurve,
  sectionGrid,
  layersAtBar,
  cutMainsFirst,
  mainsApart,
  organTheme,
  generate,
  style,
  settings,
  v1,
  HOUSE,
  biasFor,
  swellsOf,
  spellVerdict,
  sweepsOf,
  soloPlace,
  soloEvents,
  soloCeiling,
  soloMinBars,
  SOLO_MIN_MINUTES,
  SOLO_POP_DB,
  SOLO_SECTION_BARS
};
export type { Arrangement, Section };
