'use strict';

// The settings, the registered projects, the workspace list and the
// orchestrator's engine used to be config.json. They are the same class of
// state as the roster, and the roster is in SQLite — so they are too. The JSON
// file is read ONCE, to import an existing install, and then left alone.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src/main/config.ts'), 'utf8');

test('the config is stored in the database, not written to a file', () => {
  assert.match(src, /function writeStored/);
  assert.match(src, /INSERT INTO kv \(key, value, updated_at\)/);
  // persistConfig used to writeFileSync the whole config on every save.
  const persist = src.slice(src.indexOf('function persistConfig'));
  assert.doesNotMatch(persist.slice(0, 400), /writeFileSync/,
    'saving a setting must not write config.json any more');
});

test('an existing install is imported once, and the file is never rewritten', () => {
  assert.match(src, /imported config\.json into the database/);
  // The import writes the row immediately, so it cannot run twice and produce
  // two different answers.
  const read = src.slice(src.indexOf('function readStored'), src.indexOf('function writeStored'));
  assert.match(read, /writeStored\(parsed\)/);
  assert.match(read, /configRead\??\.get\(CONFIG_KEY\)/);
  assert.ok(read.search(/configRead\??\.get\(CONFIG_KEY\)/) < read.indexOf('readFileSync'),
    'the database is checked BEFORE the legacy file, or the import repeats forever');
});

test('the legacy file is not deleted', () => {
  // Two reasons: the "which state directory is this install's" probe looks for
  // it, and a file nobody writes is a free safety net for a downgrade.
  assert.doesNotMatch(src, /rmSync\(configPath|unlinkSync\(configPath/);
});

test('the state-directory probes accept either marker', () => {
  // An install that has only ever run the new build has no config.json at all,
  // so a probe that looks only for that file would adopt the wrong directory
  // or none.
  for (const f of ['src/main/index.ts', 'src/server/electronShim.ts']) {
    const body = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    const probe = body.slice(body.indexOf("'config.json'") - 300, body.indexOf("'config.json'") + 300);
    assert.match(probe, /harness\.db/, `${f} must also recognise the database`);
  }
});

test('every caller still goes through readConfig and writeConfig', () => {
  // The whole migration rests on this: 130-odd call sites did not change
  // because the storage is behind two functions.
  assert.match(src, /export function readConfig\(\): HarnessConfig/);
  assert.match(src, /export function writeConfig\(patch: Partial<HarnessConfig>\): HarnessConfig/);
  assert.match(src, /export function resetConfig\(\): HarnessConfig/);
});
