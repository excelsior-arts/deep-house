// Two styles that exist only to be counted: one with **two** lanes and one with
// **twelve** that are not the record's twelve.
//
// Round K6. Eugene's decision of 09-18 is that the number of lanes belongs to
// the style — "we could have up to 12, and for some styles it could be only 2,
// like ambient" — and a decision like that is only true if nothing downstream
// assumes a number. The record cannot prove it: house-v1 and house-v2 both have
// twelve lanes and the same twelve, so a composer that quietly hard-coded eight
// arrangement layers and four pieces of glue would pass every gate there is.
//
// **These are fixtures and not strategies.** They are in `tools/` and not in
// `src/`, no strategy names them, they are in no bundle, and nothing a listener
// can reach resolves to one — the same arrangement `packages/engine/tools/
// fixture.ts` has, for the same reason: a table with no music in it, held to the
// contract the styles are held to.
//
// What they are made of is house-v1's own data with one field replaced, so they
// cannot go stale behind a change to the record: the lane table and the section
// grammar that gates it. Both are derived from `style.lanes`, so a lane row that
// grows a field grows it here too.

import { style as houseV1 } from '../src/styles/deep-house.ts';
import { SIXTEENTH_MASKS } from '../src/catalogue.ts';

/** A grammar whose every kind switches on exactly the gates it is given. */
function grammarFor(gates) {
  const on = Object.fromEntries(gates.map((g) => [g, true]));
  const kinds = {};
  for (const [name, kind] of Object.entries(houseV1.sections.kinds)) {
    kinds[name] = { ...kind, layers: () => ({ ...on }) };
  }
  return { kinds, labelToKind: houseV1.sections.labelToKind };
}

/** house-v1's own row for a lane, by id, so a fixture never transcribes one. */
const rowOf = (id) => houseV1.lanes.find((l) => l.id === id);

/**
 * The one room a fixture needs, and why it cannot be either of the record's.
 *
 * Neither measured room lets every lane of the twelve-lane table sound: the
 * **sub** room turns the clap off and the **growl** room turns the sixteenths
 * off, which is a real fact about the record and not an accident. So a fixture
 * takes the growl room and has those two answers taken off it — the same move
 * `roomsUnder` makes in `src/styles/deep-house-v2.ts` when a switch goes on, and
 * for the same reason: a room's own answer is what stops a lane being heard.
 */
const growl = houseV1.rooms.growl;
const FIXTURE_ROOM = {
  ...growl,
  id: 'fixture',
  label: 'the fixture room: the growl room with nothing switched off',
  shape: Object.fromEntries(Object.entries(growl.shape || {}).filter(([k]) => k !== 'sixteenths')),
  params: { ...growl.params, clap: { ...(growl.params || {}).clap, on: true } },
};

/**
 * A style with a lane table of its own, and a grammar that gates exactly it —
 * or, given `on`, exactly those of its gates, with the rest off in every
 * section (the two-gate pair below).
 */
function styleWith(id, label, lanes, on = null) {
  return {
    ...houseV1,
    id,
    label,
    lanes,
    sections: grammarFor(on || [...new Set(lanes.filter((l) => l.gate).map((l) => l.gate))]),
    rooms: { ...houseV1.rooms, fixture: FIXTURE_ROOM },
    // A lane that names the sixteenth source needs the table that feeds it, and
    // house-v1's catalogue has none — its sixteenth lane takes the hat mask's
    // leftovers, which is the record. Derived where `src/catalogue.ts` derives
    // it, never transcribed.
    catalogue: { ...houseV1.catalogue, rooms: ['fixture'], sixteenthMasks: SIXTEENTH_MASKS },
  };
}

/**
 * **Two lanes**: a pulse and a drone, which is the shape Eugene named — "for
 * some styles it could be only 2, like ambient". The kick keeps its own figure
 * and the drone holds the chord; there is no hat family, no backbeat, no
 * bassline, no figure lane and no glue at all, so every one of the composer's
 * eight other parts has to be absent rather than empty.
 */
export const twoLane = styleWith('fixture-two-lane', 'two lanes: a pulse and a drone', [
  rowOf('kick'),
  rowOf('drone'),
]);

/**
 * **Twelve lanes, and not the record's twelve.** Same count, different table:
 * three sixteenth lanes instead of one — one of them on the hat mask and two of
 * them on a figure source of their own — two backbeat lanes sharing one figure,
 * and one piece of glue instead of four. It is what proves the count is a number and not the
 * name of a particular arrangement — a composer keyed to *which* lanes the
 * record has would pass a twelve-lane fixture that was the record's own twelve
 * and fail this one.
 *
 * Two of its rows are the shapes the record has no example of and the machinery
 * therefore has to be asked about: **two lanes on one figure** (the clap and a
 * snare both playing the backbeat, which is one draw and two instruments) and
 * **a second lane on the sixteenth source** (a conga on the same figure as the
 * shaker).
 */
export const twelveLane = styleWith('fixture-twelve-lane', 'twelve lanes, and not the record\'s twelve', [
  rowOf('kick'),
  rowOf('offbeat'),
  rowOf('offbeatOpen'),
  rowOf('sixteenth'),
  { ...rowOf('sixteenth'), id: 'sixteenthConga', voices: [{ v: 'conga', w: 1 }], figure: 'sixteenthMask' },
  { ...rowOf('sixteenth'), id: 'sixteenthCabasa', voices: [{ v: 'cabasa', w: 1 }], figure: 'sixteenthMask' },
  rowOf('backbeat'),
  { ...rowOf('backbeat'), id: 'backbeatSnare', voices: [{ v: 'snare', w: 1 }] },
  rowOf('bassline'),
  rowOf('figure'),
  rowOf('drone'),
  rowOf('glueRiser'),
]);

/**
 * **Two lanes on one figure with two gates**, which neither strategy has and
 * the composer therefore has to be asked about (the outside review of 09-19,
 * §1 of its composition review): a clap and a snare both on the backbeat
 * source, the clap's gate on in every section and the snare's off in every
 * one. Until 09-20 the snare emitted whenever the clap did — one gate per
 * figure group, inherited from the first lane. Two styles, one per direction,
 * because the pair asks two questions: does an off lane stay silent under an
 * on one, and is a group asked at all when only its second lane is on. Kept
 * out of `FIXTURES`, which `npm test` renders through two engines: this pair
 * is a question for the plan and needs no sound.
 */
const backbeatPair = [
  rowOf('kick'),
  rowOf('backbeat'),
  { ...rowOf('backbeat'), id: 'backbeatSnare', voices: [{ v: 'snare', w: 1 }], gate: 'snare' },
  rowOf('bassline'),
  rowOf('drone'),
];
export const twoGates = Object.freeze({
  clapOnSnareOff: styleWith('fixture-two-gates-a', 'two gates on one figure: the clap on, the snare off', backbeatPair, ['kick', 'clap', 'bass', 'pad']),
  clapOffSnareOn: styleWith('fixture-two-gates-b', 'two gates on one figure: the clap off, the snare on', backbeatPair, ['kick', 'snare', 'bass', 'pad']),
});

/** Both of them, for a gate that wants to walk the pair. */
export const FIXTURES = Object.freeze({ twoLane, twelveLane });

export default FIXTURES;
