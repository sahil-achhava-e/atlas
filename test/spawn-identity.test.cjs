'use strict';

/**
 * Identity belongs to the record, not to whoever is respawning.
 *
 * The renderer sends the card it happens to hold. After a lost roster that card
 * is a DEFAULT — a stand-in face, a stand-in colour, no briefing, isLead false —
 * and preferring it overwrote the registry, the only surviving copy, with
 * exactly the emptiness it was meant to repair. A first spawn establishes these
 * fields; every spawn after that keeps them. Changing one is an explicit edit.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const src = readFileSync(join(__dirname, '..', 'src/main/hive.ts'), 'utf8');
const upsert = src.slice(src.indexOf('reg.agents[meta.id] = {'), src.indexOf('if (meta.isGod) reg.godId'));

for (const field of ['goal', 'character', 'accent', 'isLead']) {
  test(`a respawn cannot change \`${field}\` — the record wins`, () => {
    const re = new RegExp(`${field}: prev\\?\\.${field} \\?\\? meta\\.${field}`);
    assert.match(upsert, re, `${field} must prefer the record over the spawn`);
  });
}

test('restore hands the identity fields back to the hive', () => {
  const restore = readFileSync(join(__dirname, '..', 'src/renderer/src/hooks/useRestoreTeam.ts'), 'utf8');
  for (const field of ['goal', 'character', 'accent', 'isLead']) {
    assert.match(restore, new RegExp(`${field}: a\\.${field}`), `restore should send ${field}`);
  }
});
