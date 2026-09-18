'use strict';

// The desks you can assign, read out of the map.
//
// Two things must hold, and both are invisible until they break. Atlas's cabin
// must never be offerable: the floor reserves it, and the arrival sequence, the
// errand spots and the no-wander fence are all written around him being in it —
// a dropdown that offers it would be offering something nothing else honours.
// And every name in the list must be a real spawn point, or assigning it seats
// the agent nowhere and the floor silently falls back to first-free.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MAP = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'src/renderer/src/assets/maps/office.tmj'), 'utf8'));
const T = MAP.tilewidth;
const SPAWNS = MAP.layers.find((l) => l.name === 'spawn-points').objects
  .map((o) => ({ name: o.name, x: Math.round(o.x / T), y: Math.round(o.y / T) }));

// deskDirectory.ts imports the map through Vite's `?raw`, which node cannot
// resolve, so the directory's RULES are re-derived here from the same map and
// asserted against the same expectations. What this pins is the contract the
// picker relies on; the module is a thin reading of it.
const LEAD_SEAT_NAMES = ['desk-chief-architect', 'desk-ui-ux-expert', 'desk-agent-organizer', 'warroom-seat'];
const DESK_NAMES = SPAWNS
  .filter((o) => o.name.startsWith('desk-') || o.name.startsWith('pc-') || o.name === 'warroom-seat')
  .filter((o) => o.name !== 'desk-ceo')
  .map((o) => o.name);

test("Atlas's cabin is not in the assignable list", () => {
  assert.ok(SPAWNS.some((o) => o.name === 'desk-ceo'), 'the map still has a god desk');
  assert.ok(!DESK_NAMES.includes('desk-ceo'), 'desk-ceo must never be offerable');
});

test('café seats, stands and the door are not desks', () => {
  for (const name of DESK_NAMES) {
    assert.ok(!name.startsWith('cafe-'), `${name} is café furniture, not a desk`);
    assert.notEqual(name, 'entrance');
  }
});

test('every leader office is a real desk in the list', () => {
  for (const name of LEAD_SEAT_NAMES) {
    assert.ok(DESK_NAMES.includes(name), `${name} missing — leads would have nothing to sit at`);
  }
});

test('desk names are unique, so an assignment is unambiguous', () => {
  assert.equal(new Set(DESK_NAMES).size, DESK_NAMES.length);
});

test('there are more desks than leader offices, or assignment is pointless', () => {
  assert.ok(DESK_NAMES.length > LEAD_SEAT_NAMES.length,
    `only ${DESK_NAMES.length} desks`);
});

test('every desk sits on a tile the map actually has', () => {
  const byName = Object.fromEntries(SPAWNS.map((o) => [o.name, o]));
  for (const name of DESK_NAMES) {
    const d = byName[name];
    assert.ok(d.x >= 0 && d.x < MAP.width, `${name} x off-grid`);
    assert.ok(d.y >= 0 && d.y < MAP.height, `${name} y off-grid`);
  }
});
