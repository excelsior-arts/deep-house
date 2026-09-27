# What this stands on

Nothing you can hear.

The [licence](LICENSE) covers what was made here. **No framework, no library,
no sample and no network call is anywhere near the sound or the ring**, and one
font file is near the ring's words and nowhere else (below): every import under either package's `src/` that the ring's page reaches
is a path to another file in this repository — a relative one, or the name of
the other package in this same workspace — and the only outside thing the music
uses is the Web Audio API the browser already has. Every sound you hear is built
at runtime out of oscillators and generated noise, the reverb's impulse
included.

## One face, for the page's type

| what | licence | where it is |
|---|---|---|
| [Jost](https://github.com/indestructible-type/Jost) 3.710, by indestructible type | [SIL Open Font License 1.1](public/fonts/OFL.txt) | `public/fonts/jost.woff2`, the page's one face; its outlines are also the wordmark |

The file is Jost's variable font cut to what the page reaches — the weight axis
from 400 to 500 and the Latin range — and nothing else is changed in it; the
licence travels beside it as `fonts/OFL.txt`, which is what the OFL asks of a
copy that ships. It is served from the page's own folder like every other
file: no font service is asked for anything. The wordmark
(`public/wordmark.svg`, `public/wordmark-logo.svg`) is DEEP HOUSE drawn from
Jost Medium's outlines and spaced by hand, which the OFL allows of any
document made with the font.

## Two, in the machine view, and nowhere else

Since 2026-09-19 the page has a second face — the engineer's, behind `m` and
`?view=machine` — and it is an application rather than a drawing, so it is built
with one:

| what | licence | where it is |
|---|---|---|
| [React](https://react.dev) 19.3.0 | [MIT](https://github.com/facebook/react/blob/main/LICENSE) | the machine view's own script, and nothing else |
| [React DOM](https://react.dev) 19.3.0 | [MIT](https://github.com/facebook/react/blob/main/LICENSE) | the same |

**They are in a script of their own and are fetched the moment somebody asks for
that face, and at no other moment.** The ring's page does not carry them, does
not load them and is not made slower by them — measured: the script the page
starts with is 446,879 bytes against the 474,646 it was before they existed,
because turning code splitting on for the view also let the listening bench out
of it. Nothing of either of them touches the audio graph, the composer or the
transport: the view reads, and the one control on it — the switch between the
two engines — calls one method of the transport and nothing else.

The types for both (`@types/react`, `@types/react-dom`) are development
dependencies, like `@types/node`: they are checked against and never shipped.

## Not in the page at all

[Vite](https://vite.dev) ([MIT](https://github.com/vitejs/vite/blob/main/LICENSE))
serves the modules while the work is done and writes the site: it runs on a
machine, never in a browser, and none of it is in what it writes.

That is checked rather than claimed: `node tools/check-release.ts` fails the
release if anything that ships names a URL, a file the repository does not hold,
or a package that is not this workspace's own or a declared dependency of the
package naming it — and `docs/`, which is the one thing a browser is ever
handed, is held to the old rule exactly: not one specifier in it may be anything
but relative, because nothing out there resolves a name of any kind.

The checks are the same: `packages/deep-house/tools/golden.ts` pins the
generator, `tools/check-release.ts` audits what would ship,
`packages/deep-house/tools/test.ts` meters the sound and `tools/release.ts`
cuts the release — Node scripts with no dependencies of their own, and
Playwright where it is already installed, to drive a browser.
