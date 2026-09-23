'use strict';

/**
 * The review lane, and the fact that it is GLOBAL: it reaches every agent
 * through the spawn prompt and PROTOCOL.md, not through a briefing one human
 * happened to type. If these strings drift, a floor silently goes back to
 * engineers marking their own work done.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};

const { HiveManager } = loadTs('src/main/hive.ts');

function floor() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-lane-'));
  fs.mkdirSync(path.join(home, 'hive'), { recursive: true });
  const h = new HiveManager(() => home);
  h.setProjectCodes({ '/Users/me/Desktop/acme-events': 'EVENTS' });
  h.setCardHelper('/Applications/Atlas.app/Contents/Resources/open-card.cjs');
  return h;
}
/** The prompt an agent is actually spawned with. */
const promptFor = (h, meta) =>
  h.injectedPrompt({ id: 'x', name: 'X', ...meta }, '/hive/agents/x', '/hive', false, false);

test('every agent is told the five columns, in order', () => {
  const h = floor();
  for (const meta of [{ isGod: true }, { isLead: true }, {}]) {
    const p = promptFor(h, meta);
    for (const s of ['`todo`', '`in-progress`', '`in-review`', '`blocked`', '`done`']) {
      assert.ok(p.includes(s), `${s} missing for ${JSON.stringify(meta)}`);
    }
    assert.ok(/THE CARD NEVER WAITS ON A MERGE/.test(p), 'the merge rule is the one people get wrong');
  }
});

test('the lane names one owner per hop', () => {
  const p = promptFor(floor(), {});
  assert.match(p, /the ENGINEER runs the pre-commit review, commits, pushes, opens the PR, moves the card to `in-review`/);
  assert.match(p, /the LEAD sets the card's `reviewer`/);
  assert.match(p, /the REVIEWER reviews the PR only, never edits the branch and never merges/);
  assert.match(p, /the LEAD moves the card to `done` on that report/);
  assert.match(p, /`assignee` stays the engineer/, 'a done card must still say who built it');
});

test('a lead is told the reviewer is theirs to name and the card theirs to close', () => {
  const lead = promptFor(floor(), { isLead: true });
  assert.match(lead, /YOU OWN THE REVIEW LANE/);
  assert.match(lead, /set that card's `reviewer`/);
  assert.match(lead, /the reviewer does not close it, does not merge/);
  // And an engineer is NOT told to name a reviewer.
  const worker = promptFor(floor(), {});
  assert.doesNotMatch(worker, /YOU OWN THE REVIEW LANE/);
  assert.match(worker, /Move it to `in-progress` when you start, `in-review` when your PR is open/);
});

test('card ids are allocated by the helper, with the project codes listed', () => {
  const p = promptFor(floor(), { isGod: true });
  assert.match(p, /CARD IDS ARE ALLOCATED, NEVER INVENTED/);
  assert.match(p, /TASK-<PROJECT>-<n>/);
  assert.match(p, /open-card\.cjs" --project <CODE>/);
  assert.match(p, /EVENTS = \/Users\/me\/Desktop\/acme-events/);
  assert.match(p, /Never hand-write an id into tasks\.json and never reuse one/);
});

test('with no codes and no helper the id instruction is left out, not half-given', () => {
  // A floor with no registered projects has no codes. Telling an agent to run a
  // helper it cannot name is worse than saying nothing.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-lane-bare-'));
  fs.mkdirSync(path.join(home, 'hive'), { recursive: true });
  const h = new HiveManager(() => home);
  const p = promptFor(h, { isGod: true });
  assert.doesNotMatch(p, /CARD IDS ARE ALLOCATED/);
  assert.match(p, /`in-review`/, 'the lane is still there — it needs no config');
});

test('PROTOCOL.md carries the same lane, for every user of every build', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-lane-proto-'));
  const h = new HiveManager(() => home);
  h.ensureHive();
  const md = fs.readFileSync(path.join(home, 'hive', 'PROTOCOL.md'), 'utf8');
  assert.match(md, /## The review lane/);
  assert.match(md, /`todo` queued, `in-progress` being worked, `in-review` PR open/);
  assert.match(md, /\| `reviewer` \|/);
  assert.match(md, /\| `id` \| `TASK-<PROJECT>-<n>`/);
  assert.match(md, /The card never waits on a merge/);
  assert.match(md, /todo \/ in-progress \/ in-review \/ blocked \/ done/);
});
