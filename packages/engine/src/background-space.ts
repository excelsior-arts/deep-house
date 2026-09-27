// A quiet, dark return whose tail is independent of the kick's gain envelope.
// One instance per theme, built only when a note asks for this send. The
// composer chooses the send amount; no recording or instrument lives here.
import { room, ROOMS } from './effects/spaces.ts';

export interface BackgroundSpaceSettings {
  seconds: number; preDelay: number; lowHz: number; highHz: number;
  echoBeats: number; feedback: number; echoLevel: number; plateLevel: number;
  diffuseOnly: boolean; tilt: number; correlation: number;
  build?: number; decay?: number;
}

export function validateSpace(p: BackgroundSpaceSettings): void {
  if (typeof p.diffuseOnly !== 'boolean') throw new Error('space.diffuseOnly: boolean required');
  for (const [key, value] of Object.entries(p)) {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`space.${key}: finite value required`);
  }
  if (!(p.seconds > 0 && p.seconds <= 30 && p.preDelay >= 0 && p.preDelay <= .25
    && p.lowHz > 0 && p.highHz > p.lowHz && p.highHz <= 24000
    && p.feedback >= 0 && p.feedback < 1 && p.echoBeats >= 0
    && p.echoLevel >= 0 && p.plateLevel >= 0 && p.tilt >= 0 && p.tilt <= 1 && p.correlation >= 0 && p.correlation <= 1
    && (p.build === undefined || p.build >= 0) && (p.decay === undefined || p.decay > 0))) {
    throw new Error('spatial return settings outside supported bounds');
  }
}

export interface BackgroundSpace {
  input: GainNode;
  dispose(): void;
}

/**
 * The two spaces a graph builds when its settings name none: the background's
 * dark plate with quiet echoes, and the immersed space the pulse sits wholly
 * inside, whose echoes excite the plate and never reach the listener as taps.
 * A composer that sends to either names its own (`settings.backgroundSpaces`,
 * the style's `characters.returns`, which carries these numbers today); this is
 * what an older program with no such block, a fixture and a measurement get.
 * It was `legacy-spaces.ts`, the same numbers in two spread objects under a
 * name that said compatibility where it is the only fallback.
 */
export const DEFAULT_SPACES: Readonly<Record<'background' | 'immersed', BackgroundSpaceSettings>> = Object.freeze({
  background: { seconds: 4.8, preDelay: .065, lowHz: 260, highHz: 1400, echoBeats: .75, feedback: .35, echoLevel: .2, plateLevel: .32,
    diffuseOnly: false, tilt: .06, correlation: .35 },
  immersed: { seconds: 7.5, preDelay: .025, lowHz: 260, highHz: 950, echoBeats: .75, feedback: .28, echoLevel: .35, plateLevel: .65,
    diffuseOnly: true, tilt: .06, correlation: .35, build: .04, decay: 2 },
});

export function backgroundSpace(ctx: BaseAudioContext, destination: AudioNode, beat: number, p: BackgroundSpaceSettings): BackgroundSpace {
  validateSpace(p);
  const input = ctx.createGain();
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = p.lowHz; hp.Q.value = -3.01;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = p.highHz; lp.Q.value = -3.01;
  const pre = ctx.createDelay(.25);
  pre.delayTime.value = p.preDelay;
  const echo = ctx.createDelay(4);
  echo.delayTime.value = Math.min(3.9, Math.max(.02, beat * p.echoBeats));
  const feedbackTone = ctx.createBiquadFilter();
  feedbackTone.type = 'lowpass'; feedbackTone.frequency.value = p.highHz; feedbackTone.Q.value = -3.01;
  const feedback = ctx.createGain(); feedback.gain.value = p.feedback;
  const echoLevel = ctx.createGain(); echoLevel.gain.value = p.echoLevel;
  const plate = ctx.createConvolver();
  plate.buffer = room(ctx, { ...ROOMS[2], seconds: p.seconds, tilt: p.tilt, corr: p.correlation,
    ...(p.build !== undefined ? { build: p.build } : {}), ...(p.decay !== undefined ? { decay: p.decay } : {}) });
  const plateLevel = ctx.createGain(); plateLevel.gain.value = p.plateLevel;
  input.connect(hp); hp.connect(lp); lp.connect(pre);
  pre.connect(echo); echo.connect(feedbackTone); feedbackTone.connect(feedback); feedback.connect(echo);
  echo.connect(echoLevel);
  if (!p.diffuseOnly) echoLevel.connect(destination);
  pre.connect(plate); echoLevel.connect(plate); plate.connect(plateLevel); plateLevel.connect(destination);
  const nodes: AudioNode[] = [input, hp, lp, pre, echo, feedbackTone, feedback, echoLevel, plate, plateLevel];
  return { input, dispose() { for (const node of nodes) node.disconnect(); } };
}
