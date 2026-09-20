'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { RosterStore, rosterDbPath, rosterBackupDir } = loadTs('src/main/roster.ts');

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md-roster-'));
}

/** A store bound to `home`. A fresh instance is a fresh RUN — a restart, or the
 *  other window: the point of every test below is that a run holding less than
 *  the database does cannot take anything away. */
function storeAt(home) {
  return new RosterStore(() => home);
}

const card = (id, extra = {}) => ({ id, name: id, ...extra });

test('a roster round-trips through the database', () => {
  const home = tmpHome();
  const store = storeAt(home);
  assert.equal(store.read(), null); // nothing saved yet

  assert.equal(store.save({ agents: [card('a', { note: 'beets' })] }).ok, true);

  const back = store.read();
  assert.equal(back.agents.length, 1);
  assert.equal(back.agents[0].note, 'beets');
  assert.equal(back.seeded, true);
});

test('a window that knows about one agent cannot erase the other two', () => {
  // THE bug this file exists for. A crash left a fresh window holding one agent;
  // it saved, and the two it had never heard of were gone. There is no longer a
  // write shaped like "replace everything" for it to make.
  const home = tmpHome();
  storeAt(home).save({ agents: [card('a'), card('b'), card('c')] });

  const halfInformed = storeAt(home);
  assert.equal(halfInformed.save({ agents: [card('a')] }).ok, true);
  assert.deepEqual(halfInformed.read().agents.map((a) => a.id).sort(), ['a', 'b', 'c']);
});

test('an empty save from a fresh window changes nothing', () => {
  const home = tmpHome();
  storeAt(home).save({ agents: [card('a'), card('b')] });

  const blank = storeAt(home);
  assert.equal(blank.save({ agents: [], archived: [], restorable: [] }).ok, true);
  assert.equal(blank.read().agents.length, 2);
});

test('removing an agent is explicit, by id, and it sticks', () => {
  const home = tmpHome();
  const store = storeAt(home);
  store.save({ agents: [card('a'), card('b')] });
  store.save({ agents: [card('a')], removes: ['b'] });

  assert.deepEqual(store.read().agents.map((a) => a.id), ['a']);
  // And a later run does not resurrect it.
  assert.deepEqual(storeAt(home).read().agents.map((a) => a.id), ['a']);
});

test('removing an agent takes its queue with it', () => {
  const home = tmpHome();
  const store = storeAt(home);
  store.save({ agents: [card('a')], queues: { a: [{ id: 'q1', text: 'ship it' }] } });
  assert.equal(store.read().queues.a.length, 1);

  store.save({ agents: [], removes: ['a'] });
  assert.deepEqual(store.read().queues, {});
});

test('an agent that moves bucket is one row, not two', () => {
  // A worker whose terminal died becomes restorable. It is the same agent: it
  // must not be duplicated, and it must not be read as a removal.
  const home = tmpHome();
  const store = storeAt(home);
  store.save({ agents: [card('a'), card('b')] });
  store.save({ agents: [card('a')], restorable: [card('b')] });

  const back = store.read();
  assert.deepEqual(back.agents.map((a) => a.id), ['a']);
  assert.deepEqual(back.restorable.map((a) => a.id), ['b']);
});

test('order on the floor survives the round trip', () => {
  const home = tmpHome();
  const store = storeAt(home);
  store.save({ agents: [card('c'), card('a'), card('b')] });
  assert.deepEqual(store.read().agents.map((a) => a.id), ['c', 'a', 'b']);
});

test('queues are replaced for the agents a window knows, and left alone for others', () => {
  const home = tmpHome();
  const store = storeAt(home);
  store.save({
    agents: [card('a'), card('b')],
    queues: { a: [{ id: 'q1', text: 'one' }], b: [{ id: 'q2', text: 'two' }] }
  });

  // A window that only knows about `a`, with `a`'s queue now drained.
  const partial = storeAt(home);
  partial.save({ agents: [card('a')], queues: {} });

  const back = partial.read();
  assert.equal(back.queues.a, undefined, "a's queue was drained");
  assert.equal(back.queues.b.length, 1, "b was never mentioned, so b's queue stands");
});

test('worktree paths and notes survive the round trip verbatim', () => {
  const home = tmpHome();
  const agent = {
    id: 'w1',
    name: 'Jim',
    cwd: '/Users/x/Atlas/agents-workspace/worktrees/w1',
    worktreePath: '/Users/x/Atlas/agents-workspace/worktrees/w1',
    note: '- shipping the queue fix\n- then the roster'
  };
  const store = storeAt(home);
  store.save({ agents: [agent] });
  assert.deepEqual(store.read().agents[0], agent);
});

test('selection round-trips and can be cleared', () => {
  const home = tmpHome();
  const store = storeAt(home);
  store.save({ agents: [card('a')], selectedId: 'a' });
  assert.equal(store.read().selectedId, 'a');
  store.save({ selectedId: null });
  assert.equal(store.read().selectedId, null);
});

test('an unmentioned selection is not disturbed', () => {
  const home = tmpHome();
  const store = storeAt(home);
  store.save({ agents: [card('a')], selectedId: 'a' });
  store.save({ agents: [card('a', { note: 'edited' })] }); // no selectedId key
  assert.equal(store.read().selectedId, 'a');
});

test('an emptied roster reads as empty, not as "no opinion"', () => {
  // Deleting everyone is a real answer. Returning null would send the renderer
  // looking for another copy, which is how deleted agents used to come back.
  const home = tmpHome();
  const store = storeAt(home);
  store.save({ agents: [card('a')] });
  store.save({ agents: [], removes: ['a'] });

  const back = storeAt(home).read();
  assert.equal(back.agents.length, 0);
  assert.equal(back.seeded, true);
});

test('no harnessHome means no database at all', () => {
  const store = new RosterStore(() => null);
  assert.equal(store.read(), null);
  assert.equal(store.save({ agents: [card('a')] }).ok, false);
  store.archive(); // must not throw
});

test('switching home switches roster', () => {
  const a = tmpHome();
  const b = tmpHome();
  let home = a;
  const store = new RosterStore(() => home);
  store.save({ agents: [card('in-a')] });
  home = b;
  assert.equal(store.read(), null, 'the other workspace has its own roster');
  store.save({ agents: [card('in-b')] });
  home = a;
  assert.deepEqual(store.read().agents.map((x) => x.id), ['in-a']);
});

test('reset copies the database aside before clearing it', () => {
  const home = tmpHome();
  const store = storeAt(home);
  store.save({ agents: [card('a', { note: 'do not lose me' })] });

  store.archive();
  // A reset returns the workspace to virgin: not "an empty roster", but "no
  // roster", exactly as a home that has never been used reads.
  assert.equal(store.read(), null);

  const saved = fs.readdirSync(rosterBackupDir(home)).filter((f) => f.endsWith('-reset.db'));
  assert.equal(saved.length, 1);
  const copy = new RosterStore(() => home);
  // Point a store at the backup by copying it back over a second home.
  const other = tmpHome();
  fs.copyFileSync(path.join(rosterBackupDir(home), saved[0]), rosterDbPath(other));
  assert.equal(new RosterStore(() => other).read().agents[0].note, 'do not lose me');
  copy.archive(); // idempotent, must not throw
});

test('a bad row is skipped rather than failing the whole read', () => {
  const home = tmpHome();
  const store = storeAt(home);
  store.save({ agents: [card('a'), card('b')] });
  const Database = require('better-sqlite3');
  const db = new Database(rosterDbPath(home));
  db.prepare("UPDATE agent SET data = '{ not json' WHERE id = 'a'").run();
  db.close();
  assert.deepEqual(storeAt(home).read().agents.map((x) => x.id), ['b']);
});
