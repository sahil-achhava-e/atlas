'use strict';

// When a burst of messages is a meeting, and how long it waits for the room.
// The case is real and in the floor's own log: Atlas asked Naruto to run a
// design meeting, and Naruto wrote to Sasuke, Sakura and Hinata over 33
// seconds. Three single-target messages, so the boardroom stayed empty.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { BriefingWindow, BRIEFING_SETTLE_MS, BRIEFING_MAX_MS, BRIEFING_PATIENCE_MS } =
  loadTs('src/shared/briefingWindow.ts');

const S = BRIEFING_SETTLE_MS;

test('the real dispatch from the log is one briefing', () => {
  const w = new BriefingWindow();
  w.note('naruto', ['sasuke'], 0);
  w.note('naruto', ['sakura'], 15_000);
  w.note('naruto', ['hinata'], 33_000);
  assert.deepEqual(w.pending(40_000), [], 'still writing — the gaps here are 15-18s');
  assert.deepEqual(w.pending(33_000 + S), [
    { from: 'naruto', attendees: ['sasuke', 'sakura', 'hinata'] }
  ]);
});

test('it keeps waiting until the room is free, then stops', () => {
  // THE POINT OF THE CLASS. When a briefing settles, its recipients are working
  // on what they were just briefed about, and a working agent does not leave
  // its desk. So the briefing is offered again and again until they are free.
  const w = new BriefingWindow();
  w.note('naruto', ['sasuke', 'sakura'], 0);
  const at = (t) => w.pending(t).length;
  assert.equal(at(S), 1);
  assert.equal(at(S + 30_000), 1, 'still on offer a half-minute later');
  assert.equal(at(S + 120_000), 1, 'and two minutes later');
  w.staged('naruto');
  assert.equal(at(S + 130_000), 0, 'once the meeting forms it is not offered again');
});

test('a briefing nobody could stage is eventually given up on', () => {
  const w = new BriefingWindow();
  w.note('naruto', ['sasuke', 'sakura'], 0);
  assert.equal(w.pending(S + BRIEFING_PATIENCE_MS).length, 1, 'inside the window');
  assert.equal(w.pending(S + BRIEFING_PATIENCE_MS + 1_000).length, 0, 'past it, dropped');
  assert.equal(w.pending(S + BRIEFING_PATIENCE_MS + 2_000).length, 0, 'and stays dropped');
});

test('one message to one person is a handoff, not a meeting', () => {
  const w = new BriefingWindow();
  w.note('sasuke', ['naruto'], 0);
  assert.deepEqual(w.pending(S), []);
  assert.deepEqual(w.pending(S + 60_000), [], 'and it is not kept around either');
});

test('the same recipient written to twice is still one person', () => {
  const w = new BriefingWindow();
  w.note('naruto', ['sasuke'], 0);
  w.note('naruto', ['sasuke'], 10_000);
  assert.deepEqual(w.pending(10_000 + S), []);
});

test('a broadcast still forms one briefing', () => {
  // The router resolves a broadcast to its recipient list, so it arrives as one
  // note with many targets — the case that used to be the ONLY one.
  const w = new BriefingWindow();
  w.note('god', ['naruto', 'luffy', 'sasuke'], 0);
  const due = w.pending(S);
  assert.equal(due.length, 1);
  assert.deepEqual(due[0].attendees, ['naruto', 'luffy', 'sasuke']);
});

test('two leads briefing at once are two briefings, not one', () => {
  const w = new BriefingWindow();
  w.note('naruto', ['sasuke', 'sakura'], 0);
  w.note('luffy', ['zoro', 'robin'], 5_000);
  const due = w.pending(5_000 + S);
  assert.deepEqual(due.map((b) => b.from).sort(), ['luffy', 'naruto']);
  w.staged('naruto');
  assert.deepEqual(w.pending(5_000 + S + 1_000).map((b) => b.from), ['luffy'],
    'staging one must not consume the other');
});

test('a sender never briefs themselves', () => {
  const w = new BriefingWindow();
  w.note('naruto', ['naruto', 'sasuke'], 0);
  assert.deepEqual(w.pending(S), [], 'one real recipient is not a meeting');
});

test('a long trickle is cut off, and the next message starts a fresh burst', () => {
  const w = new BriefingWindow();
  w.note('god', ['naruto'], 0);
  w.note('god', ['luffy'], BRIEFING_MAX_MS - 1_000);
  assert.deepEqual(w.pending(BRIEFING_MAX_MS), [{ from: 'god', attendees: ['naruto', 'luffy'] }],
    'the ceiling offers it even though the burst has not gone quiet');
  w.staged('god');
  w.note('god', ['sasuke'], BRIEFING_MAX_MS + 1_000);
  w.note('god', ['hinata'], BRIEFING_MAX_MS + 2_000);
  assert.deepEqual(w.pending(BRIEFING_MAX_MS + 2_000 + S),
    [{ from: 'god', attendees: ['sasuke', 'hinata'] }]);
});

test('empty and self-only notes are ignored outright', () => {
  const w = new BriefingWindow();
  w.note('', ['sasuke'], 0);
  w.note('naruto', [], 0);
  w.note('naruto', ['naruto'], 0);
  assert.deepEqual(w.pending(999_999), []);
});

// And the floor actually uses it. These are source assertions because the
// director lives inside a 2,500-line Pixi component; the rule itself is the
// class above, which is tested for real.

const fs = require('node:fs');
const path = require('node:path');
const floor = fs.readFileSync(
  path.join(__dirname, '..', 'src/renderer/src/scene/office/OfficeFloor.tsx'), 'utf8');

test('the floor collects every routed message, not just multi-target ones', () => {
  assert.match(floor, /briefings\.note\(e\.from, e\.targets, Date\.now\(\)\)/);
  assert.doesNotMatch(floor, /if \(e\.targets\.length >= 2\) startMeeting/,
    'the old rule only ever fired on a broadcast');
});

test('a pending briefing is retried until it stages', () => {
  const loop = floor.slice(floor.indexOf('const updateMeetings'));
  const body = loop.slice(0, loop.indexOf('\n      };'));
  assert.match(body, /for \(const b of briefings\.pending\(Date\.now\(\)\)\)/);
  assert.match(body, /if \(startMeeting\(b\.from, b\.attendees\)\) briefings\.staged\(b\.from\)/);
});

test('startMeeting reports whether the meeting formed', () => {
  // Without this the window would drop a briefing the room could not hold.
  const fn = floor.slice(floor.indexOf('const startMeeting ='));
  const body = fn.slice(0, fn.indexOf('\n      };'));
  assert.match(body, /const startMeeting = \(callerId: string, attendees: string\[\]\): boolean =>/);
  assert.match(body, /if \(going\.length < 3\) return false;/);
  assert.match(body, /return true;\s*$/, 'the last thing it does is report success');
  assert.equal((body.match(/return false;/g) || []).length, 5, 'every rejection path reports it');
});
