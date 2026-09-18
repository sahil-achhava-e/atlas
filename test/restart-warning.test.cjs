'use strict';

// Who has something to lose when the app restarts to install an update.
//
// This decides two visible things: whether the update dialog offers a restart at
// all, and whose names the confirmation puts in front of you. Both are the sort
// of rule that quietly inverts during a refactor — "is busy" becoming "is not
// idle" would sweep in every agent parked on a question — so it is pinned here.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { workingAgents, nameList, offerRestartInDialog, WORKING_STATUSES } =
  loadTs('src/renderer/src/components/restartWarning.ts');

const agent = (name, status) => ({ id: name.toLowerCase(), name, status });

test('an agent mid-work has something to lose; a parked one does not', () => {
  const crew = [
    agent('Luffy', 'working'),
    agent('Zoro', 'thinking'),
    agent('Nami', 'idle'),
    agent('Robin', 'waiting'),   // parked on a question — already wrote its work
    agent('Ryuk', 'blocked'),    // ditto
    agent('Sakura', 'compacting')
  ];
  assert.deepEqual(workingAgents(crew).map((a) => a.name), ['Luffy', 'Zoro', 'Sakura']);
});

test("'waiting' and 'blocked' are deliberately not working states", () => {
  assert.ok(!WORKING_STATUSES.includes('waiting'));
  assert.ok(!WORKING_STATUSES.includes('blocked'));
  assert.ok(!WORKING_STATUSES.includes('idle'));
  assert.ok(WORKING_STATUSES.includes('looping'), 'the breaker winding an agent down is still mid-operation');
});

test('the dialog offers a restart only when nothing is in flight', () => {
  assert.equal(offerRestartInDialog([]), true);
  assert.equal(offerRestartInDialog([agent('Nami', 'idle'), agent('Robin', 'waiting')]), true);
  assert.equal(offerRestartInDialog([agent('Luffy', 'working')]), false);
});

test('names read like a sentence, and a crowd is summarised', () => {
  assert.equal(nameList([]), '');
  assert.equal(nameList([agent('Luffy', 'working')]), 'Luffy');
  assert.equal(nameList([agent('Luffy', 'working'), agent('Zoro', 'working')]), 'Luffy and Zoro');
  assert.equal(
    nameList(['Luffy', 'Zoro', 'Nami'].map((n) => agent(n, 'working'))),
    'Luffy, Zoro and Nami');
  // Past the cap the tail is counted rather than listed — a warning nobody
  // finishes reading is a warning nobody reads.
  assert.equal(
    nameList(['Luffy', 'Zoro', 'Nami', 'Robin', 'Ryuk'].map((n) => agent(n, 'working'))),
    'Luffy, Zoro, Nami, Robin and 1 other');
  assert.equal(
    nameList(['Luffy', 'Zoro', 'Nami', 'Robin', 'Ryuk', 'Sakura'].map((n) => agent(n, 'working'))),
    'Luffy, Zoro, Nami, Robin and 2 others');
});

test('the joining word is translatable', () => {
  assert.equal(nameList([agent('Luffy', 'working'), agent('Zoro', 'working')], 'و'), 'Luffy و Zoro');
});
