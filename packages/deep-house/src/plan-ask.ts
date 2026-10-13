// **A plan asked of another thread, and answered**: the three halves of the
// one call (`planTheme`, `src/planning.ts`) when it is made in the planner's
// worker (`src/plan-worker.ts`) rather than on the page's thread (the planning
// perf round, 10-12).
//
// A plan is data but for one field. `style` is the music the plan was made
// in, a module's object with functions in it, and it is the same object on
// both threads because both load the same module — so it never crosses: the
// ask names the strategy, the worker plans in that strategy's style and
// answers with the field emptied in place (so the plan's keys keep their
// order), and the page puts its own style back. The one other thing a plan
// carries is beside it and not in it: who played the bass lane, which the
// composer remembers per plan (`bassLaneOf`) and a held bird's seasoning reads
// (`seasonOf`); it crosses as a list and is remembered again on arrival.
//
// Everything else crosses by the structured clone, which keeps every number
// as it was (a minus nought, an infinity), every key in its order and every
// shared object shared. `tools/check-plan-worker.ts` holds a worker's plans to
// this thread's over the link digest's grid, byte for byte.

import { planTheme } from './planning.ts';
import { strategyById } from './strategies/index.ts';
import { accompanimentFor } from './recipe-request.ts';
import { developmentFor } from './development.ts';
import { bassLaneOf, keepBassLane } from './generator.ts';
import { applyBypass } from './set-plan.ts';
import { programOf, adoptProgram } from './performance.ts';
import type { Bypass, MixOptions, SetTrack } from './set-plan.ts';
import type { Program } from '@deep-house/engine/program';
import type { Style } from '@deep-house/engine/style';

/**
 * What a worker is asked: the theme, the request with its style left out, the
 * room's bypass the plan is played under (folded in as `applyBypass` folds it
 * here), and whether the plan's program is wanted too.
 */
export interface PlanAsk {
  seed: string | number;
  index: number;
  opts: Partial<MixOptions>;
  bypass: Bypass | null;
  program: boolean;
}

/**
 * What it answers: the plan with `style` emptied, the bass lane its composer
 * remembered, and its program where one was asked for — in one message, so
 * what the program shares with the plan is shared on arrival.
 */
export interface PlanAnswer {
  plan: SetTrack;
  bassLane: string[] | null;
  program: Program | null;
}

/**
 * **The ask for a request, or null where only this thread can plan it.** A
 * stated style that is not its strategy's own (a bench's, a check's) stays
 * here; so does an ask that cannot be resolved (an unknown mode throws here,
 * as the plan itself would). The two modes are resolved here, off this
 * thread's address, because the worker's address is its own script's.
 */
export function askOf(seed: string | number, index: number, opts: Partial<MixOptions>, bypass: Bypass | null = null, program = false): PlanAsk | null {
  const own = strategyById(opts.strategy).style;
  if (opts.style && opts.style !== own) return null;
  let accompaniment, development;
  try {
    accompaniment = accompanimentFor(opts);
    development = developmentFor(opts);
  } catch (e) {
    return null;
  }
  const { style: _style, destination: _destination, ...rest } = opts;
  return { seed, index, opts: { ...rest, accompaniment, development }, bypass, program };
}

/** The plan a request makes on this thread: `planTheme`, the bypass folded in. The fallback and the check's reference. */
export const planHere = (seed: string | number, index: number, opts: Partial<MixOptions>, bypass: Bypass | null): SetTrack =>
  applyBypass(planTheme(seed, index, opts), bypass);

/** A plan made in the worker, kept there by its request: the plan itself, its bass lane, and its program once asked for. */
export interface Planned { plan: SetTrack; lane: ReadonlySet<string> | null; program: Program | null }

/** The worker's half: the plan, made in the strategy's own style with the bypass folded in. */
export function planAsked(ask: PlanAsk): Planned {
  const plan = planHere(ask.seed, ask.index, { ...ask.opts, style: strategyById(ask.opts.strategy).style }, ask.bypass);
  return { plan, lane: bassLaneOf(plan), program: null };
}

/** And what crosses back: the plan with its style emptied, the lane as a list, the program compiled where asked. */
export function answerOf(made: Planned, program: boolean): PlanAnswer {
  if (program && !made.program) made.program = programOf(made.plan);
  return { plan: { ...made.plan, style: null as unknown as Style }, bassLane: made.lane ? [...made.lane] : null, program: program ? made.program : null };
}

/** The whole of the worker's half, for one ask. */
export const answerAsk = (ask: PlanAsk): PlanAnswer => answerOf(planAsked(ask), ask.program);

/** The page's half: its own style put back where the field stood, the bass lane remembered, the program taken as the plan's. */
export function adopt(answer: PlanAnswer, style: Style): SetTrack {
  const plan = answer.plan;
  plan.style = style;
  if (answer.bassLane) keepBassLane(plan, answer.bassLane);
  if (answer.program) adoptProgram(plan, answer.program);
  return plan;
}

/** The style a request plans in: the one it states, or its strategy's. */
export const styleOfAsk = (opts: Partial<MixOptions>): Style => opts.style || strategyById(opts.strategy).style;

/**
 * One string per request, for the worker's memo: every value as itself,
 * a minus nought and an absent field included, so two asks share an answer
 * only when they are the same ask.
 */
export function askKey(ask: PlanAsk): string {
  return JSON.stringify([ask.seed, ask.index, ask.opts, ask.bypass], (_k, v) => (v === undefined ? '\u0000undefined'
    : typeof v === 'number' && !Number.isFinite(v) ? `\u0000${v}` : typeof v === 'number' && Object.is(v, -0) ? '\u0000-0' : v));
}
