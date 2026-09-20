'use strict';

// Where team leaders sit.
//
// The rule the floor promises: the two side rooms are the leaders' offices, and
// a leader gets their OWN room with the spare desk left empty. Two leads means
// a room each, not a shared room and an empty one. The third and fourth double
// up, because sharing an office still beats the open floor. Past four the
// overflow takes the boardroom table, never a worker's desk.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { LEAD_SEAT_NAMES, nextLeadSlot, roomOf, roomOccupancy } =
  loadTs('src/renderer/src/scene/office/leadSeats.ts');

test('four offices, two rooms, and the claim order alternates between them', () => {
  assert.equal(LEAD_SEAT_NAMES.length, 4);
  assert.equal(roomOf(0), 1);
  assert.equal(roomOf(1), 2);
  assert.equal(roomOf(2), 1);
  assert.equal(roomOf(3), 2);
  // The first two claimed are the two rooms' FIRST desks, so neither lead is
  // sat next to the other while a whole room stands empty.
  assert.deepEqual(LEAD_SEAT_NAMES.slice(0, 2), ['desk-chief-architect', 'desk-agent-organizer']);
});

test('each lead gets their own room before anyone shares', () => {
  assert.deepEqual(roomOccupancy(0), { roomOne: 0, roomTwo: 0, boardroom: 0 });
  assert.deepEqual(roomOccupancy(1), { roomOne: 1, roomTwo: 0, boardroom: 0 });
  assert.deepEqual(roomOccupancy(2), { roomOne: 1, roomTwo: 1, boardroom: 0 }, 'a room each, one empty desk each');
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

// THE ONE THAT BIT. `warroom-seat` was in LEAD_SEAT_NAMES and in the desk
// picker, but NOT in the theme's primarySeatNames — which is the list the floor
// turns into actual seats. So the picker offered the second desk in the
// right-hand office, the human assigned their reviewer to it, and the floor
// could not resolve the name: she silently fell through to an open-plan desk
// and the fourth leader's office did not exist at all.

test('every leader desk is a seat the floor can actually place someone at', () => {
  const theme = fs.readFileSync(
    path.join(__dirname, '..', 'src/renderer/src/scene/office/themeRegistry.ts'), 'utf8');
  const block = theme.slice(theme.indexOf('primarySeatNames: ['),
    theme.indexOf(']', theme.indexOf('primarySeatNames: [')));
  for (const name of LEAD_SEAT_NAMES) {
    assert.ok(block.includes(`'${name}'`),
      `${name} is offered as a desk but the floor has no seat for it`);
  }
});

test('the desk picker names the room a desk is really in', () => {
  // The label used to be computed from the claim index (`i < 2 ? 1 : 2`). Once
  // leaders started taking the first desk of each room, index 1 became the
  // OTHER room and the label was a lie.
  const dir = fs.readFileSync(
    path.join(__dirname, '..', 'src/renderer/src/scene/office/deskDirectory.ts'), 'utf8');
  assert.match(dir, /const room = roomOf\(i\)/);
  const label = dir.slice(dir.indexOf('LEAD_SEAT_NAMES.forEach'));
  assert.doesNotMatch(label.slice(0, label.indexOf('});')), /i < 2 \? 1 : 2/,
    'the label must not be computed from the claim index');
  // room one holds slots 0 and 2, room two holds 1 and 3
  assert.equal(roomOf(0), roomOf(2));
  assert.equal(roomOf(1), roomOf(3));
  assert.notEqual(roomOf(0), roomOf(1));
});
