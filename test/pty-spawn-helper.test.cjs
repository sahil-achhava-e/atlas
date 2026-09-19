'use strict';

// node-pty starts every macOS process by exec'ing a bundled binary, and an app
// allowlisting product kills binaries it does not know. The replacement has to
// behave EXACTLY like the C one it stands in for — a wrong argument position
// runs the right command in the wrong directory, or the wrong command entirely.

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, chmodSync, mkdirSync, existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

const { ensureSpawnHelper, SCRIPT, helperPaths } = require('../tools/pty-spawn-helper.cjs');

const shell = (args, opts = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'helper-'));
  const helper = join(dir, 'spawn-helper');
  writeFileSync(helper, SCRIPT, 'utf8');
  chmodSync(helper, 0o755);
  return execFileSync(helper, args, { encoding: 'utf8', ...opts });
};

test('argv[2] onward is the command, and it keeps its own argv[0]', () => {
  // <cwd> <command> [args…] — an empty cwd means "stay put".
  assert.equal(shell(['', '/bin/echo', 'one', 'two']), 'one two\n');
});

test('argv[1] is a directory to enter first', () => {
  assert.equal(shell(['/tmp', '/bin/pwd']).trim(), execFileSync('/bin/sh', ['-c', 'cd /tmp && pwd'], { encoding: 'utf8' }).trim());
});

test('a cwd that cannot be entered fails, rather than running somewhere else', () => {
  // Silently running an agent in the wrong repository is the worse outcome.
  assert.throws(() => shell(['/no/such/directory/anywhere', '/bin/echo', 'hi']), (e) => e.status === 1);
});

test('the command replaces the shell, so its exit status is the one reported', () => {
  assert.throws(() => shell(['', '/bin/sh', '-c', 'exit 42']), (e) => e.status === 42);
});

test('it is a script, so what gets exec\'d is an interpreter every allowlist has', () => {
  assert.match(SCRIPT, /^#!\/bin\/sh\n/);
});

test('a machine whose helper runs fine is left alone', (t) => {
  if (process.platform !== 'darwin') return t.skip('macOS only');
  const root = mkdtempSync(join(tmpdir(), 'node-pty-'));
  const dir = join(root, 'prebuilds', `${process.platform}-${process.arch}`);
  mkdirSync(dir, { recursive: true });
  const helper = join(dir, 'spawn-helper');
  // /bin/sh stands in for a helper the policy allows: it is not killed.
  writeFileSync(helper, '#!/bin/sh\nexit 0\n');
  chmodSync(helper, 0o755);
  assert.equal(helperPaths(root).length, 1);
  assert.equal(ensureSpawnHelper(root), 'ok');
  assert.ok(!existsSync(`${helper}.orig`), 'nothing should have been backed up');
});

test('a blocked helper is replaced, and the original kept beside it', (t) => {
  if (process.platform !== 'darwin') return t.skip('macOS only');
  const root = mkdtempSync(join(tmpdir(), 'node-pty-'));
  const dir = join(root, 'prebuilds', `${process.platform}-${process.arch}`);
  mkdirSync(dir, { recursive: true });
  const helper = join(dir, 'spawn-helper');
  // A copy of a system binary is enough to be killed on a locked-down machine,
  // and runs normally anywhere else — so this test asserts whichever is true.
  execFileSync('/bin/cp', ['/bin/echo', helper]);
  const before = readFileSync(helper);
  const res = ensureSpawnHelper(root);
  if (res === 'ok') return t.skip('this machine does not block unapproved binaries');
  assert.equal(res, 'patched');
  assert.equal(readFileSync(helper, 'utf8'), SCRIPT);
  assert.deepEqual(readFileSync(`${helper}.orig`), before);
  // Idempotent: a second pass must not back up the replacement over the original.
  assert.equal(ensureSpawnHelper(root), 'ok');
  assert.deepEqual(readFileSync(`${helper}.orig`), before);
});
