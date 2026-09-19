'use strict';

// New workspaces live under one root, one folder each. Two things have to hold:
// the suggested name is never one already in use (opening that would silently
// reuse a crew instead of starting one), and a typed name stays INSIDE the root.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { suggestWorkspaceName, workspacePath, cleanWorkspaceName, WORKSPACE_ROOT } =
  loadTs('src/shared/workspaceName.ts');

test('the first one is just agents', () => {
  assert.equal(suggestWorkspaceName([]), 'agents');
  assert.equal(suggestWorkspaceName(['/Users/me/work', '/Users/me/Atlas/spike']), 'agents');
});

test('a taken name steps to the next free number, filling gaps', () => {
  assert.equal(suggestWorkspaceName(['/Users/me/Atlas/agents']), 'agents-2');
  assert.equal(suggestWorkspaceName(['/Users/me/Atlas/agents', '/Users/me/Atlas/agents-2']), 'agents-3');
  assert.equal(suggestWorkspaceName(['/Users/me/Atlas/agents', '/Users/me/Atlas/agents-3']), 'agents-2');
});

test('a trailing slash is still the same folder', () => {
  assert.equal(suggestWorkspaceName(['/Users/me/Atlas/agents/']), 'agents-2');
});

test('a name is a folder in the root, never a path out of it', () => {
  assert.equal(workspacePath('billing'), `${WORKSPACE_ROOT}/billing`);
  assert.equal(workspacePath('../escape'), `${WORKSPACE_ROOT}/escape`);
  assert.equal(workspacePath('a/b'), `${WORKSPACE_ROOT}/a-b`);
  assert.equal(workspacePath('  spaced out  '), `${WORKSPACE_ROOT}/spaced out`);
  assert.equal(cleanWorkspaceName('..'), '');
});
