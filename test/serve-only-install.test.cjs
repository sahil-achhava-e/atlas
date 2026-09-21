'use strict';

// Company laptops run browser mode and never the desktop app. That machine has
// no C++ toolchain, and it must not need one: better-sqlite3 installs a
// prebuilt binary (`prebuild-install || node-gyp rebuild`) and node-pty ships
// prebuilds for darwin-arm64, darwin-x64, win32-x64 and win32-arm64.
//
// The thing in the way was our own postinstall. `electron-rebuild -f` needs a
// compiler, and worse, when it SUCCEEDS it rebuilds those two modules for
// Electron's runtime — after which the browser-mode server cannot load them.
// Watched that happen: 1085 tests passing, run the rebuild, seven files fail.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const pkg = JSON.parse(read('package.json'));

test('there is one command to install for browser mode', () => {
  assert.equal(pkg.scripts['setup:serve'], 'node tools/setup-serve.cjs');
  // A node script rather than `ATLAS_SERVE_ONLY=1 npm ci`, because that is not
  // the same command on Windows and this has to be one line a colleague pastes.
  const src = read('tools/setup-serve.cjs');
  assert.match(src, /ATLAS_SERVE_ONLY: '1'/);
  assert.match(src, /process\.platform === 'win32' \? 'npm\.cmd' : 'npm'/);
});

test('the serve-only install skips the Electron rebuild entirely', () => {
  const src = read('tools/postinstall.cjs');
  assert.match(src, /const serveOnly = process\.env\.ATLAS_SERVE_ONLY === '1'/);
  const guarded = src.slice(src.indexOf('if (serveOnly)'));
  assert.ok(guarded.indexOf('electron-rebuild') > 0, 'the rebuild sits inside the guard');
});

test('a missing compiler warns instead of failing the install', () => {
  // It used to take the whole install down, leaving nothing runnable at all.
  const src = read('tools/postinstall.cjs');
  const attempt = src.slice(src.indexOf('try {'), src.indexOf('// These fix files'));
  assert.match(attempt, /catch \(e\)/);
  assert.match(attempt, /can run BROWSER MODE but not the desktop app/);
  assert.doesNotMatch(attempt, /process\.exit\(1\)/);
});

test('the pty fixes still run on every path, and still fail loudly', () => {
  // A rebuild replaces the files they patch, so they run after it — and without
  // them every macOS pty dies at exec and Windows crashes on a closed console.
  const src = read('tools/postinstall.cjs');
  const after = src.slice(src.indexOf('// These fix files'));
  for (const s of ['ensure-pty-perms.cjs', 'pty-spawn-helper.cjs', 'patch-node-pty-conpty.cjs']) {
    assert.ok(after.includes(s), `${s} must run on both paths`);
  }
  assert.doesNotMatch(after, /catch/, 'a broken pty is not a warning');
});

test('the instructions exist and tell the truth about the trap', () => {
  const doc = read('docs/BROWSER-MODE.md');
  assert.match(doc, /npm run setup:serve/);
  assert.match(doc, /npm rebuild better-sqlite3/, 'how to recover from a plain npm ci');
  assert.match(doc, /127\.0\.0\.1/, 'says it is loopback only');
  assert.match(doc, /Node 20 or newer/);
  assert.match(doc, /signed in/, 'the agent CLI is the user\'s, not ours');
  assert.match(read('README.md'), /docs\/BROWSER-MODE\.md/, 'linked from the README');
});
