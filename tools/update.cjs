#!/usr/bin/env node
'use strict';
/**
 * Update a browser-mode install.
 *
 * There is no auto-updater in the tab — that is Electron's, along with the tray
 * and native dialogs. So updating is `git pull` and a rebuild, and `npm run
 * serve` already rebuilds. The only judgement call is whether dependencies
 * moved, because reinstalling when they have not is a minute wasted and NOT
 * reinstalling when they have is a confusing crash.
 *
 * So: pull, compare the lockfile before and after, install only if it changed.
 * Nothing here restarts the server — stopping it stops the agents, and that is
 * the human's call, not a script's.
 */
const { execFileSync, spawnSync } = require('node:child_process');
const { join } = require('node:path');

const root = join(__dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

function main() {
  let dirty = '';
  try { dirty = git('status', '--porcelain'); } catch {
    console.error('Not a git checkout — update by re-cloning, or use the desktop app.');
    process.exit(1);
  }
  if (dirty) {
    console.error('You have local changes. Commit or stash them first:\n');
    console.error(dirty.split('\n').slice(0, 10).join('\n'));
    process.exit(1);
  }

  const before = git('rev-parse', 'HEAD');
  const lockBefore = git('rev-parse', 'HEAD:package-lock.json');
  console.log(`Current: ${before.slice(0, 8)}`);

  // --ff-only: a merge commit in someone's clone is a surprise nobody wants to
  // debug over a screen share.
  const pull = spawnSync('git', ['pull', '--ff-only'], { cwd: root, stdio: 'inherit' });
  if (pull.status !== 0) {
    console.error('\ngit pull failed. Nothing has changed.');
    process.exit(pull.status ?? 1);
  }

  const after = git('rev-parse', 'HEAD');
  if (after === before) {
    console.log('\nAlready up to date. Nothing to do.');
    return;
  }
  const version = JSON.parse(require('node:fs').readFileSync(join(root, 'package.json'), 'utf8')).version;
  console.log(`\nUpdated to ${after.slice(0, 8)} (version ${version}).`);

  if (git('rev-parse', 'HEAD:package-lock.json') !== lockBefore) {
    console.log('Dependencies changed — reinstalling (no compiler needed).\n');
    const install = spawnSync(process.execPath, [join(__dirname, 'setup-serve.cjs')], { cwd: root, stdio: 'inherit' });
    if (install.status !== 0) process.exit(install.status ?? 1);
  } else {
    console.log('Dependencies unchanged — no reinstall needed.');
  }

  console.log('\nDone. Stop the running server (Ctrl-C) and start it again:\n  npm run serve');
  console.log('Your workspace, agents and their briefings are untouched.');
}

main();
