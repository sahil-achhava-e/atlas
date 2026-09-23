'use strict';

/**
 * The count on the ASK ME tab.
 *
 * Two faults, reported as one ("the tab stops showing the count once opened"):
 *
 *  1. The badge was rendered on the selected tab, but as white text on 25%
 *     white over the lilac fill — invisible, so opening the tab looked like
 *     reading it had cleared the number.
 *  2. It counted CARDS. A card can hold several open asks and the human answers
 *     each separately, so the badge said 1 where the board listed three rows.
 *
 * The count is not a notification. It is how many questions are still
 * unanswered, so it stays until they are.
 *
 * Run: node --test test/open-asks-badge.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { openAsks } = loadTs('src/shared/humanQA.ts');
const { isOpenStatus, OPEN_STATUSES } = loadTs('src/shared/taskStatus.ts');

/** The counting rule as useOpenAsks applies it over a ledger. */
const badgeCount = (tasks) => tasks.reduce((n, t) => n + openAsks(t).length, 0);

test('a card with three open asks counts three, not one', () => {
  const ledger = [{ id: 'A', status: 'blocked', humanQA: [{ q: 'one' }, { q: 'two' }, { q: 'three' }] }];
  assert.equal(badgeCount(ledger), 3);
});

test('the badge matches the number of rows the board lists', () => {
  const ledger = [
    { id: 'A', status: 'blocked', humanQA: [{ q: 'a' }, { q: 'b' }] },
    { id: 'B', status: 'blocked', humanQA: [{ q: 'c' }] },
    { id: 'C', status: 'in-progress', humanQA: [{ q: 'd', a: 'answered' }] }
  ];
  const rows = ledger.flatMap((t) => openAsks(t));
  assert.equal(badgeCount(ledger), rows.length);
  assert.equal(badgeCount(ledger), 3);
});

test('a dismissed ask stops counting', () => {
  // The old rule was `!e.a`, so an ask the human cleared without answering kept
  // the badge up with nothing on the board to act on.
  const ledger = [{ id: 'A', status: 'blocked', humanQA: [
    { q: 'answered', a: 'yes' },
    { q: 'dismissed', dismissedAt: '2026-09-23T09:00:00Z' },
    { q: 'still open' }
  ] }];
  assert.equal(badgeCount(ledger), 1);
});

test('it counts asks wherever the card sits, not only on blocked cards', () => {
  // The old rule tested `status === 'blocked'`, which the ledger write path now
  // derives. Testing it again here let the badge and the board disagree about a
  // card caught mid-write.
  const ledger = [{ id: 'A', status: 'in-progress', humanQA: [{ q: 'open' }] }];
  assert.equal(badgeCount(ledger), 1);
});

test('nothing open counts zero, and a broken ledger does not throw', () => {
  assert.equal(badgeCount([]), 0);
  assert.equal(badgeCount([{ id: 'A', status: 'done' }]), 0);
  assert.equal(badgeCount([{ id: 'A', humanQA: null }]), 0);
  assert.equal(badgeCount([{ id: 'A', humanQA: 'not an array' }]), 0);
});

// ── the half a unit test cannot reach ───────────────────────────────────────

const src = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('the hook reuses the shared predicates instead of its own copies', () => {
  const hook = src('src/renderer/src/hooks/useBoardCounts.ts');
  assert.match(hook, /from '@shared\/humanQA'/);
  // Comments stripped first: the doc comment QUOTES the old rule to explain
  // what was removed, and an assertion that cannot tell prose from code fails
  // on the explanation of its own fix.
  const code = hook.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /=== 'blocked'/, 'the status rule belongs to the write path, not here');
  assert.doesNotMatch(code, /typeof e\.q === 'string'/, 'the open-ask rule lives in shared, not here');
});

test('the badge stays legible on the selected tab', () => {
  const panel = src('src/renderer/src/components/CommandCenterPanel.tsx');
  // The bug: a translucent white pill under white text, on the lilac fill.
  assert.doesNotMatch(panel, /rgba\(255,255,255,0\.25\)/);
  // Selected wins over urgency: on the lilac fill BOTH badges go solid.
  assert.match(panel, /background: on\s*\n?\s*\? 'var\(--cth-paper-100\)'/);
  assert.match(panel, /color: on\s*\n?\s*\? 'var\(--cth-lilac-text\)'/);
});

test('the badge is not gated on the tab being unselected', () => {
  const panel = src('src/renderer/src/components/CommandCenterPanel.tsx');
  assert.match(panel, /\{badge > 0 && \(/, 'the only condition is that there is something to count');
  assert.doesNotMatch(panel, /!on && badge > 0/);
});

// ── the Tasks count: every card that is not done ────────────────────────────

/** The counting rule as useBoardCounts applies it over a ledger. */
const taskCount = (tasks) => tasks.filter((t) => isOpenStatus(t.status)).length;

test('the four open columns count, done does not', () => {
  assert.deepEqual([...OPEN_STATUSES], ['todo', 'in-progress', 'in-review', 'blocked']);
  const ledger = [
    { id: 'a', status: 'todo' },
    { id: 'b', status: 'in-progress' },
    { id: 'c', status: 'in-review' },
    { id: 'd', status: 'blocked' },
    { id: 'e', status: 'done' }
  ];
  assert.equal(taskCount(ledger), 4);
});

test('the words agents actually write are counted in the right column', () => {
  // Nothing owns tasks.json: `doing`, `wip`, `needs-review`, `stuck` and
  // `merged` are all in the wild. A badge comparing raw strings would miscount
  // every one of them.
  assert.equal(taskCount([{ status: 'doing' }, { status: 'wip' }, { status: 'needs-review' }, { status: 'stuck' }]), 4);
  for (const finished of ['done', 'complete', 'completed', 'closed', 'finished', 'merged']) {
    assert.equal(taskCount([{ status: finished }]), 0, `${finished} means done`);
  }
});

test('an unplaceable status counts, because the board shows it in todo', () => {
  // normalizeStatus puts anything it cannot read in `todo` rather than hiding
  // it, so the badge has to agree or it under-reports what is on screen. This
  // is why a card written as `cancelled` still counts.
  assert.equal(taskCount([{ status: 'cancelled' }, { status: 'banana' }, {}]), 3);
});

test('the badge matches the number of cards the board draws', () => {
  const ledger = [
    { id: 'a', status: 'todo' }, { id: 'b', status: 'doing' },
    { id: 'c', status: 'done' }, { id: 'd', status: 'blocked' }
  ];
  const drawn = ledger.filter((t) => isOpenStatus(t.status));
  assert.equal(taskCount(ledger), drawn.length);
});

test('the two badges are told apart, and only human is urgent', () => {
  const panel = src('src/renderer/src/components/CommandCenterPanel.tsx');
  assert.match(panel, /const urgent = d\.key === 'human'/);
  assert.match(panel, /d\.key === 'human' \? openAsks : d\.key === 'tasks' \? openTasks : 0/);
  // Coral is reserved for the one that wants an action from you.
  assert.match(panel, /urgent \? 'var\(--cth-coral\)' : 'var\(--cth-ink-300\)'/);
});

test('every locale can label the count', () => {
  const dir = path.join(__dirname, '..', 'src/renderer/src/i18n/locales');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const k of ['openAsks', 'openTasks']) {
      assert.ok(j.commandCenter[k], `${f} is missing commandCenter.${k}`);
      assert.match(j.commandCenter[k], /\{\{count\}\}/, `${f} ${k} must interpolate the count`);
    }
  }
});
