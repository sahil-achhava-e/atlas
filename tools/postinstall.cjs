#!/usr/bin/env node
'use strict';
/**
 * One postinstall, two audiences.
 *
 * DESKTOP BUILDS need the native modules compiled against Electron's ABI, which
 * is what `electron-rebuild` does and why it has always run here.
 *
 * BROWSER MODE does not. `npm run serve` runs the same main process under plain
 * node, where better-sqlite3 and node-pty both resolve PREBUILT binaries —
 * node-pty ships darwin-arm64, darwin-x64, win32-x64 and win32-arm64, and
 * better-sqlite3's install script is `prebuild-install || node-gyp rebuild`. So
 * a machine that only ever runs browser mode needs no compiler at all.
 *
 * That matters because company laptops are exactly that machine: browser mode
 * only, no desktop app, and no Visual Studio Build Tools or Xcode command line
 * tools to hand. `electron-rebuild` failing there used to fail the whole
 * install, leaving nothing runnable. Now it is a WARNING: the install finishes,
 * browser mode works, and the message says plainly that the desktop build is
 * the part that is unavailable.
 *
 * The three steps after it are not optional on either path:
 *   - spawn-helper must be executable or every macOS/Linux pty dies at exec;
 *   - the conpty patch stops a Windows crash when an agent's console has gone;
 *   - both run AFTER a rebuild, which replaces the files they fix.
 */
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

const run = (cmd, args) =>
  execFileSync(cmd, args, { stdio: 'inherit', cwd: join(__dirname, '..') });

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
/** Set by `npm run setup:serve` — skip the Electron rebuild outright. */
const serveOnly = process.env.ATLAS_SERVE_ONLY === '1';

if (serveOnly) {
  console.log('[postinstall] ATLAS_SERVE_ONLY=1 — skipping the Electron rebuild (browser mode needs prebuilt binaries only)');
} else {
  try {
    run(npx, ['electron-rebuild', '-f']);
  } catch (e) {
    console.warn('\n[postinstall] electron-rebuild failed — this install can run BROWSER MODE but not the desktop app.');
    console.warn('[postinstall] That is the expected outcome on a machine with no C++ toolchain.');
    console.warn(`[postinstall] Reason: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    console.warn('[postinstall] Next: npm run serve\n');
  }
}

// These fix files a rebuild would have just replaced, so they run last, and on
// every path. A failure here IS fatal: without them a pty dies at exec.
for (const script of ['ensure-pty-perms.cjs', 'pty-spawn-helper.cjs', 'patch-node-pty-conpty.cjs']) {
  run(process.execPath, [join(__dirname, script)]);
}
