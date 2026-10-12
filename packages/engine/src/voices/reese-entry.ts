/** Optional low-only entrance, separate from the held pair and its harmonics.
 * It settles towards the first note and vanishes; it never retunes the body.
 * All times are physical seconds, including when the deck changes tempo. */
export function subEntry(ctx: BaseAudioContext, into: AudioNode, time: number, hz: number,
  level: number, cents: number, seconds: number): void {
  if (![time, hz, level, cents, seconds].every(Number.isFinite)
    || hz <= 0 || level <= 0 || seconds < 0.03) return;
  const duration = Math.min(0.25, seconds), size = 257;
  const gain = new Float32Array(size), pitch = new Float32Array(size);
  const smooth = (x: number) => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u); };
  for (let i = 0; i < size; i++) {
    const u = i / (size - 1);
    // Rounded rise, brief shoulder, long taper with zero slope at both ends.
    gain[i] = Math.min(1, level) * smooth(u / 0.08) * (1 - smooth((u - 0.2) / 0.8));
    pitch[i] = Math.max(0, Math.min(1200, cents)) * (1 - smooth(u / 0.65));
  }
  const osc = ctx.createOscillator(), env = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = hz;
  osc.detune.setValueCurveAtTime(pitch, time, duration);
  env.channelCount = 1; env.channelCountMode = 'explicit'; env.channelInterpretation = 'discrete';
  env.gain.setValueCurveAtTime(gain, time, duration);
  osc.connect(env); env.connect(into);
  osc.start(time); osc.stop(time + duration);
}
