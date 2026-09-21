'use strict';

// Which file the activity view reads.
//
// Resuming an agent starts a NEW transcript file. The registry's session id is
// updated by a hook, and the first hook of a resumed session lands seconds to
// minutes after the process does. Until then the pinned id points at the
// PREVIOUS session — a file that will never change again — so the read-only
// activity view shows an agent that has gone quiet while it is visibly working.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src/main/index.ts'), 'utf8');
const fn = (() => {
  const from = src.indexOf('function activityTranscript');
  assert.notEqual(from, -1, 'activityTranscript was renamed');
  return src.slice(from, src.indexOf('\nipcMain.handle(\'agent:activity\'', from));
})();

test('a hook-reported path still wins outright', () => {
  // It names the exact file this session is writing; nothing beats that.
  assert.match(fn, /const hooked = hookServer\.transcriptPath\(agentId\);\s*\n\s*if \(hooked && existsSync\(hooked\)\) return hooked;/);
});

test('a newer file overtakes a stale pinned session', () => {
  assert.match(fn, /newest\.at <= statSync\(pinned\)\.mtimeMs\) return pinned;/);
  assert.match(fn, /return newest\.path;/);
});

test('but never when two agents share the directory', () => {
  // A shared cwd means a shared transcript folder, and there the newest file is
  // as likely to belong to the other agent.
  assert.match(fn, /const sharing = Object\.values\(hive\.registry\(\)\.agents \?\? \{\}\)/);
  assert.match(fn, /if \(sharing > 1 \|\| !newest/);
});

test('no pinned session at all still falls back to the newest', () => {
  assert.match(fn, /return newest\?\.path \?\? null;/);
});
