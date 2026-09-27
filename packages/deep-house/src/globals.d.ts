// What the page provides that TypeScript's DOM library does not: the automation
// surface the face installs, the ring's own handle, and the flag the build
// writes in.
//
// Declarations only — no runtime, nothing imported, nothing shipped. The
// machine's half — the worklet's scope, the clock's worker, Safari's prefixed
// constructors — is `packages/engine/src/globals.d.ts`, and the two merge
// because the checker runs once over both packages.

/**
 * The private tier's tools (the per-instrument export): `true` only where
 * `VITE_PRIVATE_TOOLS` is set — `npm run dev` and `npm run build:preview` —
 * which a release refuses. `vite.config.ts`.
 */
declare const __PRIVATE_TOOLS__: boolean;
/** The page's version, from its package.json, for the exception tracker's release. */
declare const __APP_VERSION__: string;

interface ImportMeta {
  /** Vite's build facts the exception tracker reads: a production build, and its mode. */
  env: { PROD: boolean; DEV: boolean; MODE: string };
  /** Vite's glob: the modules a pattern matches, each as a loader; none matched is `{}`. */
  glob<T = unknown>(pattern: string): Record<string, () => Promise<T>>;
}

interface Window {
  /** The automation surface both faces install (src/debug.ts). */
  deepHouse: any;
  /** The ring's own handle, for the headless checks. */
  ring: any;
}
