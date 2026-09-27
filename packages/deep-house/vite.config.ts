// Vite is the whole build. The source is still plain ES modules with relative
// imports, so a static server over src/ plays the ring without one; the dev
// server is what the work is done on, and `vite build` writes the site.
//
//   npm run dev          127.0.0.1:6975 — the listening server
//   npm run build        docs/, which is what Pages serves
//   npm run build:preview  the same, with the private tier's tools in it
//   npm run preview      127.0.0.1:6977 — the built site, as published
//
// The root is this package's `src/`: the pages are code and live with the code
// they load, so the repository's own root holds the licence and the folders and
// nothing a browser ever asks for. Since round W of PLAN-V1-NEXT the source is
// two packages — `packages/engine` is the machine and this is the composer and
// the page — and the bundle is the same bundle: the app names the engine by its
// package name, npm's workspaces link it, and Vite follows the link into
// ordinary source files. `src/index.html` is the only page built —
// it is the root's index, which is what Vite takes as the entry when none is
// named; there is no other page.
//
// `base: './'` keeps every URL in the built pages relative, so the same files
// work at a domain root and under a project path (the site lives at
// /deep-house/ on Pages). `publicDir` and `outDir` are read relative to the
// root, and both climb out to the *repository's* top: the pictures live in
// `public/` and land beside index.html in both dev and build, which is why the
// page can ask for './artwork-512.png' in either place and always be right, and
// the site is written to `docs/`, which is what Pages serves and what the
// release ships — unmoved by the packages, because the published site is the
// repository's and not one package's.

import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Both are read relative to the root, and the root is src/, so each climbs a
// folder to reach the one at the top of the repository.
const ROOT = 'src';
const SITE = '../../../docs';
const PICTURES = '../../../public';
// Where this build is writing: docs/, or the scratch folder the release check
// builds into to ask whether docs/ is still what the build makes.
let out = resolve(import.meta.dirname, ROOT, SITE);

// **The private tier is a build flag, and it is the only one** (Eugene, 09-22:
// the per-instrument export is his and never public). `VITE_PRIVATE_TOOLS=1`
// is set for `npm run dev` and `npm run build:preview` and for **nothing
// else**: the release build, `npm test`'s build and the ring's own pictures all
// run without it, and `tools/release.ts` refuses to cut a release with it set,
// so it cannot ship by somebody's shell. The engine a bare link plays is not a
// flag any more: it is `DEFAULT_VER` in `src/link-table.ts`, house-v2 in every
// build (Eugene, 09-23), so the preview, the dev server and the published page
// play the same thing for the same link.
//
// A define and not `import.meta.env`, because the composer's tools are the same
// modules run under node, where there is no `import.meta.env` to read: the one
// place that reads it guards it by `typeof`.
const PRIVATE_TOOLS = !!process.env.VITE_PRIVATE_TOOLS;
if (PRIVATE_TOOLS) console.log('deep-house: building with the private tier\'s tools — not a release build.');

export default defineConfig({
  root: ROOT,
  define: {
    // The per-instrument export is reachable only in a build with the flag
    // on. Off, the one glob that can reach the private folder
    // (`machine/source-controls.tsx`) is a dead branch and not a byte of it is
    // bundled; `tools/check-release.ts` proves it on the shipped files.
    __PRIVATE_TOOLS__: JSON.stringify(PRIVATE_TOOLS),
    // The page's version, for the exception tracker's `release` (src/instrument.ts).
    __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')).version),
  },
  publicDir: PICTURES,
  base: './',
  build: {
    outDir: SITE,
    // docs/ is outside the root, and Vite will not empty such a folder unless
    // it is told to in so many words.
    emptyOutDir: true,
    target: 'es2022',
    minify: true,
    // Sources are written into the map relative to it, so a map carries the
    // shape of the tree and never the path of the machine it was built on.
    sourcemap: true,
    rollupOptions: {
      // **Code splitting is on since the machine view** (2026-09-19), and it had
      // to be: the view is React and the ring's page may not carry React to
      // draw a sigil. `codeSplitting: false` inlined every dynamic import into
      // the one script, which put the whole framework in front of a listener
      // who never presses `m`.
      //
      // What it cost the ring's page is *less than nothing*, which was worth
      // measuring rather than assuming: the entry went from 474,646 bytes to
      // 445,268, because the two dynamic imports that were being inlined — the
      // listening bench (`?rate=1`, retired 09-22) and the view — were out of it, and
      // a 5,352-byte chunk of what the entry and the view share is preloaded
      // beside the entry. So start-up is 450,620 bytes in two requests that
      // begin together against 474,646 in one, and the view's own 241,873 are
      // fetched on the flip and at no other time. The file is still named for
      // the work, and a chunk is named for the module that asked for it.
      output: {
        codeSplitting: true,
        entryFileNames: 'assets/deep-house-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  // The clock's tick comes from a module worker, inlined into the one script.
  worker: { format: 'es' },
  server: { host: '127.0.0.1', port: 6975, strictPort: true },
  preview: { host: '127.0.0.1', port: 6977, strictPort: true },
  plugins: [
    {
      name: 'deep-house-output',
      configResolved(config) {
        out = resolve(config.root, config.build.outDir);
      },
      // The worker is inlined into the bundle as text, so the map Vite writes
      // beside it addresses a blob and can never be fetched. It would be the
      // only other file in the output; it does not travel.
      generateBundle(_options, bundle) {
        for (const name of Object.keys(bundle))
          if (/^assets\/clock-worker-[\w-]+\.js\.map$/.test(name)) delete bundle[name];
      },
      // A map carries our own sources in full, so a stack trace reads as the
      // code; a dependency's source text is not ours to publish (the exception
      // tracker's SDK ships its documentation in it, with the example names
      // and paths the release audit refuses), so those entries keep their file
      // names and lose their text. A dependency's frames still map to its file
      // and line. Done on the written files: the entry's map is not in the
      // bundle at generateBundle under rolldown.
      async closeBundle() {
        const assets = resolve(out, 'assets');
        for (const name of await readdir(assets).catch(() => [])) {
          if (!/\.js\.map$/.test(name)) continue;
          const file = resolve(assets, name);
          const map = JSON.parse(await readFile(file, 'utf8'));
          if (Array.isArray(map.sources) && Array.isArray(map.sourcesContent)) {
            map.sourcesContent = map.sources.map((src, i) => (/(^|\/)node_modules\//.test(src) ? null : map.sourcesContent[i]));
            await writeFile(file, JSON.stringify(map));
          }
        }
        // Pages runs Jekyll over a branch unless told not to.
        await writeFile(resolve(out, '.nojekyll'), '');
      },
    },
  ],
});
