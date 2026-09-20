'use strict';

// An ask on the ASK ME board was labelled with the CARD'S ASSIGNEE. Atlas wrote
// three asks about Luffy's card, and the board said "Luffy is asking" — which
// reads as the engineer going round the orchestrator straight to the human.
// Atlas had done exactly the right thing; only the label was wrong.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const src = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const ask = src('src/renderer/src/components/AskMeTab.tsx');

test('the board names the ASKER, not whoever the card is assigned to', () => {
  assert.match(ask, /const asker = agentFor\(open\.by\) \?\? agents\.find\(\(a\) => a\.isGod\)/,
    'the asker comes from the entry, falling back to the orchestrator');
  assert.doesNotMatch(ask, /const asker = agentFor\(t\.assignee\)/,
    'the assignee is who is BLOCKED, never who asked');
});

test('who is stuck is still shown, separately from who asked', () => {
  assert.match(ask, /const blocked = agentFor\(t\.assignee\)/);
  assert.match(ask, /blocked\.id !== asker\?\.id/,
    'no point saying both when they are the same agent');
});

test('the entry carries an author field', () => {
  const kanban = src('src/renderer/src/components/TasksKanban.tsx');
  assert.match(kanban, /^\s*by\?: string;/m, 'HumanQA.by');
});

test('the orchestrator is told to sign the ask, and that it is the only one who writes them', () => {
  const hive = src('src/main/hive.ts');
  assert.match(hive, /"by": "god"/, 'the PROTOCOL.md example includes the author');
  assert.match(hive, /YOU ARE THE ONLY ONE WHO WRITES THESE/);
  assert.match(hive, /"by":"<your agent id>"/, 'the orchestrator prompt asks for it too');
});

test('an unsigned ask reads as the orchestrator, because nobody else writes them', () => {
  // Every entry written before this change has no `by`. They were all the
  // orchestrator's, so the fallback is the truth rather than a guess.
  assert.match(ask, /\?\? agents\.find\(\(a\) => a\.isGod\)/);
});

test('every locale can render the new line', () => {
  const dir = path.join(__dirname, '..', 'src/renderer/src/i18n/locales');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.ok(j.askMe.blocks, `${f} is missing askMe.blocks`);
    assert.match(j.askMe.blocks, /\{\{name\}\}/, `${f} must interpolate the name`);
  }
});
