'use strict';

// THE CRASH THIS PREVENTS.
//
//   Assertion failed: (env) != nullptr
//   node::RemoveEnvironmentCleanupHook … Statement::~Statement()
//
// A better-sqlite3 prepared statement is a native object whose destructor
// unregisters an environment cleanup hook. Preparing them per call — nine on
// every roster save, one on every readConfig, and readConfig runs on nearly
// every IPC — leaves thousands queued for the garbage collector. When one is
// collected after its database has gone, node aborts the whole process. That
// is the crash that had been killing the server at random, and it finally
// killed it six times in a minute once the roster started reading a row back
// on every save.
//
// Prepared once per connection, they live as long as the connection and are
// freed with it, in order.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('the roster prepares its statements once, at connect', () => {
  const src = read('src/main/roster.ts');
  const setup = src.slice(src.indexOf('this.stmts = {'), src.indexOf('return db;', src.indexOf('this.stmts = {')));
  const total = (src.match(/db\.prepare\(/g) ?? []).length;
  const inSetup = (setup.match(/db\.prepare\(/g) ?? []).length;
  assert.equal(total, inSetup, 'every prepare belongs to the connection setup');
  assert.ok(inSetup >= 8, 'all the statements a save needs are prepared up front');
});

test('the config prepares its statements once, at connect', () => {
  const src = read('src/main/config.ts');
  const body = src.slice(src.indexOf('function readStored'));
  assert.doesNotMatch(body.slice(0, body.indexOf('export function readConfig')), /\.prepare\(/,
    'reading or writing the config must not prepare anything');
});

test('closing drops the statements before the database', () => {
  for (const [file, marker] of [
    ['src/main/roster.ts', 'this.stmts = null;'],
    ['src/main/config.ts', 'configRead = null;']
  ]) {
    const src = read(file);
    const close = src.slice(src.indexOf(marker));
    const dropAt = 0;
    const closeAt = close.indexOf('.close()');
    assert.ok(closeAt > dropAt, `${file}: statements are released before the handle`);
  }
});

test('the roster still works when its statements are cached', () => {
  // The behaviour has to be identical — this is the same round trip the rest
  // of the suite relies on, run once here against the cached path.
  const { RosterStore } = loadTs('src/main/roster.ts');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-stmt-'));
  const store = new RosterStore(() => home);
  store.save({ agents: [{ id: 'a', name: 'A', seat: 'pc-1' }], selectedId: 'a' });
  store.save({ agents: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
  store.save({ agents: [{ id: 'a', name: 'A' }], removes: ['b'] });
  const back = store.read();
  assert.deepEqual(back.agents.map((x) => x.id), ['a']);
  assert.equal(back.agents[0].seat, 'pc-1', 'the sticky guard still runs');
  assert.equal(back.selectedId, 'a');
  store.close();
  // And a closed store reopens cleanly rather than using dead statements.
  const reopened = new RosterStore(() => home);
  assert.equal(reopened.read().agents.length, 1);
  reopened.close();   // never leave a handle to the collector — see the header
});
