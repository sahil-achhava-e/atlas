'use strict';

const test = require('node:test');
const { afterEach } = require('node:test');
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
/** Every store this file opens, so they can be closed at the end.
 *
 *  A better-sqlite3 database left to the garbage collector takes its prepared
 *  statements with it, and the order is not guaranteed: a statement finalized
 *  after its database has gone aborts the whole process with
 *  "Assertion failed: (env) != nullptr". These tests open dozens of stores, so
 *  they hit it often enough to look like a flaky suite. */
const opened = [];
// Closed after EACH test, not at the end of the file.
//
// This does not fully cure it, and the reason is worth writing down. Closing
// the database frees its statements' native side, but the JS wrappers live
// until the collector takes them, and a wrapper finalized during V8's teardown
// — after the environment is gone — aborts the process:
//
//   Assertion failed: (env) != nullptr … Statement::~Statement()
//
// Every database IS closed here; a probe at exit counts zero open. So the
// residue is an upstream race between garbage collection and teardown in
// better-sqlite3, not a handle this suite leaks. Closing promptly still cuts
// it from roughly one run in three to one in ten, by giving the collector
// fewer live objects to reach at the wrong moment.
afterEach(() => {
  for (const s of opened.splice(0)) { try { s.close(); } catch { /* already closed */ } }
});

function storeAt(home) {
  const store = (() => { const x = new RosterStore(() => home); opened.push(x); return x; })();
  opened.push(store);
  return store;
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
  opened.push(store);   // nothing to close, but the list is the rule
  assert.equal(store.read(), null);
  assert.equal(store.save({ agents: [card('a')] }).ok, false);
  store.archive(); // must not throw
});

test('switching home switches roster', () => {
  const a = tmpHome();
  const b = tmpHome();
  let home = a;
  const store = (() => { const x = new RosterStore(() => home); opened.push(x); return x; })();
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
  const copy = new RosterStore(() => home); opened.push(copy);
  // Point a store at the backup by copying it back over a second home.
  const other = tmpHome();
  fs.copyFileSync(path.join(rosterBackupDir(home), saved[0]), rosterDbPath(other));
  const fromBackup = new RosterStore(() => other); opened.push(fromBackup);
  assert.equal(fromBackup.read().agents[0].note, 'do not lose me');
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

// Rows stopped us losing AGENTS. They did not stop us losing FIELDS: a row is
// one JSON blob, so a writer that rebuilds a card without the desk erases the
// desk. That is how every agent lost its seat — the floor card is rebuilt from
// the hive record on adopt and restore, and the hive record had no seat.

test('a save that forgets the desk does not erase it', () => {
  const home = tmpHome();
  const store = storeAt(home);
  store.save({ agents: [card('a', { seat: 'warroom-seat', character: 'lib-hinata' })] });

  // A rebuilt card: same agent, same id, no placement fields.
  store.save({ agents: [{ id: 'a', name: 'a', status: 'idle' }] });

  const back = store.read().agents[0];
  assert.equal(back.seat, 'warroom-seat');
  assert.equal(back.character, 'lib-hinata');
});

test('sticky fields survive across runs, not just within one', () => {
  const home = tmpHome();
  storeAt(home).save({ agents: [card('a', { seat: 'pc-1', worktreePath: '/w/a', isLead: true })] });
  storeAt(home).save({ agents: [{ id: 'a', name: 'a' }] });

  const back = storeAt(home).read().agents[0];
  assert.equal(back.seat, 'pc-1');
  assert.equal(back.worktreePath, '/w/a');
  assert.equal(back.isLead, true);
});

test('a save that CHANGES a sticky field still changes it', () => {
  // The guard is about absence, never about disagreement. Moving an agent's
  // desk has to work.
  const home = tmpHome();
  const store = storeAt(home);
  store.save({ agents: [card('a', { seat: 'pc-1' })] });
  store.save({ agents: [card('a', { seat: 'desk-ui-ux-expert' })] });
  assert.equal(store.read().agents[0].seat, 'desk-ui-ux-expert');
});

test('the fields the human empties on purpose are NOT sticky', () => {
  // Clearing a goal or a note from the editor arrives as an absent key, and it
  // has to mean cleared.
  const home = tmpHome();
  const store = storeAt(home);
  store.save({ agents: [card('a', { goal: 'old briefing', note: 'old note', description: 'old' })] });
  store.save({ agents: [card('a')] });

  const back = store.read().agents[0];
  assert.equal(back.goal, undefined);
  assert.equal(back.note, undefined);
  assert.equal(back.description, undefined);
});

test('a brand new agent with no stored row is written as sent', () => {
  const home = tmpHome();
  const store = storeAt(home);
  store.save({ agents: [{ id: 'new', name: 'New' }] });
  assert.deepEqual(store.read().agents[0], { id: 'new', name: 'New' });
});
