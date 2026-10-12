# A sound row

One JSON file per sound under `packages/engine/sounds/<family>/<id>.json`, read
by `packages/engine/src/voices/index.ts` where a voice module used to be
imported, and rendered by the topology it names (`src/voices/<topology>.ts`,
listed in `src/voices/topologies.ts`). The contract is `src/voices/sound.ts`;
this is the same thing in prose.

```json
{
  "schema": 1,
  "kind": "sound",
  "id": "kick",                 the event string; the file's name; never changes
  "revision": 1,                a positive integer a material change increments
  "topology": "kick",           which module renders it
  "block": "kick",              optional: the block of the settings table these
                                parameters are, so a room may voice them — only
                                the row that owns it (`BLOCKS` in params.ts)
  "voicedBy": ["strings"],      optional, never beside a `block`: the settings
                                paths whose fields voice this row, where one
                                block is the room's word on several rows
                                (`VOICINGS` in params.ts; below)
  "parameters": { … },          exactly what the topology renders from
  "descriptor": { … },          what the registry says about it (below)
  "measured": { … },            optional: numbers a gate measured that are not a
                                timbre fact (a kit drum's click bound, and an
                                articulation's own loudness and click bound by
                                its scene's name: `congaSlap: {…}`)
  "dice": 157.3,                optional: a kit instrument's offset in the strike
                                dice — outside the patch, since no room voices it
  "provenance": { "module": "kick.ts", "round": "sounds-r1", … }
                                what it came from and when: the module, the
                                round, a `note` and per-parameter `notes` carrying
                                the prose that sat beside the numbers — never who
                                said what
}
```

**`parameters`** are the topology's **contract**, exactly (`PARAMETERS` in the
topology's module, the vocabulary in `src/voices/schema.ts`): a row may not
carry a number nothing reads or lack one the topology renders from, and each
value is of its field's type and in its range — a number between bounds (open
where nought would divide or end an exponential ramp: a frequency, a decay, a
level an exponential ramp ends on), a whole count with a ceiling (a bank of
oscillators, a number of rendered variants, a cache), a buffer length with a
ceiling, a switch, `null` where the field allows it (a part of the topology this
row does not build — the FM key's second modulator, a tine, the reese's clip),
one of a set of words (a shaper's `oversample`, the field of a room's block the
row reads — a hat's `metal: "metalClosed"`), a name a table beside it defines
(the FM bell's `tone` among its `ratios`), a list of a stated length, or a table
of stated fields. Relations no one field can state are the contract's too: the
organ's drawbar levels add up to something, a cymbal's ping has a pitch, the
shimmer's second ring fits its delay line. The ranges are what the topology can
compute, not taste; a style narrows them with its knobs and lists.
`soundFaults` holds a row to it at the registry; `resolveSettings` holds every
owned block to it as a room left it (`admitBlocks`), so a room may voice a sound
and may not voice it into a NaN; and `patchOf` hands a voice its numbers typed
by the contract (`PatchOf`) only once they have passed it.

**`block`** is a declared alias, not a switch. A block of the instruments table
is the room-voiced copy of **one** row's parameters, and `BLOCKS` in
`params.ts` says which: a row may name a block only where that table says the
block is its own (`soundFaults`, and `patchOf` again at the note). With it,
`params.ts` puts the row's numbers in that block and the voice renders from the
**resolved** block — the room's copy of the row, which is what the program
lock's `settings` line already carries by value. Without one, the voice renders
from the row itself, frozen, and no room reaches it. A preparation renders
what the note will: each event's patch is resolved through its own row (the
topology's `rows`, filled at admission), and a rendered body is keyed by the
patch it was made of.

**`voicedBy`** is the same rule for a block that is no one row's copy (round
SOUNDS-R3). The settings' `strings` block is the ensemble's body that both
strings rows (`stringsPad`, `stringsSwell`) are made of, and `keys` the
amplifier all five keyboard patches play through; a style's
`keyboardPatches.<name>` is a partial voicing of one patch's tone. Such a row
renders from its own parameters with the room's voicing written over them: the
fields its topology lets a room voice (`Topology.voiced` — the strings' body and
breath, not their shape; a patch's tone and the amplifier, not its family or its
envelope), taken from the settings at each path it names, where the room holds
them. `VOICINGS` in `params.ts` lists the rows each path voices, as `BLOCKS`
names a block's owner, and a row may name only a path that lists it
(`soundFaults`: a copy that kept `voicedBy` would play the room's word on its
original); at rest the row is its own numbers — every voiced field the
instruments table holds at the path is the row's own value there — and
`resolveSettings` holds the room's voicing of every such row to its contract
(`admitBlocks`). The program lock's `sounds` line carries it.

**A dispatching row** (topology `dispatch`, round SOUNDS-R3) is an event name
that stands for several rows: `pad` and `keys`, whose parts write the role and
name the family on the note. Its parameters are the table — `by` (the note's
field that names the timbre), `none` (what a note naming none plays),
`otherwise` (what a name the table has not plays) and `timbres`, each timbre's
`row` and whether it is a keyboard patch the sustained role holds (`sustain`)
— and its descriptor is the role's, as the composer has always read it. The
rows it names are admitted (`TIMBRE_ROWS` in `voices/index.ts`) and held to
their topologies like any row, with devices of their own, and are not event
names: no die or lane draws one. The program lock hashes, for each event, its
own row and the row its timbre renders through.

**`descriptor`** is every field of a `Descriptor` that is a value:

| field | what |
|---|---|
| `family` | `drum`, `bass`, `keyboard`, `ensemble`, `noise`, `effect`, `vocal` |
| `roles` | what it can play, out of `ROLES` |
| `bus`, `level`, `layer`, `plays` | where it lands, the level it is trimmed to, the layer its events carry, the arrangement layer that gates it or `null` |
| `mono`, `treat` | the mono gate; whether the stage may move it |
| `cost` | MEASURED by `tools/budget.ts --bless`; absent, the topology's class |
| `knobs` | the ranges a bird may move (`KnobSpec`): `default` is the parameter the topology names for it, held to it |
| `controls` | what a part may write on a note (`ControlSpec`); a numeric `default` is the parameter the topology names |
| `returns` | the lazy returns its notes send to by default |
| `timbres` | the five timbre facts per timbre it makes; `loudnessDb` MEASURED by the voice gates' `--bless` |
| `dispatches`, `mood` | as the descriptor has them (empty) |

The functions of a descriptor — `render`, `prepare`, `anticipates` — are the
topology's. `name` is the row's `id`.

**What a change is.** A changed number is a changed row: bump `revision`. The
program lock hashes `{id, topology, revision, block, voicedBy, parameters}` of every
row a theme's events render through on a `sounds` line beside `settings`, so a row that
moves moves the lock as a changed module's numbers did through the settings.

**What a sound is called.** For the sound, never for a genre: `reeseDeep`,
`kickPunch`. The id is the event name and is camelCase as the voices have
always been; the file is `<family>/<id>.json`.

**Writing one.** Copy the nearest row of the same topology, change the numbers,
give it a new `id` and `revision: 1`, **delete its `block`** — a copy that keeps
the block it was copied with is refused, since it would play the incumbent's
numbers and not its own — name the module it came from or `none`, and add it to
`REGISTRY` in `src/voices/index.ts` where it belongs in the order the record is
heard in. A new sound renders from its own numbers and no room voices it; a
room-voiced block of its own is a new key of the instruments table and a line
of `BLOCKS`, both in `params.ts`. Then `node tools/budget.ts --bless` for its
class and the voice gate for its loudness and slopes, which write into the row.
Nothing draws it until a candidate list of a style names it.
