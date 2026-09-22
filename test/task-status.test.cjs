'use strict';

// The five columns, and the aliases that keep an agent's card on the board when
// it writes the word it learned last month instead of the word on the screen.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { TASK_STATUSES, normalizeStatus, isCanonicalStatus } =
  loadTs('src/shared/taskStatus.ts');

test('the board has five columns, in reading order', () => {
  assert.deepEqual([...TASK_STATUSES], ['todo', 'in-progress', 'in-review', 'blocked', 'done']);
});

test('the old word for in-progress still lands in the right column', () => {
  // THE ONE THAT MATTERS. Ten agents have "doing" in their memory.md and in the
  // prompts they were hired under. If that fell back to `todo`, every card in
  // flight would appear un-started the moment the release landed.
  assert.equal(normalizeStatus('doing'), 'in-progress');
  assert.equal(normalizeStatus('Doing'), 'in-progress');
  assert.equal(normalizeStatus('in progress'), 'in-progress');
  assert.equal(normalizeStatus('in_progress'), 'in-progress');
});

test('every reasonable spelling of the review lane is the review lane', () => {
  for (const s of ['review', 'In Review', 'in_review', 'code-review', 'needs review', 'PR-REVIEW']) {
    assert.equal(normalizeStatus(s), 'in-review', s);
  }
});

test('the canonical five pass through untouched', () => {
  for (const s of TASK_STATUSES) assert.equal(normalizeStatus(s), s);
});

test('anything unreadable shows up as todo rather than vanishing', () => {
  for (const s of [undefined, null, 42, '', '   ', 'somethingelse', {}]) {
    assert.equal(normalizeStatus(s), 'todo');
  }
});

test('isCanonicalStatus only accepts the exact five', () => {
  assert.ok(isCanonicalStatus('in-review'));
  assert.ok(!isCanonicalStatus('doing'));
  assert.ok(!isCanonicalStatus('In Review'));
});
