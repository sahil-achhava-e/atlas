'use strict';

// The morning plays once per app start. A page reload is not a morning — the
// agents never left, and replaying it says they did (and costs ten seconds
// before the floor is usable).

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { shouldPlayArrivals } = loadTs('src/shared/floorArrival.ts');

test('first ever load: nothing seen, so play it', () => {
  assert.equal(shouldPlayArrivals('boot-1', null), true);
});

test('a reload of the same running process: already here, do not replay', () => {
  assert.equal(shouldPlayArrivals('boot-1', 'boot-1'), false);
});

test('main restarted: a real morning', () => {
  assert.equal(shouldPlayArrivals('boot-2', 'boot-1'), true);
});

test('no boot id at all: play it rather than have agents appear from nowhere', () => {
  // An older main, or a failed read. The wrong we choose is the smaller one.
  assert.equal(shouldPlayArrivals(undefined, 'boot-1'), true);
  assert.equal(shouldPlayArrivals('', 'boot-1'), true);
});
