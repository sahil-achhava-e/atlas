'use strict';

// "God already carded it (pr-2115-review, assignee Hinata, status doing)."
//
// Two faults in one sentence. "God" is an internal id the human never chose —
// the agent on their floor is called Atlas. And "carded" is a verb invented
// from a noun: the board has CARDS, you OPEN one, you do not card anything.
//
// The floor's vocabulary has to be the vocabulary on the screen the human is
// looking at, or every status report needs translating.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

async function hiveWithGod(name = 'Atlas') {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-lang-'));
  const hive = new HiveManager(() => home);
  const inj = await hive.ensureAgent(
    { id: 'god', name, provider: 'claude', cwd: home, isGod: true }, {});
  return {
    home, hive, inj,
    protocol: fs.readFileSync(path.join(home, 'hive', 'PROTOCOL.md'), 'utf8'),
    prompt: inj.args[inj.args.indexOf('--append-system-prompt') + 1]
  };
}

test('the protocol calls the orchestrator by name', async () => {
  const { protocol } = await hiveWithGod('Atlas');
  assert.ok(protocol.includes('Atlas'), 'the name has to appear');
  assert.match(protocol, /"to": "<agent-id> \| atlas \| broadcast"/,
    'even the address example uses the name');
});

test('"god" survives only where it is literally an id', async () => {
  const { protocol } = await hiveWithGod('Atlas');
  const lines = protocol.split('\n').filter((l) => /god/.test(l));
  assert.equal(lines.length, 2, `unexpected "god" prose:\n${lines.join('\n')}`);
  assert.ok(lines.some((l) => l.includes('`god` is an address')), 'the rule that explains it');
  assert.ok(lines.some((l) => l.includes('"by": "god"')), 'the humanQA field, which is an id');
});

test('a renamed orchestrator renames the protocol with it', async () => {
  const { protocol } = await hiveWithGod('Michael');
  assert.ok(protocol.includes('Michael'));
  assert.doesNotMatch(protocol, /Atlas/);
});

test('every agent is told the board vocabulary, and told not to invent verbs', async () => {
  const { prompt } = await hiveWithGod();
  assert.match(prompt, /a task is a CARD on the BOARD/);
  assert.match(prompt, /nobody "cards" anything/);
  assert.match(prompt, /use the name on the floor, never an internal id/);
});

test('a message addressed to the orchestrator BY NAME reaches them', async () => {
  // The prose now says to write "atlas", so the router has to accept it.
  const { hive, home } = await hiveWithGod('Atlas');
  await hive.ensureAgent({ id: 'w1', name: 'Zoro', provider: 'claude', cwd: home }, {});
  hive.send({ to: 'Atlas', act: 'query', subject: 'ping', body: 'by name' }, 'w1');
  const inbox = hive.inbox('god');
  assert.equal(inbox.length, 1, 'the name resolved to the orchestrator');
  assert.equal(inbox[0].subject, 'ping');
});

test('the id and "human" still work, so nothing already written breaks', async () => {
  const { hive, home } = await hiveWithGod('Atlas');
  await hive.ensureAgent({ id: 'w1', name: 'Zoro', provider: 'claude', cwd: home }, {});
  hive.send({ to: 'god', act: 'query', subject: 'by-id', body: '' }, 'w1');
  hive.send({ to: 'human', act: 'query', subject: 'to-human', body: '' }, 'w1');
  assert.deepEqual(hive.inbox('god').map((m) => m.subject).sort(), ['by-id', 'to-human']);
});

test('the orchestrator is not described to itself as "orchestrator (god)"', async () => {
  const { home } = await hiveWithGod('Atlas');
  const identity = fs.readFileSync(path.join(home, 'hive', 'agents', 'god', 'identity.md'), 'utf8');
  assert.doesNotMatch(identity, /orchestrator \(god\)/);
});
