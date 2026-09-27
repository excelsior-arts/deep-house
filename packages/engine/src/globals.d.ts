// What the two environments the machine runs in provide, and TypeScript's DOM
// library does not: the worklet's global scope, the worker module Vite inlines,
// and the prefixed constructors Safari still needs.
//
// Declarations only — no runtime, nothing imported, nothing shipped. It exists
// so that `npm run types` is a clean sheet a real finding stands out against
// rather than a page of environment noise. The page's own surface and the
// build's stamp are the app's and are declared beside it
// (`packages/deep-house/src/globals.d.ts`); the two merge, because the checker
// runs once over both packages.

interface Window {
  /** Safari's prefixed constructors. */
  webkitAudioContext: typeof AudioContext;
  webkitOfflineAudioContext: typeof OfflineAudioContext;
}

// The same prefixed constructor read off the *global* rather than off the
// window, which is how every render that is not the page's own asks for one:
// `scheduler.ts`, the composer's `mix.ts`, and the three voices that bake a
// buffer offline all write `globalThis.OfflineAudioContext ||
// globalThis.webkitOfflineAudioContext`. A member of `Window` is not a global,
// so without this line that second half is an untyped index on `globalThis`.
declare var webkitOfflineAudioContext: typeof OfflineAudioContext;

// --- the audio worklet's global scope (src/limiter-worklet.js) --------------
// It is not a window and not a worker: the processor runs in an
// AudioWorkletGlobalScope, which the DOM library does not describe.
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: any);
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;
/** The context's sample rate, a global inside a worklet. */
declare const sampleRate: number;

// --- the clock's worker (src/clock-worker.ts, src/clock.ts) -----------------
declare class WorkerGlobalScope {}

/** Vite's inline worker import: the clock's tick, bundled into the one file. */
declare module '*?worker&inline' {
  const Worker: { new (options?: { name?: string }): Worker };
  export default Worker;
}
