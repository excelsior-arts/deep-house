// Every treated voice on a lane the stage colours takes its colour (R3 of the
// reconciled review of 09-24): a note handed `lpMul` walks a lowpass down by
// that factor across the note, and one handed `hpMul` walks a highpass up by
// it — on the voice's own filter or on the stage's (`treat.ts`'s
// `stageTone`), whichever it has.
//
//   node --test tools/check-stage.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSettings } from '../src/settings.ts';
import { REGISTRY, VOICES } from '../src/voices/index.ts';
import { standin } from './standin.ts';
import { table } from './fixture.ts';

const settings = resolveSettings({ base: table, room: {} });
const setTimer = globalThis.setTimeout;
globalThis.setTimeout = ((fn: () => void, ms?: number) => { const t = setTimer(fn, ms); (t as unknown as { unref?: () => void }).unref?.(); return t; }) as typeof setTimeout;
// The layers the stage writes a colour onto (`performance.ts`, the stage's
// rows): the harmonic lanes. A treated voice on the bass lane is treated for
// the rota's inserts and is not coloured.
const COLOURED = new Set(['pad', 'keys']);

// Walked by `ratio` across the note: some filter of `type` whose frequency is
// set to f and ramped exponentially to f × ratio.
function walks(ctx: ReturnType<typeof standin>, type: string, ratio: number): boolean {
  return ctx.nodes.some((n) => n.type === type && (() => {
    const e = n.frequency.events;
    const set = e.find((x) => x[0] === 'set');
    const exp = e.find((x) => x[0] === 'exp');
    return !!set && !!exp && Math.abs((exp[1] as number) / (set[1] as number) - ratio) < 1e-6;
  })());
}

for (const d of REGISTRY.filter((v) => v.treat && COLOURED.has(v.layer))) {
  test(`${d.name} takes the stage's colour`, () => {
    const out = () => { const c = standin(); return { ctx: c, out: { dry: c.createGain(), delay: c.createGain(), reverb: c.createGain(), room: c.createGain(), hall: c.createGain(), background: c.createGain(), immersed: c.createGain() } }; };
    const lp = out();
    VOICES[d.name](lp.ctx as unknown as BaseAudioContext, lp.out as never, 0.1, { midi: 60, vel: 0.8, dur: 1, lpMul: [1, 0.25] }, settings);
    assert.ok(walks(lp.ctx, 'lowpass', 0.25), `${d.name} ignores lpMul`);
    const hp = out();
    VOICES[d.name](hp.ctx as unknown as BaseAudioContext, hp.out as never, 0.1, { midi: 60, vel: 0.8, dur: 1, hpMul: [1, 4] }, settings);
    assert.ok(walks(hp.ctx, 'highpass', 4), `${d.name} ignores hpMul`);
  });
}
