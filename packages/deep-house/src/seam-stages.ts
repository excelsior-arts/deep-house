// **A hand-over as a face reads it** (round ring-seam, 10-30): the coming theme's lead, the blend's crossing and its
// landing, off the transport's own seam. One function for the phone's readout (`control.ts`) and the TV's
// (`tv-view.ts`), which reads the phone's seam and clock off the feed.
//
// Eugene, 10-30, on a free-play seam: *"the ring gets blurry line way too ahead of when mixing starting, I wonder why
// so?"*; on the plan, *"yeah sounds good"*. The coming theme showed from the thirty-two bars before the plan's own
// seam, at once at a fifth of its brightness: 80 s at 96 BPM, and since the shorter themes often before a theme's
// middle. It fades in from nothing over the record's last eight bars before the crossfade begins, counted down to the
// seam the transport will take (`MixState.seam`, `seamOf`), crosses into the band through the blend to the swap, and
// lands there from the swap to the blend's end.

import type { MixSeam } from '@deep-house/engine/session';

/** How far ahead of a blend the coming theme shows: the record's last eight bars before the crossfade begins. */
export const LEAD_BARS = 8;

export interface SeamStages {
  /** nought to one over the record's last `LEAD_BARS` bars before the blend begins; one from the blend on */
  lead: number;
  /** how far the blend in flight has come from its first instant to the swap, nought to one */
  crossing: number;
  /** and from the swap to the blend's end, nought to one: the arrived theme settling into the band */
  landing: number;
  /** the hand-over the transport will take, its instants on the set's clock */
  seam: MixSeam | null;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * The stages at a position: `pos` and `seamOf` in the record's own seconds, `barSeconds` its own bar, `seam` the
 * transport's instants and `now` its clock. The lead is in the record's own bars, so a playlist's clock that plays
 * the record faster or slower still shows the coming theme for eight of its bars; the crossing and the landing are
 * the transport's instants, so they close where the fader does.
 */
export function seamStages(pos: number, seamOf: number, barSeconds: number, seam: MixSeam | null, now: number | null): SeamStages {
  const window = LEAD_BARS * barSeconds;
  const lead = window > 0 && Number.isFinite(seamOf) ? clamp01((pos - (seamOf - window)) / window) : 0;
  if (!seam || !seam.laid || now == null) return { lead, crossing: 0, landing: 0, seam };
  const part = (from: number, to: number) => (now < from ? 0 : to - from > 1e-6 ? clamp01((now - from) / (to - from)) : 1);
  return { lead, crossing: part(seam.at, seam.swapAt), landing: now >= seam.swapAt ? part(seam.swapAt, seam.end) : 0, seam };
}
