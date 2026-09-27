// Where a set's seams fall, worked out from the plans alone.
//
// This used to be the arithmetic `renderMix` does before it builds a node,
// written a second time — deliberate duplication, checked rather than trusted,
// because two things stood on it: the scene gate, which has to know where the
// first seam of a set is *before* it renders one, and `tools/check.ts`, which
// sweeps nine hundred pairs of it and needs no browser to do so.
//
// Round E of PLAN-V1-NEXT made them one function. The set's layout is
// `setLayout` in `src/set-plan.ts` — pure, no context, no nodes — and the live
// engine, the offline render, the scene gate and the checks all read that one.
// What is left here is the name the tools have always imported it by — bound
// to the build's own style, which round F of PLAN-V1-NEXT made an argument:
// `src/mix.ts` is where the machine is told which music it is playing, so that
// is where the bound `setLayout` comes from and a tool asks for the one thing
// it always asked for.
//
// It runs on a machine and imports src/ directly, the way tools/golden.ts
// does; nothing here is ever served to a browser.

export { setLayout, setLayout as default } from '../src/mix.ts';
export { swapAfterBars } from '../src/set-plan.ts';
