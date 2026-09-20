'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(
  path.join(__dirname, '..', 'src/renderer/src/store/store.ts'), 'utf8');

/** The body of one zustand action, from its name to the start of the next. */
function action(name) {
  const from = src.indexOf(`  ${name}: (id) =>`);
  assert.notEqual(from, -1, `${name} not found — was it renamed?`);
  return src.slice(from, from + 900);
}

// A roster row is deleted ONLY when something asked for that agent to go. It
// was briefly inferred instead — "it was in the store, now it is not" — and a
// server restart, which drops cards whose PTY is not live, read as the human
// deleting the whole floor. An absence is not an intent.

test('every deliberate removal marks the agent, and nothing else does', () => {
  for (const name of ['removeAgent', 'removeArchivedAgent', 'removeRestorableAgent']) {
    assert.match(action(name), /markRemoved\(id\)/,
      `${name} must record that this agent is meant to go`);
  }
  const calls = src.match(/markRemoved\(/g) ?? [];
  assert.equal(calls.length, 4, // the definition + the three actions
    'only the three remove* actions may mark an agent for deletion');
});

test('a card that leaves the floor without being deleted is not a deletion', () => {
  // reconcileWithLivePtys drops agents whose terminal is gone. That is a
  // reload, not a delete, and the orchestrator goes through it on every restart.
  const from = src.indexOf('  reconcileWithLivePtys: (livePtyIds) =>');
  assert.notEqual(from, -1);
  assert.doesNotMatch(src.slice(from, from + 1200), /markRemoved/,
    'reconciling against live PTYs must never delete a roster row');
});

test('a removal is retried until the database confirms it', () => {
  // Clearing it on send would mean a failed save quietly resurrects the agent.
  assert.match(src, /if \(res\?\.ok\) for \(const id of removes\) pendingRemovals\.delete\(id\)/,
    'pending removals clear on confirmation, not on send');
});

test('an agent we are still holding is never in the removes list', () => {
  assert.match(src, /for \(const id of held\) pendingRemovals\.delete\(id\)/,
    'a re-added agent must drop out of the pending removals');
});
