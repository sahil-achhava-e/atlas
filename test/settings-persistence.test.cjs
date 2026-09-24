'use strict';

// Every switch, picker and field in Settings → does it reach SQLite, and does it
// read back as what was typed?
//
// The dialog stages everything into one `updateConfig` patch, so this drives the
// real `writeConfig`/`readConfig` against a throwaway database and checks the
// stored row itself — not a mock, and not the merged view, so a key that is
// dropped or rewritten on the way down shows up here.
//
// Two live-application bugs are guarded at the bottom:
//   - the close guard ignored the number fields, so typing a token budget and
//     closing the dialog dropped it silently
//   - `strongKeepalive` was only ever re-read on a PTY lifecycle event, so the
//     switch did nothing under a running floor

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const loadTs = require('./load-ts.cjs');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-settings-'));
const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { app: { getPath: () => userData } }
};

const { readConfig, writeConfig, closeConfigDb } = loadTs('src/main/config.ts');

test.after(() => {
  closeConfigDb();
  fs.rmSync(userData, { recursive: true, force: true });
});

/** The row as SQLite actually holds it, read on a separate connection. */
function storedRow() {
  const db = new Database(path.join(userData, 'harness.db'), { readonly: true });
  try {
    const row = db.prepare('SELECT value FROM kv WHERE key = ?').get('config');
    return row ? JSON.parse(row.value) : null;
  } finally { db.close(); }
}

// Every key a Settings control writes, with a value that is not its default.
// `notifications` is written by its own IPC (app:setNotifications) and
// contextTrigger by triggers:setContext; both land in the same writeConfig.
const SETTINGS = {
  strongKeepalive: true,
  autoMode: false,
  audience: 'non-technical',
  orchestratorMaySpawn: true,
  gossipWriter: false,
  defaultModel: 'claude-opus-5',
  autoUpdate: false,
  tilePalette: 'night',
  realtimeIdleDisconnectMs: 0,
  maxTurns: 42,
  costCapTokens: 5_000_000,
  notifications: true,
  projectCodes: { '/tmp/atlas-project': 'AB' },
  circuitBreaker: {
    enabled: true, hardStop: true,
    tokenVelocityPerMin: 9000, repeatedToolLimit: 7, errorStormLimit: 3
  }
};

test('every Settings key round-trips through the database', () => {
  for (const [key, value] of Object.entries(SETTINGS)) {
    writeConfig({ [key]: value });
    assert.deepEqual(readConfig()[key], value, `${key} did not read back`);
    assert.deepEqual(storedRow()[key], value, `${key} is not in the stored row`);
  }
});

test('saving one setting does not drop the ones saved before it', () => {
  // The dialog saves a PATCH, and writeConfig merges it into what is on disk.
  // A patch that replaced the document would lose every untouched setting.
  const all = readConfig();
  for (const [key, value] of Object.entries(SETTINGS)) {
    assert.deepEqual(all[key], value, `${key} was lost by a later save`);
  }
});

test('the auto-compact switch round-trips as contextTrigger.compact.enabled', () => {
  writeConfig({ contextTrigger: { ...readConfig().contextTrigger, compact: { ...readConfig().contextTrigger.compact, enabled: true } } });
  assert.equal(readConfig().contextTrigger.compact.enabled, true);
  // …and the rest of the rule survives the partial write (withTriggerDefaults).
  assert.equal(typeof readConfig().contextTrigger.compact.everyMs, 'number');
  assert.equal(typeof readConfig().contextTrigger.clear.minContextPct, 'number');
});

test('a value cleared back to empty falls back to the default, not to null', () => {
  // maxTurns empty means "no ceiling": the patch carries `undefined`, which
  // JSON drops, so the key must simply be absent rather than stored as null.
  writeConfig({ maxTurns: undefined });
  assert.equal(Object.prototype.hasOwnProperty.call(storedRow(), 'maxTurns'), false);
  assert.equal(readConfig().maxTurns, undefined);
});

// ── the settings that were not actually working ──────────────────────────────

const settingsSrc = fs.readFileSync(
  path.resolve(__dirname, '..', 'src/renderer/src/components/SettingsModal.tsx'), 'utf8'
);
const appSrc = fs.readFileSync(path.resolve(__dirname, '..', 'src/renderer/src/App.tsx'), 'utf8');
const mainSrc = fs.readFileSync(path.resolve(__dirname, '..', 'src/main/index.ts'), 'utf8');

test('Settings does not write the fields it has no control for', () => {
  // The Autonomy & Budgets tab is gone, but the state and both patch builders
  // stayed and were folded into EVERY save from a mount-time snapshot — so
  // changing the office theme wrote a stale token cap back over a newer one.
  for (const dead of ['budgetPatch', 'maxTurnsPatch', 'agentBudget', 'brkEnabled', 'fmtBudgetTokens']) {
    assert.doesNotMatch(settingsSrc, new RegExp(dead), `${dead} is dead state that still writes`);
  }
  assert.match(settingsSrc, /const patch: Partial<HarnessConfig> = \{ \.\.\.pending \};/);
});

test('every switch in the dialog is staged, so Discard can undo it', () => {
  // Notifications wrote straight to disk on click. The permission prompt still
  // needs the gesture; the VALUE is staged like the rest.
  assert.match(settingsSrc, /stage\(\{ notifications: next \}/);
  assert.doesNotMatch(settingsSrc, /window\.cth\.setNotifications/);
  assert.match(settingsSrc, /if \(next && !\(await ensureNotificationPermission\(\)\)\)/,
    'the permission must still be requested from the click');
});

test('discarding puts the office theme back', () => {
  // It is the one setting that applies before it is saved, so discarding has to
  // repaint the floor or the config and the floor disagree until a restart.
  assert.match(settingsSrc, /const discard = \(\): void => \{\s*setTilePalette\(config\.tilePalette \?\? 'original'\);/);
  assert.match(settingsSrc, /onConfirm=\{\(\) => \{ setUnsavedOpen\(false\); discard\(\); \}\}/);
});

test('a saved setting repaints the surfaces that mirror it', () => {
  // The mirrors used to be filled once, in the initial load, so anything saved
  // by another window, a voice action or main itself reached nobody.
  assert.match(appSrc, /function applyConfigMirrors\(c: HarnessConfig\): void/);
  const sub = appSrc.slice(appSrc.indexOf('onConfigChanged'));
  assert.match(sub.slice(0, 200), /applyConfigMirrors/);
});

test('a config save re-evaluates the keep-awake blocker', () => {
  // strongKeepalive decides the blocker MODE and syncKeepAwake is its only
  // reader; every other call site is a PTY lifecycle event, so the switch did
  // nothing under a running floor.
  const listener = mainSrc.slice(mainSrc.indexOf('onConfigWritten((config) => {'));
  assert.match(listener.slice(0, 800), /syncKeepAwake\(\)/);
});
