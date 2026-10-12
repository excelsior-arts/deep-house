// The space rows (`packages/engine/spaces/*.json`), admitted once and named by
// id: what a part that plays through a space of its own reads its row from
// (liquid-space round 1, `settings.partSpace`). Twelve rows written for the keys
// lab (rounds 1-3, `effects/space.ts` says what a row is); a row that is not a
// space refuses the module, so a typo is never a silent dry part.
import { asSpace, type SpaceRow } from './space.ts';
import chorusRoom from '../../spaces/chorusRoom.json' with { type: 'json' };
import dottedIntoHall from '../../spaces/dottedIntoHall.json' with { type: 'json' };
import hallDark from '../../spaces/hallDark.json' with { type: 'json' };
import hallDeep from '../../spaces/hallDeep.json' with { type: 'json' };
import nearDry from '../../spaces/nearDry.json' with { type: 'json' };
import pingQuarterHall from '../../spaces/pingQuarterHall.json' with { type: 'json' };
import plateDottedQuarter from '../../spaces/plateDottedQuarter.json' with { type: 'json' };
import plateSmooth from '../../spaces/plateSmooth.json' with { type: 'json' };
import roomTapeDotted from '../../spaces/roomTapeDotted.json' with { type: 'json' };
import slowWideWash from '../../spaces/slowWideWash.json' with { type: 'json' };
import washFiltered from '../../spaces/washFiltered.json' with { type: 'json' };
import widePlateDrift from '../../spaces/widePlateDrift.json' with { type: 'json' };

/** Every space row, by its id. */
export const SPACE_ROWS: Readonly<Record<string, SpaceRow>> = Object.freeze(Object.fromEntries(
  [chorusRoom, dottedIntoHall, hallDark, hallDeep, nearDry, pingQuarterHall, plateDottedQuarter, plateSmooth, roomTapeDotted, slowWideWash, washFiltered, widePlateDrift]
    .map((raw) => { const row = asSpace(raw); return [row.id, row]; }),
));

export default SPACE_ROWS;
