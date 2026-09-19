'use strict';

// Agents used to pick a café seat or an errand spot at random, so one could
// cross the whole floor past three free ones. Nearest means nearest BY WALKING:
// a spot on the other side of a wall is far, however close it looks.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { nearestReachable } = loadTs('src/renderer/src/scene/office/pathfinding.ts');

/** A grid from strings: '.' walkable, '#' wall. */
const grid = (rows) => ({
  width: rows[0].length,
  height: rows.length,
  isWalkable: (x, y) => y >= 0 && y < rows.length && x >= 0 && x < rows[0].length && rows[y][x] !== '#'
});

test('picks the closest of several, by steps', () => {
  const map = grid(['..........']);
  const goal = nearestReachable(map, { x: 0, y: 0 }, [{ x: 9, y: 0, id: 'far' }, { x: 3, y: 0, id: 'near' }]);
  assert.equal(goal.id, 'near');
});

test('a wall makes a near-looking spot far', () => {
  // `b` is 2 tiles away in a straight line but walled off; `a` is 6 steps round.
  const map = grid([
    '..a...',
    '#####.',
    '.b....'
  ]);
  const goal = nearestReachable(map, { x: 0, y: 0 }, [{ x: 1, y: 2, id: 'b' }, { x: 2, y: 0, id: 'a' }]);
  assert.equal(goal.id, 'a');
});

test('a goal you are standing on is the answer', () => {
  const map = grid(['...']);
  assert.equal(nearestReachable(map, { x: 1, y: 0 }, [{ x: 1, y: 0, id: 'here' }]).id, 'here');
});

test('a goal tile need not be walkable — you stand AT a seat, not on it', () => {
  const map = grid(['..#']);
  assert.equal(nearestReachable(map, { x: 0, y: 0 }, [{ x: 2, y: 0, id: 'seat' }]).id, 'seat');
});

test('nothing reachable, and nothing to choose from, both answer null', () => {
  const walled = grid(['.#.']);
  assert.equal(nearestReachable(walled, { x: 0, y: 0 }, [{ x: 2, y: 0, id: 'x' }]), null);
  assert.equal(nearestReachable(grid(['...']), { x: 0, y: 0 }, []), null);
});
