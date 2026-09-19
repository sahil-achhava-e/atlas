'use strict';

// Deleting a workspace is the one action in the app with nothing behind it: the
// agents' memory, their sessions and the board are in those folders and in no
// other copy. These are the guards, tested for what they REFUSE.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { canDeleteWorkspace, WORKSPACE_DATA } = loadTs('src/shared/workspaceDelete.ts');

const ctx = { home: '/Users/me/Work', recents: ['/Users/me/Work', '/Users/me/Old', '/Users/me/Spike'] };

test('a workspace this install has opened can be deleted', () => {
  assert.equal(canDeleteWorkspace('/Users/me/Old', ctx).ok, true);
});

test('the open workspace is refused — that is what resetting the app is for', () => {
  const res = canDeleteWorkspace('/Users/me/Work', ctx);
  assert.equal(res.ok, false);
  assert.match(res.error, /open/i);
});

test('a path this install never opened is refused, however plausible', () => {
  for (const p of ['/Users/me/Documents', '/Users/me', '/', '/Users/me/Old/hive']) {
    assert.equal(canDeleteWorkspace(p, ctx).ok, false, p);
  }
});

test('nothing and nonsense are refused', () => {
  for (const p of ['', '   ', undefined, null, 42, {}]) {
    assert.equal(canDeleteWorkspace(p, ctx).ok, false, String(p));
  }
});

test('with no workspace open, a recent one is still deletable', () => {
  assert.equal(canDeleteWorkspace('/Users/me/Old', { home: null, recents: ctx.recents }).ok, true);
});

test('only Atlas-created data is named — never the workspace folder itself', () => {
  assert.deepEqual([...WORKSPACE_DATA], ['hive', 'palace', 'roster.json', 'roster-backups']);
});
