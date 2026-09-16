// Vite is the whole build. The source is still plain ES modules with relative
// imports, so a static server over src/ plays the ring without one; the dev
// server is what the work is done on, and `vite build` writes the site.
//
//   npm run dev        127.0.0.1:6975 — the listening server
//   npm run build      docs/, which is what Pages serves
//   npm run preview    127.0.0.1:6977 — the built site, as published
//
// The root is `src/`: the pages are code and live with the code they load, so
// the repository's own root holds the config, the licence and the folders and
// nothing a browser ever asks for. `src/index.html` is the only page built —
// it is the root's index, which is what Vite takes as the entry when none is
// named; there is no other page.
//
// `base: './'` keeps every URL in the built pages relative, so the same files
// work at a domain root and under a project path (the site lives at
// /deep-house/ on Pages). `publicDir` and `outDir` are read relative to the
// root, so both climb out of src/: the pictures live in `public/` and land
// beside index.html in both dev and build, which is why the page can ask for
// './artwork-512.png' in either place and always be right, and the site is
// written to `docs/`, which sits outside the root and so needs `emptyOutDir`
// said out loud.

import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Both are read relative to the root, and the root is src/, so each climbs a
// folder to reach the one at the top of the repository.
const ROOT = 'src';
const SITE = '../docs';
const PICTURES = '../public';

// Where this build is writing: docs/, or the scratch folder the release check
// builds into to ask whether docs/ is still what the build makes.
let out = resolve(import.meta.dirname, ROOT, SITE);

// Which build this is, for the rating bench to write beside a rating or a
// capture. The evidence has to name the code it came from, and the bench used
// to read a `?v=` off the page's script tag that nothing ever wrote, so every
// rating made on the published site said `dev`.
//
// It is the version and a short hash of the source the build was made from —
// not a commit, which would carry the private history into a published file,
// and not a time, which would make two builds of the same source differ. The
// same source always stamps the same revision.
function sourceRevision() {
  const h = createHash('sha256');
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const file = resolve(dir, name);
      if (statSync(file).isDirectory()) walk(file);
      else if (/\.(?:js|html|css)$/.test(name)) {
        h.update(name);
        h.update(readFileSync(file));
      }
    }
  };
  try {
    walk(resolve(import.meta.dirname, ROOT));
  } catch (e) {
    return 'unknown';
  }
  const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8'));
  return `${pkg.version}+${h.digest('hex').slice(0, 8)}`;
}

export default defineConfig({
  root: ROOT,
  // Stamped into the bundle, and into the dev server's modules, so a rating
  // can say which code made the sound it is about.
  define: { __BUILD__: JSON.stringify(sourceRevision()) },
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
      // One page, one script: the bench that ?rate=1 pulls in is inlined
      // rather than split off, and the file is named for the work.
      output: { codeSplitting: false, entryFileNames: 'assets/deep-house-[hash].js' },
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
      // Pages runs Jekyll over a branch unless told not to.
      async closeBundle() {
        await writeFile(resolve(out, '.nojekyll'), '');
      },
    },
  ],
});
