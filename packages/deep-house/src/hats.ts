// **The offbeat hat follows its section** — house-v2's `hatSections`, round S6
// (the hat analysis of `?seed=26925&v=2&theme=3&spell=ember:0.49,gleam:1.00,
// spark:1.00`: hats four a bar in every section of the theme). The cause is not
// the breaks kit: the record's section grammar (`sections.kinds`, shared with
// house-v1) keeps the closed hat's gate on in every phrase of an intro, a
// breakdown and an outro, so the offbeat ticks through all of them under the
// house as under any spell. The rule thins it by what the section is:
//
//   a breakdown's first phrase leaves the hat out — the kick has gone and the
//     harmony is being given the room, which a ticking hat takes back;
//   its later phrases, an intro's first phrase and an outro's last keep the
//     offbeats of beats one and three only (sixteenths 2 and 10): the pulse
//     is kept for a DJ's ear and halved for the listener's.
//
// Only the hat layer's own notes; no die, no time moves; a main, a build and a
// drop are untouched.

import type { Arrangement } from './arrangement.ts';

/** The sixteenths a thinned phrase keeps: the offbeats of beats one and three. */
export const THIN_STEPS: readonly number[] = [2, 10];

/** What each section kind does with the hat, phrase by phrase. */
function modeAt(kind: string, phrase: number, phrases: number): 'rest' | 'thin' | 'full' {
  if (kind === 'breakdown') return phrase === 0 ? 'rest' : 'thin';
  if (kind === 'intro' && phrase === 0 && phrases > 1) return 'thin';
  if (kind === 'outro' && phrase === phrases - 1 && phrases > 1) return 'thin';
  return 'full';
}

/** The plan's events with the hat thinned by section; the same list where nothing is. */
export function hatsBySection<E extends { layer: string; bar?: number | null; step?: number }>(
  events: E[], arrangement: Arrangement, layer = 'hats',
): E[] {
  return events.filter((e) => {
    if (e.layer !== layer || e.bar == null) return true;
    const s = arrangement.sections.find((x) => e.bar! >= x.startBar && e.bar! < x.startBar + x.bars);
    if (!s) return true;
    let k = 0;
    for (let i = 0; i < s.phrases.length; i++) if (s.phrases[i].startBar <= e.bar!) k = i;
    const mode = modeAt(s.kind, k, s.phrases.length);
    return mode === 'full' || (mode === 'thin' && THIN_STEPS.includes(e.step ?? -1));
  });
}
