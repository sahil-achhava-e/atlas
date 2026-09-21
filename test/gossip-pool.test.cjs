'use strict';

// Gossip written by a model instead of by hand — grounded in the real roster
// and the real board, so two agents at the coffee machine can grumble about a
// review that has actually been sitting for two days.
//
// This file guards the trust boundary. What comes back is model output that
// goes straight onto the screen above somebody's head, so it is parsed,
// measured and filtered rather than rendered hopefully. Every rejection here
// costs nothing: the hand-written pool is the fallback on every path.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { parseGossip, poolIsUsable, poolIsStale, POOL_MAX_AGE_MS, EMPTY_POOL } =
  loadTs('src/shared/gossipPool.ts');

const good = JSON.stringify({
  work: [['is the build green?', 'do not look.'], ['who owns this card?', 'nobody', 'of course']],
  about: [['{name} has not read it yet', 'two days now'], ['did {name} close that?', 'says it is done']]
});

test('a well-formed answer parses into two pools', () => {
  const pool = parseGossip(good, 1000);
  assert.equal(pool.work.length, 2);
  assert.equal(pool.about.length, 2);
  assert.equal(pool.at, 1000);
  assert.ok(poolIsUsable(pool));
});

test('the CLI envelope and a stray code fence are both tolerated', () => {
  for (const wrapped of [
    JSON.stringify({ result: good }),
    '```json\n' + good + '\n```',
    'Here you go:\n' + good + '\nHope that helps.'
  ]) {
    assert.ok(poolIsUsable(parseGossip(wrapped)), `failed to unwrap: ${wrapped.slice(0, 24)}`);
  }
});

test('an "about" exchange with no placeholder is dropped', () => {
  // It cannot be aimed at anybody, so the earshot rule could not apply to it.
  const pool = parseGossip(JSON.stringify({ about: [['Hinata has not read it', 'two days']] }));
  assert.deepEqual(pool, EMPTY_POOL);
});

test('a "work" exchange carrying a placeholder is dropped', () => {
  // It would render the literal word {name} above someone's head.
  const pool = parseGossip(JSON.stringify({ work: [['{name} broke the build', 'again']] }));
  assert.deepEqual(pool, EMPTY_POOL);
});

test('a mild dig is allowed; the cruel words are still dropped', () => {
  // Relaxed at the human's call: a break room where nobody can say "that was
  // sloppy" is not a break room. What stays out is the handful of words that
  // are about a PERSON rather than their work.
  for (const line of ['{name} is sloppy with cards', '{name} never reads it']) {
    assert.ok(poolIsUsable(parseGossip(JSON.stringify({ about: [[line, 'mm']] }))),
      `a mild dig was dropped: ${line}`);
  }
  for (const line of ['{name} is an idiot', '{name} is incompetent', 'what a moron', 'i hate this team']) {
    assert.deepEqual(parseGossip(JSON.stringify({ about: [[line, 'mm']], work: [[line, 'mm']] })),
      EMPTY_POOL, `let through: ${line}`);
  }
});

test('a line too long for a bubble is dropped', () => {
  const long = 'x'.repeat(60);
  assert.deepEqual(parseGossip(JSON.stringify({ work: [[long, 'ok']] })), EMPTY_POOL);
});

test('one bad beat spoils only its own exchange', () => {
  const pool = parseGossip(JSON.stringify({
    work: [['fine', 'also fine'], ['fine', 42], ['good', 'good']]
  }));
  assert.equal(pool.work.length, 2, 'the two clean exchanges survive');
});

test('markdown and stage directions are stripped', () => {
  const pool = parseGossip(JSON.stringify({ work: [['**shipped it**', '_did you test it_']] }));
  assert.deepEqual(pool.work[0], ['shipped it', 'did you test it']);
});

test('one beat is not a conversation, and six outlast the break', () => {
  // Up to five now: beats are timed by length (1.1-2.6s), so five short ones
  // fit comfortably inside an 18-32s break and read as actual talk.
  assert.deepEqual(parseGossip(JSON.stringify({ work: [['just me']] })), EMPTY_POOL);
  assert.ok(poolIsUsable(parseGossip(JSON.stringify({ work: [['a', 'b', 'c', 'd', 'e']] }))));
  assert.deepEqual(parseGossip(JSON.stringify({ work: [['a', 'b', 'c', 'd', 'e', 'f']] })), EMPTY_POOL);
});

test('junk, prose and silence all mean "use the static pool"', () => {
  for (const bad of ['', undefined, 'I cannot help with that.', '{', '{"work": "not an array"}', 'null']) {
    assert.equal(poolIsUsable(parseGossip(bad)), false, `treated as usable: ${String(bad).slice(0, 20)}`);
  }
});

test('a pool goes stale so the gossip stays current', () => {
  const pool = parseGossip(good, 0);
  assert.equal(poolIsStale(pool, POOL_MAX_AGE_MS - 1), false);
  assert.equal(poolIsStale(pool, POOL_MAX_AGE_MS + 1), true);
  assert.equal(poolIsStale(EMPTY_POOL, 0), true, 'nothing cached is always stale');
});

// The restraint half. This is decoration, and decoration must never cost real
// money, stall a bubble, or run when nobody is watching an office.

const fs = require('node:fs');
const path = require('node:path');
const gossipSrc = fs.readFileSync(path.join(__dirname, '..', 'src/main/gossip.ts'), 'utf8');
const floorSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src/renderer/src/scene/office/OfficeFloor.tsx'), 'utf8');

test('it is the cheap model, one at a time, with a floor on the interval', () => {
  assert.match(gossipSrc, /const GOSSIP_MODEL = 'claude-haiku/, 'flavour text does not need a big model');
  assert.match(gossipSrc, /if \(this\.inFlight\) return;/, 'never two sessions at once');
  assert.match(gossipSrc, /Date\.now\(\) - this\.lastRunAt < MIN_GAP_MS/, 'a hard floor on how often');
  assert.match(gossipSrc, /if \(!root \|\| crew\.length < 2\) return;/,
    'one agent cannot talk behind their own back');
});

test('it cannot edit, write or shell out to do it', () => {
  // Print mode takes the deny list as a CLI flag, not an options object.
  assert.match(gossipSrc, /'--disallowedTools', 'Edit,Write,NotebookEdit,Bash,Task'/);
});

test('the human who owns the floor is not a subject', () => {
  // Their call: the crew talk about each other, their lead and the
  // orchestrator. The owner is not a colleague and is not in the room.
  assert.match(gossipSrc, /NEVER about the human who owns this floor/);
});

test('laughter is a beat the floor can play, and only real laughter', () => {
  const { isLaughBeat } = loadTs('src/shared/gossipPool.ts');
  for (const yes of ['ha', 'hah', 'hahaha', 'heh', 'pfft', 'lol', 'ha, no']) {
    assert.equal(isLaughBeat(yes), true, `should laugh: ${yes}`);
  }
  for (const no of ['oh god', 'harsh', 'that tracks', 'hardly']) {
    assert.equal(isLaughBeat(no), false, `should not laugh: ${no}`);
  }
});

test('the toggle exists, defaults on, and off means no model call at all', () => {
  const cfg = fs.readFileSync(path.join(__dirname, '..', 'src/main/config.ts'), 'utf8');
  assert.match(cfg, /gossipWriter: boolean;/);
  assert.match(cfg, /gossipWriter: true,/, 'on by default, at the human\'s call');
  assert.match(gossipSrc, /const \{ enabled, root, crew \} = this\.ctx\(\);\s*\n\s*if \(!enabled\) return;/,
    'off has to short-circuit BEFORE anything is spawned');
});

test('a queue, not a call per conversation', () => {
  // A conversation starts the instant two agents meet; a generation takes
  // seconds. Per-conversation would stall the bubble or land after they left.
  assert.match(floorSrc, /Date\.now\(\) - gossipAskedAt < 60_000/, 'the floor asks at most once a minute');
  assert.match(floorSrc, /anyOf\(written\.work\) \?\? pickExchange/, 'written first, static always ready');
  assert.match(floorSrc, /if \(live\) return live\.map\(\(line\) => line\.replace/, 'the name is filled in locally');
});

test('the earshot rule still decides the name, not the model', () => {
  // The model writes {name}; the floor is what knows who is in the room.
  assert.match(floorSrc, /const who = gossipAbout\(speakerId, x, y\)/);
  const script = floorSrc.slice(floorSrc.indexOf('const chatScript'));
  const body = script.slice(0, script.indexOf('\n      };'));
  assert.ok(body.indexOf('gossipAbout') < body.indexOf('written.about'),
    'who is absent is decided BEFORE a written exchange is chosen');
});

test('the generation is grounded in things that are actually true', () => {
  const idx = fs.readFileSync(path.join(__dirname, '..', 'src/main/index.ts'), 'utf8');
  assert.match(idx, /function floorHappenings\(\): string\[\]/);
  assert.match(idx, /is blocked waiting on the human/);
  assert.match(idx, /has no description/);
  assert.match(idx, /have nothing named to do/);
  assert.match(idx, /out\.slice\(0, 10\)/, 'a break room does not quote the whole board');
});

// The laugh itself. cheer() is hops-with-confetti and refuses while seated, so
// at a café table it did nothing and elsewhere it read as celebration. A laugh
// had to be its own small thing.

test('laughing works while seated, and does not interrupt anything', () => {
  const ch = fs.readFileSync(
    path.join(__dirname, '..', 'src/renderer/src/scene/office/Character.ts'), 'utf8');
  const fn = ch.slice(ch.indexOf('  laugh(): void {'));
  const body = fn.slice(0, fn.indexOf('\n  }'));
  assert.doesNotMatch(body, /if \(this\.sitting\) return/, 'a seated agent must still be able to laugh');
  assert.doesNotMatch(body, /this\.path = \[\]/, 'you can laugh on the way back to your desk');
  // It bobs on top of the seated tuck, or it would teleport out of the chair.
  const tick = ch.slice(ch.indexOf('if (this.laughT >= 0'));
  assert.match(tick.slice(0, 600), /const seat = this\.seatOffset\(\)/);
  assert.match(tick.slice(0, 600), /this\.py \+ seat\.dy - bob/);
  assert.match(ch, /private seatOffset\(\): \{ dx: number; dy: number \}/);
});

test('a laugh beat makes the speaker bob, and sometimes the other one too', () => {
  assert.match(floorSrc, /if \(isLaughBeat\(line\)\) \{/);
  assert.match(floorSrc, /speaker\?\.character\.laugh\(\)/);
  assert.match(floorSrc, /if \(Math\.random\(\) < 0\.5\) \{/, 'laughing alone at your own joke is a different office');
});

test('beats are timed by length, so a reaction is not a slideshow', () => {
  assert.match(floorSrc, /line\.length <= 12 \? 1\.1 : line\.length <= 28 \? 1\.8 : 2\.6/);
});
