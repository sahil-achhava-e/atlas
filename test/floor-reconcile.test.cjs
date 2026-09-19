'use strict';

// The renderer's copy of the floor can be lost; the hive's and the running
// terminals cannot. Every "where did my agent go" bug in this app has been a
// path that asked the renderer instead of those two.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { planFloor } = loadTs('src/shared/floorReconcile.ts');

const ptyIdFor = (id) => (id === 'god' ? 'pty-god' : `pty-${id}`);
const plan = (registry, live, known = []) =>
  planFloor(registry, live, new Set(known), ptyIdFor);

test('a live terminal with no card is adopted as running', () => {
  // Atlas's case: his terminal was fine, nothing ever drew him.
  const p = plan([{ id: 'god', isGod: true }], ['pty-god']);
  assert.deepEqual(p.adoptLive.map((a) => a.id), ['god']);
  assert.deepEqual(p.adoptRestorable, []);
});

test('no card and no terminal goes to restore, which respawns it', () => {
  const p = plan([{ id: 'luffy' }], []);
  assert.deepEqual(p.adoptRestorable.map((a) => a.id), ['luffy']);
  assert.deepEqual(p.adoptLive, []);
});

test('an agent the renderer already knows is left completely alone', () => {
  const p = plan([{ id: 'naruto' }], ['pty-naruto'], ['naruto']);
  assert.deepEqual(p.adoptLive, []);
  assert.deepEqual(p.adoptRestorable, []);
});

test('archived stays archived — it is the one thing the human decided', () => {
  const p = plan([{ id: 'ghost', archived: true }], ['pty-ghost']);
  assert.deepEqual(p.adoptLive, []);
  assert.deepEqual(p.adoptRestorable, []);
});

test('a mixed floor is sorted into the two buckets in one pass', () => {
  const p = plan(
    [{ id: 'god', isGod: true }, { id: 'naruto' }, { id: 'luffy' }, { id: 'ghost', archived: true }],
    ['pty-god', 'pty-naruto'],
    ['naruto']
  );
  assert.deepEqual(p.adoptLive.map((a) => a.id), ['god']);
  assert.deepEqual(p.adoptRestorable.map((a) => a.id), ['luffy']);
});

test('an empty registry plans nothing', () => {
  const p = plan([], ['pty-god']);
  assert.deepEqual(p, { adoptLive: [], adoptRestorable: [] });
});
