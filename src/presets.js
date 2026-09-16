// A preset is a set of overrides on params plus a few structural choices —
// which figures to use, whether there is a clap, how the harmony moves. Two of
// them are measured off benchmark minutes and named for what they sound like
// rather than where they came from; "auto" rolls between them from the seed.
//
// What every preset shares is the family signature, and that lives in
// params.js rather than here: 103-104 BPM, minor, a kick pitched into the
// mid-40s within 30 ms and gone by 150-180 ms, a bass fundamental of 42-49 Hz,
// a hat on every offbeat eighth and nothing open, and a sidechain whose
// minimum sits 54 ms after the beat and is back by the next one.

export const PRESETS = {
  auto: {
    id: 'auto',
    label: 'auto',
    note: 'rolls between the others from the seed',
  },

  // From the archetypal minute: sub-heavy, near-sine bass playing two notes a
  // beat, no clap at all, a loud sixteenth shaker, short bright stabs and a
  // filter opening across the minute.
  sub: {
    id: 'sub',
    label: 'sub',
    note: 'near-sine bass, washy hats, a loud sixteenth layer, no clap',
    bench: 's3_22m00s',
    params: {
      // The minute this came from runs at 103.1 BPM; a measured preset is that
      // room, so it does not roll the tempo family.
      tempo: { slowMin: 103, slowMax: 103, slowChance: 1 },
      kick: {
        startHz: 54, endHz: 46, pitchTime: 0.03,
        t6: 0.075, t20: 0.20, t34: 0.27,
        drive: 0.05, clickLevel: 0.0, clickLp: 1200, bodyLp: 130,
      },
      // Near a sine: 2nd harmonic 19 dB down, 3rd 15 dB down.
      // Near a sine at the fundamental, but the body peak still has to reach
      // the -11.0 dB of 80-160 Hz the minute measures.
      bass: { drive: 0.14, cutoff: 250, triangle: 0.015, octave: 0.035, even: 0.1, bodyDb: 2.0 },
      register: { subCenter: 31 },
      hats: { closedT10: 0.085, shakerT10: 0.09, metalClosed: 0.45, lidHz: 7800 },
      clap: { on: false },
      sidechain: { depthDb: -19.5, minimumAt: 0.055, recoverBy: 0.94 },
      levels: { sub: -11.0, hatClosed: -8.0, shaker: -4.0, clap: -60, keys: -14.5, pad: -9.5, piano: -11.5 },
      master: { presenceDb: 4.2, airDb: 1.0 },
      groove: { openHatChance: 0 },
    },
    shape: {
      // MEASURED masks from the same minute.
      hatMask: '..xx..xx..xx..xx',
      bassMask: '.xx..xx..xx..xx.',
      bassContour: ['x', 'R', 'R', 'R', 'R', 'R', 'x', 'R'],
      stabMask: '..x.xxxx...xxxxx',
      sixteenths: true,
      voicingStyle: 'elevenths',
      // Static tonic with an occasional VI, three bars at a time.
      degreeBias: [{ v: 0, w: 20 }, { v: 5, w: 5 }],
      loopBars: 8,
      changeEvery: 4,
      sweep: 1.0, // the high band moves 25 dB across the minute
      stabLen: 1,
    },
  },

  // From the drum-and-bass-tone minute: flat and mid-forward, harmonically
  // rich bass, a snappy clap, bone-dry offbeat hats with no sixteenth layer,
  // darker sustained chords and nothing moving.
  growl: {
    id: 'growl',
    label: 'growl',
    note: 'dry short hats, a clap on 2 and 4, nothing sweeps',
    bench: 's2_2h40m50s',
    params: {
      tempo: { slowMin: 104, slowMax: 104, slowChance: 1 },
      // MEASURED: 65 Hz falling to 42 within 35 ms and gone by 146.
      kick: {
        startHz: 65, endHz: 42, pitchTime: 0.035,
        t6: 0.06, t20: 0.12, t34: 0.146,
        drive: 0.1, clickLevel: 0.0, clickLp: 1300, bodyLp: 150,
      },
      // This preset used to be the "reedy" one: the benchmark minute measures
      // its 3rd harmonic only 5 dB under the fundamental, and a bass built to
      // that number is the mush Eugene threw out. What the measurement is
      // reading there is a mixed record, not a bass, so the room keeps its
      // identity in the short dry hats and the clap and gives up the drive:
      // the 2nd harmonic sits around 15 dB down and the 3rd around 18, a
      // shade richer than `sub` and nowhere near reedy.
      bass: { drive: 0.2, cutoff: 420, triangle: 0.025, octave: 0.045, even: 0.15, bodyDb: 2.5 },
      register: { subCenter: 28 },
      hats: { closedT10: 0.021, metalClosed: 0.6, lidHz: 8200 },
      clap: { on: true, t20: 0.036 },
      sidechain: { depthDb: -15.1, minimumAt: 0.054, recoverBy: 0.97 },
      levels: { sub: -12.0, hatClosed: -3.5, shaker: -60, clap: -11.5, keys: -9.5, pad: -6.0, piano: -8.5 },
      master: { presenceDb: 4.2, airDb: 1.5 },
      groove: { openHatChance: 0 },
    },
    shape: {
      bassMask: '.x.....x.x....x.',
      bassContour: ['m3', 'x', 'm3', 'm3'],
      stabMask: 'x...x...x...x...',
      hatMask: '..x...x...x...x.',
      sixteenths: false,
      voicingStyle: 'ninths',
      // i alternating with III, two bars each.
      degreeBias: [{ v: 0, w: 12 }, { v: 2, w: 9 }],
      loopBars: 4,
      changeEvery: 2,
      sweep: 0.08, // the high band moves 2 dB across the whole clip
      stabLen: 4,
    },
  },
};

export const PRESET_IDS = Object.keys(PRESETS);
export const MEASURED_IDS = PRESET_IDS.filter((id) => PRESETS[id].bench);

export function resolvePreset(id, rng) {
  if (id && id !== 'auto' && PRESETS[id]) return PRESETS[id];
  return PRESETS[rng.pick(MEASURED_IDS)];
}

export default PRESETS;
