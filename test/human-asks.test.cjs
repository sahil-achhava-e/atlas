'use strict';

/**
 * Two open human questions went missing (2026-09-23, TASK-EVENTS-13/14).
 *
 * A card can hold several unanswered asks. The board showed only the LAST one,
 * so answering it made an older ask from a different agent appear where the
 * answered one had been — and then vanish, because ASK ME listed
 * `status === 'blocked'` cards only and the orchestrator had already moved the
 * card to `in-progress`. The asks stayed open in the ledger with no way to
 * answer or dismiss them.
 *
 * Two rules close that hole, and these are them:
 *   1. openAsks() returns EVERY open ask, so the board can list them all.
 *   2. statusWithOpenAsks() holds a card blocked while any ask is open, applied
 *      on the ledger write path where every writer routes through.
 *
 * Run: node --test test/human-asks.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { isOpenAsk, openAsks, statusWithOpenAsks } = loadTs('src/shared/humanQA.ts');
const { askedAtMs, compareByNewestAsk } = loadTs('src/renderer/src/components/askMeOrder.ts');

// The real card, trimmed to the fields that matter. Note the order: the OPEN
// entry sits in the middle, which is exactly why a backwards scan for "the last
// open one" found it only after [2] was answered.
const TASK_EVENTS_13 = {
  id: 'TASK-EVENTS-13',
  status: 'in-progress',
  humanQA: [
    { q: 'Two things unblock the scanner APK build.', by: 'god', a: 'done', answeredAt: '2026-09-23T08:00:46.780Z' },
    { q: 'App fully built, flutter analyze clean.', by: 'naruto-mu94j85b', askedAt: '2026-09-23T14:52:00.000Z' },
    { q: 'App is built + in code review.', by: 'god', a: 'ok', answeredAt: '2026-09-23T08:35:17.179Z' }
  ]
};

test('isOpenAsk: unanswered and undismissed, with real question text', () => {
  assert.equal(isOpenAsk({ q: 'why?' }), true);
  assert.equal(isOpenAsk({ q: 'why?', a: 'because' }), false);
  assert.equal(isOpenAsk({ q: 'why?', dismissedAt: '2026-09-23T08:00:00Z' }), false);
  // Guards against a hand-edited ledger.
  assert.equal(isOpenAsk({ q: '   ' }), false);
  assert.equal(isOpenAsk({}), false);
  assert.equal(isOpenAsk(null), false);
  assert.equal(isOpenAsk('a string'), false);
});

test('openAsks finds the open entry even when it is not the last one', () => {
  const open = openAsks(TASK_EVENTS_13);
  assert.equal(open.length, 1);
  assert.equal(open[0].by, 'naruto-mu94j85b');
});

test('every open ask is returned, not just one', () => {
  const card = { humanQA: [{ q: 'one' }, { q: 'two', a: 'x' }, { q: 'three' }, { q: 'four' }] };
  assert.deepEqual(openAsks(card).map((e) => e.q), ['one', 'three', 'four']);
});

test('a card with no humanQA, or a broken one, has no open asks', () => {
  assert.deepEqual(openAsks({}), []);
  assert.deepEqual(openAsks({ humanQA: null }), []);
  assert.deepEqual(openAsks({ humanQA: 'not an array' }), []);
  assert.deepEqual(openAsks(null), []);
  assert.deepEqual(openAsks(undefined), []);
});

test('an open ask forces the card back to blocked — the bug, directly', () => {
  // This is the card as the ledger held it: in-progress, with an ask nobody
  // could reach. On the next write it becomes blocked, so it is on ASK ME again.
  assert.equal(statusWithOpenAsks('in-progress', TASK_EVENTS_13), 'blocked');
});

test('every status is held, including done', () => {
  const asking = { humanQA: [{ q: 'still open' }] };
  for (const status of ['todo', 'in-progress', 'in-review', 'blocked', 'done']) {
    assert.equal(statusWithOpenAsks(status, asking), 'blocked', `${status} should be held`);
  }
});

test('a card frees up only when EVERY ask is answered or dismissed', () => {
  const three = (...qa) => ({ humanQA: qa });
  assert.equal(statusWithOpenAsks('in-progress', three({ q: 'a' }, { q: 'b' }, { q: 'c' })), 'blocked');
  assert.equal(statusWithOpenAsks('in-progress', three({ q: 'a', a: '1' }, { q: 'b' }, { q: 'c' })), 'blocked');
  assert.equal(statusWithOpenAsks('in-progress', three({ q: 'a', a: '1' }, { q: 'b', a: '2' }, { q: 'c' })), 'blocked');
  // The last one resolved, by an answer and by a dismissal.
  assert.equal(
    statusWithOpenAsks('in-progress', three({ q: 'a', a: '1' }, { q: 'b', a: '2' }, { q: 'c', a: '3' })),
    'in-progress'
  );
  assert.equal(
    statusWithOpenAsks('done', three({ q: 'a', a: '1' }, { q: 'b', dismissedAt: 'x' }, { q: 'c', a: '3' })),
    'done'
  );
});

test('a card with no asks at all keeps whatever status it had', () => {
  assert.equal(statusWithOpenAsks('done', {}), 'done');
  assert.equal(statusWithOpenAsks('todo', { humanQA: [] }), 'todo');
});

// ── the made-up timestamps ───────────────────────────────────────────────────

test('askedAt in the future is clamped to now', () => {
  const now = Date.parse('2026-09-23T09:30:00.000Z');
  // naruto's invented time, hours ahead of the clock.
  assert.equal(askedAtMs({ askedAt: '2026-09-23T14:52:00.000Z' }, now), now);
  // A real past time is untouched.
  const past = Date.parse('2026-09-23T08:31:56.764Z');
  assert.equal(askedAtMs({ askedAt: '2026-09-23T08:31:56.764Z' }, now), past);
});

test('a missing or unparseable askedAt is still null, not a crash', () => {
  const now = Date.parse('2026-09-23T09:30:00.000Z');
  assert.equal(askedAtMs({}, now), null);
  assert.equal(askedAtMs(undefined, now), null);
  assert.equal(askedAtMs({ askedAt: 'last tuesday' }, now), null);
});

test('a made-up future timestamp no longer jumps the queue', () => {
  const now = Date.parse('2026-09-23T09:30:00.000Z');
  const invented = { askedAt: '2026-09-23T14:52:00.000Z' }; // clamps to now
  const real = { askedAt: '2026-09-23T09:29:00.000Z' };     // one minute ago
  const old = { askedAt: '2026-09-22T10:00:00.000Z' };      // yesterday

  const order = [old, invented, real].sort((a, b) => compareByNewestAsk(a, b, now));
  // Clamped to `now`, the invented one is still first — it cannot be pushed
  // further forward than the present, which is the point: it can no longer sit
  // hours ahead of genuinely recent asks.
  assert.deepEqual(order, [invented, real, old]);

  // And an ask genuinely raised at this instant ties with it rather than
  // losing to a fabricated hour in the future.
  assert.equal(compareByNewestAsk(invented, { askedAt: new Date(now).toISOString() }, now), 0);
});

test('an ask with no timestamp sorts last, unchanged', () => {
  const now = Date.parse('2026-09-23T09:30:00.000Z');
  assert.equal(compareByNewestAsk({}, { askedAt: '2026-09-22T10:00:00.000Z' }, now), 1);
  assert.equal(compareByNewestAsk({ askedAt: '2026-09-22T10:00:00.000Z' }, {}, now), -1);
  assert.equal(compareByNewestAsk({}, {}, now), 0);
});
