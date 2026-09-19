'use strict';

/**
 * A spawn must never launder a default back over something the human set.
 *
 * The renderer sends the card it happens to hold. After a lost roster that card
 * is a default — no briefing, no face, isLead false — and spreading it flat
 * overwrote the registry, which was the only surviving copy, with exactly the
 * emptiness it was meant to repair. An absent field in a spawn means
 * "unchanged", not "cleared".
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const src = readFileSync(join(__dirname, '..', 'src/main/hive.ts'), 'utf8');
const upsert = src.slice(src.indexOf('reg.agents[meta.id] = {'), src.indexOf('if (meta.isGod) reg.godId'));

for (const field of ['goal', 'character', 'accent', 'isLead']) {
  test(`a spawn without \`${field}\` keeps the one on record`, () => {
    // `meta.x ?? prev?.x` — nullish, so `false` and `''` from the human still win.
    const re = new RegExp(`${field}: meta\\.${field} \\?\\? prev\\?\\.${field}`);
    assert.match(upsert, re, `${field} must fall back to the previous record`);
  });
}

test('restore hands the identity fields back to the hive', () => {
  const restore = readFileSync(join(__dirname, '..', 'src/renderer/src/hooks/useRestoreTeam.ts'), 'utf8');
  for (const field of ['goal', 'character', 'accent', 'isLead']) {
    assert.match(restore, new RegExp(`${field}: a\\.${field}`), `restore should send ${field}`);
  }
});
