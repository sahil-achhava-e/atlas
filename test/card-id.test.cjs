'use strict';

// Card ids. The rule that matters: a number is never handed out twice, because
// the ledger merges by id and a collision eats a card rather than reporting one.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { CARD_ID_RE, isCardId, codeOf, defaultCode, cleanCode, nextCardId } =
  loadTs('src/shared/cardId.ts');

test('the shape is TASK-CODE-n', () => {
  assert.ok(isCardId('TASK-EVENTS-1'));
  assert.ok(isCardId('TASK-VMS-42'));
  assert.equal(codeOf('TASK-OUTLOOK-7'), 'OUTLOOK');
  for (const bad of ['task-events-1', 'TASK-EVENTS-0', 'TASK-EVENTS-01', 'TASK--1', 'pr-2115-review', 'TASK-1EVENTS-1']) {
    assert.ok(!isCardId(bad), bad);
  }
  assert.equal(codeOf('pr-2115-review'), null);
});

test('a folder name gives a usable starting code', () => {
  assert.equal(defaultCode('/Users/x/Desktop/acme-events'), 'ACMEEVENTS');
  assert.equal(defaultCode('/Users/x/Desktop/Acme-VMS/'), 'ACMEVMS');
  assert.equal(defaultCode('/Users/x/Desktop/visits-outlook-addin'), 'VISITSOUTLOO');
  assert.ok(CARD_ID_RE.test(`TASK-${defaultCode('/tmp/9lives')}-1`), 'a leading digit must still produce a legal code');
});

test('a typed code is cleaned, or refused', () => {
  assert.equal(cleanCode(' events '), 'EVENTS');
  assert.equal(cleanCode('vms-2'), 'VMS2');
  assert.equal(cleanCode('E'), null, 'one character is not a code');
  assert.equal(cleanCode('1EVENTS'), null, 'must start with a letter');
  assert.equal(cleanCode('AVERYLONGPROJECTCODE'), null, 'twelve characters is the limit');
});

test('numbers run in order, per project', () => {
  let counters = {};
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const a = nextCardId('EVENTS', ids, counters);
    ids.push(a.id); counters = a.counters;
  }
  assert.deepEqual(ids, ['TASK-EVENTS-1', 'TASK-EVENTS-2', 'TASK-EVENTS-3']);
  assert.equal(nextCardId('VMS', ids, counters).id, 'TASK-VMS-1', 'each project has its own number line');
});

test('a deleted card does not give its number back', () => {
  const { counters } = nextCardId('EVENTS', [], nextCardId('EVENTS', [], {}).counters);
  // both cards deleted — the board is empty, the counter is not
  assert.equal(nextCardId('EVENTS', [], counters).id, 'TASK-EVENTS-3');
});

test('a hand-written id pushes the counter past it', () => {
  // Someone typed TASK-EVENTS-9 straight into the file. The next allocation
  // must not be 2 and collide with it.
  assert.equal(nextCardId('EVENTS', ['TASK-EVENTS-9'], { EVENTS: 1 }).id, 'TASK-EVENTS-10');
});

test('ids from other projects never move this project on', () => {
  assert.equal(nextCardId('VMS', ['TASK-EVENTS-88', 'pr-2115-review', null, 7], {}).id, 'TASK-VMS-1');
});
