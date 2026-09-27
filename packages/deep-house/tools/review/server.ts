// The review server: a page, the wavs, and one write.
//
//   node tools/review/server.ts notes/reviews/cookbook.json
//   node tools/review/server.ts notes/reviews/cookbook.json --port 7040 --lan
//
// No dependencies, no build, nothing to install: node's own http server, the
// page as one file beside it, and the manifest as the only state there is.
// Localhost unless `--lan` is given, and then it binds every interface and
// prints the address to type into a phone — which is the only reason it does,
// because reviewing twenty tracks standing up is not the same job as reviewing
// them at a desk.
//
// The wavs are served with **range requests**, so the browser can seek inside a
// file instead of fetching it whole, and only the files the manifest names are
// reachable: a request asks for an item, not for a path.

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, decide, itemOf, orderOf, progressOf, readSession } from './session.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(HERE, 'index.html');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const has = (k) => process.argv.includes(`--${k}`);

const positional = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !(all[i - 1] || '').startsWith('--port'));
if (!positional.length) {
  console.error('usage: node tools/review/server.ts <session.json> [--port 7040] [--lan]');
  process.exit(2);
}

/**
 * The manifest, found from where it was typed: as given (from the repository
 * root, which is where `npm run review` is typed) or relative to the working
 * directory, whichever exists. One argument, two right answers.
 */
function findSession(given) {
  const tries = [...new Set([path.resolve(process.cwd(), given), path.join(ROOT, given)])];
  for (const t of tries) if (fs.existsSync(t)) return t;
  console.error(`no session at ${tries.map((t) => path.relative(ROOT, t) || t).join(' or ')}`);
  process.exit(2);
}

const FILE = findSession(positional[0]);
const PORT = +arg('port', 7040);
const LAN = has('lan');
// 6975 is the dev server and is never taken by a tool.
if (PORT === 6975) { console.error('6975 is the dev server; pick another port'); process.exit(2); }

// Read once at the start so a broken manifest is a message and not a blank
// page. Every request re-reads it, because the file is the state.
let first;
try {
  first = readSession(FILE);
} catch (e) {
  // One line, and the line names what is wrong with the file: a stack trace
  // about a manifest is a stack trace about a typo.
  console.error(e.message);
  process.exit(2);
}
console.log(`${path.relative(ROOT, FILE)} — ${first.title}: ${first.items.length} items, ${progressOf(first).reviewed} reviewed`);

const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.wav': 'audio/wav' };

const send = (res, code, body, type = 'application/json') => {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(code, { 'content-type': type, 'content-length': buf.length, 'cache-control': 'no-store' });
  res.end(buf);
};

/** The body of a POST, with a ceiling on it: this is a local tool, not a service. */
function bodyOf(req, limit = 1 << 20) {
  return new Promise((resolve, reject) => {
    let text = '';
    req.on('data', (c) => {
      text += c;
      if (text.length > limit) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => resolve(text));
    req.on('error', reject);
  });
}

/**
 * One wav, with seeking. `Range: bytes=a-b` is answered with a 206 and the
 * slice; anything else with the whole file and `Accept-Ranges`, which is what
 * tells the browser it may ask for a range at all. Without this, dragging the
 * scrubber in a sixteen-bar file refetches it.
 */
function sendWav(req, res, file) {
  if (!fs.existsSync(file)) return send(res, 404, { error: `no wav at ${path.relative(ROOT, file)}` });
  const size = fs.statSync(file).size;
  const head = { 'content-type': TYPES['.wav'], 'accept-ranges': 'bytes', 'cache-control': 'no-store' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (!range) {
    res.writeHead(200, { ...head, 'content-length': size });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file).pipe(res);
  }
  let [, from, to] = range;
  let start = from === '' ? size - Number(to) : Number(from);
  let end = from === '' || to === '' ? size - 1 : Number(to);
  start = Math.max(0, Math.min(start, size - 1));
  end = Math.max(start, Math.min(end, size - 1));
  res.writeHead(206, { ...head, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${size}` });
  if (req.method === 'HEAD') return res.end();
  return fs.createReadStream(file, { start, end }).pipe(res);
}

/** What the page is told: the manifest, plus which wavs are actually on disk. */
function sessionPayload() {
  const session = readSession(FILE);
  const on = (p) => (p ? fs.existsSync(path.join(ROOT, p)) : false);
  return {
    session: {
      ...session,
      items: session.items.map((it) => ({ ...it, has: { wav: on(it.wav), source: on(it.source) } })),
    },
    file: path.relative(ROOT, FILE),
    order: orderOf(session),
    progress: progressOf(session),
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const name = decodeURIComponent(url.pathname);
  try {
    if (name === '/' || name === '/index.html') {
      return send(res, 200, fs.readFileSync(PAGE), TYPES['.html']);
    }
    if (name === '/api/session') return send(res, 200, sessionPayload());

    // /audio/<item id> and /audio/<item id>/source — an item, never a path, so
    // nothing outside the manifest is reachable through this server.
    const audio = /^\/audio\/([^/]+)(\/source)?$/.exec(name);
    if (audio) {
      const session = readSession(FILE);
      const item = itemOf(session, audio[1]);
      if (!item) return send(res, 404, { error: `no item ${audio[1]}` });
      const rel = audio[2] ? item.source : item.wav;
      if (!rel) return send(res, 404, { error: `item ${item.id} has no ${audio[2] ? 'source' : 'wav'}` });
      return sendWav(req, res, path.join(ROOT, rel));
    }

    if (name === '/api/state' && req.method === 'POST') {
      const body = JSON.parse((await bodyOf(req)) || '{}');
      const { entry, row, progress, session } = decide(FILE, body);
      const label = entry ? `${body.action} ${entry.score > 0 ? `+${entry.score}` : entry.score}` : 'pending again';
      console.log(`  ${body.item.padEnd(28)} ${label}${row && !row.missing ? `  ->  ${row.path} chef ${row.chef ?? '—'}` : ''}${entry?.note ? `  "${entry.note}"` : ''}`);
      return send(res, 200, { ok: true, item: body.item, entry, row, progress, order: orderOf(session) });
    }

    return send(res, 404, { error: 'no such thing here' });
  } catch (e) {
    console.error(`  ${name}: ${e.message}`);
    return send(res, 400, { error: e.message });
  }
});

server.listen(PORT, LAN ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(`\n  http://127.0.0.1:${PORT}/`);
  if (LAN) {
    for (const [, addrs] of Object.entries(os.networkInterfaces())) {
      for (const a of addrs || []) if (a.family === 'IPv4' && !a.internal) console.log(`  http://${a.address}:${PORT}/   (this network)`);
    }
  }
  console.log('');
});
