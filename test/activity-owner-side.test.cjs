'use strict';

// The read-only view showed one side of the conversation: the agent's answers
// with the human's questions cut out. A short reply then reads as a non
// sequitur, and there is no way to tell what was asked for.
//
// The hard part is not showing `user` entries — it is knowing which of them the
// human typed. Everything the harness sends on their behalf lands in the
// transcript the same way: the orientation seed, the resume nudge, the inbox
// wake, a circuit-breaker warning. In one real day's transcript the inbox nudge
// alone was 37 of 61 user entries, so showing them all would bury the four
// things the human actually said.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { activityRows, isOwnerPrompt, lastSaid } = loadTs('src/shared/activityFeed.ts');

const userLine = (text, at = '2026-09-21T10:00:00Z') =>
  JSON.stringify({ type: 'user', timestamp: at, message: { content: text } });
const assistantLine = (text) =>
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } });

test('what the human typed becomes a row of its own', () => {
  const rows = activityRows([
    userLine('in events check pr 2115'),
    assistantLine('Opened a card for it.')
  ]);
  assert.deepEqual(rows.map((r) => r.kind), ['ask', 'say']);
  assert.equal(rows[0].text, 'in events check pr 2115');
  assert.ok(rows[0].at, 'and carries its timestamp');
});

test('the prompts the app writes are not attributed to the human', () => {
  const injected = [
    'You have new hive inbox message(s) — at least: 2026-09-20T01-20-59-196Z-d46110. Read your inbox',
    'Continue from where you left off.',
    '<pasted_content id="6593"> You\'re online as Atlas, the orchestrator',
    'ENRICH TASK: make the thing',
    'Circuit breaker: steer — you are looping',
    'Base directory for this skill: /Users/x/.claude/skills/azure-devops',
    // A long nudge arrives split across lines, so the head is not always there.
    's authoritative: work everything still pending in it, and move handled ones to inbox/.done/'
  ];
  for (const text of injected) {
    assert.equal(isOwnerPrompt(text), false, `attributed to the human: ${text.slice(0, 40)}`);
    assert.deepEqual(activityRows([userLine(text)]), [], `showed up as a row: ${text.slice(0, 40)}`);
  }
});

test('a tool result is machinery, not a turn in the conversation', () => {
  // These are most of the user entries in any transcript.
  const line = JSON.stringify({
    type: 'user',
    message: { content: [{ type: 'tool_result', text: 'file contents here' }] }
  });
  assert.deepEqual(activityRows([line]), []);
});

test('a real message survives the filters it superficially resembles', () => {
  // "check the inbox" contains neither marker phrase and must not be dropped.
  assert.equal(isOwnerPrompt('check the inbox and tell me what is pending'), true);
  assert.equal(isOwnerPrompt('continue'), true, 'not the resume nudge');
  assert.equal(isOwnerPrompt('what is the heartbeat schedule?'), true, 'asking ABOUT one is not one');
});

test('text blocks count, and several in one entry read as one message', () => {
  const line = JSON.stringify({
    type: 'user',
    message: { content: [{ type: 'text', text: 'first line' }, { type: 'text', text: 'second line' }] }
  });
  assert.deepEqual(activityRows([line]).map((r) => r.text), ['first line\nsecond line']);
});

test('the one-line summary still quotes the AGENT, never the human', () => {
  const rows = activityRows([
    assistantLine('Card opened.'),
    userLine('and the other repo?')
  ]);
  assert.equal(rows[rows.length - 1].kind, 'ask', 'the human spoke last');
  assert.equal(lastSaid(rows), 'Card opened.', 'but the summary is what the agent said');
});

test('an empty or whitespace message is not a turn', () => {
  assert.deepEqual(activityRows([userLine('   '), userLine('')]), []);
});
