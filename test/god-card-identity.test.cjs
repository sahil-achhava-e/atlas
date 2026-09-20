'use strict';

// The orchestrator's card used to be rebuilt from constants on every boot:
// character 'michael', accent 'coral', description 'runs the floor', and no
// goal at all. So the briefing the human wrote into Atlas's Goal field was
// written over with nothing the next time the app started. The hive still had
// it, which is how it was caught, but the floor is what the hook reads first.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(
  path.join(__dirname, '..', 'src/renderer/src/hooks/useHive.ts'), 'utf8');

/** The god card literal in the spawn path. */
function spawnCard() {
  const from = src.indexOf('const god: Agent = {');
  assert.notEqual(from, -1, 'the god card was renamed');
  return src.slice(from, src.indexOf('};', from));
}

/** The god card literal in the adopt-a-live-terminal path. */
function adoptCard() {
  const from = src.indexOf('adopting the running orchestrator');
  assert.notEqual(from, -1);
  return src.slice(from, from + 900);
}

test('the spawned orchestrator keeps his briefing', () => {
  assert.match(spawnCard(), /goal: prevGod\?\.goal \|\| godEntry\?\.goal/,
    'the goal must come from the card or the hive, never from nothing');
});

test('the adopted orchestrator keeps his briefing', () => {
  assert.match(adoptCard(), /goal: entry\?\.goal/);
});

test('his face, colour and description are his, not constants', () => {
  const card = spawnCard();
  assert.match(card, /character: prevGod\?\.character \|\| godEntry\?\.character \|\| 'michael'/);
  assert.match(card, /accent: prevGod\?\.accent \|\| godEntry\?\.accent \|\| 'coral'/);
  assert.match(card, /description: prevGod\?\.description \|\| godEntry\?\.role \|\| 'runs the floor'/);
});

test('a failed spawn cannot leave the floor with no orchestrator', () => {
  // removeAgent deletes his roster row. It has to happen next to the addAgent
  // that puts the new card back, not before an await that can return early.
  const rm = src.indexOf("removeAgent(GOD_ID)");
  const add = src.indexOf('addAgent(god)');
  assert.ok(rm !== -1 && add !== -1);
  assert.ok(add - rm < 400 && add > rm,
    'the delete and the re-add must sit together, with no early return between them');
});
