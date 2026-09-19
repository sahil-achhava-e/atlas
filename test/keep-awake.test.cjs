'use strict';

// The command that keeps a machine awake, per OS. Worth a test because a wrong
// flag fails SILENTLY — the process starts, nothing errors, and the machine
// sleeps through the night's work anyway.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { keepAwakeCommand } = loadTs('src/shared/keepAwake.ts');

test('macOS holds it with caffeinate, and only adds the display when asked', () => {
  assert.deepEqual(keepAwakeCommand('darwin'), { exe: 'caffeinate', args: ['-i'] });
  assert.deepEqual(keepAwakeCommand('darwin', 'prevent-app-suspension'), { exe: 'caffeinate', args: ['-i'] });
  assert.deepEqual(keepAwakeCommand('darwin', 'prevent-display-sleep'), { exe: 'caffeinate', args: ['-di'] });
});

test('Windows calls SetThreadExecutionState, with the flags that mean "stay on"', () => {
  const cmd = keepAwakeCommand('win32');
  assert.equal(cmd.exe, 'powershell.exe');
  const script = cmd.args[cmd.args.length - 1];
  // ES_CONTINUOUS | ES_SYSTEM_REQUIRED. Without ES_CONTINUOUS the request is a
  // one-shot reset of the idle timer, not a standing "do not sleep".
  assert.match(script, /0x80000001/);
  assert.match(script, /SetThreadExecutionState/);
  // The thread that made the call has to stay alive, or the request dies with it.
  assert.match(script, /Start-Sleep/);
  assert.ok(cmd.args.includes('-NoProfile'), 'a user profile must not be able to break this');
});

test('Windows adds the display flag only when the display was asked for', () => {
  assert.match(keepAwakeCommand('win32', 'prevent-display-sleep').args.at(-1), /0x80000003/);
});

test('Linux holds it with systemd-inhibit, blocking for the child lifetime', () => {
  const cmd = keepAwakeCommand('linux');
  assert.equal(cmd.exe, 'systemd-inhibit');
  assert.ok(cmd.args.includes('--mode=block'));
  assert.ok(cmd.args.includes('--what=idle:sleep'));
  assert.deepEqual(cmd.args.slice(-2), ['sleep', 'infinity']);
});

test('an OS with no answer says so, instead of pretending', () => {
  assert.equal(keepAwakeCommand('aix'), null);
  assert.equal(keepAwakeCommand(''), null);
});
