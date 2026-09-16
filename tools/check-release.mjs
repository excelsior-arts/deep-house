// What ships is audited by shape, not by taste.
//
//   node tools/check-release.mjs
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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  [/[\w.+-]+@[\w-]+\.[a-z]{2,}/i, 'an address'],
  [/[\w/-]+\.(?:mp3|m4a|flac|ogg|opus|aiff?)\b/i, 'a recording'],
];

// Audio never ships, in any format, under any name.
const AUDIO = /\.(?:wav|mp3|aiff?|flac|ogg|opus|m4a)$/i;

// The page is one module graph served off a static folder, and the folder can
// be served from any prefix — a project site lives under /<repo>/. So every
// specifier it loads is relative to the file that asks for it: no scheme, no
// host, no leading slash, no bare package name.
const MODULE = [/\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]/g];
const TAG = /<([a-z][a-z0-9-]*)\b([^>]*)>/gi;
const ATTR = /\b(src|href)\s*=\s*["']([^"']*)["']/gi;
// A link the reader may follow is not a thing the page loads. Everything else
// a tag names — a module, a stylesheet, an icon, a picture — has to come from
// the folder the page was served out of.
const relative = (spec) => /^\.{1,2}\//.test(spec) || spec.startsWith('#') || spec.startsWith('data:');

// What a browser loads: src/, which is the build's root and holds the pages
// with the modules they ask for, and docs/, which is what that build writes.
// Browser code may not name the scratch folder. The scripts in tools/ may:
// they run on a machine, and what they write there is the point.
const PAGE = /^(?:docs|src)\//;

const shipped = () =>
  execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((p) => p && !p.startsWith('tmp/'))
    .sort();

const faults = [];
const fault = (file, line, why) => faults.push(`${file}:${line}: ${why}`);

for (const rel of shipped()) {
  const abs = path.join(ROOT, rel);
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
    continue;
  }
  const lines = text.split('\n');
  const code = /\.(?:js|mjs|html|css)$/.test(rel);
  lines.forEach((line, i) => {
    const n = i + 1;
    for (const [shape, why] of SHAPES) if (shape.test(line)) fault(rel, n, `${why}: ${line.trim().slice(0, 90)}`);
    for (const word of line.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) || [])
      if (DENIED.has(hash(word))) fault(rel, n, 'a denied name');
    if (PAGE.test(rel) && /\btmp\//.test(line)) fault(rel, n, `the scratch folder: ${line.trim().slice(0, 90)}`);
    if (code && PAGE.test(rel))
      for (const re of MODULE) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(line))) if (!relative(m[1])) fault(rel, n, `not a relative module: ${m[1]}`);
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
        if (tag === 'link' && /rel=["']canonical["']/i.test(attrs) && /^https:\/\/excelsior-arts\.github\.io\//.test(spec)) continue;
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
console.log(`release audit passed: ${shipped().length} files, nothing outside the work.`);
