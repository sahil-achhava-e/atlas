'use strict';

// "New workspace" prefills a path. It must never prefill one that is already a
// workspace: pressing the button twice would otherwise offer the folder you
// just made, and opening it would silently reuse that crew instead of starting.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { suggestWorkspace } = loadTs('src/shared/workspaceName.ts');

test('the first one is just ~/agents', () => {
  assert.equal(suggestWorkspace([]), '~/agents');
  assert.equal(suggestWorkspace(['/Users/me/work', '/Users/me/spike']), '~/agents');
});

test('a taken name steps to the next free number', () => {
  assert.equal(suggestWorkspace(['/Users/me/agents']), '~/agents-2');
  assert.equal(suggestWorkspace(['/Users/me/agents', '/Users/me/agents-2']), '~/agents-3');
  // A gap is filled rather than skipped.
  assert.equal(suggestWorkspace(['/Users/me/agents', '/Users/me/agents-3']), '~/agents-2');
});

test('a trailing slash is still the same folder', () => {
  assert.equal(suggestWorkspace(['/Users/me/agents/']), '~/agents-2');
});
