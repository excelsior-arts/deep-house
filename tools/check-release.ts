// What ships is audited by shape, not by taste.
//
//   node tools/check-release.ts
//   node tools/check-release.ts --site .release-build   audit a scratch build as docs/
//
// It walks every file a release would carry — everything git tracks or would
// track, minus the scratch under tmp/ — and fails, naming the file and the
// line, on anything that belongs to the machine this was built on rather than
// to the work: a disk path, an address, a scratch folder, a name from the
// denylist below, an audio file, or a module that comes from anywhere but the
// folder next to it.
//
// The denylist is carried as truncated SHA-256 of the lowercased word, so this
// file can refuse a name without repeating it. Words are hashed one at a time
// and compared against every word in every shipped file.

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateTier, inTier } from './private-tier.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Names that may not appear in anything published. Truncated SHA-256 of the
// lowercased word; the words themselves are not written down here.
const DENIED = new Set([
  'c857d09db23e', 'c70eca6b0f88', 'c9ad8f2cc129', '5a5110ebe154',
  '09cf980b5ff3', '053ea4804ef1', '60965168ce76', '7d3194f79e64',
  '5d72436256ad', 'fc5a1047f591', '3ea125d0bff3', '57de4cf40144',
  'abc9ac4c60ff', '94a168d2da57', 'd298391b0743',
]);
const hash = (w) => crypto.createHash('sha256').update(w).digest('hex').slice(0, 12);

// Paths outside this project, matched by shape so the list gives nothing away
// and still catches one that has not been seen before.
const SHAPES = [
  [/\/Users\//, 'a disk path'],
  [/\/home\/[a-z]/, 'a disk path'],
  [/\/private\/tmp\//, 'a scratch path'],
  [/["'`][\w-]+\.local["'`]/, 'a machine name'],
  // A mailbox, not the userinfo of a URL: a key standing before the host in
  // `https://<key>@<host>/` is a service's public write-only token (the
  // exception tracker's DSN in src/instrument.ts), which is meant to stand in
  // the page, so the shape is taken only where nothing but a word boundary
  // or a space stands before it and never after `://`.
  [/(?<![\w.+-]|:\/\/)[\w.+-]+@[\w-]+\.[a-z]{2,}/i, 'an address'],
  [/[\w/-]+\.(?:mp3|m4a|flac|ogg|opus|aiff?|aac|caf|mp4|m4v|mov|webm)\b/i, 'a recording'],
];

// Audio never ships, in any format, under any name — nor video, which is audio
// with pictures on it (the reconciled review of 09-24, R68: the lab keeps .mp4
// sources and demo cuts, and none of them had a rule).
const AUDIO = /\.(?:wav|mp3|aiff?|flac|ogg|opus|m4a|aac|caf|mp4|m4v|mov|webm|mkv|avi)$/i;

// The page is one module graph served off a static folder, and the folder can
// be served from any prefix — a project site lives under /<repo>/. So every
// specifier it loads is relative to the file that asks for it: no scheme, no
// host, no leading slash, and no bare package name a browser could not resolve.
//
// Since round W of PLAN-V1-NEXT the source is two packages and the app names
// the engine by its package name, which the build resolves and the browser
// never sees. So a specifier naming a package **of this workspace** is allowed
// in a package's own source, and nowhere else: `docs/` is held to the old rule
// exactly, and it is `docs/` that is served. The names are read off the root
// package.json's workspaces rather than written down here, so a third package
// would be allowed the day it exists and a name that is not one of ours is
// still a fault.
//
// Since the machine view (2026-09-19) the same sentence covers a package's own
// **declared dependencies**, and for the same reason: the app depends on react
// and react-dom, the bundler inlines them, and the browser never sees a bare
// name either. What is allowed is read off that package's own manifest — so a
// dependency somebody adds without declaring it is still a fault, and one
// declared is one that has a line in `THIRD-PARTY.md` beside it. **The rule
// about `docs/` did not move an inch**: `SITE` still refuses every specifier
// that is not relative, whoever declared it, because nothing out there resolves
// a package name of any kind. That is the guarantee, and it is still checked on
// the only files a browser is ever handed.
// Three forms: `… from '…'`, `import('…')`, and the **side-effect import**,
// `import '…';`, which names a module and binds nothing (the reconciled review
// of 09-24, R135 — the first two patterns never saw it, so
// `import 'https://…';` passed). `selftest()` below holds all three to lines
// that must and must not match, every time the audit runs.
const MODULE = [/\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]/g, /\bimport\s*['"]([^'"]+)['"]/g];
// ...on a line that is actually an import. `from` is an ordinary word — a seam
// has a deck it comes `from` and a curve a value goes `from`, and in a
// TypeScript union those are quoted — so the specifier hunt runs on lines that
// import or export, plus the closing line of a multi-line import, and nowhere
// else. It cost a false failure the first time a `.ts` file wrote
// `deck: 'from' | 'to'`, which is a shape and not a module.
const IMPORTS = (line) => /\b(?:import|export)\b/.test(line) || /^\s*\}\s*from\b/.test(line);
const TAG = /<([a-z][a-z0-9-]*)\b([^>]*)>/gi;
const ATTR = /\b(src|href)\s*=\s*["']([^"']*)["']/gi;
// A link the reader may follow is not a thing the page loads. Everything else
// a tag names — a module, a stylesheet, an icon, a picture — has to come from
// the folder the page was served out of.
const relative = (spec) => /^\.{1,2}\//.test(spec) || spec.startsWith('#') || spec.startsWith('data:');

// What a browser loads: each package's src/, which holds the pages with the
// modules they ask for, and docs/, which is what the build writes. Browser code
// may not name the scratch folder. The scripts in tools/ may: they run on a
// machine, and what they write there is the point.
const PAGE = /^(?:docs\/|packages\/[^/]+\/src\/)/;
// The published site, which is the one thing a browser is ever handed: nothing
// in it may name a package, because nothing resolves a package name out there.
const SITE = /^docs\//;
// **A build's own config is held to the page's rule about the private tier**
// (the page review of 09-22, finding 6). The dev server used to serve audition
// manifests out of `mining/attempts/` through a middleware in
// `packages/deep-house/vite.config.ts`: dev-only, path-safe, and still a shipped
// file whose server reads the private catalogue. The auditions are retired and
// the middleware with them; this keeps it from coming back. A config may not
// load a private-tier path at all — whatever it serves in development, it
// serves out of a file the release carries — so a dev tool that needs the
// catalogue lives in the private package and not here.
const CONFIG = /(?:^|\/)vite\.config\.[cm]?[jt]s$/;

// The private tier of `.releaseignore` is tracked for the private origin and
// stripped from the release, so the audit neither scans it nor lets the page
// name it — a public build must never point at a path it does not carry.
const PRIVATE = privateTier(ROOT);
const isPrivate = (p) => inTier(PRIVATE, p);
const PRIVATE_REF = PRIVATE.length ? new RegExp(`(?:^|[^A-Za-z0-9_./-])(?:${PRIVATE.map((p) => p.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|')})`, 'g') : null;
const LOADS = /\b(?:import|require|fetch|readFile|readFileSync|readdir|realpath\w*|resolve\s*\(|join\s*\(|new URL|href\s*=|src\s*=|url\()/;

// The packages this repository builds, by the names their own manifests carry.
// A package of the private tier is **not** one of them: it is stripped before
// master is cut, so a shipped file naming it would name something the release
// does not carry, and the two allowances below — a workspace's own name, and a
// package's declared dependencies — would be a hole rather than a rule. The
// same list decides it that decides what is scanned, so the tier cannot drift.
const PACKAGES = fs
  .readdirSync(path.join(ROOT, 'packages'), { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(ROOT, 'packages', e.name, 'package.json')))
  .filter((e) => !isPrivate(`packages/${e.name}/`));
const manifestOf = (name) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'packages', name, 'package.json'), 'utf8'));
const WORKSPACES = PACKAGES.map((e) => manifestOf(e.name).name).filter(Boolean);
const names = (spec, list) => list.some((n) => spec === n || spec.startsWith(`${n}/`));
// What each package declares it stands on, by its own manifest: `dependencies`
// only, because a devDependency is tooling and never reaches a bundle.
const DEPENDENCIES = Object.fromEntries(
  PACKAGES.map((e) => [`packages/${e.name}/`, Object.keys(manifestOf(e.name).dependencies || {})]),
);
const declared = (rel, spec) => {
  const owner = Object.keys(DEPENDENCIES).find((prefix) => rel.startsWith(prefix));
  return !!owner && names(spec, DEPENDENCIES[owner]);
};
const ours = (spec) => names(spec, WORKSPACES);
// How far in front of a path a loader may stand and still be reading it. The
// rule below is about a *reference* and not about a line, because the page's
// one shipped line is the whole minified bundle: read by the line, every
// provenance string in the page shares that line with every import in it, and
// the rule fired on notes written to be read rather than followed. A hundred
// and twenty characters is more than the longest loader-and-argument this
// repository writes (`await import(new URL('…', import.meta.url).href)`) and
// far less than the distance between two things in a bundle.
const NEAR = 120;
/** Does a loader stand where it could read this private-tier path? */
const couldLoad = (line, at) => LOADS.test(line.slice(Math.max(0, at - NEAR), at + 1));
// **`--site <dir>`: a scratch build audited as `docs/`** (R68). A dry release
// builds to one side and used to audit the committed `docs/` instead, so what
// it reported was not what the cut would ship. With `--site`, every tracked
// file under `docs/` gives way to the files of that folder, read from there and
// named as `docs/<file>`, so the rules that hold `docs/` hold the build.
const SITE_AT = process.argv.indexOf('--site');
const SITE_DIR = SITE_AT < 0 ? null : path.resolve(process.argv[SITE_AT + 1] || '');
if (SITE_DIR && !fs.existsSync(SITE_DIR)) {
  console.error(`--site ${process.argv[SITE_AT + 1]}: no such folder`);
  process.exit(2);
}
const filesIn = (dir, base = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? filesIn(path.join(dir, e.name), `${base}${e.name}/`) : [`${base}${e.name}`]);
const shipped = () => {
  const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((p) => p && !p.startsWith('tmp/') && !isPrivate(p));
  if (!SITE_DIR) return listed.sort();
  return [...listed.filter((p) => !SITE.test(p)), ...filesIn(SITE_DIR).map((f) => `docs/${f}`)].sort();
};
/** Where a shipped path's bytes are: the scratch build for docs/ under --site, the checkout otherwise. */
const absOf = (rel) => (SITE_DIR && SITE.test(rel) ? path.join(SITE_DIR, rel.slice('docs/'.length)) : path.join(ROOT, rel));

// **The text a picture carries** (R68). A PNG's `tEXt`, `zTXt` and `iTXt`
// chunks are words — a renderer's scene path, an author, a comment — and were
// never read, because a file with a nought byte in it was shape-checked and
// left. They are read here and held to every rule prose is held to.
function pngText(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) return '';
  const out = [];
  for (let at = 8; at + 12 <= buf.length;) {
    const len = buf.readUInt32BE(at), type = buf.toString('latin1', at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + len);
    if (type === 'tEXt') out.push(data.toString('latin1').replace(/\0/g, ' '));
    if (type === 'zTXt' || type === 'iTXt') {
      const nul = data.indexOf(0);
      const key = data.toString('latin1', 0, nul);
      if (type === 'zTXt') {
        try { out.push(`${key} ${zlib.inflateSync(data.subarray(nul + 2)).toString('latin1')}`); } catch { out.push(key); }
      } else {
        const compressed = data[nul + 1] === 1;
        let rest = data.subarray(nul + 3);
        for (let k = 0; k < 2; k++) { const z = rest.indexOf(0); rest = rest.subarray(z + 1); }
        try { out.push(`${key} ${(compressed ? zlib.inflateSync(rest) : rest).toString('utf8')}`); } catch { out.push(key); }
      }
    }
    at += 12 + len;
  }
  return out.join('\n');
}

// **The private tier's tools, held from both ends** (Eugene, 09-22: the
// per-instrument export is his and never public; 09-25: so are the whole theme
// as a WAV and the ring as a video, record-r1). Each of their modules stamps a
// sentence into itself that begins with the words below, so a shipped file
// carrying them — a bundle in docs/, a copy somewhere else — is a tool having
// shipped. And a shipped source may name the private folder only in a glob
// behind `__PRIVATE_TOOLS__` (`machine/source-controls.tsx` for the export,
// `machine/index.tsx` for the record row), which a release build compiles to
// nothing. Anything else naming a module in it is a way in.
const PRIVATE_MARK = ['deep-house private tier', ''].join(': ');
const PRIVATE_TOOLS = /(?:^|[^\w])(?:\.\/)?private\/[\w.*-]+\.(?:tsx?|jsx?)\b/;
const privateToolsGuarded = (text, line) => /import\.meta\.glob/.test(line) && /__PRIVATE_TOOLS__/.test(text);

const faults = [];
const fault = (file, line, why) => faults.push(`${file}:${line}: ${why}`);

// **The audit's own rules, held to lines whose answer is known** (R135, R68):
// run every time, before a file is read, so a matcher that stops seeing a form
// fails the audit rather than passing everything.
function selftest() {
  const specs = (line) => MODULE.flatMap((re) => { re.lastIndex = 0; return [...line.matchAll(re)].map((m) => m[1]); });
  const cases = [
    ["import 'https://example.invalid/remote.js';", ['https://example.invalid/remote.js']],
    ['import "./side.css";', ['./side.css']],
    ["import x from 'https://example.invalid/x.js';", ['https://example.invalid/x.js']],
    ["export * from 'lodash';", ['lodash']],
    ["const m = await import('https://example.invalid/late.js');", ['https://example.invalid/late.js']],
    ["import{a}from'./a.js'", ['./a.js']],
    ["// an important word, and a value to import from nowhere", []],
  ];
  const wrong = cases.filter(([line, want]) => specs(line).join('|') !== want.join('|')).map(([line]) => line);
  // The names are put together so this file does not carry them whole.
  const cut = ['demo/cut', 'x', 'y'].map((n, i) => `${n}.${['mp4', 'webm', 'MOV'][i]}`);
  if (!cut.every((n) => AUDIO.test(n)) || AUDIO.test('clip.mpeg4.ts'))
    wrong.push('the audio and video extensions');
  // A PNG with one tEXt chunk whose words must be read.
  const chunk = (type, data) => {
    const b = Buffer.alloc(12 + data.length);
    b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8);
    return b;
  };
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('tEXt', Buffer.from(`Comment\0/${'Users'}/somebody/scene.blend`, 'latin1')),
    chunk('zTXt', Buffer.concat([Buffer.from('Author\0\0', 'latin1'), zlib.deflateSync(Buffer.from(PRIVATE_MARK))])),
    chunk('IEND', Buffer.alloc(0))]);
  const t = pngText(png);
  if (!/\/Users\/somebody/.test(t) || !t.includes(PRIVATE_MARK)) wrong.push('a PNG\'s text chunks');
  // every tool of the private folder by its module's name, and not the tier's name in prose
  if (!['./private/source-export.ts', "import('./private/record-tools.tsx')", 'private/ring-video.ts'].every((l) => PRIVATE_TOOLS.test(l))
    || PRIVATE_TOOLS.test('the private tier: the notes, the mining tooling'))
    wrong.push('the private folder\'s module names');
  if (wrong.length) {
    console.error(`release audit: its own rules no longer see ${wrong.length} known case(s):\n${wrong.map((w) => '  ' + w).join('\n')}`);
    process.exit(1);
  }
}
selftest();

for (const rel of shipped()) {
  const abs = absOf(rel);
  if (!fs.existsSync(abs)) continue;
  if (AUDIO.test(rel)) {
    fault(rel, 0, 'an audio file in the release');
    continue;
  }
  const buf = fs.readFileSync(abs);
  const text = buf.toString('latin1');
  // A picture carries its own hazard — a render leaves the path of the scene
  // it came from in a chunk — so the path shapes are read over the bytes. The
  // rest of the rules are about prose and code, and random bytes spell words
  // by accident, so they stop here.
  if (buf.includes(0)) {
    for (const [shape, why] of SHAPES) if (shape.test(text)) fault(rel, 0, why);
    if (text.includes(PRIVATE_MARK)) fault(rel, 0, 'a private tier\'s tool, shipped');
    const words = pngText(buf);
    for (const [shape, why] of SHAPES) if (shape.test(words)) fault(rel, 0, `${why}, in a picture's text`);
    for (const word of words.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) || [])
      if (DENIED.has(hash(word))) fault(rel, 0, 'a denied name, in a picture\'s text');
    if (words.includes(PRIVATE_MARK)) fault(rel, 0, 'a private tier\'s tool, in a picture\'s text');
    continue;
  }
  if (text.includes(PRIVATE_MARK)) fault(rel, 0, 'a private tier\'s tool, shipped');
  const lines = text.split('\n');
  // `.ts` since round C, and two files of it since round D: part of the page
  // is TypeScript, and a module specifier in it has to be as relative as one in
  // a `.js` file. `.tsx` since the machine view, which is the same statement
  // about a component.
  const code = /\.(?:js|mjs|ts|tsx|html|css)$/.test(rel);
  lines.forEach((line, i) => {
    const n = i + 1;
    for (const [shape, why] of SHAPES) if (shape.test(line)) fault(rel, n, `${why}: ${line.trim().slice(0, 90)}`);
    for (const word of line.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) || [])
      if (DENIED.has(hash(word))) fault(rel, n, 'a denied name');
    if (PAGE.test(rel) && /\btmp\//.test(line)) fault(rel, n, `the scratch folder: ${line.trim().slice(0, 90)}`);
    if (PAGE.test(rel) && !/\.map$/.test(rel) && PRIVATE_TOOLS.test(line) && !/^\s*\/\//.test(line) && !privateToolsGuarded(text, line))
      fault(rel, n, `a private tier's module named outside a guarded glob: ${line.trim().slice(0, 90)}`);
    // A private-tier path in a comment, a JSON note, a source map or a
    // provenance string points a reader at the paper trail and the build
    // nowhere; what is held to the rule is a place where the page could LOAD
    // the path — an import, a require, a fetch, a file read, a URL, a src or
    // href, standing close enough in front of it to be reading it (`NEAR`).
    if ((PAGE.test(rel) || CONFIG.test(rel)) && PRIVATE_REF && !/\.(?:json|map)$/.test(rel)) {
      PRIVATE_REF.lastIndex = 0;
      let m;
      while ((m = PRIVATE_REF.exec(line))) {
        if (!couldLoad(line, m.index)) continue;
        fault(rel, n, `a private-tier path where the page could load it: `
          + line.slice(Math.max(0, m.index - NEAR), m.index + 60).trim().slice(-90));
        break;
      }
    }
    // A line that is all comment imports nothing, whatever it quotes.
    if (code && PAGE.test(rel) && IMPORTS(line) && !/^\s*(?:\/\/|\/?\*)/.test(line))
      for (const re of MODULE) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(line))) {
          if (relative(m[1])) continue;
          if (!SITE.test(rel) && (ours(m[1]) || declared(rel, m[1]))) continue;
          fault(rel, n, `not a relative module: ${m[1]}`);
        }
      }
  });
  if (/\.html$/.test(rel) && PAGE.test(rel)) {
    TAG.lastIndex = 0;
    let t;
    while ((t = TAG.exec(text))) {
      const [tag, attrs] = [t[1].toLowerCase(), t[2]];
      const n = text.slice(0, t.index).split('\n').length;
      ATTR.lastIndex = 0;
      let a;
      while ((a = ATTR.exec(attrs))) {
        const spec = a[2];
        if (!spec) continue;
        if (tag === 'a' && /^https:\/\//.test(spec)) continue;
        // A canonical link names the page's own public address; it loads nothing.
        if (tag === 'link' && /rel=["']canonical["']/i.test(attrs) && /^https:\/\/deephouse\.audio\//.test(spec)) continue;
        if (!relative(spec)) fault(rel, n, `<${tag}> loads something that is not beside the page: ${spec}`);
      }
    }
  }
}

if (faults.length) {
  console.error(`release audit failed: ${faults.length} to fix`);
  for (const f of faults) console.error('  ' + f);
  process.exit(1);
}
console.log(`release audit passed: ${shipped().length} files${SITE_DIR ? `, docs/ read from ${path.relative(ROOT, SITE_DIR) || SITE_DIR}` : ''}, nothing outside the work.`);
