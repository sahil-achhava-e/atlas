'use strict';

/**
 * The conversation has to survive a restart.
 *
 * It used to be a pure read of the engine's session transcript, and a resume
 * starts a NEW transcript — so everything said before the restart sat in a file
 * the app no longer opened. The human's side read as erased (they have nothing
 * new to add) while the agent's side looked fine (it keeps talking).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const electronPath = require.resolve('electron');
require.cache[electronPath] = {
  id: electronPath, filename: electronPath, loaded: true,
  exports: { app: { getPath: () => os.tmpdir() } }
};

const { PersistStore } = loadTs('src/main/db.ts');

function store() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-activity-')), 'harness.db');
  const s = new PersistStore(file);
  s.open();
  return s;
}

test('both sides are kept, oldest first', () => {
  const s = store();
  s.addActivity('god', [
    { kind: 'ask', text: 'status of the events task?', at: 1000 },
    { kind: 'say', text: 'Sasuke has TASK-EVENTS-3, blocked on you.', at: 2000 }
  ]);
  const rows = s.activity('god');
  assert.deepEqual(rows.map((r) => r.kind), ['ask', 'say']);
  assert.equal(rows[0].text, 'status of the events task?');
  s.close();
});

test('the same line arriving twice is stored once', () => {
  // The transcript window is re-read on every poll, on every sweep and after
  // every restart, and an owner message is ALSO written when it is sent. The
  // same line legitimately arrives from three directions.
  const s = store();
  const line = { kind: 'ask', text: 'give me the brief', at: 1_700_000_000_123 };
  assert.equal(s.addActivity('god', [line]), 1);
  assert.equal(s.addActivity('god', [line]), 0, 'a re-read must not duplicate');
  assert.equal(s.addActivity('god', [{ ...line, at: 1_700_000_000_900 }]), 0,
    'the same second is the same line — transcript timestamps are not byte-stable');
  assert.equal(s.activity('god').length, 1);
  s.close();
});

test('two agents never see each other conversation', () => {
  const s = store();
  s.addActivity('god', [{ kind: 'ask', text: 'yours', at: 1 }]);
  s.addActivity('sasuke', [{ kind: 'ask', text: 'mine', at: 1 }]);
  assert.deepEqual(s.activity('god').map((r) => r.text), ['yours']);
  assert.deepEqual(s.activity('sasuke').map((r) => r.text), ['mine']);
  s.close();
});

test('tool rows and empty text are refused, so the history stays a conversation', () => {
  const s = store();
  assert.equal(s.addActivity('god', [
    { kind: 'do', text: 'Reading', at: 1 },
    { kind: 'say', text: '   ', at: 2 },
    { kind: 'say', text: 'real', at: 3 }
  ]), 1);
  assert.deepEqual(s.activity('god').map((r) => r.text), ['real']);
  s.close();
});

test('history is capped per agent, oldest dropped first', () => {
  const s = store();
  const cap = PersistStore.ACTIVITY_CAP;
  const rows = [];
  for (let i = 0; i < cap + 50; i++) rows.push({ kind: 'say', text: `line ${i}`, at: 1000 + i * 1000 });
  s.addActivity('god', rows);
  const kept = s.activity('god', cap);
  assert.equal(kept.length, cap);
  assert.equal(kept[0].text, 'line 50', 'the oldest 50 are the ones dropped');
  assert.equal(kept[kept.length - 1].text, `line ${cap + 49}`);
  s.close();
});

test('a limit returns the most RECENT rows, still oldest-first', () => {
  const s = store();
  s.addActivity('god', [
    { kind: 'say', text: 'one', at: 1000 },
    { kind: 'say', text: 'two', at: 2000 },
    { kind: 'say', text: 'three', at: 3000 }
  ]);
  assert.deepEqual(s.activity('god', 2).map((r) => r.text), ['two', 'three']);
  s.close();
});

test('the store reopens with the conversation intact — this is the whole point', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-activity-')), 'harness.db');
  const first = new PersistStore(file);
  first.open();
  first.addActivity('god', [
    { kind: 'ask', text: 'what is blocked?', at: 1000 },
    { kind: 'say', text: 'three cards, all on you.', at: 2000 }
  ]);
  first.close();

  const second = new PersistStore(file);   // a restart: new process, new session
  second.open();
  assert.deepEqual(second.activity('god').map((r) => `${r.kind}:${r.text}`),
    ['ask:what is blocked?', 'say:three cards, all on you.']);
  second.close();
});

test('a deleted agent can be forgotten', () => {
  const s = store();
  s.addActivity('gone', [{ kind: 'ask', text: 'anything', at: 1 }]);
  s.forgetActivity('gone');
  assert.deepEqual(s.activity('gone'), []);
  s.close();
});

test('an unopened store is inert rather than throwing', () => {
  const s = new PersistStore(path.join(os.tmpdir(), 'atlas-never-opened.db'));
  assert.equal(s.addActivity('god', [{ kind: 'say', text: 'x', at: 1 }]), 0);
  assert.deepEqual(s.activity('god'), []);
});
