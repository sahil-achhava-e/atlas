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

// The install sheet names the three CLIs setup offers, with their install
// commands. Those commands live in agentProvider.ts, so the doc is checked
// against the code: a package rename would otherwise leave a colleague pasting
// a command that installs nothing.

test('the documented CLI install commands are the ones the app knows', () => {
  const loadTs = require('./load-ts.cjs');
  const { AGENT_PROVIDER_PRESETS } = loadTs('src/shared/agentProvider.ts');
  const doc = read('docs/BROWSER-MODE.md');
  for (const id of ['claude', 'codex', 'gemini']) {
    const preset = Object.values(AGENT_PROVIDER_PRESETS).find((p) => p.id === id);
    assert.ok(preset, `${id} is no longer a preset`);
    assert.ok(doc.includes(preset.installCommand),
      `${id}: the doc does not carry "${preset.installCommand}"`);
    assert.ok(doc.includes(`\`${preset.defaultCommand}\``),
      `${id}: the doc never names the binary "${preset.defaultCommand}"`);
  }
});

test('the sheet says the CLI is the user\'s own, signed in by them', () => {
  const doc = read('docs/BROWSER-MODE.md');
  assert.match(doc, /does not bundle a model or a CLI/);
  assert.match(doc, /Run it once on its own first/);
});

// Updating. There is no auto-updater in the tab — that is Electron's — so it is
// a git pull and a rebuild. The only judgement is whether dependencies moved:
// reinstalling when they did not wastes a minute, and not reinstalling when
// they did is a confusing crash.

test('there is one command to update, and the doc says so', () => {
  assert.equal(pkg.scripts.update, 'node tools/update.cjs');
  const doc = read('docs/BROWSER-MODE.md');
  assert.match(doc, /npm run update/);
  assert.match(doc, /no update notification/i, 'the tab does not tell you — say so');
});

test('it reinstalls only when the lockfile moved', () => {
  const src = read('tools/update.cjs');
  assert.match(src, /HEAD:package-lock\.json/);
  assert.match(src, /Dependencies unchanged — no reinstall needed/);
});

test('it refuses on local changes rather than clobbering them', () => {
  const src = read('tools/update.cjs');
  assert.match(src, /You have local changes/);
  assert.match(src, /--ff-only/, 'a merge commit in a colleague\'s clone is nobody\'s idea of an update');
});

test('it does not restart the server for you', () => {
  // Stopping the server stops every agent. That moment is the human's to pick.
  const src = read('tools/update.cjs');
  // It NAMES the command for the human to run; it must not run one itself.
  // Anchored so it does not trip over setup-serve.cjs, which is the INSTALLER.
  assert.doesNotMatch(src, /['/]serve\.cjs/, 'never launches tools/serve.cjs');
  assert.doesNotMatch(src, /'npm run serve'|\['serve'\]/, 'never runs the serve script');
  assert.match(src, /Stop the running server/);
});
