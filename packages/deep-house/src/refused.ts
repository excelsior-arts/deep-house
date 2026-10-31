// **A part a theme refuses** (the code review of 10-29, on the ensemble's fallback): a recipe's part that cannot be laid
// in this theme, though nothing is wrong with the row or the code: its register does not hold the phrase in this key,
// or the lane it plays on is off or silenced here. A caller that falls back from a refusal (the ensemble's
// `refused: 'theme'`: the composer's own theme, the refusal on the readout) catches this and nothing else, so a fault
// in the code or the data still throws. Pure; no DOM.

export class PartRefused extends Error {}
