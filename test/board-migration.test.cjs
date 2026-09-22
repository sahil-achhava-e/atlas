'use strict';

// The one-time pass that brings an existing board up to five columns and real
// card ids. The risk it carries: an id is quoted in inbox messages, memory.md,
// PR descriptions and Slack threads, so a renumber has to leave a way back.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

function hive(tasks) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-migrate-'));
  const root = path.join(home, 'hive');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'tasks.json'), JSON.stringify({ tasks }, null, 2));
  const h = new HiveManager(() => home);
  return { h, root };
}
const read = (root) => JSON.parse(fs.readFileSync(path.join(root, 'tasks.json'), 'utf8'));

const CODES = { sasuke: 'EVENTS', hinata: 'EVENTS', luffy: 'VMS' };
const codeFor = (id) => CODES[id] ?? null;

test('legacy ids are renumbered per project, in board order', () => {
  const { h, root } = hive([
    { id: 'vms-sec-1', title: 'a', status: 'blocked', assignee: 'luffy' },
    { id: 'wi-7670', title: 'b', status: 'doing', assignee: 'sasuke' },
    { id: 'pr-2115-review', title: 'c', status: 'done', assignee: 'hinata' }
  ]);
  assert.equal(h.migrateBoard(codeFor), 3);
  const doc = read(root);
  assert.deepEqual(doc.tasks.map((t) => t.id), ['TASK-VMS-1', 'TASK-EVENTS-1', 'TASK-EVENTS-2']);
  assert.deepEqual(doc.counters, { VMS: 1, EVENTS: 2 });
});

test('the old id survives on the card and in the map file', () => {
  const { h, root } = hive([{ id: 'pr-2115-review', title: 'c', status: 'done', assignee: 'hinata' }]);
  h.migrateBoard(codeFor);
  assert.equal(read(root).tasks[0].previousId, 'pr-2115-review');
  const map = JSON.parse(fs.readFileSync(path.join(root, 'card-id-map.json'), 'utf8'));
  assert.equal(map.map['pr-2115-review'], 'TASK-EVENTS-1');
});

test('statuses are canonicalised in the same pass', () => {
  const { h, root } = hive([
    { id: 'TASK-EVENTS-1', title: 'a', status: 'doing', assignee: 'sasuke' },
    { id: 'TASK-EVENTS-2', title: 'b', status: 'In Review', assignee: 'sasuke' }
  ]);
  h.migrateBoard(codeFor);
  assert.deepEqual(read(root).tasks.map((t) => t.status), ['in-progress', 'in-review']);
});

test('it runs once, and a second call changes nothing', () => {
  const { h, root } = hive([{ id: 'wi-7670', title: 'b', status: 'doing', assignee: 'sasuke' }]);
  assert.equal(h.migrateBoard(codeFor), 1);
  const after = read(root);
  assert.ok(after.boardMigratedAt, 'the latch has to be on the ledger it rewrote');
  assert.equal(h.migrateBoard(codeFor), 0, 'a second pass must not renumber anything again');
  assert.deepEqual(read(root).tasks.map((t) => t.id), after.tasks.map((t) => t.id));
});

test('a card nobody can be mapped to keeps its id', () => {
  // An unassigned card, or one held by an agent the roster no longer has. Guessing
  // a project would put it on the wrong number line for good.
  const { h, root } = hive([
    { id: 'orphan-card', title: 'a', status: 'todo' },
    { id: 'ghost-card', title: 'b', status: 'todo', assignee: 'someone-deleted' }
  ]);
  assert.equal(h.migrateBoard(codeFor), 0);
  assert.deepEqual(read(root).tasks.map((t) => t.id), ['orphan-card', 'ghost-card']);
});

test('fields the display model knows nothing about are untouched', () => {
  const { h, root } = hive([{
    id: 'wi-7670', title: 'b', status: 'doing', assignee: 'sasuke',
    result: 'a slack reply', repo: 'epicxp-events', humanQA: [{ q: 'which venue?' }]
  }]);
  h.migrateBoard(codeFor);
  const card = read(root).tasks[0];
  assert.equal(card.result, 'a slack reply');
  assert.equal(card.repo, 'epicxp-events');
  assert.equal(card.humanQA[0].q, 'which venue?');
});

test('a renumbered id never collides with an id already on the board', () => {
  const { h, root } = hive([
    { id: 'TASK-EVENTS-1', title: 'existing', status: 'done', assignee: 'sasuke' },
    { id: 'wi-7670', title: 'legacy', status: 'doing', assignee: 'sasuke' }
  ]);
  h.migrateBoard(codeFor);
  const ids = read(root).tasks.map((t) => t.id);
  assert.deepEqual(ids, ['TASK-EVENTS-1', 'TASK-EVENTS-2']);
  assert.equal(new Set(ids).size, 2);
});
