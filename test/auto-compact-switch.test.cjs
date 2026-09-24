'use strict';

// Two bugs in the auto-compact path, guarded.
//
// (a) Settings' auto-compact switch wrote a `compact-maintenance` MISSION.
//     main retired that mission: ensureDefaultMissions DELETES it on the next
//     launch and folds its `enabled` into `contextTrigger.compact`. So the
//     switch forgot its own state on every restart, and flipping it rewrote a
//     trigger the Triggers tab owns — the clobber that migration's own comment
//     says cannot happen, because "nothing seeds compact-maintenance any more".
//     Settings did.
//
// (b) The pressure gate judged "large window" off `a.contextLimit` raw while
//     the fill percentage was computed against an INFERRED limit. A 1M agent
//     whose limit never came over the status-line shim was measured against 1M
//     and then held to the 200k bar.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const hive = read('src/renderer/src/hooks/useHive.ts');
const settings = read('src/renderer/src/components/SettingsModal.tsx');

// ── (a) the switch is the trigger, not a mission ─────────────────────────────

test('(a) Settings no longer writes the retired compact-maintenance mission', () => {
  assert.doesNotMatch(settings, /COMPACT_MAINTENANCE_MISSION|'compact-maintenance'/);
  assert.doesNotMatch(settings, /patch\.missions\s*=/);
});

test('(a) the switch reads AND writes contextTrigger.compact.enabled', () => {
  assert.match(settings, /getContextTrigger\(\)\.then\(\(c\) => setAutoCompactOn\(c\.compact\.enabled\)\)/);
  assert.match(settings, /setContextTrigger\(\{ \.\.\.ctx, compact: \{ \.\.\.ctx\.compact, enabled: autoCompactPending \} \}\)/);
});

test('(a) main still retires the mission, so re-seeding it would reopen the bug', () => {
  const main = read('src/main/index.ts');
  assert.match(main, /missions: missions3\.filter\(\(m\) => m\.id !== COMPACT_MAINTENANCE_MISSION\.id\)/);
});

test('(a) retiring a resurrected mission leaves an already-set trigger alone', () => {
  // 2026-09-24: a stale renderer re-created the mission; the retirement copied its
  // 2h over the operator's 30m. A configured trigger must only lose the mission.
  const main = read('src/main/index.ts');
  assert.match(main, /writeConfig\(cfg3\.contextTrigger \? \{\s*missions: missions3\.filter\([^)]*\)[^)]*\),\s*compactMaintenanceSeeded: true\s*\} :/);
});

// ── (b) the pressure gate, run for real ──────────────────────────────────────
// useHive.ts is a React hook whose import graph cannot load under node:test, so
// the two pure functions are sliced out and transpiled — the house pattern,
// one step further than a regex because this is arithmetic, not wiring.

const start = hive.indexOf('const LARGE_CONTEXT_WINDOW');
const end = hive.indexOf('\n}\n', hive.indexOf('function passesContextPressure')) + 3;
assert.ok(start > 0 && end > start, 'the pressure gate is still where the test slices it from');
const { outputText } = ts.transpileModule(
  `${hive.slice(start, end)}\nmodule.exports = { passesContextPressure, contextLimitOf };`,
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
);
const mod = { exports: {} };
new Function('module', 'exports', outputText)(mod, mod.exports);
const { passesContextPressure, contextLimitOf } = mod.exports;

const RULE = { enabled: true, everyMs: 7_200_000, minContextPct: 60, minContextPctLargeWindow: 40, message: '' };

test('(b) a 1M agent with no reported limit is judged against the LARGE bar', () => {
  // 450k of an inferred 1M window = 45%: past the 40% large bar, short of 60%.
  const a = { model: 'claude-opus-5[1m]', contextTokens: 450_000, contextLimit: undefined };
  assert.equal(contextLimitOf(a), 1_000_000);
  assert.equal(passesContextPressure(a, RULE), true);
});

test('(b) the same agent below its own bar still waits', () => {
  const a = { model: 'claude-opus-5[1m]', contextTokens: 350_000, contextLimit: undefined };
  assert.equal(passesContextPressure(a, RULE), false);
});

test('(b) a reported 200k window keeps the small bar', () => {
  const at45 = { model: 'claude-sonnet-5', contextTokens: 90_000, contextLimit: 200_000 };
  const at70 = { model: 'claude-sonnet-5', contextTokens: 140_000, contextLimit: 200_000 };
  assert.equal(passesContextPressure(at45, RULE), false);
  assert.equal(passesContextPressure(at70, RULE), true);
});

test('(b) no reading at all still fails OPEN, and a 0 bar disables the gate', () => {
  assert.equal(passesContextPressure({ model: 'crush' }, RULE), true);
  assert.equal(
    passesContextPressure({ model: 'claude-sonnet-5', contextTokens: 1, contextLimit: 200_000 },
      { ...RULE, minContextPct: 0 }),
    true
  );
});

// ── (c) near-empty sessions are not compacted ────────────────────────────────

test('(c) a Claude agent with no reading yet is left alone; an unmetered CLI still fails open', () => {
  assert.equal(passesContextPressure({ model: 'claude-sonnet-5' }, RULE, true), false);
  assert.equal(passesContextPressure({ model: 'crush' }, RULE, false), true);
});

test('(c) a finished compaction zeroes the stale reading until the next reply', () => {
  const post = hive.slice(hive.indexOf("e.event === 'PostCompact'"), hive.indexOf("e.event === 'PreToolUse'"));
  assert.match(post, /updateAgent\(e\.agentId, \{ contextTokens: 0 \}\)/);
});

// ── (d) a reloaded page learns the real window, not a guess ──────────────────

test('(d) the context backfill carries the status line\'s window size', () => {
  const main = read('src/main/index.ts');
  const h = main.slice(main.indexOf("ipcMain.handle('hive:agentContext'"), main.indexOf("ipcMain.handle('hive:agentContext'") + 600);
  assert.match(h, /hookServer\.contextFor\(agentId\)/);
  assert.match(h, /limit: live\.limit/);
  assert.match(hive, /contextLimit: res\.limit/);
});
