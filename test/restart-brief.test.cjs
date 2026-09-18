'use strict';

// What god is told when the app comes back with work in flight.
//
// The judgement about WHICH work counts lives here rather than in the boot hook,
// because getting it wrong is silent in both directions: too broad and every
// launch re-dispatches finished cards, too narrow and an interrupted agent sits
// at an idle prompt forever with its card still reading "doing".

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { interruptedWork, restartBrief, briefSignature } =
  loadTs('src/main/restartBrief.ts');

const CREW = [
  { id: 'luffy', name: 'Luffy' },
  { id: 'zoro', name: 'Zoro' },
  { id: 'nami', name: 'Nami' },
  { id: 'god', name: 'Atlas', isGod: true },
  { id: 'ghost', name: 'Ghost', archived: true }
];

const doc = (...tasks) => ({ tasks });

test('only cards actually in flight count', () => {
  const items = interruptedWork(doc(
    { id: 'T-1', title: 'migrate auth tables', status: 'doing', assignee: 'luffy' },
    { id: 'T-2', title: 'write the changelog', status: 'todo', assignee: 'zoro' },
    { id: 'T-3', title: 'waiting on a key', status: 'blocked', assignee: 'zoro' },
    { id: 'T-4', title: 'shipped', status: 'done', assignee: 'nami' }
  ), CREW);
  assert.deepEqual(items.map((i) => i.taskId), ['T-1']);
  assert.equal(items[0].agentName, 'Luffy');
});

test('a card with no assignee, or one owned by nobody on the roster, is dropped', () => {
  const items = interruptedWork(doc(
    { id: 'T-1', title: 'unowned', status: 'doing' },
    { id: 'T-2', title: 'deleted agent', status: 'doing', assignee: 'brook' },
    { id: 'T-3', title: 'archived agent', status: 'doing', assignee: 'ghost' },
    { id: 'T-4', title: 'real', status: 'doing', assignee: 'nami' }
  ), CREW);
  assert.deepEqual(items.map((i) => i.taskId), ['T-4']);
});

test("god's own cards are not reported back to god", () => {
  const items = interruptedWork(doc(
    { id: 'T-9', title: 'run the floor', status: 'doing', assignee: 'god' }
  ), CREW);
  assert.deepEqual(items, []);
});

test('a duplicated card is reported once', () => {
  const items = interruptedWork(doc(
    { id: 'T-1', title: 'migrate', status: 'doing', assignee: 'luffy' },
    { id: 'T-1', title: 'migrate', status: 'doing', assignee: 'luffy' }
  ), CREW);
  assert.equal(items.length, 1);
});

test('a malformed or empty ledger is not an error', () => {
  assert.deepEqual(interruptedWork(null, CREW), []);
  assert.deepEqual(interruptedWork({}, CREW), []);
  assert.deepEqual(interruptedWork({ tasks: 'nope' }, CREW), []);
  assert.deepEqual(interruptedWork(doc(null, 42, 'x'), CREW), []);
  assert.deepEqual(interruptedWork(doc({ status: 'doing', assignee: 'luffy' }), CREW),
    [{ agentId: 'luffy', agentName: 'Luffy', taskId: '(no id)', title: '(untitled card)' }]);
});

test('a quiet floor sends nothing at all', () => {
  assert.equal(restartBrief([]), null);
});

test('the brief names the agents, their cards, and says to check the ledger first', () => {
  const items = interruptedWork(doc(
    { id: 'T-1', title: 'migrate auth tables', status: 'doing', assignee: 'luffy' },
    { id: 'T-7', title: 'fix the Windows spawn', status: 'doing', assignee: 'zoro' }
  ), CREW);
  const body = restartBrief(items);
  assert.match(body, /Luffy/);
  assert.match(body, /T-1: migrate auth tables/);
  assert.match(body, /Zoro/);
  assert.match(body, /T-7: fix the Windows spawn/);
  // The load-bearing instruction: the half-finished turn is the only real loss,
  // so the ledger must be reconciled against disk before anyone is re-dispatched.
  assert.match(body, /check each card against what is actually on disk/);
});

test('the signature ignores order, so a relaunch does not re-post the same brief', () => {
  const a = interruptedWork(doc(
    { id: 'T-1', status: 'doing', assignee: 'luffy' },
    { id: 'T-7', status: 'doing', assignee: 'zoro' }
  ), CREW);
  const b = interruptedWork(doc(
    { id: 'T-7', status: 'doing', assignee: 'zoro' },
    { id: 'T-1', status: 'doing', assignee: 'luffy' }
  ), CREW);
  assert.equal(briefSignature(a), briefSignature(b));

  const c = interruptedWork(doc({ id: 'T-1', status: 'doing', assignee: 'luffy' }), CREW);
  assert.notEqual(briefSignature(a), briefSignature(c), 'different work must post again');
});
