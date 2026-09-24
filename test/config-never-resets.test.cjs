'use strict';

// A failed read of the config row must never turn into a reset.
//
// readStored used to answer a busy database or an unparseable row with null,
// readConfig turned that into factory defaults, and the next writeConfig stored
// its one change on top of them: every other setting gone. Seen 2026-09-24 as
// the one-time *Seeded guards vanishing and the standup coming back.
//
// Runs in order, on one module instance: the first case has no good copy yet.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const loadTs = require('./load-ts.cjs');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-noreset-'));
const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { app: { getPath: () => userData } }
};
const { readConfig, writeConfig, closeConfigDb } = loadTs('src/main/config.ts');

const dbFile = path.join(userData, 'harness.db');
function setRow(value) {
  const db = new Database(dbFile);
  try {
    db.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)');
    db.prepare('INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run('config', value, Date.now());
  } finally { db.close(); }
}
function getRow() {
  const db = new Database(dbFile, { readonly: true });
  try { return db.prepare('SELECT value FROM kv WHERE key = ?').get('config').value; } finally { db.close(); }
}

const MINE = { onboardingComplete: true, godModel: 'claude-opus-4-8[1m]', opsStandupSeeded: true, autoUpdate: true };

test.after(() => { closeConfigDb(); fs.rmSync(userData, { recursive: true, force: true }); });

test('unreadable row and no good copy yet: the save fails and the row is left alone', () => {
  setRow('{not json');
  assert.throws(() => writeConfig({ autoUpdate: false }), /config unreadable/);
  assert.equal(getRow(), '{not json');
});

test('unreadable row after a good read: reads and saves build on the good copy, not defaults', () => {
  setRow(JSON.stringify(MINE));
  assert.equal(readConfig().godModel, MINE.godModel);
  setRow('{not json');
  assert.equal(readConfig().opsStandupSeeded, true, 'read serves the last good copy');
  writeConfig({ autoUpdate: false });
  const stored = JSON.parse(getRow());
  assert.equal(stored.godModel, MINE.godModel);
  assert.equal(stored.opsStandupSeeded, true);
  assert.equal(stored.onboardingComplete, true);
  assert.equal(stored.autoUpdate, false);
});
