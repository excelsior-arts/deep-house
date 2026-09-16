# What this stands on

Nothing.

The [licence](LICENSE) covers what was made here, and there is nothing else in
the page to cover. No framework, no library, no font file, no sample, no
network call: every import under `src/`, the page's own script tag included, is
a relative path to another file in this repository, and the only outside thing
the page uses is the Web Audio API the browser already has. Every sound you
hear is built at runtime out of oscillators and generated noise — the reverb's
impulse included.

The published site is one script because a bundler put this project's own
modules end to end. Nothing of anyone else's went in with them.

That is checked rather than claimed: `node tools/check-release.mjs` fails the
release if anything that ships names a URL, a package or a file the repository
does not hold.

## Not in the page

[Vite](https://vite.dev) ([MIT](https://github.com/vitejs/vite/blob/main/LICENSE))
serves the modules while the work is done and writes the site: it runs on a
machine, never in a browser, and none of it is in what it writes.

The checks are the same: `tools/golden.mjs` pins the generator,
`tools/check-release.mjs` audits what would ship, `tools/test.mjs` meters the
sound and `tools/release.mjs` cuts the release — Node scripts with no
dependencies of their own, and Playwright where it is already installed, to
drive a browser.
