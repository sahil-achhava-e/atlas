'use strict';

// Where team leaders sit.
//
// The rule the floor promises: the two side rooms are the leaders' offices, and
// they fill A ROOM AT A TIME rather than spreading out — two projects should put
// both leads in one room talking to each other, not one each in two half-empty
// offices. Past four leaders the overflow takes the boardroom table, never a
// worker's desk on the open floor.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { LEAD_SEAT_NAMES, nextLeadSlot, roomOf, roomOccupancy } =
  loadTs('src/renderer/src/scene/office/leadSeats.ts');

test('four offices, two rooms, claimed in order', () => {
  assert.equal(LEAD_SEAT_NAMES.length, 4);
  assert.equal(roomOf(0), 1);
  assert.equal(roomOf(1), 1);
  assert.equal(roomOf(2), 2);
  assert.equal(roomOf(3), 2);
});

test('rooms fill one at a time', () => {
  assert.deepEqual(roomOccupancy(0), { roomOne: 0, roomTwo: 0, boardroom: 0 });
  assert.deepEqual(roomOccupancy(1), { roomOne: 1, roomTwo: 0, boardroom: 0 });
  assert.deepEqual(roomOccupancy(2), { roomOne: 2, roomTwo: 0, boardroom: 0 });
  assert.deepEqual(roomOccupancy(3), { roomOne: 2, roomTwo: 1, boardroom: 0 });
  assert.deepEqual(roomOccupancy(4), { roomOne: 2, roomTwo: 2, boardroom: 0 });
});

test('a fifth leader takes the boardroom, not a worker desk', () => {
  assert.deepEqual(roomOccupancy(6), { roomOne: 2, roomTwo: 2, boardroom: 2 });
});

test('slots are handed out lowest-first and run out at four', () => {
  const taken = new Set();
  const order = [];
  for (let i = 0; i < 5; i++) {
    const slot = nextLeadSlot(taken);
    order.push(slot);
    if (slot !== null) taken.add(slot);
  }
  assert.deepEqual(order, [0, 1, 2, 3, null]);
});

test('a freed office is reused before the boardroom', () => {
  const taken = new Set([0, 1, 2, 3]);
  assert.equal(nextLeadSlot(taken), null);
  taken.delete(1);                       // a leader was deleted or demoted
  assert.equal(nextLeadSlot(taken), 1);
});

test('every leader desk exists in the office map', () => {
  const map = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'src/renderer/src/assets/maps/office.tmj'), 'utf8'));
  const spawns = new Set(map.layers
    .filter((l) => l.type === 'objectgroup' && l.name === 'spawn-points')
    .flatMap((l) => l.objects.map((o) => o.name)));
  for (const name of LEAD_SEAT_NAMES) {
    assert.ok(spawns.has(name), `${name} is not a spawn point — leaders would fall back to the floor`);
  }
});
