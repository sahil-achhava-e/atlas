'use strict';

/**
 * An agent leaves the floor when the human removes it, and at no other time.
 *
 * A terminal can die for reasons that have nothing to do with the agent — the
 * server crashed, the engine was killed, the machine slept. Archiving on every
 * exit meant a crash took the whole floor with it: two agents vanished and the
 * orchestrator was told it was alone, while their memory and identity sat
 * untouched on disk.
 *
 * Source assertions, because what matters is WHICH code paths archive — a test
 * that called teardownPty would have to rebuild the whole main process to say
 * anything about that.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const src = readFileSync(join(__dirname, '..', 'src/main/index.ts'), 'utf8');

test('a dead terminal does not archive its agent', () => {
  // The only setArchived(…, true) in teardown is gated on it being an ephemeral
  // worker — one the orchestrator created per task, that the human never made.
  const teardown = src.slice(src.indexOf('function teardownPty('), src.indexOf('// 2) Remove the isolated worktree'));
  assert.match(teardown, /wasWorker\s*\)\s*\{[^}]*setArchived\(agentId, true\)/s,
    'archiving in teardown must be gated on wasWorker');
  assert.equal(
    (teardown.match(/setArchived\([^)]*true\)/g) ?? []).length, 1,
    'exactly one archive path in teardown, and it is the worker one'
  );
});

test('there is no boot-time orphan sweep', () => {
  // It archived every registry entry with no live terminal — which at bootstrap
  // is all of them, and after a crash emptied the floor.
  assert.ok(!src.includes('archiveOrphanedAgents'),
    'the orphan sweep is gone; an entry with no terminal is an agent waiting to restart');
});

test('the human-driven archive is still reachable', () => {
  // Removing an agent from the floor is the ONE thing that should archive it.
  assert.match(src, /ipcMain\.handle\('hive:setArchived'/);
});

test('the renderer reconciles the floor against the hive on boot', () => {
  const store = readFileSync(join(__dirname, '..', 'src/renderer/src/store/store.ts'), 'utf8');
  const hive = readFileSync(join(__dirname, '..', 'src/renderer/src/hooks/useHive.ts'), 'utf8');
  assert.match(store, /adoptRestorable:/, 'store needs the action');
  assert.match(hive, /planFloor\(/, 'and boot must plan the floor from the registry + live ptys');
  assert.match(hive, /adoptRestorable\(/, 'agents with no terminal go to restore');
  assert.match(hive, /addAgent\(cardFor\(e, ptyIdFor\(e\.id\)\)\)/, 'a live terminal gets a card wired to it');
});
