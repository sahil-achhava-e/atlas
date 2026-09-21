'use strict';

// Break-room talk, and the one rule it has: you may talk about the
// orchestrator, your lead or a colleague — but only while they are not in the
// room. Said in front of them it stops being gossip and starts being rude,
// which is a different office from the one this is.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { pickAboutPerson, pickExchange, pickSoloLine } =
  loadTs('src/renderer/src/scene/office/cafeteriaLines.ts');
const floor = fs.readFileSync(
  path.join(__dirname, '..', 'src/renderer/src/scene/office/OfficeFloor.tsx'), 'utf8');

test('an exchange about someone names them in every beat it mentions anyone', () => {
  for (let seed = 0; seed < 60; seed++) {
    const beats = pickAboutPerson('Luffy', seed);
    assert.ok(beats.length >= 2, 'a conversation is at least two beats');
    assert.doesNotMatch(beats.join(' '), /\{name\}/, 'the placeholder must be filled');
    assert.ok(beats.some((b) => b.includes('Luffy')), 'somebody has to be named');
  }
});

test('both a light pool and a complaining pool are reachable', () => {
  const seen = new Set();
  for (let seed = 0; seed < 200; seed++) seen.add(pickAboutPerson('Nami', seed)[0]);
  const complaints = [...seen].filter((l) => /sitting with|no description|without telling|said hold/.test(l));
  assert.ok(complaints.length > 0, 'nobody ever complains');
  assert.ok(seen.size - complaints.length > 0, 'everybody always complains');
});

test('nothing in the pools is about a person rather than their work', () => {
  // The line this stays on the right side of: annoyed with each other, not
  // nasty about each other.
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src/renderer/src/scene/office/cafeteriaLines.ts'), 'utf8');
  for (const word of ['idiot', 'stupid', 'useless', 'lazy', 'incompetent', 'hate']) {
    assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(src), `"${word}" is not colleagues being annoyed`);
  }
});

test('the director filters everyone within earshot BEFORE picking a name', () => {
  const fn = floor.slice(floor.indexOf('const gossipAbout'));
  const body = fn.slice(0, fn.indexOf('\n      };'));
  assert.match(body, /outOfEarshot\(a\.id, x, y\)/, 'presence is the filter');
  // The filter has to run on every candidate, including the boss and the lead.
  assert.match(body, /const seniors = \[boss, lead\]\.filter\(away\)/);
  assert.match(body, /const peers = agents\.filter\(\(a\) => !a\.isGod && away\(a\)\)/);
});

test('earshot is a distance, and someone not on the floor cannot overhear', () => {
  const fn = floor.slice(floor.indexOf('const outOfEarshot'));
  const body = fn.slice(0, fn.indexOf('\n      };'));
  assert.match(body, /if \(!rt\) return true;/, 'an agent with no avatar is not present');
  assert.match(body, /Math\.hypot/);
  assert.match(floor, /const EARSHOT_PX = \d+;/);
});

test('work talk is still the default', () => {
  const fn = floor.slice(floor.indexOf('const chatScript'));
  const body = fn.slice(0, fn.indexOf('\n      };'));
  assert.match(body, /Math\.random\(\) < 0\.4/, 'a minority of conversations are about people');
  assert.match(body, /return pickExchange\(character, seed\)/, 'the rest are about the work');
  // And the work pool is unchanged: short, closed, about builds and cards.
  assert.ok(pickExchange('michael', 3).length >= 2);
  assert.ok(pickSoloLine('lib-nami', 'coffee', 1).length > 0);
});

test('four can be in the pantry, and they talk to whoever is nearest', () => {
  assert.match(floor, /const CAFE_SEATS_AT_ONCE = 4;/);
  const fn = floor.slice(floor.indexOf('const maybePairChat'));
  const body = fn.slice(0, fn.indexOf('\n      };'));
  assert.doesNotMatch(body, /spot\.partner/, 'the seat no longer decides who you talk to');
  assert.match(body, /here\.sort/, 'the nearest free person is the one you talk to');
});

test('silence does not set in — a chat is attempted every second and a half', () => {
  assert.match(floor, /b\.chatTry = 1\.5;/);
  const loop = floor.slice(floor.indexOf('} else if (!b.chattingWith) {'));
  const body = loop.slice(0, loop.indexOf('b.timer -= dt;'));
  assert.ok(body.indexOf('maybePairChat') < body.indexOf('emitQuip'),
    'try to start a conversation BEFORE muttering to yourself');
});
