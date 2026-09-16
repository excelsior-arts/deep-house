// How far one set stands from another, in style rather than in number.
//
// A master seed is a number, and two numbers beside each other say nothing
// about whether the records they grow sound alike: the dice are independent,
// so the seed after this one can roll the same room, the same key and the same
// figures and be, to the ear, the record you were already listening to. That
// is why casting four or five times in a row could land on four or five
// versions of the same thing. A throw of the dice on the ring asks for a
// distance in *style*, and this is what measures it: every die the generator
// rolls, weighted by how much of a record's character it carries, summed and
// normalised — nought for the same theme, one for two that share nothing.
//
// Pure. It is handed two planned themes and touches nothing else, so the bench
// can score a thousand of them without a sound card.

// What a listener would notice, in the order they would notice it. The room is
// the biggest single difference the generator can make, the key is the next,
// and the masks are the smallest — a different hat figure is a different
// groove, but it is still the same record.
export const WEIGHTS = {
  room: 3,           // the preset: sub, growl, the whole bottom of the record
  key: 2,            // the root, round the shortest way on the chromatic circle
  scale: 1.2,        // minor against major
  tempo: 1.5,        // the tempo family
  bpm: 0.8,          // and how far apart they sit inside it
  density: 1.2,      // how much is playing
  voicing: 1,        // ninths against elevenths
  lead: 1.2,         // which instrument carries the line
  pad: 0.8,
  stab: 0.8,
  fx: 1,             // the palette the noises come from
  progression: 1.2,  // the chord loop, named
  hat: 1,            // the figures, by how many of their sixteen steps differ
  bass: 1,
  loop: 0.5,         // how long the chord loop is
  length: 0.4,       // how long the theme runs
};

// The traits a listener names first. A cast that moves none of them is not a
// new record however different its seed is, so the ring will not offer one.
export const LOUD = ['room', 'key', 'tempo', 'density', 'lead', 'progression'];

// Two floors a candidate can be asked to clear: a throw wants any one of the
// loud traits moved; a tap on the die wants the room or the key, which is the
// pair nothing else can disguise, so two taps in a row can never sound alike.
export const FLOOR = {
  loud: (p) => LOUD.some((k) => (p[k] || 0) > 0.4),
  fresh: (p) => (p.room || 0) > 0.4 || (p.key || 0) > 0,
};

const dieValue = (d) => (d && typeof d === 'object' ? d.value : d);

// The dice of a planned theme, as the flat reading the scoring works on.
export function styleOf(t) {
  const d = (t && t.dice) || {};
  const k = (t && t.key) || {};
  return {
    room: String(d.preset ?? t?.presetLabel ?? ''),
    root: Number.isFinite(k.root) ? k.root : -1,
    scale: String(k.scaleName ?? ''),
    tempo: String(d.tempoFamily ?? ''),
    bpm: Number(t?.bpm) || 0,
    density: String(dieValue(d.densityDie) ?? d.density ?? ''),
    voicing: String(d.voicingStyle ?? ''),
    lead: String(d.leadTimbre ?? ''),
    pad: String(d.padTimbre ?? ''),
    stab: String(d.stabTimbre ?? ''),
    fx: String(d.fxPalette ?? ''),
    progression: String(d.progression ?? ''),
    hat: String(d.hatMask ?? ''),
    bass: String(d.bassMask ?? ''),
    loop: Number(d.loopBars) || 0,
    bars: Number(t?.bars) || 0,
  };
}

const same = (a, b) => (a === b ? 0 : 1);
// The chromatic circle, the short way round: a tritone is as far as a root can
// get, and that is the one.
const rootApart = (a, b) => {
  if (a < 0 || b < 0) return a === b ? 0 : 1;
  const d = Math.abs(a - b) % 12;
  return Math.min(d, 12 - d) / 6;
};
const hamming = (a, b) => {
  if (!a || !b || a.length !== b.length) return same(a, b);
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n / a.length;
};
const apart = (a, b, full) => Math.min(1, Math.abs(a - b) / full);

// Nought to one, with the part each die played in getting there and the names
// of the ones a listener would actually call out.
export function styleDistance(A, B) {
  const a = styleOf(A);
  const b = styleOf(B);
  const parts = {
    room: same(a.room, b.room),
    key: rootApart(a.root, b.root),
    scale: same(a.scale, b.scale),
    tempo: same(a.tempo, b.tempo),
    bpm: apart(a.bpm, b.bpm, 16),
    density: same(a.density, b.density),
    voicing: same(a.voicing, b.voicing),
    lead: same(a.lead, b.lead),
    pad: same(a.pad, b.pad),
    stab: same(a.stab, b.stab),
    fx: same(a.fx, b.fx),
    progression: same(a.progression, b.progression),
    hat: hamming(a.hat, b.hat),
    bass: hamming(a.bass, b.bass),
    loop: same(a.loop, b.loop),
    length: apart(a.bars, b.bars, 240),
  };
  let sum = 0;
  let total = 0;
  for (const k in WEIGHTS) {
    sum += WEIGHTS[k] * (parts[k] || 0);
    total += WEIGHTS[k];
  }
  return {
    distance: sum / total,
    parts,
    differs: Object.keys(parts).filter((k) => parts[k] > 0.4),
    from: a,
    to: b,
  };
}

export default styleDistance;
