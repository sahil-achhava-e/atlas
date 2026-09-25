'use strict';

// Clearing throws context away, so the cost of a wrong answer here is an agent
// forgetting live work. Most of these cases are about who must NOT be cleared.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { agentsToClearOnDone } = loadTs('src/shared/clearOnDone.ts');

const agents = { eng: {}, rev: {}, lead: { isLead: true }, god: { isGod: true }, old: { archived: true } };
const card = (id, status, assignee, reviewer) => ({ id, status, assignee, reviewer });

test('the first look is a baseline and clears nobody', () => {
  const r = agentsToClearOnDone(null, [card('A', 'done', 'eng')], agents);
  assert.deepEqual(r.clear, []);
  assert.deepEqual([...r.seen], ['A']);
});

test('a card newly done clears its engineer and its reviewer', () => {
  const r = agentsToClearOnDone(new Set(), [card('A', 'done', 'eng', 'rev')], agents);
  assert.deepEqual(r.clear.sort(), ['eng', 'rev']);
});

test('a card already seen done clears nobody again', () => {
  assert.deepEqual(agentsToClearOnDone(new Set(['A']), [card('A', 'done', 'eng')], agents).clear, []);
});

test('an agent with other live work is left alone', () => {
  const cards = [card('A', 'done', 'eng', 'rev'), card('B', 'in-progress', 'eng'), card('C', 'in-review', 'x', 'rev')];
  assert.deepEqual(agentsToClearOnDone(new Set(), cards, agents).clear, []);
});

test('a queued todo card does not stop the clear', () => {
  const cards = [card('A', 'done', 'eng'), card('B', 'todo', 'eng')];
  assert.deepEqual(agentsToClearOnDone(new Set(), cards, agents).clear, ['eng']);
});

test('leads, the orchestrator, archived and unknown agents are never cleared', () => {
  const cards = [card('A', 'done', 'lead', 'god'), card('B', 'done', 'old', 'ghost')];
  assert.deepEqual(agentsToClearOnDone(new Set(), cards, agents).clear, []);
});
