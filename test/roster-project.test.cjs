'use strict';

// Routing depends on knowing which repo an agent works in. With one project it
// is implied; with two it is the first thing a dispatch gets wrong, and the
// live roster never said it.

const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

/** A hive root with a fleet snapshot in it, and a manager pointed at it. */
const withFleet = (agents) => {
  const home = mkdtempSync(join(tmpdir(), 'hive-'));
  mkdirSync(join(home, 'hive'), { recursive: true });
  writeFileSync(join(home, 'hive', 'fleet.json'), JSON.stringify({ ts: Date.now(), agents }));
  return new HiveManager(() => home, () => true);
};

test('each agent is listed with the project it works in', () => {
  const hive = withFleet([
    { id: 'a1', name: 'Dana', role: 'backend', cwd: '/Users/me/Desktop/epicxp-events' },
    { id: 'a2', name: 'Sam', role: 'frontend', cwd: '/Users/me/Desktop/Ethara-VMS' }
  ]);
  const roster = hive.rosterContext();
  assert.match(roster, /a1 "Dana" \(backend, epicxp-events/);
  assert.match(roster, /a2 "Sam" \(frontend, Ethara-VMS/);
});

test('the folder name, not the whole path — a roster of paths is unreadable', () => {
  const hive = withFleet([{ id: 'a1', role: 'backend', cwd: '/Users/me/Desktop/epicxp-events' }]);
  assert.ok(!hive.rosterContext().includes('/Users/me/Desktop/epicxp-events'));
});

test('an agent with its own worktree says so — it can work in parallel', () => {
  const hive = withFleet([
    { id: 'a1', role: 'backend', cwd: '/r/api', worktreePath: '/r/.worktrees/a1' },
    { id: 'a2', role: 'backend', cwd: '/r/api' }
  ]);
  const roster = hive.rosterContext();
  assert.match(roster, /a1 \(backend, api \(own worktree\)/);
  assert.match(roster, /a2 \(backend, api,/);
});

test('the orchestrator is not labelled with a project', () => {
  // Its cwd is the workspace, not a repo — printing it would read as a third
  // project that nobody registered.
  const hive = withFleet([{ id: 'god', role: 'orchestrator', isGod: true, cwd: '/Users/me/Atlas/ws' }]);
  assert.ok(!hive.rosterContext().includes('ws,'));
});

test('an agent with no cwd is still listed, just without a project', () => {
  const hive = withFleet([{ id: 'a1', role: 'backend' }]);
  assert.match(hive.rosterContext(), /a1 \(backend, no activity yet\)/);
});

// An empty floor has to SAY it is empty. Left to infer it from a one-row
// roster, the orchestrator filled the gap with the subagent templates lying
// around the machine (~/.claude/agents/backend-engineer.md and friends) and
// planned hires around a team that did not exist.

test('a floor with only the orchestrator says so, in words', () => {
  const hive = withFleet([{ id: 'god', role: 'orchestrator', isGod: true, cwd: '/w' }]);
  const roster = hive.rosterContext();
  assert.match(roster, /ONLY agent on this floor/);
  assert.match(roster, /no workers/i);
  // And names the thing it must not mistake for a crew.
  assert.match(roster, /\.claude\/agents/);
});

test('one real worker is a floor, and reads as the normal roster', () => {
  const hive = withFleet([
    { id: 'god', role: 'orchestrator', isGod: true, cwd: '/w' },
    { id: 'a1', name: 'Dana', role: 'backend', cwd: '/r/api' }
  ]);
  const roster = hive.rosterContext();
  assert.ok(!roster.includes('ONLY agent'));
  assert.match(roster, /a1 "Dana" \(backend, api/);
});
