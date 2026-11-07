// A node test file that plays a set on the engine's stand-in context moves the set's clock itself, but the engine still
// keeps a few wall-clock timers of its own: a deck torn down 300 ms after its fade ends (`deck.ts`, in real seconds, so
// a fade a test played through in a second of node is minutes of wall), a texture's pump. They do nothing a test reads,
// and they held `check-transport.ts` open three minutes after its last test and `check-keys.ts` most of one (round
// test-sane, 11-05). Imported first, this lets any timer of a second or more go unheld: it still fires if the file is
// still running, and it no longer keeps the file alive once the tests are done.
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = ((fn: (...a: unknown[]) => void, ms?: number, ...rest: unknown[]) => {
  const h = realSetTimeout(fn, ms, ...rest);
  if ((ms ?? 0) >= 1000 && typeof h?.unref === 'function') h.unref();
  return h;
}) as typeof setTimeout;
