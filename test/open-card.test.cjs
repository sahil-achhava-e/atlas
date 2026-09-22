'use strict';

// The helper every agent uses to open a card. The invariant it exists for: two
// agents opening a card at the same moment must not get the same number, because
// the ledger merges by id and a collision folds two cards into one.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const { nextCardId } = loadTs('src/shared/cardId.ts');
const HELPER = path.join(__dirname, '..', 'resources', 'open-card.cjs');

function hive() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-cards-'));
  return dir;
}
function open(dir, args) {
  return execFileSync(process.execPath, [HELPER, '--hive', dir, ...args], { encoding: 'utf8' }).trim();
}
function ledger(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'tasks.json'), 'utf8'));
}

test('opens a card with the next number for its project', () => {
  const dir = hive();
  assert.equal(open(dir, ['--project', 'EVENTS', '--title', 'one', '--description', 'first card']), 'TASK-EVENTS-1');
  assert.equal(open(dir, ['--project', 'events', '--title', 'two', '--description', 'second card']), 'TASK-EVENTS-2');
  assert.equal(open(dir, ['--project', 'VMS', '--title', 'three', '--description', 'other project']), 'TASK-VMS-1');
  const doc = ledger(dir);
  assert.deepEqual(doc.tasks.map((t) => t.id), ['TASK-EVENTS-1', 'TASK-EVENTS-2', 'TASK-VMS-1']);
  assert.deepEqual(doc.counters, { EVENTS: 2, VMS: 1 });
});

test('a card without a description is refused', () => {
  // A title with no description is the failure the board already had: a card
  // the human has to come and ask about.
  const dir = hive();
  assert.throws(() => open(dir, ['--project', 'EVENTS', '--title', 'no detail']), /description/);
  assert.throws(() => open(dir, ['--project', 'EVENTS', '--description', 'no title']), /title/);
  assert.throws(() => open(dir, ['--project', '1', '--title', 't', '--description', 'd']), /card code/);
  assert.ok(!fs.existsSync(path.join(dir, 'tasks.json')), 'a refused card must not create a board');
});

test('it never hands the same number to two callers at once', () => {
  const dir = hive();
  const { execFile } = require('node:child_process');
  return new Promise((resolve, reject) => {
    const ids = [];
    let left = 8;
    for (let i = 0; i < 8; i++) {
      execFile(process.execPath,
        [HELPER, '--hive', dir, '--project', 'EVENTS', '--title', `c${i}`, '--description', 'concurrent'],
        (err, stdout) => {
          if (err) return reject(err);
          ids.push(stdout.trim());
          if (--left === 0) {
            assert.equal(new Set(ids).size, 8, `duplicate ids: ${ids.join(', ')}`);
            assert.equal(ledger(dir).tasks.length, 8, 'a lost write is a lost card');
            assert.equal(ledger(dir).counters.EVENTS, 8);
            resolve();
          }
        });
    }
  });
});

test('the helper and the app allocate identically', () => {
  // Two implementations of one rule (CJS for the agents, TS for the harness).
  // This is what keeps them in step.
  const dir = hive();
  open(dir, ['--project', 'EVENTS', '--title', 'a', '--description', 'x']);
  open(dir, ['--project', 'EVENTS', '--title', 'b', '--description', 'x']);
  const doc = ledger(dir);
  const fromApp = nextCardId('EVENTS', doc.tasks.map((t) => t.id), doc.counters);
  const fromHelper = open(dir, ['--project', 'EVENTS', '--title', 'c', '--description', 'x']);
  assert.equal(fromHelper, fromApp.id);
});

test('a deleted card does not give its number back', () => {
  const dir = hive();
  open(dir, ['--project', 'EVENTS', '--title', 'a', '--description', 'x']);
  const doc = ledger(dir);
  doc.tasks = [];                                  // the human dismissed it
  fs.writeFileSync(path.join(dir, 'tasks.json'), JSON.stringify(doc));
  assert.equal(open(dir, ['--project', 'EVENTS', '--title', 'b', '--description', 'x']), 'TASK-EVENTS-2');
});

test('an existing board keeps its cards and its unknown fields', () => {
  const dir = hive();
  fs.writeFileSync(path.join(dir, 'tasks.json'), JSON.stringify({
    tasks: [{ id: 'pr-2115-review', title: 'old', status: 'done', result: 'kept' }],
    somethingElse: 'kept too'
  }));
  open(dir, ['--project', 'EVENTS', '--title', 'new', '--description', 'x', '--assignee', 'sasuke']);
  const doc = ledger(dir);
  assert.equal(doc.tasks.length, 2);
  assert.equal(doc.tasks[0].result, 'kept');
  assert.equal(doc.somethingElse, 'kept too');
  assert.equal(doc.tasks[1].assignee, 'sasuke');
});
