// **A break keeps its rhythm in beat-led places** (round break-pulse-rule, `src/break-pulse.ts`): what the rule may and
// may not do, read off the plans. The deep and slow places keep their break; a beat-led one keeps one carrier of its own
// sounds inside its beatless stretch and nothing else moves; the beat's style picks it and the birds steer it.
import assert from 'node:assert/strict';
import test from 'node:test';
import { played } from './link-digest.ts';
import { linkOf } from './check-program-guards.ts';
import { lengthSpells } from './length-table.ts';
import { FEATURED } from '../src/featured.ts';
import { planTheme } from '../src/mix.ts';
import { beatLed } from '../src/performance.ts';
import { style } from '../src/styles/deep-house-v2.ts';
import { BREAK_PULSE } from '../src/break-pulse.ts';
import { VOICE_BUS } from '@deep-house/engine/voices';
import { dbToGain } from '@deep-house/engine/dsp';

const quiet = <T>(f: () => T): T => { const k = [console.log, console.info, console.warn]; console.log = console.info = console.warn = () => {}; try { return f(); } finally { [console.log, console.info, console.warn] = k; } };
const off = { ...style, switches: { ...(style.switches as Record<string, boolean>), breakPulse: false } } as typeof style;
const linkNamed = (name: string) => { for (const f of FEATURED) for (const [i, l] of f.links.entries()) if (`${f.name} - ${f.labels?.[i]}` === name) return l; throw new Error(name); };
const withSpell = (link: string, set: Record<string, number>) => {
  const q = new URLSearchParams(link);
  const sp = Object.fromEntries((q.get('spell') ?? '').split(',').filter(Boolean).map((x) => x.split(':')));
  for (const [k, v] of Object.entries(set)) sp[k] = v.toFixed(2);
  q.set('spell', Object.entries(sp).map(([k, v]) => `${k}:${v}`).join(','));
  return decodeURIComponent(q.toString());
};
/** the link's plan with the rule and without it */
const both = (link: string, theme?: number) => quiet(() => {
  const { seed, request, plan } = played(link, theme) as any;
  const was = planTheme(seed, theme ?? plan.index ?? 0, { ...request, style: off }) as any;
  return { plan, was };
});
const isDrum = (e: any) => VOICE_BUS[e.voice] === 'kick' || VOICE_BUS[e.voice] === 'drums';
const key = (e: any) => `${e.t.toFixed(5)}|${e.voice}|${JSON.stringify(e.p)}`;

test('the deep and slow places keep their beatless break: the house, Downtempo, Trip Hop and every ambient place, seeds 1-6', () => {
  for (const { name, spell } of lengthSpells()) {
    if (/Drum|Dubstep|Trance|Techno|Breaks/.test(name)) continue;
    for (let s = 1; s <= 6; s++) for (let t = 0; t < 3; t++) {
      const { plan } = quiet(() => played(linkOf(String(s), spell, t), t)) as any;
      assert.ok(!plan.breakPulse, `${name} ${s}/${t + 1}: a break carrier at ${plan.bpm.toFixed(0)} BPM`);
      assert.ok(!plan.events.some((e: any) => String(e.by ?? '').startsWith('break-pulse/')), `${name} ${s}/${t + 1}: a carrier's hit`);
    }
  }
});

test('a break reads the tempo as played: a slow theme whose drums run double is beat-led on a hand-over and not in its break', () => {
  let found = 0;
  const trip = lengthSpells().find((x) => /Trip Hop/.test(x.name))!;
  for (let s = 1; s <= 12; s++) for (let t = 0; t < 3; t++) {
    const { plan } = quiet(() => played(linkOf(String(s), trip.spell, t), t)) as any;
    const felt = beatLed(plan), playedV = beatLed(plan, plan.bpm, { tempo: 'played' });
    assert.ok(playedV.felt === +plan.bpm.toFixed(1) && playedV.value <= felt.value, `${s}/${t + 1}: the played reading doubles`);
    if (felt.value >= 0.5 && playedV.value < 0.5) { found++; assert.ok(!plan.breakPulse, `${s}/${t + 1}: a felt-only beat-led theme keeps a carrier`); }
  }
  assert.ok(found >= 3, `${found} trip hop themes read double on the grid`);
});

test('the featured tracks: the beat style picks the carrier, it plays only inside the beatless stretch, and nothing else moves', () => {
  const expect: Record<string, string> = { 'Vibe - Solar Wind': 'half-time', 'Drive - Supercell': 'pump', 'Vibe - Undertow': 'hats', 'Drive - Static Charge': 'hats' };
  for (const [name, carrier] of Object.entries(expect)) {
    const { plan, was } = both(linkNamed(name));
    const bp = plan.breakPulse;
    assert.ok(bp, `${name}: no carrier`);
    assert.equal(bp.carrier, carrier, `${name}: ${bp.carrier}`);
    const bs = plan.barSeconds;
    // inside: a hit in a stretch, or a note sounding into one (the pump rides those)
    const inside = (e: any) => bp.breaks.some((b: any) => e.t < b.until * bs - 1e-6 && (e.t >= b.from * bs - 1e-6 || e.t + (Number(e.p.dur) || 0) > b.from * bs + 1e-6));
    // outside the stretches every event as it was
    assert.deepEqual(plan.events.filter((e: any) => !inside(e)).map(key).sort(), was.events.filter((e: any) => !inside(e)).map(key).sort(), `${name}: an event outside the break moved`);
    for (const b of bp.breaks) {
      const ins = plan.events.filter((e: any) => e.t >= b.from * bs - 1e-6 && e.t < b.until * bs - 1e-6);
      // never a kick, and a drum carrier's hits are copies of the groove's own voices
      assert.ok(!ins.some((e: any) => VOICE_BUS[e.voice] === 'kick'), `${name}: a kick in the break`);
      const groove = new Set(plan.events.filter((e: any) => isDrum(e) && !String(e.by ?? '').startsWith('break-pulse/')).map((e: any) => e.voice));
      for (const e of ins) if (String(e.by ?? '').startsWith('break-pulse/')) assert.ok(groove.has(e.voice), `${name}: a carrier voice the groove never plays (${e.voice})`);
      assert.ok(b.liftDb <= BREAK_PULSE.level.most && b.liftDb >= BREAK_PULSE.level.least, `${name}: lift ${b.liftDb}`);
    }
    if (carrier === 'pump') {
      // a few dB at most, never a gate: every pumped note's path stays within the deepest stage of its own level
      const deepest = dbToGain(-Math.max(BREAK_PULSE.pump.depthDb.light, BREAK_PULSE.pump.depthDb.first, BREAK_PULSE.pump.depthDb.last)) - 1e-3;
      const id = (e: any) => `${e.t.toFixed(5)}|${e.voice}|${e.p.midi}`;
      const pathless = new Set(was.events.filter((e: any) => e.p.gainPath === undefined).map(id));
      const pumped = plan.events.filter((e: any) => Array.isArray(e.p.gainPath) && pathless.has(id(e)) && inside(e));
      assert.ok(pumped.length > 0, `${name}: no note pumped`);
      for (const e of pumped) { const v = (e.p.gainPath as number[]).filter((_, k) => k % 2); assert.ok(Math.min(...v) >= deepest, `${name}: a pump deeper than its row (${Math.min(...v)})`); }
    }
  }
});

test('the birds steer the approach where more than one fits: Vibe - Solar Wind at its own birds, a close dry room and a wide heavy one', () => {
  const link = linkNamed('Vibe - Solar Wind');
  const at = (set: Record<string, number>) => (quiet(() => played(withSpell(link, set))) as any).plan.breakPulse;
  assert.equal(at({}).carrier, 'half-time');
  assert.equal(at({ ti: 0.10 }).carrier, 'hats');
  assert.equal(at({ ti: 0.70, ro: 0.95 }).carrier, 'pump');
  // the pump has no weight of its own: at the house's middle it is never drawn where a drum carrier fits
  const w = at({ ti: 0.5, ro: 0.5 }).weights;
  assert.equal(w.pump, 0);
});
