'use strict';

// An idle agent belongs AT ITS DESK.
//
// The floor used to do the opposite: eligibility for coffee required an agent
// to be standing, so after the arrival settle every worker was stood up and
// handed to the sprite library's idle drift. That drift is what the human saw
// — five agents milling about a room, nobody at a desk, nobody going anywhere
// for a reason. Atlas looked right only because his own sitting check did not
// apply to him.
//
// Now everyone behaves the way he always did: seated by default, and leaving
// the desk only for something with a purpose — coffee, an errand, a meeting,
// a visit.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const floor = fs.readFileSync(
  path.join(__dirname, '..', 'src/renderer/src/scene/office/OfficeFloor.tsx'), 'utf8');

test('nothing on the floor wanders any more', () => {
  assert.doesNotMatch(floor, /\.startWandering\(\)/,
    'aimless roaming is not a behaviour: every trip has a destination');
});

test('being seated is not a reason to skip someone for coffee', () => {
  const fn = floor.slice(floor.indexOf('const breakEligible'));
  const body = fn.slice(0, fn.indexOf('\n      };'));
  assert.doesNotMatch(body, /!rt\.character\.isSitting\(\)/,
    'the sitting check is what made an idle floor stand up');
  assert.match(body, /agent\.status !== 'idle' && agent\.status !== 'success'/,
    'a working agent still never leaves its desk');
});

test('the settle window only clears the dwell, it does not stand anyone up', () => {
  const fn = floor.slice(floor.indexOf('const releaseSettled'));
  const body = fn.slice(0, fn.indexOf('\n      };'));
  assert.doesNotMatch(body, /startWandering|sitAtDesk/,
    'releasing the dwell is bookkeeping, not a movement');
});

test('every trip ends back at the desk', () => {
  // The break, its watchdog, the errand, its watchdog, and the coffee run.
  const ends = floor.match(/releaseErrand\(rt\);[\s\S]{0,120}?sitAtDesk/g) ?? [];
  assert.ok(ends.length >= 2, 'both errand exits return to the desk');
  const endBreak = floor.slice(floor.indexOf('const endBreak'));
  assert.doesNotMatch(endBreak.slice(0, endBreak.indexOf('\n      };')), /startWandering/);
});

test('a working agent is never picked for a trip', () => {
  const fn = floor.slice(floor.indexOf('const breakEligible'));
  const body = fn.slice(0, fn.indexOf('\n      };'));
  assert.match(body, /if \(rt\.brk \|\| rt\.err \|\| rt\.run \|\| rt\.mtg \|\| rt\.visit \|\| rt\.cupCarryHome\) return false;/,
    'no second trip while one is in progress');
  assert.match(body, /rt\.settleUntil && Date\.now\(\) < rt\.settleUntil/,
    'and not straight after coming back');
});

// Arrivals: Atlas opens the office, then everyone comes in TOGETHER.
//
// They used to file in one every two seconds. With three agents that was a
// pause; with five it was a queue at the door on every refresh, and it got
// worse with each hire.

test('the door admits everyone in one pass, not one at a time', () => {
  assert.doesNotMatch(floor, /ARRIVAL_GAP_S/, 'the per-agent gap is gone');
  assert.doesNotMatch(floor, /sinceLastArrival/);
  const pump = floor.slice(floor.indexOf('const updateArrivals'));
  const body = pump.slice(0, pump.indexOf('\n      };'));
  assert.match(body, /for \(const a of arrivalOrder\(agents\)\)/,
    'every waiting agent is admitted in the same pass');
});

test('Atlas still goes first, and the doors still open three seconds after him', () => {
  assert.match(floor, /const DOORS_OPEN_AFTER_S = 3;/);
  const pump = floor.slice(floor.indexOf('const updateArrivals'));
  const body = pump.slice(0, pump.indexOf('\n      };'));
  assert.match(body, /if \(sinceGodArrived < DOORS_OPEN_AFTER_S\) return;/);
  assert.match(body, /if \(a\.isGod \|\| runtimes\.has\(a\.id\) \|\| arriving\.has\(a\.id\)\) continue;/,
    'the boss is not in the queue — he IS the gate');
});

test('leads still arrive before workers, so they claim their offices first', () => {
  assert.match(floor, /const arrivalOrder = \(agents: Agent\[\]\): Agent\[\] => \[\s*\.\.\.agents\.filter\(\(a\) => a\.isLead\),/);
});
