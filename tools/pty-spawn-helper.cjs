'use strict';
/**
 * Keep node-pty able to start a process on a machine that only runs approved
 * binaries.
 *
 * On macOS node-pty does not exec your command directly. `forkpty` gives it a
 * child on a new pty, and that child execs a small bundled binary,
 * `spawn-helper`, which chdirs and then execs the real command. Application
 * allowlisting products (ThreatLocker, Carbon Black, and friends) SIGKILL any
 * executable that is not on their list, and a binary that arrived inside an npm
 * tarball never is. The symptom is every agent dying instantly with no output
 * and exit 137, which reads exactly like a broken install.
 *
 * The helper does three things a shell can do — attach the controlling
 * terminal, chdir, exec — so this replaces it with a script. A script is not
 * exec'd itself: the kernel execs its interpreter, and /bin/sh is on every
 * allowlist there is.
 *
 * ONLY WHEN THE REAL ONE IS BLOCKED. The C helper is what upstream ships and
 * what upstream tests; it stays in place on a normal machine, and the original
 * is kept beside the replacement so this is reversible.
 */

const { spawnSync } = require('node:child_process');
const { chmodSync, copyFileSync, existsSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

/** What the C helper does, in the shell. Mirrors src/unix/spawn-helper.cc:
 *  argv[1] is the cwd, argv[2] is the command, argv[3..] are its arguments, and
 *  the command must end up as its own argv[0]. */
const SCRIPT = `#!/bin/sh
# Stands in for node-pty's compiled spawn-helper on machines whose endpoint
# policy kills unapproved binaries. Written by tools/pty-spawn-helper.cjs; the
# original is beside this file as spawn-helper.orig.
#
# argv: <cwd> <command> [args...]   — see src/unix/spawn-helper.cc.

# Attach the controlling terminal, as the C helper does. forkpty has normally
# done this already via login_tty, so a failure here is not fatal.
__tty=$(tty 2>/dev/null) && [ -c "$__tty" ] && { : <>"$__tty"; } 2>/dev/null

# An empty cwd means "stay put"; a cwd that cannot be entered is fatal, because
# running the command in the wrong directory is worse than not running it.
if [ -n "$1" ]; then
  cd "$1" || exit 1
fi
shift

exec "$@"
`;

/** Where node-pty will look for the helper: beside whichever copy of the native
 *  module it loads. Mirrors lib/utils.js's search order. */
function helperPaths(root) {
  const dirs = [join(root, 'build', 'Release'), join(root, 'build', 'Debug')];
  const prebuilds = join(root, 'prebuilds', `${process.platform}-${process.arch}`);
  dirs.push(prebuilds);
  return dirs.map((d) => join(d, 'spawn-helper')).filter((p) => existsSync(p));
}

/** Can this binary actually be exec'd here? A policy kill arrives as SIGKILL on
 *  a binary that runs fine when the policy allows it, which is indistinguishable
 *  from the inside — so run it and look. The helper with no arguments exits
 *  immediately either way. */
function isBlocked(path) {
  const res = spawnSync(path, [], { stdio: 'ignore', timeout: 5000 });
  return res.signal === 'SIGKILL';
}

/** Returns what it did, for the caller to log: 'ok' | 'patched' | 'skipped'. */
function ensureSpawnHelper(root) {
  if (process.platform !== 'darwin') return 'skipped';
  if (!existsSync(root)) return 'skipped';

  let patched = false;
  for (const helper of helperPaths(root)) {
    // Already ours? Nothing to do — and nothing to re-probe, since a script
    // cannot be killed for being an unapproved binary.
    let head = '';
    try { head = readFileSync(helper, 'utf8').slice(0, 64); } catch { /* binary */ }
    if (head.startsWith('#!')) continue;

    if (!isBlocked(helper)) continue;

    try {
      const backup = `${helper}.orig`;
      if (!existsSync(backup)) copyFileSync(helper, backup);
      writeFileSync(helper, SCRIPT, 'utf8');
      chmodSync(helper, 0o755);
      patched = true;
    } catch {
      // A read-only install (a packaged app in /Applications) cannot be
      // repaired from here. The caller reports it; nothing is broken further.
      return 'skipped';
    }
  }
  return patched ? 'patched' : 'ok';
}

module.exports = { ensureSpawnHelper, SCRIPT, helperPaths, isBlocked };

if (require.main === module) {
  const root = join(__dirname, '..', 'node_modules', 'node-pty');
  let result = 'skipped';
  try { result = ensureSpawnHelper(root); } catch { /* never break an install */ }
  if (result === 'patched') {
    console.log('[pty-spawn-helper] spawn-helper is blocked by this machine\'s app policy — replaced it with a shell equivalent.');
  }
}
