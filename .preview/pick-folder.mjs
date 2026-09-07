/**
 * Native folder picker for the browser preview.
 *
 * The preview runs in Chrome, and a browser cannot open a native dialog: the
 * File System Access API asks "allow this site to view and copy files?" and
 * still refuses to hand over an absolute path. So the picker runs HERE, on the
 * Mac, where `osascript` opens the same folder chooser every native app uses,
 * and hands back a real POSIX path.
 *
 * Runs on the HOST (not in the preview container, which has no macOS and no
 * display). Vite proxies /__pick to it, so the page's fetch stays same-origin
 * and the app's CSP is untouched.
 *
 *   node .preview/pick-folder.mjs
 *
 * Bound to 127.0.0.1 only. It opens a dialog and returns paths; it never reads
 * a file.
 */
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';

const PORT = 5198;

const SCRIPT_MULTI = `
set theFolders to choose folder with prompt "Pick one or more project folders" with multiple selections allowed
set out to ""
repeat with f in theFolders
  set out to out & POSIX path of f & linefeed
end repeat
return out`;

const SCRIPT_ONE = `
set f to choose folder with prompt "Pick a folder"
return POSIX path of f`;

function choose(multi) {
  return new Promise((resolve) => {
    execFile('osascript', ['-e', multi ? SCRIPT_MULTI : SCRIPT_ONE], (err, stdout) => {
      // A cancelled dialog exits non-zero with "User canceled"; that is not an
      // error worth surfacing, it is the same 'cancelled' the real app returns.
      if (err) return resolve({ ok: false, error: 'cancelled' });
      const paths = String(stdout).split('\n').map((s) => s.trim())
        // osascript returns directories with a trailing slash; the app stores
        // them without one, and a mismatch would defeat the duplicate check.
        .map((s) => (s.length > 1 ? s.replace(/\/+$/, '') : s))
        .filter(Boolean);
      if (!paths.length) return resolve({ ok: false, error: 'cancelled' });
      resolve({ ok: true, path: paths[0], paths });
    });
  });
}

createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!req.url?.startsWith('/pick')) { res.writeHead(404).end(); return; }
  const q = new URL(req.url, 'http://x').searchParams;
  // `probe=1` answers without opening a dialog, so anything can check the helper
  // is reachable without putting a window on the user's screen.
  if (q.get('probe') === '1') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, probe: true }));
    return;
  }
  const multi = q.get('multi') === '1';
  const out = await choose(multi);
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
}).listen(PORT, '127.0.0.1', () => {
  console.log(`native folder picker listening on http://127.0.0.1:${PORT}`);
});
