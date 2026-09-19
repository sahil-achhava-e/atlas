'use strict';

/**
 * Archiving "orphaned" agents must not run at boot.
 *
 * At bootstrap NO agent has a terminal yet — they are spawned by the renderer a
 * moment later — so a sweep that archives everything without a live PTY archives
 * the entire floor. On a normal launch the restore hid it; after a crash, with
 * the roster gone too, two agents simply vanished and the orchestrator was told
 * it was alone.
 *
 * Source assertions: the thing that went wrong is WHEN the call happens, and a
 * test that exercised the function would have passed either way.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const src = readFileSync(join(__dirname, '..', 'src/main/index.ts'), 'utf8');

test('the sweep is not called straight from the hive bootstrap', () => {
  // i.e. never `archiveOrphanedAgents();` on its own line as a direct call.
  const direct = src.match(/^\s*archiveOrphanedAgents\(\);/m);
  assert.equal(direct, null,
    'calling it inline at bootstrap archives every agent — none has a PTY yet');
});

test('it runs after a grace window instead', () => {
  assert.match(src, /setTimeout\(archiveOrphanedAgents, ORPHAN_GRACE_MS\)/);
});

test('the window is long enough for the renderer to restore the team', () => {
  const m = src.match(/const ORPHAN_GRACE_MS = ([^;]+);/);
  assert.ok(m, 'ORPHAN_GRACE_MS not found');
  // eslint-disable-next-line no-eval
  const ms = eval(m[1]);
  assert.ok(ms >= 60_000, `grace is ${ms}ms — a slow restore would still be archived`);
});

test('the god is still never archived, whenever it runs', () => {
  assert.match(src, /if \(id === reg\.godId\) continue;/);
});
