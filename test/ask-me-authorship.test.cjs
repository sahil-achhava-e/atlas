'use strict';

// An ask on the ASK ME board was labelled with the CARD'S ASSIGNEE. Atlas wrote
// three asks about Luffy's card, and the board said "Luffy is asking" — which
// reads as the engineer going round the orchestrator straight to the human.
// Atlas had done exactly the right thing; only the label was wrong.
//
// 2026-09-23: reading `by` as the author had the same failure the other way
// round. A worker that writes its own humanQA entry got its name on the board,
// so it still looked like the crew going round the orchestrator. Atlas is the
// human's one counterpart: workers raise things with it, it decides what is
// worth the human's time. So the board always says ATLAS is asking, and `by`
// now says whose WORK the question is about.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const src = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const ask = src('src/renderer/src/components/AskMeTab.tsx');

test('the board always names the orchestrator as the asker', () => {
  assert.match(ask, /const asker = agents\.find\(\(a\) => a\.isGod\)/,
    'Atlas asks, on behalf of everyone');
  assert.doesNotMatch(ask, /const asker = agentFor\(t\.assignee\)/,
    'the assignee is who is BLOCKED, never who asked');
  assert.doesNotMatch(ask, /const asker = agentFor\(open\.by\)/,
    'a worker that signed its own entry must not appear to ask the human directly');
});

test('`by` is kept, as whose work the ask is about', () => {
  // Not thrown away: the honest line is "Atlas is asking, about Naruto's work".
  assert.match(ask, /const onBehalfOf = open\.by && open\.by !== asker\?\.id \? agentFor\(open\.by\) : undefined/);
  assert.match(ask, /askMe\.asksFor/);
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

test('an unsigned ask shows no "about whose work" line', () => {
  // Every entry written before `by` existed has none. There is nothing to say
  // about whose work it is, and the header is just "Atlas is asking".
  assert.match(ask, /\{onBehalfOf && <span>\{translate\('askMe\.asksFor'/);
});

test('every locale can render the new line', () => {
  const dir = path.join(__dirname, '..', 'src/renderer/src/i18n/locales');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.ok(j.askMe.blocks, `${f} is missing askMe.blocks`);
    assert.match(j.askMe.blocks, /\{\{name\}\}/, `${f} must interpolate the name`);
    assert.ok(j.askMe.asksFor, `${f} is missing askMe.asksFor`);
    assert.match(j.askMe.asksFor, /\{\{name\}\}/, `${f} must interpolate the name`);
    // A card can hold several open asks; every locale needs to count them.
    for (const k of ['askIndex', 'stillBlocked_one', 'stillBlocked_other']) {
      assert.ok(j.askMe[k], `${f} is missing askMe.${k}`);
    }
    assert.match(j.askMe.askIndex, /\{\{n\}\}[\s\S]*\{\{total\}\}/, `${f} askIndex needs n and total`);
  }
});
