import assert from 'node:assert/strict';
import test from 'node:test';
import { bodyCurve } from '../src/voices/reese-body.ts';
import { REESE } from '../src/voices/reese.ts';
import { asSound, soundDescriptor } from '../src/voices/sound.ts';
import { StandinContext } from './standin.ts';
import type { NoteParams } from '../src/voices/descriptor.ts';
import type { Settings } from '../src/settings.ts';
import row from '../sounds/bass/reeseSub.json' with { type: 'json' };

const voice = soundDescriptor(asSound(row), REESE).render;
function graph(p: NoteParams): StandinContext {
  const ctx = new StandinContext();
  voice(ctx as unknown as BaseAudioContext, { dry: ctx.destination as unknown as AudioNode }, 0.125,
    { midi: 28, dur: 1, ...p }, {} as Settings);
  return ctx;
}
const shape = (ctx: StandinContext) => ctx.nodes.map((n) => ({
  type: n.type, params: Object.values(n.params).map((p) => [p.value, p.events]),
  sets: n.sets, starts: n.starts, stops: n.stops,
  connections: n.connections.map((to) => ctx.nodes.indexOf(to as typeof n)),
}));

test('a neutral body request preserves the existing graph, paired or unpaired', () => {
  for (const p of [{}, { subBeatLevel: 0 }, { subBodyFollow: 0 }])
    assert.deepEqual(shape(graph(p)), shape(graph({ ...p, bodyCurve: [0, 1, 1, 1] })));
});

test('a seek reads the accent in progress and does not replay it afterwards', () => {
  const curve = [0, 1, 0.5, 2, 1, 1];
  assert.deepEqual(bodyCurve(curve, 0.25), [0, 1.5, 0.25, 2, 0.75, 1]);
  assert.equal(bodyCurve(curve, 1.1), null);
  assert.deepEqual(bodyCurve([0, 1, 1, 2], 2), [0, 2], 'a final non-unity value holds');
  for (const p of [{}, { subBeatLevel: 0 }, { subBodyFollow: 0 }]) {
    const ctx = graph({ ...p, bodyCurve: curve, dur: 0.75, curveDuration: 1 });
    const gain = ctx.nodes.find((n) => n.type === 'gain' && n.gain.events.length === 3
      && n.gain.events[1][0] === 'lin' && n.gain.events[1][2] === 0.375);
    assert.ok(gain, 'the voice writes the remaining accent at the seek');
    const scale = p.subBeatLevel === 0 || p.subBodyFollow === 0 ? 0.1 : 1;
    const less = scale === 0.1 ? 1 : 0;
    assert.equal(gain.gain.events[0][1], scale * (1.5 - less));
    assert.equal(gain.gain.events[2][2], 0.875);
  }
});

test('malformed and unbounded curves fall back without building an accent', () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (const curve of [[], [0, 1], [0, 1, 0, 2], [-1, 1, 1, 2], [0, 1, 61, 2],
      [0, 1, 1, NaN], [0, 1, 1, -1], [0, 1, 1, 9], [0, 1, 1], Array(258).fill(1)]) {
      assert.equal(bodyCurve(curve, 100), null, 'validation precedes trimming');
      assert.deepEqual(shape(graph({})), shape(graph({ bodyCurve: curve })));
    }
  } finally { console.warn = warn; }
});
